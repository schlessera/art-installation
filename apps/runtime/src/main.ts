/**
 * Art Installation Runtime - Main Entry Point
 *
 * Initializes the canvas, render loop, actor system, and integrates
 * AI review, gallery storage, and QR code display.
 */

import type { Actor, ActorSetupAPI, ActorUpdateAPI, ActorContribution, DisplayMode } from '@art/types';
import { CanvasManager } from './engine/CanvasManager';
import { RenderLoop } from './engine/RenderLoop';
import { ActorRegistry, ActorScheduler, ActorContainerManager } from './actors';
import { BrushAPIImpl } from './drawing/BrushAPIImpl';
import { FilterAPIImpl } from './drawing/FilterAPIImpl';
import { Layer } from './engine/CanvasManager';
import { ContextManager } from './context';
import { SnapshotCapture } from './review';
import { QROverlay } from './ui';
import { GalleryClient } from './api/GalleryClient';
import { RetryQueue } from './api/RetryQueue';
import {
  GlobalErrorHandler,
  WebGLRecovery,
  Watchdog,
  MemoryMonitor,
  ConnectivityMonitor,
} from './resilience';

/**
 * Parse runtime configuration from URL query parameters.
 * Supported params:
 *   - maxActors: Maximum actors per cycle (default: 5)
 *   - minActors: Minimum actors per cycle (default: 2)
 *   - cycleDuration: Cycle duration in ms (default: 60000)
 *   - debug: Enable debug mode (default: true in dev)
 *   - width: Canvas width in pixels (default: 540)
 *   - height: Canvas height in pixels (default: 960)
 *   - actor: Solo mode - run only this actor (e.g., ?actor=wave-painter)
 *   - actors: Fixed actor list for testing (e.g., ?actors=wave-painter,particle-flow)
 *   - bgActor: Fixed background actor ID
 *   - bgFilters: Fixed background filter IDs (comma-separated) or count (0-2)
 *   - fgFilters: Fixed foreground filter IDs (comma-separated) or count (0-2)
 *   - enableVideo: Enable webcam video input (default: false)
 *   - mode: Force display mode ('light' or 'dark'), otherwise random per cycle
 */
