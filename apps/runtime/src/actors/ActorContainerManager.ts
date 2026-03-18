/**
 * Actor Container Manager
 *
 * Manages per-actor Pixi.js Containers for z-order control.
 * First selected actor = z-index 0 (bottom), last = highest (top).
 *
 * Follows memory management best practices:
 * - Pre-allocates containers and APIs at startup
 * - Reuses containers between cycles via pooling
 * - Properly destroys resources on cleanup
 */

import { Container } from 'pixi.js';
import type { CanvasManager } from '../engine/CanvasManager';
import { Layer } from '../engine/CanvasManager';
import { BrushAPIImpl } from '../drawing/BrushAPIImpl';
import { FilterAPIImpl } from '../drawing/FilterAPIImpl';
import type { ActorUpdateAPI, ActorMetadata } from '@art/types';
import { getActorRole } from '@art/types';

interface ActorContainerEntry {
  actorId: string;
  container: Container;
  brushApi: BrushAPIImpl;
  filterApi: FilterAPIImpl;
  zIndex: number;
}

/**
 * Entry for global filter actors (no container needed, just FilterAPI).
 */
interface FilterActorEntry {
  actorId: string;
  filterApi: FilterAPIImpl;
}

export class ActorContainerManager {
  private canvasManager: CanvasManager;
  private foregroundLayer: Container;
  private backgroundLayer: Container;
  private entries: Map<string, ActorContainerEntry> = new Map();

  // Background actor (single actor per cycle)
  private backgroundActorId: string | null = null;
  private backgroundContainer: Container | null = null;
  private backgroundBrushApi: BrushAPIImpl | null = null;
  private backgroundFilterApi: FilterAPIImpl | null = null;

  // Background filter actors (post-processing for background layer)
  private backgroundFilterActorEntries: Map<string, FilterActorEntry> = new Map();
  private sharedBackgroundFilterApi: FilterAPIImpl | null = null;

  // Foreground filter actors (post-processing for entire scene)
  private foregroundFilterActorEntries: Map<string, FilterActorEntry> = new Map();
  private sharedForegroundFilterApi: FilterAPIImpl | null = null;

  // Pre-allocated pools to avoid runtime allocations
  private containerPool: Container[] = [];
  private brushApiPool: BrushAPIImpl[] = [];
  private filterApiPool: FilterAPIImpl[] = [];

  // Pre-allocate for max expected actors (with buffer)
  private static readonly MAX_ACTORS = 10;
  private static readonly MAX_FILTER_ACTORS = 5;

  constructor(canvasManager: CanvasManager) {
    this.canvasManager = canvasManager;
    this.foregroundLayer = canvasManager.getLayer(Layer.Foreground);
    this.backgroundLayer = canvasManager.getLayer(Layer.Background);
    this.preallocate();
  }

  /**
   * Pre-allocate containers and APIs to avoid allocations during runtime.
   */
  private preallocate(): void {
    // Pre-allocate foreground actor containers
    for (let i = 0; i < ActorContainerManager.MAX_ACTORS; i++) {
      const container = new Container();
      container.visible = false;
      container.label = `actor-container-pool-${i}`;
      this.foregroundLayer.addChild(container);
      this.containerPool.push(container);

      // Pre-create BrushAPIImpl and FilterAPIImpl for each container
      // Pool size of 2000 per actor is sufficient for most actors
      this.brushApiPool.push(new BrushAPIImpl(this.canvasManager, Layer.Foreground, container));
      this.filterApiPool.push(new FilterAPIImpl(this.canvasManager, Layer.Foreground, container));
    }

    // Enable z-index sorting on foreground layer
    this.foregroundLayer.sortableChildren = true;

    // Pre-allocate background actor container (single actor)
    this.backgroundContainer = new Container();
    this.backgroundContainer.visible = false;
    this.backgroundContainer.label = 'background-actor-container';
    this.backgroundLayer.addChild(this.backgroundContainer);
    this.backgroundBrushApi = new BrushAPIImpl(this.canvasManager, Layer.Background, this.backgroundContainer);
    this.backgroundFilterApi = new FilterAPIImpl(this.canvasManager, Layer.Background, this.backgroundContainer);

    // Note: Filter APIs for post-processing are created lazily in setup methods
    // because they need the post-process sprite which may not exist yet
  }

