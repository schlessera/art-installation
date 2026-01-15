/**
 * Actor Runner
 *
 * Executes actors by providing them with the necessary APIs and calling their
 * lifecycle methods (setup, update, teardown).
 */

import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  CanvasReadAPI,
  BrushAPI,
  FilterAPI,
} from '@art/types';
import { Layer } from '../engine/CanvasManager';
import type { CanvasManager } from '../engine/CanvasManager';
import { BrushAPIImpl } from '../drawing/BrushAPIImpl';
import { FilterAPIImpl } from '../drawing/FilterAPIImpl';
import type { ContextManager } from '../context/ContextManager';

export interface ActiveActor {
  actor: Actor;
  startedAt: number;
  frameCount: number;
  brushApi: BrushAPIImpl;
  filterApi: FilterAPIImpl;
}

/**
 * Runs actors and manages their lifecycle.
 */
export class ActorRunner {
  private canvasManager: CanvasManager;
  private contextManager: ContextManager;
  private activeActors: Map<string, ActiveActor> = new Map();

  constructor(canvasManager: CanvasManager, contextManager: ContextManager) {
    this.canvasManager = canvasManager;
    this.contextManager = contextManager;
  }

  /**
   * Load an asset (stub implementation).
   */
  private async loadAsset(url: string, type: 'image' | 'font'): Promise<unknown> {
    console.log(`[ActorRunner] Loading ${type} asset: ${url}`);
    // For now, just return a placeholder
    // In production, this would use Pixi.js Assets loader
    if (type === 'image') {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });
    }
    return Promise.resolve(null);
  }

  /**
   * Start running an actor.
   */
  async startActor(actor: Actor): Promise<void> {
    const actorId = actor.metadata.id;

    if (this.activeActors.has(actorId)) {
      console.warn(`[ActorRunner] Actor ${actorId} is already running`);
      return;
    }

    // Create APIs for this actor (using Foreground layer)
    const brushApi = new BrushAPIImpl(this.canvasManager, Layer.Foreground);
    const filterApi = new FilterAPIImpl(this.canvasManager, Layer.Foreground);

    const activeActor: ActiveActor = {
      actor,
      startedAt: performance.now(),
      frameCount: 0,
      brushApi,
      filterApi,
    };

    this.activeActors.set(actorId, activeActor);

    // Call setup if defined
    if (actor.setup) {
      const setupApi: ActorSetupAPI = {
        canvas: this.canvasManager as CanvasReadAPI,
        context: this.contextManager.getContextAPI(),
        loadAsset: this.loadAsset.bind(this),
      };

      try {
        await actor.setup(setupApi);
        console.log(`[ActorRunner] Actor ${actorId} setup complete`);
      } catch (error) {
        console.error(`[ActorRunner] Actor ${actorId} setup failed:`, error);
        this.activeActors.delete(actorId);
        throw error;
      }
    }
  }

  /**
   * Stop running an actor.
   */
  async stopActor(actorId: string): Promise<void> {
    const activeActor = this.activeActors.get(actorId);
    if (!activeActor) {
      return;
    }

    // Call teardown if defined
    if (activeActor.actor.teardown) {
      try {
        await activeActor.actor.teardown();
        console.log(`[ActorRunner] Actor ${actorId} teardown complete`);
      } catch (error) {
        console.error(`[ActorRunner] Actor ${actorId} teardown failed:`, error);
      }
    }

    this.activeActors.delete(actorId);
  }

  /**
   * Stop all running actors.
   */
  async stopAll(): Promise<void> {
    const actorIds = Array.from(this.activeActors.keys());
    for (const actorId of actorIds) {
      await this.stopActor(actorId);
    }
  }

  /**
   * Update all running actors for a frame.
   */
  update(frame: FrameContext): void {
    // Clear all graphics from previous frame first
    for (const [, activeActor] of this.activeActors) {
      activeActor.brushApi.clearFrame();
    }

    // Now update all actors
    for (const [actorId, activeActor] of this.activeActors) {
      try {
        // Create update API
        const updateApi: ActorUpdateAPI = {
          canvas: this.canvasManager as CanvasReadAPI,
          brush: activeActor.brushApi as BrushAPI,
          filter: activeActor.filterApi as FilterAPI,
          context: this.contextManager.getContextAPI(),
        };

        // Call update
        activeActor.actor.update(updateApi, frame);
        activeActor.frameCount++;
      } catch (error) {
        console.error(`[ActorRunner] Actor ${actorId} update failed:`, error);
      }
    }
  }

  /**
   * Get count of active actors.
   */
  getActiveCount(): number {
    return this.activeActors.size;
  }

  /**
   * Get active actor IDs.
   */
  getActiveIds(): string[] {
    return Array.from(this.activeActors.keys());
  }

  /**
   * Check if an actor is running.
   */
  isRunning(actorId: string): boolean {
    return this.activeActors.has(actorId);
  }

  /**
   * Get stats for an active actor.
   */
  getActorStats(actorId: string): { frameCount: number; runTime: number } | null {
    const activeActor = this.activeActors.get(actorId);
    if (!activeActor) return null;

    return {
      frameCount: activeActor.frameCount,
      runTime: performance.now() - activeActor.startedAt,
    };
  }
}