function parseUrlConfig(): {
  maxActors?: number;
  minActors?: number;
  cycleDuration?: number;
  debug?: boolean;
  width?: number;
  height?: number;
  soloActorId?: string;
  fixedActorIds?: string[];
  fixedBackgroundActorId?: string;
  fixedBackgroundFilterIds?: string[];
  fixedForegroundFilterIds?: string[];
  enableVideo?: boolean;
  debugVideo?: boolean;
  displayMode?: DisplayMode;
  runtimeId?: string;
} {
  const params = new URLSearchParams(window.location.search);
  const config: ReturnType<typeof parseUrlConfig> = {};

  // Solo mode: run a single actor
  const actor = params.get('actor');
  if (actor) {
    config.soloActorId = actor;
  }

  // Fixed actor list for testing (full runtime with specific actors)
  const actors = params.get('actors');
  if (actors) {
    config.fixedActorIds = actors.split(',').map(id => id.trim()).filter(Boolean);
  }

  const maxActors = params.get('maxActors');
  if (maxActors) {
    const parsed = parseInt(maxActors, 10);
    if (!isNaN(parsed) && parsed > 0) {
      config.maxActors = parsed;
    }
  }

  const minActors = params.get('minActors');
  if (minActors) {
    const parsed = parseInt(minActors, 10);
    if (!isNaN(parsed) && parsed > 0) {
      config.minActors = parsed;
    }
  }

  const cycleDuration = params.get('cycleDuration');
  if (cycleDuration) {
    const parsed = parseInt(cycleDuration, 10);
    if (!isNaN(parsed) && parsed > 0) {
      config.cycleDuration = parsed;
    }
  }

  const debug = params.get('debug');
  if (debug !== null) {
    config.debug = debug === 'true' || debug === '1';
  }

  const width = params.get('width');
  if (width) {
    const parsed = parseInt(width, 10);
    if (!isNaN(parsed) && parsed > 0) {
      config.width = parsed;
    }
  }

  const height = params.get('height');
  if (height) {
    const parsed = parseInt(height, 10);
    if (!isNaN(parsed) && parsed > 0) {
      config.height = parsed;
    }
  }

  const enableVideo = params.get('enableVideo');
  if (enableVideo !== null) {
    config.enableVideo = enableVideo === 'true' || enableVideo === '1';
  }

  const debugVideo = params.get('debugVideo');
  if (debugVideo !== null) {
    config.debugVideo = debugVideo === 'true' || debugVideo === '1';
  }

  // Background actor override
  const bgActor = params.get('bgActor');
  if (bgActor) {
    config.fixedBackgroundActorId = bgActor;
  }

  // Background filters override (use has() to detect empty string for disabling)
  if (params.has('bgFilters')) {
    const bgFilters = params.get('bgFilters') || '';
    // Check if it's a number (count) or comma-separated IDs
    const parsed = parseInt(bgFilters, 10);
    if (!isNaN(parsed)) {
      // It's a count - we'll handle this in scheduler config
      // For now, we don't support count-only override
    } else {
      // Empty string results in empty array (disables filters)
      config.fixedBackgroundFilterIds = bgFilters.split(',').map(id => id.trim()).filter(Boolean);
    }
  }

  // Foreground filters override (use has() to detect empty string for disabling)
  if (params.has('fgFilters')) {
    const fgFilters = params.get('fgFilters') || '';
    const parsed = parseInt(fgFilters, 10);
    if (!isNaN(parsed)) {
      // It's a count - we'll handle this in scheduler config
    } else {
      // Empty string results in empty array (disables filters)
      config.fixedForegroundFilterIds = fgFilters.split(',').map(id => id.trim()).filter(Boolean);
    }
  }

  // Display mode override (light/dark)
  const mode = params.get('mode');
  if (mode === 'light' || mode === 'dark') {
    config.displayMode = mode;
  }

  // Runtime ID for gallery submission gating
  const runtimeId = params.get('runtime_id');
  if (runtimeId) {
    config.runtimeId = runtimeId;
  }

  return config;
}

const urlConfig = parseUrlConfig();

// Solo mode: run a single actor without cycling
const soloMode = !!urlConfig.soloActorId;
const soloActorId = urlConfig.soloActorId;

// Compute cycle config with proper clamping
const maxActors = soloMode ? 1 : (urlConfig.maxActors ?? 5);
const minActors = soloMode ? 1 : Math.min(urlConfig.minActors ?? 2, maxActors);

// Configuration - 9:16 portrait orientation by default (360x640)
const CONFIG = {
  canvas: {
    width: urlConfig.width ?? 360,
    height: urlConfig.height ?? 640,
    backgroundColor: 0x0a0a0f,
    antialias: true,
    preserveDrawingBuffer: true, // Required for snapshots
  },
  debug: urlConfig.debug ?? import.meta.env.DEV,
  // Solo mode disables gallery and QR overlay
  soloMode,
  soloActorId,
  // Fixed actor list for testing (full runtime with specific actors)
  fixedActorIds: urlConfig.fixedActorIds,
  // Gallery frontend URL (for QR code)
  galleryUrl: import.meta.env.VITE_GALLERY_URL || 'http://localhost:5173',
  // Gallery API URL (for submitting artworks)
  galleryApiUrl: import.meta.env.VITE_GALLERY_API_URL || 'http://localhost:3001/api',
  // Runtime ID for gallery submission gating
  runtimeId: urlConfig.runtimeId,
  cycle: {
    minActors,
    maxActors,
    // In solo mode, never end cycle (use very long duration)
    duration: soloMode ? Number.MAX_SAFE_INTEGER : (urlConfig.cycleDuration ?? 60000),
    noveltyBias: 0.7,
  },
};

// Global state
let actorRegistry: ActorRegistry;
let actorScheduler: ActorScheduler;
let canvasManager: CanvasManager;
let contextManager: ContextManager;
let snapshotCapture: SnapshotCapture;
let galleryClient: GalleryClient;
let retryQueue: RetryQueue;
let qrOverlay: QROverlay;

