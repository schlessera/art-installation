/**
 * Actor Loader
 *
 * Dynamically loads actor bundles at runtime without requiring
 * a restart or recompilation of the runtime.
 *
 * Actors are loaded as standalone JavaScript bundles that self-register
 * with a global registry upon execution.
 */

import type { Actor } from '@art/types';
import { ActorRegistry } from './ActorRegistry';

/**
 * Global registration function that actors call to register themselves.
 * This is exposed on the window object for actor bundles to use.
 */
declare global {
  interface Window {
    __registerActor?: (actor: Actor, bundlePath: string) => void;
    __actorRegistry?: ActorRegistry;
  }
}

/**
 * Configuration for ActorLoader.
 */
export interface ActorLoaderConfig {
  /** Base path for actor bundles (default: '/actors') */
  basePath: string;

  /** Scan interval in ms (default: 30000 = 30 seconds) */
  scanInterval: number;

  /** API endpoint for fetching actor list (optional) */
  actorListEndpoint?: string;

  /** Enable file watching via polling */
  enablePolling: boolean;
}

const DEFAULT_CONFIG: ActorLoaderConfig = {
  basePath: '/actors',
  scanInterval: 30000,
  enablePolling: true,
};

/**
 * Dynamically loads actor bundles at runtime.
 */
export class ActorLoader {
  private registry: ActorRegistry;
  private config: ActorLoaderConfig;
  private loadedBundles: Set<string> = new Set();
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private pendingLoads: Map<string, Promise<void>> = new Map();
  private loadedScripts: Map<string, HTMLScriptElement> = new Map();

  constructor(registry: ActorRegistry, config: Partial<ActorLoaderConfig> = {}) {
    this.registry = registry;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Expose global registration function
    this.setupGlobalRegistration();
  }

  /**
   * Set up the global actor registration function.
   * Actors call window.__registerActor(actor, path) when they load.
   */
  private setupGlobalRegistration(): void {
    window.__actorRegistry = this.registry;
    window.__registerActor = (actor: Actor, bundlePath: string) => {
      console.log(`[ActorLoader] Actor self-registered: ${actor.metadata.id}`);
      const result = this.registry.register(actor, bundlePath);
      if (!result.success) {
        console.error(`[ActorLoader] Failed to register ${actor.metadata.id}:`, result.error);
      }
    };
  }

  /**
   * Start periodic scanning for new actors.
   */
  start(): void {
    if (this.scanTimer) return;

    // Initial scan
    this.scan();

    // Set up periodic scanning
    if (this.config.enablePolling) {
      this.scanTimer = setInterval(() => this.scan(), this.config.scanInterval);
    }

    console.log('[ActorLoader] Started actor scanning');
  }

  /**
   * Stop periodic scanning.
   */
  stop(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
    console.log('[ActorLoader] Stopped actor scanning');
  }

  /**
   * Scan for new actor bundles.
   */
  async scan(): Promise<string[]> {
    console.log('[ActorLoader] Scanning for new actors...');

    const bundles = await this.discoverBundles();
    const newBundles = bundles.filter((b) => !this.loadedBundles.has(b));

    if (newBundles.length === 0) {
      console.log('[ActorLoader] No new actors found');
      return [];
    }

    console.log(`[ActorLoader] Found ${newBundles.length} new actor(s)`);

    // Load new bundles
    const loaded: string[] = [];
    for (const bundle of newBundles) {
      try {
        await this.loadBundle(bundle);
        loaded.push(bundle);
      } catch (error) {
        console.error(`[ActorLoader] Failed to load ${bundle}:`, error);
      }
    }

    return loaded;
  }

  /**
   * Discover available actor bundles.
   */
  private async discoverBundles(): Promise<string[]> {
    // If an API endpoint is configured, use it
    if (this.config.actorListEndpoint) {
      try {
        const response = await fetch(this.config.actorListEndpoint);
        if (response.ok) {
          const data = await response.json();
          return data.actors || [];
        }
      } catch (error) {
        console.error('[ActorLoader] Failed to fetch actor list:', error);
      }
    }

    // Otherwise, try to fetch a manifest file
    try {
      const manifestPath = `${this.config.basePath}/manifest.json`;
      const response = await fetch(manifestPath);
      if (response.ok) {
        const manifest = await response.json();
        return manifest.actors || [];
      }
    } catch {
      // Manifest not found, which is OK
    }

    // Fallback: try known paths
    return this.probeForBundles();
  }

