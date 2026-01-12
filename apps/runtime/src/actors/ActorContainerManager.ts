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
import type { ActorUpdateAPI } from '@art/types';

interface ActorContainerEntry {
  actorId: string;
  container: Container;
  brushApi: BrushAPIImpl;
  filterApi: FilterAPIImpl;
  zIndex: number;
}

export class ActorContainerManager {
  private canvasManager: CanvasManager;
  private mainLayer: Container;
  private entries: Map<string, ActorContainerEntry> = new Map();

  // Pre-allocated pools to avoid runtime allocations
  private containerPool: Container[] = [];
  private brushApiPool: BrushAPIImpl[] = [];
  private filterApiPool: FilterAPIImpl[] = [];

  // Pre-allocate for max expected actors (with buffer)
  private static readonly MAX_ACTORS = 10;

  constructor(canvasManager: CanvasManager) {
    this.canvasManager = canvasManager;
    this.mainLayer = canvasManager.getLayer(Layer.Main);
    this.preallocate();
  }

  /**
   * Pre-allocate containers and APIs to avoid allocations during runtime.
   */
  private preallocate(): void {
    for (let i = 0; i < ActorContainerManager.MAX_ACTORS; i++) {
      const container = new Container();
      container.visible = false;
      container.label = `actor-container-pool-${i}`;
      this.mainLayer.addChild(container);
      this.containerPool.push(container);

      // Pre-create BrushAPIImpl and FilterAPIImpl for each container
      // Pool size of 2000 per actor is sufficient for most actors
      this.brushApiPool.push(new BrushAPIImpl(this.canvasManager, Layer.Main, container));
      this.filterApiPool.push(new FilterAPIImpl(this.canvasManager, Layer.Main, container));
    }

    // Enable z-index sorting on main layer
    this.mainLayer.sortableChildren = true;
  }

  /**
   * Setup containers for a new cycle with the given actor IDs.
   * Order determines z-index: first = bottom (0), last = top (highest).
   */
  setupCycle(actorIds: string[]): void {
    this.clearCycle();

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
        `[ActorContainerManager] ${actorIds.length} actors requested, ` +
          `but only ${ActorContainerManager.MAX_ACTORS} containers available`
      );
    }
  }

  /**
   * Get the UpdateAPI for a specific actor.
   * Returns actor-specific brush and filter APIs that render to the actor's container.
   * Also wraps canvas API to inject actorId for layer-aware snapshots.
   */
  getUpdateAPI(actorId: string, baseApi: ActorUpdateAPI): ActorUpdateAPI {
    const entry = this.entries.get(actorId);
    if (!entry) {
      // Fallback to base API if actor not found (shouldn't happen normally)
      console.warn(`[ActorContainerManager] No container for actor: ${actorId}`);
      return baseApi;
    }

    // Wrap canvas API to inject actorId for layer-aware snapshots
    // Note: We need to explicitly bind all methods since spread doesn't copy prototype methods
    const wrappedCanvas = {
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

    return {
      canvas: wrappedCanvas,
      brush: entry.brushApi,
      filter: entry.filterApi,
      context: baseApi.context,
    };
  }

  /**
   * Clear all graphics for a new frame (called at frame start).
   */
  clearFrame(): void {
    for (const entry of this.entries.values()) {
      entry.brushApi.clearFrame();
      entry.filterApi.clearFilters();
    }
  }

  /**
   * Clear all containers at cycle end.
   */
  clearCycle(): void {
    for (const entry of this.entries.values()) {
      entry.brushApi.clearFrame();
      entry.filterApi.clearFilters();
      entry.container.visible = false;
    }
    this.entries.clear();
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
    for (const brushApi of this.brushApiPool) {
      brushApi.destroy();
    }
    for (const filterApi of this.filterApiPool) {
      filterApi.destroy();
    }
    for (const container of this.containerPool) {
      container.destroy({ children: true });
    }
    this.entries.clear();
    this.containerPool = [];
    this.brushApiPool = [];
    this.filterApiPool = [];
  }
}