// Resilience modules
const globalErrorHandler = new GlobalErrorHandler();
let watchdog: Watchdog;
let memoryMonitor: MemoryMonitor;
let connectivityMonitor: ConnectivityMonitor;

// Install global error handler before anything else
globalErrorHandler.install();

/**
 * Global function for actors to self-register.
 */
function setupActorRegistration() {
  (window as Window & { __registerActor?: (actor: Actor, path: string) => void }).__registerActor = (
    actor: Actor,
    path: string
  ) => {
    const result = actorRegistry.register(actor, path);
    if (result.success) {
      console.log(`[Runtime] Actor registered: ${actor.metadata.id}`);
    } else {
      console.error(`[Runtime] Failed to register actor: ${result.error}`);
    }
  };
}

async function main(): Promise<void> {
  console.log('[Runtime] Initializing art installation...');
  if (CONFIG.soloMode) {
    console.log(`[Runtime] SOLO MODE: Running only actor "${CONFIG.soloActorId}"`);
  } else if (CONFIG.fixedActorIds && CONFIG.fixedActorIds.length > 0) {
    console.log(`[Runtime] FIXED ACTORS MODE: Running with actors: ${CONFIG.fixedActorIds.join(', ')}`);
  }
  console.log(`[Runtime] Canvas: ${CONFIG.canvas.width}x${CONFIG.canvas.height} (aspect ratio ${(CONFIG.canvas.width / CONFIG.canvas.height).toFixed(3)})`);
  if (!CONFIG.soloMode) {
    console.log(`[Runtime] Cycle: minActors=${CONFIG.cycle.minActors}, maxActors=${CONFIG.cycle.maxActors}, duration=${CONFIG.cycle.duration}ms`);
  }

  // Get container element
  const container = document.getElementById('canvas-container');
  if (!container) {
    throw new Error('Canvas container not found');
  }

  // Remove loading message
  const loading = container.querySelector('.loading');
  if (loading) {
    loading.remove();
  }

  // Initialize canvas manager
  canvasManager = new CanvasManager(CONFIG.canvas);
  await canvasManager.init(container);
  console.log('[Runtime] Canvas initialized');

  // Install WebGL context loss recovery
  const webglRecovery = new WebGLRecovery(canvasManager, globalErrorHandler, {
    onContextLost: () => {
      console.warn('[Runtime] WebGL context lost — pausing');
    },
    onContextRestored: () => {
      console.log('[Runtime] WebGL context restored — restarting cycle');
      actorScheduler?.startCycle().catch(console.error);
    },
  });
  webglRecovery.install();

  // Initialize watchdog (reload if no frame for 60s)
  watchdog = new Watchdog(globalErrorHandler);
  watchdog.start();

  // Initialize memory monitor
  memoryMonitor = new MemoryMonitor(globalErrorHandler);
  memoryMonitor.setOnWarning(() => {
    console.warn('[Runtime] Memory warning — force-ending current cycle');
    actorScheduler?.startCycle().catch(console.error);
  });
  memoryMonitor.start();

  // Initialize connectivity monitor
  connectivityMonitor = new ConnectivityMonitor();
  connectivityMonitor.install();

  // Initialize context manager
  contextManager = new ContextManager({
    enableAudio: false, // Disable audio for now
    enableVideo: urlConfig.enableVideo ?? false,
    enableSocial: true,
    galleryApiUrl: import.meta.env.VITE_GALLERY_API_URL || 'http://localhost:3001/api',
    forcedDisplayMode: urlConfig.displayMode,
  });
  await contextManager.start();

  // Log initial display mode
  console.log(`[Runtime] Display mode: ${contextManager.getDisplayProvider().mode()}${urlConfig.displayMode ? ' (forced via URL)' : ' (random)'}`);


  // Set video target dimensions for proper coordinate mapping
  contextManager.setVideoTargetDimensions(CONFIG.canvas.width, CONFIG.canvas.height);

  // Create debug video overlay if enabled
  if (urlConfig.debugVideo && urlConfig.enableVideo) {
    const videoProvider = contextManager.getVideoProvider();
    const videoEl = videoProvider?.getVideoElement();
    if (videoEl) {
      // Create video element that overlays the canvas exactly
      const debugVideo = document.createElement('video');
      debugVideo.id = 'video-debug-overlay';
      debugVideo.srcObject = videoEl.srcObject;
      debugVideo.muted = true;
      debugVideo.playsInline = true;
      debugVideo.autoplay = true;
      debugVideo.style.cssText = `
        position: absolute;
        object-fit: fill;
        opacity: 0.3;
        transform: scaleX(-1);
        pointer-events: none;
        z-index: 100;
      `;

      container.appendChild(debugVideo);
      debugVideo.play();

      // Function to sync video overlay position with canvas
      const syncOverlayPosition = () => {
        const canvas = canvasManager.getCanvas();
        if (canvas && debugVideo) {
          const rect = canvas.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          debugVideo.style.left = `${rect.left - containerRect.left}px`;
          debugVideo.style.top = `${rect.top - containerRect.top}px`;
          debugVideo.style.width = `${rect.width}px`;
          debugVideo.style.height = `${rect.height}px`;
        }
      };

      // Sync on load and resize
      syncOverlayPosition();
      window.addEventListener('resize', syncOverlayPosition);
      // Also sync after a short delay to catch any layout shifts
      setTimeout(syncOverlayPosition, 100);

      console.log('[Runtime] Debug video overlay enabled');
    }
  }

  console.log('[Runtime] Context manager started');

  // Initialize snapshot capture
  snapshotCapture = new SnapshotCapture(canvasManager);
  console.log('[Runtime] Snapshot capture initialized');

  // Initialize gallery client (skip in solo mode)
  if (!CONFIG.soloMode) {
    galleryClient = new GalleryClient({
      apiUrl: CONFIG.galleryApiUrl,
    });

    // Initialize retry queue for failed submissions
    retryQueue = new RetryQueue(galleryClient);

    // Wire connectivity monitor to retry queue
    connectivityMonitor.onOnline(() => {
      console.log('[Runtime] Connectivity restored — draining retry queue');
      retryQueue.drain().catch(console.error);
    });

    // Initialize QR overlay immediately (hidden until gallery is confirmed available)
    qrOverlay = new QROverlay({
      galleryUrl: CONFIG.galleryUrl,
      position: 'bottom-right',
      label: 'Scan to vote',
      visible: false,
    });
    qrOverlay.init(document.body);
    console.log('[Runtime] QR overlay initialized (hidden, pending gallery check)');

    // Check gallery health async - don't block startup
    // Only show QR code if this is an official/sample runtime (has runtimeId)
    galleryClient.checkHealth().then((available) => {
      if (available) {
        console.log(`[Runtime] Gallery API connected: ${CONFIG.galleryApiUrl}`);
        if (CONFIG.runtimeId) {
          qrOverlay?.setVisible(true);
        } else {
          console.log('[Runtime] No runtimeId — QR overlay hidden (public viewer mode)');
        }
        // Drain any queued submissions from previous sessions
        retryQueue.drain().catch(console.error);
      } else {
        console.warn(`[Runtime] Gallery API not available at ${CONFIG.galleryApiUrl}`);
      }
    });
  } else {
    console.log('[Runtime] Solo mode: Gallery and QR overlay disabled');
  }

  // Initialize actor system
  actorRegistry = new ActorRegistry();
  actorScheduler = new ActorScheduler(actorRegistry, {
    minActors: CONFIG.cycle.minActors,
    maxActors: CONFIG.cycle.maxActors,
    cycleDuration: CONFIG.cycle.duration,
    noveltyBias: CONFIG.cycle.noveltyBias,
    fixedActorIds: CONFIG.fixedActorIds,
    fixedBackgroundActorId: urlConfig.fixedBackgroundActorId,
    fixedBackgroundFilterIds: urlConfig.fixedBackgroundFilterIds,
    fixedForegroundFilterIds: urlConfig.fixedForegroundFilterIds,
  });

  // Create per-actor container manager for z-order layering
  actorContainerManager = new ActorContainerManager(canvasManager);

  // Link container manager to canvas manager for layer-aware snapshots
  canvasManager.setContainerManager(actorContainerManager);

  // Create fallback APIs for setup phase (actors don't draw during setup)
  const brushApi = new BrushAPIImpl(canvasManager, Layer.Foreground);
  const filterApi = new FilterAPIImpl(canvasManager, Layer.Foreground);

  const setupAPI: ActorSetupAPI = {
    canvas: canvasManager,
    context: contextManager.getContextAPI(),
    loadAsset: async (url: string, type: 'image' | 'font') => {
      console.log(`[Runtime] Loading ${type} asset: ${url}`);
      if (type === 'image') {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = url;
        });
      }
      return null;
    },
  };

  const updateAPI: ActorUpdateAPI = {
    canvas: canvasManager,
    brush: brushApi,
    filter: filterApi,
    context: contextManager.getContextAPI(),
  };

  actorScheduler.initialize(
    canvasManager,
    contextManager.getContextAPI(),
    setupAPI,
    updateAPI,
    actorContainerManager
  );

  // Set up global registration function
  setupActorRegistration();
  console.log('[Runtime] Actor registration ready');

  // Set up cycle callbacks
  actorScheduler.onPrepareNewCycle(() => {
    // Randomize display mode (light/dark) for each cycle
    contextManager.prepareNewCycle();
  });

  actorScheduler.onCycleStart((actorIds) => {
    console.log(`[Runtime] Cycle started with actors:`, actorIds);
    updateCycleDisplay(actorIds);
  });

  // Skip cycle end handling in solo mode (no snapshots, no cycling)
  if (!CONFIG.soloMode) {
    actorScheduler.onCycleEnd(async (actorIds, duration) => {
      console.log(`[Runtime] Cycle ended after ${Math.round(duration)}ms`);
      await handleCycleEnd(actorIds, duration);
    });
  }

  // Initialize render loop
  const renderLoop = new RenderLoop(canvasManager);

  // Connect scheduler to render loop
  renderLoop.onFrame((frame) => {
    // Skip everything during cycle transition - preserve canvas state
    // (including filters on post-process sprites) for snapshot capture
    if (actorScheduler.isTransitioning()) {
      return;
    }

    // Prepare frame (restore layer visibility, clear post-process filters)
    canvasManager.prepareFrame();

    // Clear previous frame's graphics from all actor containers
    actorContainerManager!.clearFrame();

    // Update context (for audio analysis etc.)
    contextManager.update();

    // === THREE-PHASE RENDERING ===

    // PHASE 1: BACKGROUND
    // Update background actor (draws to Background layer)
    actorScheduler.updateBackgroundActor(frame);

    // If we have background filters, render background to texture and apply filters
    if (actorScheduler.hasBackgroundFilters()) {
      canvasManager.renderBackgroundToTexture();
      actorScheduler.updateBackgroundFilters(frame);
    }

    // PHASE 2: FOREGROUND
    // Update foreground actors (they draw to their containers in Foreground layer)
    actorScheduler.updateForegroundActors(frame);

    // PHASE 3: FOREGROUND FILTERS
    // If we have foreground filters, render scene to texture and apply filters
    if (actorScheduler.hasForegroundFilters()) {
      canvasManager.renderForegroundToTexture();
      actorScheduler.updateForegroundFilters(frame);
    }

    // Check if cycle should end
    if (actorScheduler.shouldEndCycle()) {
      actorScheduler.startCycle().catch(console.error);
    }

    // Update stats
    renderLoop.setActiveActorCount(actorScheduler.getActiveActorCount());

    // Feed watchdog on each successful frame
    watchdog.feed();
  });

  // Enable debug panel in dev mode
  if (CONFIG.debug) {
    const debugPanel = document.getElementById('debug-panel');
    if (debugPanel) {
      debugPanel.classList.add('visible');
    }

    // Update debug stats
    renderLoop.onStats((stats) => {
      const fpsEl = document.getElementById('fps');
      const frameEl = document.getElementById('frame-count');
      const actorsEl = document.getElementById('active-actors');
      const drawCallsEl = document.getElementById('draw-calls');

      if (fpsEl) fpsEl.textContent = stats.fps.toFixed(1);
      if (frameEl) frameEl.textContent = stats.frameCount.toString();
      if (actorsEl) actorsEl.textContent = stats.activeActors.toString();
      if (drawCallsEl) drawCallsEl.textContent = stats.drawCalls.toString();

      // Update cycle info
      updateCycleProgress();
    });

    // Update actor info panel (layer stack display)
    const actorInfo = document.getElementById('actor-info');
    const layerStack = document.getElementById('layer-stack');
    if (actorInfo && layerStack) {
      actorInfo.style.display = 'block';
    }
  }

  // Start render loop
  renderLoop.start();
  console.log('[Runtime] Render loop started');

  // Handle window resize
  window.addEventListener('resize', () => {
    canvasManager.resize(window.innerWidth, window.innerHeight);
  });

  // Initial resize
  canvasManager.resize(window.innerWidth, window.innerHeight);

  // Cleanup on page unload to release media resources (webcam, microphone)
  const handleUnload = () => {
    console.log('[Runtime] Page unloading, cleaning up...');
    contextManager.stop();
  };
  window.addEventListener('pagehide', handleUnload);
  window.addEventListener('beforeunload', handleUnload);

  // Expose for debugging
  if (CONFIG.debug) {
    (window as unknown as Record<string, unknown>).artInstallation = {
      canvasManager,
      renderLoop,
      contextManager,
      actorRegistry,
      actorScheduler,
      snapshotCapture,
      galleryClient,
      qrOverlay,
      config: CONFIG,
    };
  }

  console.log('[Runtime] Art installation ready');

  // Load actors from filesystem
  await loadActors();

  // Start first cycle after actors are loaded
  setTimeout(() => {
    if (actorRegistry.count > 0) {
      actorScheduler.startCycle().catch(console.error);
    } else {
      console.warn('[Runtime] No actors registered, waiting for actors...');
    }
  }, 500);
}