  /**
   * Probe for bundles by trying known paths.
   */
  private async probeForBundles(): Promise<string[]> {
    const found: string[] = [];
    const probePaths = [
      'builtin/wave-painter/dist/index.js',
      'builtin/weather-mood/dist/index.js',
      'builtin/audio-reactive/dist/index.js',
      'community/*/dist/index.js', // Would need server-side glob
    ];

    for (const path of probePaths) {
      if (path.includes('*')) continue; // Skip glob patterns

      const fullPath = `${this.config.basePath}/${path}`;
      try {
        const response = await fetch(fullPath, { method: 'HEAD' });
        if (response.ok) {
          found.push(fullPath);
        }
      } catch {
        // Bundle not found
      }
    }

    return found;
  }

  /**
   * Load an actor bundle by path.
   */
  async loadBundle(bundlePath: string): Promise<void> {
    // Check if already loading
    const existing = this.pendingLoads.get(bundlePath);
    if (existing) {
      return existing;
    }

    // Check if already loaded
    if (this.loadedBundles.has(bundlePath)) {
      console.log(`[ActorLoader] Bundle already loaded: ${bundlePath}`);
      return;
    }

    const loadPromise = this.doLoadBundle(bundlePath);
    this.pendingLoads.set(bundlePath, loadPromise);

    try {
      await loadPromise;
      this.loadedBundles.add(bundlePath);
      console.log(`[ActorLoader] Loaded bundle: ${bundlePath}`);
    } finally {
      this.pendingLoads.delete(bundlePath);
    }
  }

  /**
   * Actually load a bundle via script injection.
   */
  private async doLoadBundle(bundlePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = bundlePath;
      script.async = true;

      script.onload = () => {
        // Track the script element for cleanup
        this.loadedScripts.set(bundlePath, script);
        // Give the module a moment to execute and register
        setTimeout(resolve, 100);
      };

      script.onerror = (error) => {
        // Remove failed script from DOM
        script.remove();
        reject(new Error(`Failed to load script: ${bundlePath} - ${error}`));
      };

      document.head.appendChild(script);
    });
  }

  /**
   * Load an actor from a JavaScript string (for testing/dev).
   */
  async loadFromString(code: string, virtualPath: string): Promise<void> {
    // Create a blob URL for the code
    const blob = new Blob([code], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);

    try {
      await this.doLoadBundle(url);
      this.loadedBundles.add(virtualPath);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Unload an actor bundle (remove from registry).
   */
  unloadBundle(bundlePath: string): boolean {
    if (!this.loadedBundles.has(bundlePath)) {
      return false;
    }

    // Find and unregister the actor associated with this bundle
    const actors = this.registry.getAll();
    for (const registered of actors) {
      if (registered.sourcePath === bundlePath) {
        this.registry.unregister(registered.actor.metadata.id);
      }
    }

    // Remove script element from DOM to prevent memory leak
    const script = this.loadedScripts.get(bundlePath);
    if (script) {
      script.remove();
      this.loadedScripts.delete(bundlePath);
    }

    this.loadedBundles.delete(bundlePath);
    return true;
  }

  /**
   * Get list of loaded bundle paths.
   */
  getLoadedBundles(): string[] {
    return Array.from(this.loadedBundles);
  }

  /**
   * Check if a bundle is loaded.
   */
  isBundleLoaded(bundlePath: string): boolean {
    return this.loadedBundles.has(bundlePath);
  }

  /**
   * Force reload all bundles (clear and rescan).
   */
  async reload(): Promise<void> {
    // Remove all script elements from DOM
    for (const script of this.loadedScripts.values()) {
      script.remove();
    }
    this.loadedScripts.clear();

    // Clear registry
    this.registry.clear();
    this.loadedBundles.clear();

    // Rescan
    await this.scan();
  }

  /**
   * Set scan interval.
   */
  setScanInterval(ms: number): void {
    this.config.scanInterval = ms;

    // Restart timer if running
    if (this.scanTimer) {
      this.stop();
      this.start();
    }
  }
}
