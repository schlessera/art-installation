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
 *   - enableAudio: Enable microphone audio input (default: false)
 *   - enableVideo: Enable webcam video input (default: false)
 *   - videoRotation: Rotate video mapping 0/90/180/270 degrees CW (for physically rotated cameras)
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
  enableAudio?: boolean;
  debugAudio?: boolean;
  enableVideo?: boolean;
  debugVideo?: boolean;
  videoRotation?: 0 | 90 | 180 | 270;
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

  const enableAudio = params.get('enableAudio');
  if (enableAudio !== null) {
    config.enableAudio = enableAudio === 'true' || enableAudio === '1';
  }

  const debugAudio = params.get('debugAudio');
  if (debugAudio !== null) {
    config.debugAudio = debugAudio === 'true' || debugAudio === '1';
  }

  const enableVideo = params.get('enableVideo');
  if (enableVideo !== null) {
    config.enableVideo = enableVideo === 'true' || enableVideo === '1';
  }

  const debugVideo = params.get('debugVideo');
  if (debugVideo !== null) {
    config.debugVideo = debugVideo === 'true' || debugVideo === '1';
  }

  const videoRotation = params.get('videoRotation');
  if (videoRotation !== null) {
    const parsed = parseInt(videoRotation, 10);
    if (parsed === 90 || parsed === 180 || parsed === 270) {
      config.videoRotation = parsed;
    }
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
    // Register to catalog with a loader that returns the captured actor.
    // The actor object is held in this closure — the registry only stores metadata
    // until the actor is selected for a cycle.
    const result = actorRegistry.registerCatalog(
      actor.metadata,
      path,
      () => Promise.resolve(actor)
    );
    if (result.success) {
      console.log(`[Runtime] Actor cataloged: ${actor.metadata.id}`);
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
    enableAudio: urlConfig.enableAudio ?? false,
    enableVideo: urlConfig.enableVideo ?? false,
    videoRotation: urlConfig.videoRotation,
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
  // Shows the rotated analysis canvas + face detection boxes
  if (urlConfig.debugVideo && urlConfig.enableVideo) {
    const videoProvider = contextManager.getVideoProvider();
    if (videoProvider) {
      // Create a canvas overlay that shows the rotated video feed + face boxes
      const debugCanvas = document.createElement('canvas');
      debugCanvas.id = 'video-debug-overlay';
      debugCanvas.style.cssText = `
        position: absolute;
        opacity: 0.3;
        pointer-events: none;
        z-index: 100;
        image-rendering: pixelated;
      `;
      container.appendChild(debugCanvas);

      const debugCtx = debugCanvas.getContext('2d')!;

      // Temp canvas for scaling analysis frame pixels to overlay size
      const frameCanvas = document.createElement('canvas');
      const frameCtx = frameCanvas.getContext('2d')!;

      // Sync overlay position with canvas
      const syncOverlayPosition = () => {
        const canvas = canvasManager.getCanvas();
        if (canvas && debugCanvas) {
          const rect = canvas.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          debugCanvas.style.left = `${rect.left - containerRect.left}px`;
          debugCanvas.style.top = `${rect.top - containerRect.top}px`;
          debugCanvas.style.width = `${rect.width}px`;
          debugCanvas.style.height = `${rect.height}px`;
          debugCanvas.width = CONFIG.canvas.width;
          debugCanvas.height = CONFIG.canvas.height;
        }
      };
      syncOverlayPosition();
      window.addEventListener('resize', syncOverlayPosition);
      setTimeout(syncOverlayPosition, 100);

      // Render debug overlay each frame
      const renderDebugOverlay = () => {
        requestAnimationFrame(renderDebugOverlay);
        if (!videoProvider.isAvailable()) return;

        const frame = videoProvider.getFrame();
        if (!frame) return;

        const cw = CONFIG.canvas.width;
        const ch = CONFIG.canvas.height;

        // Draw the analysis frame scaled up to canvas size
        debugCtx.clearRect(0, 0, cw, ch);
        if (frameCanvas.width !== frame.width || frameCanvas.height !== frame.height) {
          frameCanvas.width = frame.width;
          frameCanvas.height = frame.height;
        }
        frameCtx.putImageData(frame, 0, 0);
        debugCtx.drawImage(frameCanvas, 0, 0, cw, ch);

        // Draw face detection boxes
        const faces = videoProvider.getFaces();
        debugCtx.strokeStyle = '#00ff00';
        debugCtx.lineWidth = 2;
        debugCtx.font = '12px monospace';
        debugCtx.fillStyle = '#00ff00';
        for (const face of faces) {
          debugCtx.strokeRect(face.bounds.x, face.bounds.y, face.bounds.width, face.bounds.height);
          debugCtx.fillText(
            `${Math.round(face.confidence * 100)}%`,
            face.bounds.x, face.bounds.y - 4
          );
          // Draw landmark dots
          if (face.landmarks) {
            debugCtx.fillStyle = '#ff0000';
            for (const point of Object.values(face.landmarks)) {
              const p = point as { x: number; y: number };
              debugCtx.fillRect(p.x - 2, p.y - 2, 4, 4);
            }
            debugCtx.fillStyle = '#00ff00';
          }
        }

        // Draw motion regions
        const motion = videoProvider.getMotion();
        debugCtx.strokeStyle = '#ffff00';
        debugCtx.lineWidth = 1;
        for (const region of motion.regions) {
          debugCtx.strokeRect(region.x, region.y, region.width, region.height);
        }

        // Draw motion intensity + direction
        if (motion.intensity > 0.01) {
          const cx = cw / 2;
          const cy = ch / 2;
          const len = motion.intensity * 80;
          debugCtx.strokeStyle = '#ff8800';
          debugCtx.lineWidth = 2;
          debugCtx.beginPath();
          debugCtx.moveTo(cx, cy);
          debugCtx.lineTo(cx + motion.direction.x * len, cy + motion.direction.y * len);
          debugCtx.stroke();
        }
      };
      requestAnimationFrame(renderDebugOverlay);

      console.log('[Runtime] Debug video overlay enabled (rotated view + face/motion boxes)');
    }
  }

  // Create debug audio overlay if enabled
  if (urlConfig.debugAudio) {
    const audioProvider = contextManager.getAudioProvider();
    const PANEL_W = 200;
    const PANEL_H = 150;

    const audioCanvas = document.createElement('canvas');
    audioCanvas.id = 'audio-debug-overlay';
    audioCanvas.width = PANEL_W;
    audioCanvas.height = PANEL_H;
    audioCanvas.style.cssText = `
      position: absolute;
      width: ${PANEL_W}px;
      height: ${PANEL_H}px;
      pointer-events: none;
      z-index: 101;
    `;
    container.appendChild(audioCanvas);

    const aCtx = audioCanvas.getContext('2d')!;
    let beatFlash = 0;

    // Position the panel at bottom-left of the canvas
    const syncAudioPosition = () => {
      const canvas = canvasManager.getCanvas();
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        audioCanvas.style.left = `${rect.left - containerRect.left + 4}px`;
        audioCanvas.style.top = `${rect.bottom - containerRect.top - PANEL_H - 4}px`;
      }
    };
    syncAudioPosition();
    window.addEventListener('resize', syncAudioPosition);
    setTimeout(syncAudioPosition, 100);

    const renderAudioDebug = () => {
      requestAnimationFrame(renderAudioDebug);

      const available = audioProvider.isAvailable();

      // Beat flash decay
      if (available && audioProvider.isBeat()) beatFlash = 1;
      beatFlash *= 0.85;

      // Background
      aCtx.fillStyle = `rgba(0, 0, 0, ${0.7 + beatFlash * 0.2})`;
      aCtx.fillRect(0, 0, PANEL_W, PANEL_H);

      // Beat flash border
      if (beatFlash > 0.05) {
        aCtx.strokeStyle = `rgba(255, 255, 0, ${beatFlash})`;
        aCtx.lineWidth = 2;
        aCtx.strokeRect(1, 1, PANEL_W - 2, PANEL_H - 2);
      }

      aCtx.font = '10px monospace';

      if (!available) {
        aCtx.fillStyle = '#ff4444';
        aCtx.fillText('MIC: OFF', 6, 14);
        aCtx.fillStyle = '#888';
        aCtx.fillText('Add ?enableAudio=true', 6, 30);
        return;
      }

      // Header
      aCtx.fillStyle = '#00ff00';
      aCtx.fillText('MIC: ON', 6, 14);

      const bpmVal = audioProvider.bpm();
      aCtx.fillStyle = '#ffffff';
      aCtx.fillText(`BPM: ${bpmVal !== null ? Math.round(bpmVal) : '—'}`, 70, 14);

      const vol = audioProvider.volume();
      aCtx.fillText(`VOL: ${(vol * 100).toFixed(0)}%`, 140, 14);

      // Spectrum bars (group 128 bins into 32 bars)
      const spectrum = audioProvider.spectrum();
      const numBars = 32;
      const binsPerBar = Math.floor(spectrum.length / numBars);
      const barW = (PANEL_W - 12) / numBars;
      const spectrumTop = 22;
      const spectrumH = 60;

      for (let i = 0; i < numBars; i++) {
        // Average bins in this group
        let sum = 0;
        for (let j = 0; j < binsPerBar; j++) {
          sum += spectrum[i * binsPerBar + j];
        }
        const val = sum / binsPerBar;
        const barH = val * spectrumH;

        // Color by frequency range: bass=red, mid=green, treble=blue
        const t = i / numBars;
        if (t < 0.15) {
          aCtx.fillStyle = '#ff4444';
        } else if (t < 0.5) {
          aCtx.fillStyle = '#44ff44';
        } else {
          aCtx.fillStyle = '#4488ff';
        }

        aCtx.fillRect(6 + i * barW, spectrumTop + spectrumH - barH, barW - 1, barH);
      }

      // Level meters
      const metersTop = spectrumTop + spectrumH + 8;
      const meterH = 8;
      const meterW = PANEL_W - 50;
      const levels = [
        { label: 'BASS', value: audioProvider.bass(), color: '#ff4444' },
        { label: 'MID', value: audioProvider.mid(), color: '#44ff44' },
        { label: 'TREB', value: audioProvider.treble(), color: '#4488ff' },
      ];

      for (let i = 0; i < levels.length; i++) {
        const y = metersTop + i * (meterH + 4);
        aCtx.fillStyle = '#888';
        aCtx.font = '9px monospace';
        aCtx.fillText(levels[i].label, 6, y + meterH - 1);

        // Background
        aCtx.fillStyle = '#333';
        aCtx.fillRect(42, y, meterW, meterH);

        // Fill
        aCtx.fillStyle = levels[i].color;
        aCtx.fillRect(42, y, meterW * levels[i].value, meterH);
      }
    };
    requestAnimationFrame(renderAudioDebug);

    console.log('[Runtime] Debug audio overlay enabled');
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

    // Wire connectivity to weather provider (skip fetch when offline)
    contextManager.getWeatherProvider().setOnlineCheck(() => connectivityMonitor.isOnline());

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

  // In production, start ActorLoader for hot-loaded community actors
  if (import.meta.env.PROD) {
    const { ActorLoader } = await import('./actors/ActorLoader');
    const actorLoader = new ActorLoader(actorRegistry, {
      basePath: '/actors/community',
      scanInterval: 30000,
      enablePolling: true,
    });
    actorLoader.start();
    console.log('[Runtime] ActorLoader started for community actors');

    // In solo mode with a community actor, wait for it to be loaded
    if (CONFIG.soloMode && CONFIG.soloActorId && !actorRegistry.has(CONFIG.soloActorId)) {
      console.log(`[Runtime] Solo mode: Waiting for community actor "${CONFIG.soloActorId}" to load...`);
      // Force an immediate scan, then wait up to 10s for the actor to appear
      await actorLoader.scan();
      let waited = 0;
      while (!actorRegistry.has(CONFIG.soloActorId) && waited < 10000) {
        await new Promise(resolve => setTimeout(resolve, 500));
        waited += 500;
      }
      if (!actorRegistry.has(CONFIG.soloActorId)) {
        console.error(`[Runtime] Solo mode: Actor "${CONFIG.soloActorId}" not found in builtins or community actors`);
        const container = document.getElementById('canvas-container');
        if (container) {
          container.innerHTML = `
            <div class="loading" style="color: #f44; text-align: center; padding: 40px;">
              <div style="font-size: 18px; margin-bottom: 10px;">Actor not found: "${CONFIG.soloActorId}"</div>
              <div style="font-size: 14px; opacity: 0.7;">Not found in builtin or community actors</div>
            </div>
          `;
        }
        return;
      }
      console.log(`[Runtime] Solo mode: Community actor "${CONFIG.soloActorId}" loaded`);
    }
  }

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
      // Not in builtin glob — may be a community actor loaded via ActorLoader.
      // Don't show error yet; the ActorLoader will try to load it from the manifest.
      console.log(`[Runtime] Solo mode: Actor "${CONFIG.soloActorId}" not in builtins, will check community actors`);
      pathsToLoad = []; // Skip glob loading, let ActorLoader handle it
    } else {
      console.log(`[Runtime] Solo mode: Loading only "${CONFIG.soloActorId}"`);
    }
  }

  // Register each actor to the catalog with a lazy loader.
  // In solo mode, eagerly load the target actor. Otherwise, actors are loaded
  // on demand when selected for a cycle (bounded by LRU eviction).
  for (const path of pathsToLoad) {
    try {
      // We need to load the module once to get metadata for the catalog.
      // The module factory is reusable — Vite caches the import.
      const module = await actorModules[path]();

      if (module.default && !actorRegistry.has(module.default.metadata.id)) {
        const actor = module.default;
        const loader = async () => {
          // Vite caches dynamic imports, so this returns the same module
          const m = await actorModules[path]();
          return m.default;
        };

        if (CONFIG.soloMode) {
          // In solo mode, eagerly load into cache
          actorRegistry.register(actor, path);
          console.log(`[Runtime] Registered + loaded actor: ${actor.metadata.id}`);
        } else {
          // Normal mode: catalog-only registration (lazy load on selection)
          actorRegistry.registerCatalog(actor.metadata, path, loader);
        }
      }
    } catch (error) {
      console.error(`[Runtime] Failed to catalog actor from ${path}:`, error);
    }
  }

  console.log(`[Runtime] Cataloged ${actorRegistry.count} actors (${actorRegistry.loadedCount} loaded)`);
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