/**
 * Handle the end of a cycle - capture snapshot and send to gallery.
 * Review happens asynchronously on the gallery server.
 */
async function handleCycleEnd(actorIds: string[], duration: number): Promise<void> {
  if (actorIds.length === 0) return;

  try {
    // Get cycle info
    const cycleInfo = actorScheduler.getCycleInfo();
    const contextSnapshot = contextManager.getSnapshot();

    // Force a render to ensure the canvas reflects the current scene graph
    // (including filters on post-process sprites) before capturing
    const app = canvasManager.getApp();
    app.renderer.render(app.stage);

    // Capture canvas snapshot
    const snapshot = snapshotCapture.capture(
      actorIds,
      cycleInfo.cycleNumber,
      cycleInfo.elapsed,
      contextSnapshot
    );
    console.log(`[Runtime] Captured snapshot: ${snapshot.id}`);

    // Create thumbnail
    const thumbnail = await snapshotCapture.createThumbnail(snapshot);
    console.log('[Runtime] Created thumbnail');

    // Build actor contributions
    const contributions: ActorContribution[] = actorIds.map((id) => {
      const registered = actorRegistry.get(id);
      return {
        actorId: id,
        actorName: registered?.actor.metadata.name || id,
        actorRole: registered?.actor.metadata.role ?? 'foreground',
        authorName: registered?.actor.metadata.author?.name || 'Unknown',
        authorGithub: registered?.actor.metadata.author?.github,
        contributionWeight: 1 / actorIds.length,
        operationCount: 0, // TODO: Track actual operation counts per actor
      };
    });

    // Only submit to gallery if a runtimeId is configured (official display)
    if (!CONFIG.runtimeId) {
      console.log('[Runtime] No runtimeId configured, skipping gallery submission');
      return;
    }

    // Submit to gallery API (review happens async on gallery server)
    try {
      const savedArtwork = await galleryClient.submitArtwork({
        imageData: snapshot.dataUrl,
        thumbnailData: thumbnail,
        contributingActors: contributions,
        context: contextSnapshot,
        cycleNumber: cycleInfo.cycleNumber,
        cycleDuration: duration / 1000, // Convert to seconds
        frameCount: cycleInfo.elapsed,
        runtimeId: CONFIG.runtimeId,
      });
      console.log(`[Runtime] Artwork submitted to gallery: ${savedArtwork.id}`);

      // Update UI to show submitted
      showSaveNotification(savedArtwork.id);
    } catch (submitError) {
      console.error('[Runtime] Failed to submit to gallery — queuing for retry:', submitError);
      retryQueue?.enqueue({
        imageData: snapshot.dataUrl,
        thumbnailData: thumbnail,
        contributingActors: contributions,
        context: contextSnapshot,
        cycleNumber: cycleInfo.cycleNumber,
        cycleDuration: duration / 1000,
        frameCount: cycleInfo.elapsed,
        runtimeId: CONFIG.runtimeId,
      });
    }
  } catch (error) {
    console.error('[Runtime] Failed to process cycle end:', error);
  }
}