  /**
   * Setup the background actor for a cycle.
   * @param actorId - ID of the background actor, or null for solid color fallback
   */
  setupBackgroundActor(actorId: string | null): void {
    this.backgroundActorId = actorId;

    if (actorId && this.backgroundContainer) {
      this.backgroundContainer.visible = true;
      this.backgroundContainer.label = `background-actor-${actorId}`;
      this.canvasManager.hideSolidColorBackground();
    } else {
      // No background actor - use solid color fallback
      if (this.backgroundContainer) {
        this.backgroundContainer.visible = false;
      }
      const color = this.canvasManager.generateRandomBackgroundColor();
      this.canvasManager.drawSolidColorBackground(color);
    }
  }

  /**
   * Setup background filter actors (post-processing for background layer).
   * @param actorIds - IDs of filter actors to apply to background
   */
  setupBackgroundFilters(actorIds: string[]): void {
    this.backgroundFilterActorEntries.clear();

    if (actorIds.length === 0) return;

    const postProcessSprite = this.canvasManager.getBackgroundPostProcessSprite();
    if (!postProcessSprite) {
      // Initialize background post-processing if not already done
      this.canvasManager.initBackgroundPostProcessing();
      const sprite = this.canvasManager.getBackgroundPostProcessSprite();
      if (!sprite) {
        console.warn('[ActorContainerManager] Background post-process sprite not available');
        return;
      }
    }

    // Create shared FilterAPI for background filters
    if (!this.sharedBackgroundFilterApi) {
      const sprite = this.canvasManager.getBackgroundPostProcessSprite()!;
      this.sharedBackgroundFilterApi = new FilterAPIImpl(
        this.canvasManager,
        Layer.BackgroundEffects,
        sprite
      );
    }

    // Register background filter actors
    let filterCount = 0;
    for (const actorId of actorIds) {
      if (filterCount >= ActorContainerManager.MAX_FILTER_ACTORS) {
        console.warn(`[ActorContainerManager] Max ${ActorContainerManager.MAX_FILTER_ACTORS} background filter actors exceeded`);
        break;
      }

      this.backgroundFilterActorEntries.set(actorId, {
        actorId,
        filterApi: this.sharedBackgroundFilterApi,
      });

      filterCount++;
    }

    if (this.backgroundFilterActorEntries.size > 0) {
      console.log(`[ActorContainerManager] Setup ${this.backgroundFilterActorEntries.size} background filter actors`);
    }
  }

  /**
   * Setup foreground actor containers for a new cycle.
   * Order determines z-index: first = bottom (0), last = top (highest).
   */
  setupForegroundActors(actorIds: string[]): void {
    // Clear existing foreground entries
    for (const entry of this.entries.values()) {
      entry.brushApi.clearFrame();
      entry.filterApi.clearFilters();
      entry.container.visible = false;
    }
    this.entries.clear();

    for (let i = 0; i < actorIds.length && i < ActorContainerManager.MAX_ACTORS; i++) {
      const actorId = actorIds[i];
      const container = this.containerPool[i];
      const brushApi = this.brushApiPool[i];
      const filterApi = this.filterApiPool[i];

      container.visible = true;
      container.zIndex = i; // Lower index = rendered first (behind)
      container.label = `actor-${actorId}`;

      this.entries.set(actorId, {
        actorId,
        container,
        brushApi,
        filterApi,
        zIndex: i,
      });
    }

    if (actorIds.length > ActorContainerManager.MAX_ACTORS) {
      console.warn(
        `[ActorContainerManager] ${actorIds.length} foreground actors requested, ` +
          `but only ${ActorContainerManager.MAX_ACTORS} containers available`
      );
    }
  }

  /**
   * @deprecated Use setupForegroundActors() instead.
   */
  setupCycle(actorIds: string[]): void {
    this.setupForegroundActors(actorIds);
  }