/**
 * Update the layer stack display in the debug panel.
 * Shows layers in reverse order (top layer first).
 */
function updateCycleDisplay(_actorIds: string[]): void {
  const layerStack = document.getElementById('layer-stack');
  if (!layerStack) return;

  // Helper to format actor name
  const getActorName = (id: string): string => {
    const registered = actorRegistry.get(id);
    return registered?.actor.metadata.name || id;
  };

  // Helper to convert hex color to CSS
  const hexToRgb = (hex: number): string => {
    const r = (hex >> 16) & 0xff;
    const g = (hex >> 8) & 0xff;
    const b = hex & 0xff;
    return `rgb(${r}, ${g}, ${b})`;
  };

  // Helper to format hex color as string
  const hexToString = (hex: number): string => {
    return '#' + hex.toString(16).padStart(6, '0');
  };

  // Build layer stack HTML (top to bottom)
  const sections: string[] = [];

  // 1. Foreground Effects (foreground filters)
  const fgFilterIds = actorScheduler.hasForegroundFilters()
    ? actorContainerManager?.getForegroundFilterActorIds() || []
    : [];
  if (fgFilterIds.length > 0) {
    sections.push(`
      <div class="layer-section">
        <div class="layer-content">
          ${fgFilterIds.map(id => `<div class="actor-item">${getActorName(id)} <span class="filter-tag">(filter)</span></div>`).join('')}
        </div>
      </div>
    `);
  }

  // 3. Foreground (main actors, in z-order reverse - highest z first)
  const fgActorIds = actorContainerManager?.getForegroundActorIds() || [];
  const fgActorsReversed = [...fgActorIds].reverse();
  if (fgActorsReversed.length > 0) {
    sections.push(`
      <div class="layer-section">
        <div class="layer-content">
          ${fgActorsReversed.map((id, i) => {
              const zIndex = fgActorIds.length - 1 - i;
              return `<div class="actor-item">${getActorName(id)} <span class="z-index">(z:${zIndex})</span></div>`;
            }).join('')}
        </div>
      </div>
    `);
  }

  // 4. Background Effects (background filters)
  const bgFilterIds = actorScheduler.hasBackgroundFilters()
    ? actorContainerManager?.getBackgroundFilterActorIds() || []
    : [];
  if (bgFilterIds.length > 0) {
    sections.push(`
      <div class="layer-section">
        <div class="layer-content">
          ${bgFilterIds.map(id => `<div class="actor-item">${getActorName(id)} <span class="filter-tag">(filter)</span></div>`).join('')}
        </div>
      </div>
    `);
  }

  // 5. Background (single actor or solid color)
  const bgActorId = actorContainerManager?.getBackgroundActorId();
  const bgColor = canvasManager.getCurrentBackgroundColor();
  let bgContent: string;
  if (bgActorId) {
    bgContent = `<div class="actor-item">${getActorName(bgActorId)} <span class="bg-tag">(background)</span></div>`;
  } else if (bgColor !== null) {
    bgContent = `<div class="actor-item"><span class="solid-color" style="background: ${hexToRgb(bgColor)}"></span>solid color: ${hexToString(bgColor)}</div>`;
  } else {
    bgContent = '<span class="layer-empty">(none)</span>';
  }
  sections.push(`
    <div class="layer-section">
      <div class="layer-content">${bgContent}</div>
    </div>
  `);

  layerStack.innerHTML = sections.join('');
}

// Reference to container manager for debug display
let actorContainerManager: ActorContainerManager | null = null;

/**
 * Update the cycle progress display.
 */
function updateCycleProgress(): void {
  const cycleInfo = actorScheduler.getCycleInfo();
  const progressEl = document.getElementById('cycle-progress');
  const cycleNumberEl = document.getElementById('cycle-number');

  if (progressEl) {
    const progressPercent = Math.round(cycleInfo.progress * 100);
    progressEl.style.width = `${progressPercent}%`;
  }

  if (cycleNumberEl) {
    cycleNumberEl.textContent = cycleInfo.cycleNumber.toString();
  }
}

/**
 * Show a notification when artwork is submitted to gallery.
 */
function showSaveNotification(_artworkId: string): void {
  const notification = document.createElement('div');
  notification.className = 'save-notification';
  notification.innerHTML = `
    <div class="save-notification-content">
      <span class="save-icon">&#x2713;</span>
      <span>Artwork submitted for review</span>
    </div>
  `;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(34, 197, 94, 0.9);
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-family: system-ui, sans-serif;
    font-size: 14px;
    font-weight: 500;
    z-index: 1001;
    animation: slideDown 0.3s ease;
  `;

  document.body.appendChild(notification);

  // Remove after 3 seconds
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

/**
 * Dynamically load all actors from the filesystem using Vite's glob import.
 * In solo mode, only loads the specified actor.
 */
async function loadActors(): Promise<void> {
  console.log('[Runtime] Scanning for actors...');

  // Use Vite's import.meta.glob to discover actors
  // Path is relative to this file's location (apps/runtime/src/)
  // So we go up to project root and into actors folder
  const actorModules = import.meta.glob<{ default: Actor }>(
    '../../../actors/**/src/index.ts',
    { eager: false }
  );

  const paths = Object.keys(actorModules);
  console.log(`[Runtime] Found ${paths.length} actor modules:`, paths);

  // In solo mode, filter to just the specified actor
  let pathsToLoad = paths;
  if (CONFIG.soloMode && CONFIG.soloActorId) {
    // Match by actor ID in path (e.g., "wave-painter" matches ".../wave-painter/src/index.ts")
    pathsToLoad = paths.filter(path => path.includes(`/${CONFIG.soloActorId}/`));
    if (pathsToLoad.length === 0) {
      console.error(`[Runtime] Solo mode: Actor "${CONFIG.soloActorId}" not found in paths:`, paths);
      // Show error in UI
      const container = document.getElementById('canvas-container');
      if (container) {
        container.innerHTML = `
          <div class="loading" style="color: #f44; text-align: center; padding: 40px;">
            <div style="font-size: 18px; margin-bottom: 10px;">Actor not found: "${CONFIG.soloActorId}"</div>
            <div style="font-size: 14px; opacity: 0.7;">Available actors:</div>
            <div style="font-size: 12px; opacity: 0.5; margin-top: 10px;">
              ${paths.map(p => p.match(/actors\/[^/]+\/([^/]+)/)?.[1] || p).join(', ')}
            </div>
          </div>
        `;
      }
      return;
    }
    console.log(`[Runtime] Solo mode: Loading only "${CONFIG.soloActorId}"`);
  }

  // Load each actor module
  for (const path of pathsToLoad) {
    try {
      console.log(`[Runtime] Loading actor from: ${path}`);
      const module = await actorModules[path]();

      if (module.default) {
        // Register the actor if not already registered
        // Actors will be started automatically when a cycle begins
        if (!actorRegistry.has(module.default.metadata.id)) {
          const result = actorRegistry.register(module.default, path);
          if (result.success) {
            console.log(`[Runtime] Registered actor: ${module.default.metadata.id}`);
          }
        }
      }
    } catch (error) {
      console.error(`[Runtime] Failed to load actor from ${path}:`, error);
    }
  }

  console.log(`[Runtime] Loaded ${actorRegistry.count} actors`);
}

// Start the application
main().catch((error) => {
  console.error('[Runtime] Failed to initialize:', error);
  const container = document.getElementById('canvas-container');
  if (container) {
    container.innerHTML = `
      <div class="loading" style="color: #f44;">
        Failed to initialize: ${error.message}
      </div>
    `;
  }
});