  /**
   * Setup foreground filter actors (post-processing for entire scene).
   * @param actorIds - IDs of filter actors to apply to foreground
   */
  setupForegroundFilters(actorIds: string[]): void {
    this.foregroundFilterActorEntries.clear();

    if (actorIds.length === 0) return;

    const postProcessSprite = this.canvasManager.getForegroundPostProcessSprite();
    if (!postProcessSprite) {
      // Initialize foreground post-processing if not already done
      this.canvasManager.initForegroundPostProcessing();
      const sprite = this.canvasManager.getForegroundPostProcessSprite();
      if (!sprite) {
        console.warn('[ActorContainerManager] Foreground post-process sprite not available');
        return;
      }
    }

    // Create shared FilterAPI for foreground filters
    if (!this.sharedForegroundFilterApi) {
      const sprite = this.canvasManager.getForegroundPostProcessSprite()!;
      this.sharedForegroundFilterApi = new FilterAPIImpl(
        this.canvasManager,
        Layer.ForegroundEffects,
        sprite
      );
    }

    // Register foreground filter actors
    let filterCount = 0;
    for (const actorId of actorIds) {
      if (filterCount >= ActorContainerManager.MAX_FILTER_ACTORS) {
        console.warn(`[ActorContainerManager] Max ${ActorContainerManager.MAX_FILTER_ACTORS} foreground filter actors exceeded`);
        break;
      }

      this.foregroundFilterActorEntries.set(actorId, {
        actorId,
        filterApi: this.sharedForegroundFilterApi,
      });

      filterCount++;
    }

    if (this.foregroundFilterActorEntries.size > 0) {
      console.log(`[ActorContainerManager] Setup ${this.foregroundFilterActorEntries.size} foreground filter actors`);
    }
  }

  /**
   * @deprecated Use setupBackgroundFilters() and setupForegroundFilters() instead.
   */
  setupFilterActors(actorIds: string[], metadataMap: Map<string, ActorMetadata>): void {
    // For backwards compatibility, treat all filter actors as foreground filters
    const filterActorIds = actorIds.filter(id => {
      const metadata = metadataMap.get(id);
      return metadata && getActorRole(metadata) === 'filter';
    });
    this.setupForegroundFilters(filterActorIds);
  }

  /**
   * Check if an actor is a background filter actor.
   */
  isBackgroundFilterActor(actorId: string): boolean {
    return this.backgroundFilterActorEntries.has(actorId);
  }

  /**
   * Check if an actor is a foreground filter actor.
   */
  isForegroundFilterActor(actorId: string): boolean {
    return this.foregroundFilterActorEntries.has(actorId);
  }

  /**
   * Check if an actor is any type of filter actor.
   */
  isFilterActor(actorId: string): boolean {
    return this.backgroundFilterActorEntries.has(actorId) ||
           this.foregroundFilterActorEntries.has(actorId);
  }

  /**
   * Get the IDs of all active background filter actors.
   */
  getBackgroundFilterActorIds(): string[] {
    return Array.from(this.backgroundFilterActorEntries.keys());
  }

  /**
   * Get the IDs of all active foreground filter actors.
   */
  getForegroundFilterActorIds(): string[] {
    return Array.from(this.foregroundFilterActorEntries.keys());
  }

  /**
   * @deprecated Use getBackgroundFilterActorIds() or getForegroundFilterActorIds() instead.
   */
  getFilterActorIds(): string[] {
    return this.getForegroundFilterActorIds();
  }

  /**
   * Get the current background actor ID.
   */
  getBackgroundActorId(): string | null {
    return this.backgroundActorId;
  }

  /**
   * Get the IDs of all active foreground actors.
   */
  getForegroundActorIds(): string[] {
    return Array.from(this.entries.keys());
  }

  /**
   * Get the UpdateAPI for a specific actor.
   * Routes to the appropriate container/API based on actor registration.
   *
   * @param actorId - The actor's ID
   * @param baseApi - The base API to wrap
   */
  getUpdateAPI(actorId: string, baseApi: ActorUpdateAPI): ActorUpdateAPI {
    // Check if this is a background filter actor
    const bgFilterEntry = this.backgroundFilterActorEntries.get(actorId);
    if (bgFilterEntry) {
      return {
        canvas: baseApi.canvas,
        brush: this.createNoOpBrush(),
        filter: bgFilterEntry.filterApi,
        context: baseApi.context,
      };
    }

    // Check if this is a foreground filter actor
    const fgFilterEntry = this.foregroundFilterActorEntries.get(actorId);
    if (fgFilterEntry) {
      return {
        canvas: baseApi.canvas,
        brush: this.createNoOpBrush(),
        filter: fgFilterEntry.filterApi,
        context: baseApi.context,
      };
    }

    // Check if this is the background actor
    if (actorId === this.backgroundActorId && this.backgroundBrushApi && this.backgroundFilterApi) {
      return {
        canvas: this.wrapCanvas(baseApi, actorId),
        brush: this.backgroundBrushApi,
        filter: this.backgroundFilterApi,
        context: baseApi.context,
      };
    }

    // Standard foreground actor
    const entry = this.entries.get(actorId);
    if (!entry) {
      // Fallback to base API if actor not found (shouldn't happen normally)
      console.warn(`[ActorContainerManager] No container for actor: ${actorId}`);
      return baseApi;
    }

    return {
      canvas: this.wrapCanvas(baseApi, actorId),
      brush: entry.brushApi,
      filter: entry.filterApi,
      context: baseApi.context,
    };
  }

  /**
   * Wrap canvas API to inject actorId for layer-aware snapshots.
   */
  private wrapCanvas(baseApi: ActorUpdateAPI, actorId: string) {
    return {
      getSize: () => baseApi.canvas.getSize(),
      getPixel: (x: number, y: number) => baseApi.canvas.getPixel(x, y),
      getRegionAverage: (rect: import('@art/types').Rectangle) => baseApi.canvas.getRegionAverage(rect),
      getHistogram: () => baseApi.canvas.getHistogram(),
      getImageData: (region?: import('@art/types').Rectangle) => baseApi.canvas.getImageData(region),
      getComplexity: () => baseApi.canvas.getComplexity(),
      getDominantColors: (count: number) => baseApi.canvas.getDominantColors(count),
      isEmpty: (x: number, y: number, threshold?: number) => baseApi.canvas.isEmpty(x, y, threshold),
      findEmptyRegions: (minSize: number) => baseApi.canvas.findEmptyRegions(minSize),
      getBrightness: (x: number, y: number) => baseApi.canvas.getBrightness(x, y),
      getAverageBrightness: () => baseApi.canvas.getAverageBrightness(),
      // Layer-aware capture: only inject actorId if explicitly requested
      // Pass belowActorId: 'self' to get automatic layer-aware snapshot
      getCanvasSnapshotAsync: (scale?: number, options?: { belowActorId?: string }) => {
        const resolvedOptions = options?.belowActorId === 'self'
          ? { ...options, belowActorId: actorId }
          : options;
        return baseApi.canvas.getCanvasSnapshotAsync(scale, resolvedOptions);
      },
    };
  }

  /**
   * Create a no-op BrushAPI for filter actors (they shouldn't draw anything).
   */
  private createNoOpBrush(): import('@art/types').BrushAPI {
    const noop = () => {};
    const noopReturn = () => ({} as never);
    return {
      // Shapes
      circle: noop,
      rect: noop,
      roundRect: noop,
      line: noop,
      polygon: noop,
      regularPolygon: noop,
      arc: noop,
      ellipse: noop,
      star: noop,
      // Curves
      stroke: noop,
      bezier: noop,
      quadratic: noop,
      // Text & Images
      text: noop,
      image: noop,
      // Path building
      beginPath: noopReturn,
      // Transform
      pushMatrix: noop,
      popMatrix: noop,
      translate: noop,
      rotate: noop,
      scale: noop,
      // State
      setBlendMode: noop,
      setAlpha: noop,
      clear: noop,
      background: noop,
    };
  }

  /**
   * Clear all graphics for a new frame (called at frame start).
   * Preserves custom shader cache to avoid recompilation every frame.
   */
  clearFrame(): void {
    // Clear foreground actors
    for (const entry of this.entries.values()) {
      entry.brushApi.clearFrame();
      entry.filterApi.clearFiltersPreserveCache();
    }

    // Clear background actor
    if (this.backgroundBrushApi) {
      this.backgroundBrushApi.clearFrame();
    }
    if (this.backgroundFilterApi) {
      this.backgroundFilterApi.clearFiltersPreserveCache();
    }

    // Clear shared filter APIs (filter actors will re-apply their filters each frame)
    if (this.sharedBackgroundFilterApi) {
      this.sharedBackgroundFilterApi.clearFiltersPreserveCache();
    }
    if (this.sharedForegroundFilterApi) {
      this.sharedForegroundFilterApi.clearFiltersPreserveCache();
    }
  }

  /**
   * Clear all containers at cycle end.
   */
  clearCycle(): void {
    // Clear foreground actors — clearCycle() clears ALL pooled graphics content
    for (const entry of this.entries.values()) {
      entry.brushApi.clearCycle();
      entry.filterApi.clearFilters();
      entry.container.visible = false;
    }
    this.entries.clear();

    // Clear background actor
    this.backgroundActorId = null;
    if (this.backgroundContainer) {
      this.backgroundContainer.visible = false;
    }
    if (this.backgroundBrushApi) {
      this.backgroundBrushApi.clearCycle();
    }
    if (this.backgroundFilterApi) {
      this.backgroundFilterApi.clearFilters();
    }

    // Clear shared filter APIs
    if (this.sharedBackgroundFilterApi) {
      this.sharedBackgroundFilterApi.clearFilters();
    }
    if (this.sharedForegroundFilterApi) {
      this.sharedForegroundFilterApi.clearFilters();
    }
    this.backgroundFilterActorEntries.clear();
    this.foregroundFilterActorEntries.clear();
  }

  /**
   * Get the number of active actor containers.
   */
  getActiveCount(): number {
    return this.entries.size;
  }

  /**
   * Get the z-index for a specific actor.
   */
  getActorZIndex(actorId: string): number | undefined {
    return this.entries.get(actorId)?.zIndex;
  }

  /**
   * Hide actors at and above the given z-index.
   * Used for layer-aware snapshots.
   * @returns Array of actor IDs that were hidden (for later restoration)
   */
  hideActorsAtAndAbove(zIndex: number): string[] {
    const hidden: string[] = [];
    for (const entry of this.entries.values()) {
      if (entry.zIndex >= zIndex && entry.container.visible) {
        entry.container.visible = false;
        hidden.push(entry.actorId);
      }
    }
    return hidden;
  }

  /**
   * Restore visibility of previously hidden actors.
   */
  restoreActors(actorIds: string[]): void {
    for (const actorId of actorIds) {
      const entry = this.entries.get(actorId);
      if (entry) {
        entry.container.visible = true;
      }
    }
  }

  /**
   * Destroy all resources.
   */
  destroy(): void {
    // Destroy foreground pools
    for (const brushApi of this.brushApiPool) {
      brushApi.destroy();
    }
    for (const filterApi of this.filterApiPool) {
      filterApi.destroy();
    }
    for (const container of this.containerPool) {
      container.destroy({ children: true });
    }

    // Destroy background resources
    if (this.backgroundBrushApi) {
      this.backgroundBrushApi.destroy();
      this.backgroundBrushApi = null;
    }
    if (this.backgroundFilterApi) {
      this.backgroundFilterApi.destroy();
      this.backgroundFilterApi = null;
    }
    if (this.backgroundContainer) {
      this.backgroundContainer.destroy({ children: true });
      this.backgroundContainer = null;
    }

    // Clean up shared filter APIs
    if (this.sharedBackgroundFilterApi) {
      this.sharedBackgroundFilterApi.destroy();
      this.sharedBackgroundFilterApi = null;
    }
    if (this.sharedForegroundFilterApi) {
      this.sharedForegroundFilterApi.destroy();
      this.sharedForegroundFilterApi = null;
    }

    this.entries.clear();
    this.backgroundFilterActorEntries.clear();
    this.foregroundFilterActorEntries.clear();
    this.backgroundActorId = null;
    this.containerPool = [];
    this.brushApiPool = [];
    this.filterApiPool = [];
  }
}
