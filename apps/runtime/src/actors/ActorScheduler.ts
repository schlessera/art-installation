/**
 * Actor Scheduler
 *
 * Manages actor selection, lifecycle, and cycle timing.
 * Implements the weighted selection algorithm that favors unused actors.
 */

import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  RegisteredActor,
} from '@art/types';
import type { ActorRegistry } from './ActorRegistry';
import type { CanvasManager } from '../engine/CanvasManager';
import type { ContextAPI } from '@art/types';
import type { ActorContainerManager } from './ActorContainerManager';

/**
 * Configuration for the scheduler.
 */
export interface SchedulerConfig {
  /** Minimum actors per cycle (default: 3) */
  minActors: number;

  /** Maximum actors per cycle (default: 6) */
  maxActors: number;

  /** Cycle duration in milliseconds (default: 60000 = 1 minute) */
  cycleDuration: number;

  /** Bias toward unused/rarely used actors (0-1, default: 0.7) */
  noveltyBias: number;

  /** Penalty for recently used actors (0-1, default: 0.3) */
  recentUsePenalty: number;

  /** Time window for "recently used" in ms (default: 300000 = 5 minutes) */
  recentUseWindow: number;

  /** Fixed list of actor IDs to use (bypasses random selection) */
  fixedActorIds?: string[];
}

const DEFAULT_CONFIG: SchedulerConfig = {
  minActors: 2,
  maxActors: 5,
  cycleDuration: 60000,
  noveltyBias: 0.7,
  recentUsePenalty: 0.3,
  recentUseWindow: 300000,
  fixedActorIds: undefined,
};

/**
 * Active actor instance with runtime state.
 */
interface ActiveActor {
  registered: RegisteredActor;
  actor: Actor;
  startTime: number;
  frameCount: number;
}

/**
 * Manages actor selection and lifecycle.
 */
export class ActorScheduler {
  private registry: ActorRegistry;
  private config: SchedulerConfig;

  // Active cycle state
  private activeActors: ActiveActor[] = [];
  private cycleStartTime = 0;
  private cycleNumber = 0;

  // APIs for actors
  private canvasManager: CanvasManager | null = null;
  private contextAPI: ContextAPI | null = null;
  private setupAPI: ActorSetupAPI | null = null;
  private updateAPI: ActorUpdateAPI | null = null;
  private containerManager: ActorContainerManager | null = null;

  // Callbacks
  private onCycleStartCallbacks: ((actorIds: string[]) => void)[] = [];
  private onCycleEndCallbacks: ((actorIds: string[], duration: number) => void)[] = [];

  constructor(registry: ActorRegistry, config: Partial<SchedulerConfig> = {}) {
    this.registry = registry;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the scheduler with canvas and context.
   */
  initialize(
    canvasManager: CanvasManager,
    contextAPI: ContextAPI,
    setupAPI: ActorSetupAPI,
    updateAPI: ActorUpdateAPI,
    containerManager?: ActorContainerManager
  ): void {
    this.canvasManager = canvasManager;
    this.contextAPI = contextAPI;
    this.setupAPI = setupAPI;
    this.updateAPI = updateAPI;
    this.containerManager = containerManager ?? null;
  }

  /**
   * Start a new cycle with selected actors.
   * Uses fixedActorIds if configured, otherwise randomly selects actors.
   */
  async startCycle(): Promise<string[]> {
    // End previous cycle if active
    if (this.activeActors.length > 0) {
      await this.endCycle();
    }

    // Select actors for this cycle
    let selectedActors: RegisteredActor[];

    if (this.config.fixedActorIds && this.config.fixedActorIds.length > 0) {
      // Use fixed actor list (for testing)
      selectedActors = this.config.fixedActorIds
        .map(id => this.registry.get(id))
        .filter((r): r is RegisteredActor => r !== undefined);

      if (selectedActors.length === 0) {
        console.warn('[ActorScheduler] No valid actors found in fixed list:', this.config.fixedActorIds);
        return [];
      }
      if (selectedActors.length < this.config.fixedActorIds.length) {
        const missing = this.config.fixedActorIds.filter(id => !this.registry.has(id));
        console.warn('[ActorScheduler] Some actors not found:', missing);
      }
    } else {
      // Random selection (normal behavior)
      const actorCount = this.randomInt(this.config.minActors, this.config.maxActors);
      selectedActors = this.selectActors(actorCount);

      if (selectedActors.length === 0) {
        console.warn('[ActorScheduler] No actors available for cycle');
        return [];
      }
    }

    // Initialize active actors
    this.activeActors = [];
    this.cycleStartTime = performance.now();
    this.cycleNumber++;

    for (const registered of selectedActors) {
      const activeActor: ActiveActor = {
        registered,
        actor: registered.actor,
        startTime: this.cycleStartTime,
        frameCount: 0,
      };

      // Call setup if defined
      if (activeActor.actor.setup && this.setupAPI) {
        try {
          await activeActor.actor.setup(this.setupAPI);
        } catch (error) {
          console.error(
            `[ActorScheduler] Setup failed for ${registered.actor.metadata.id}:`,
            error
          );
          continue;
        }
      }

      this.activeActors.push(activeActor);
    }

    const actorIds = this.activeActors.map((a) => a.actor.metadata.id);

    // Setup per-actor containers with z-order (first = bottom, last = top)
    if (this.containerManager) {
      this.containerManager.setupCycle(actorIds);
    }

    console.log(`[ActorScheduler] Started cycle ${this.cycleNumber} with actors:`, actorIds);

    // Notify callbacks
    for (const callback of this.onCycleStartCallbacks) {
      callback(actorIds);
    }

    return actorIds;
  }

  /**
   * End the current cycle.
   */
  async endCycle(): Promise<void> {
    const duration = performance.now() - this.cycleStartTime;
    const actorIds = this.activeActors.map((a) => a.actor.metadata.id);

    // Call teardown on each actor
    for (const activeActor of this.activeActors) {
      if (activeActor.actor.teardown) {
        try {
          await activeActor.actor.teardown();
        } catch (error) {
          console.error(
            `[ActorScheduler] Teardown failed for ${activeActor.actor.metadata.id}:`,
            error
          );
        }
      }

      // Record usage
      this.registry.recordUsage(
        activeActor.actor.metadata.id,
        performance.now() - activeActor.startTime
      );
    }

    console.log(
      `[ActorScheduler] Ended cycle ${this.cycleNumber} after ${Math.round(duration)}ms`
    );

    // Notify callbacks
    for (const callback of this.onCycleEndCallbacks) {
      callback(actorIds, duration);
    }

    // Clear per-actor containers
    if (this.containerManager) {
      this.containerManager.clearCycle();
    }

    this.activeActors = [];
  }

  /**
   * Update all active actors (called each frame).
   */
  update(frame: FrameContext): void {
    if (!this.updateAPI) return;

    for (const activeActor of this.activeActors) {
      try {
        // Get per-actor API with dedicated container (for z-order layering)
        const actorApi = this.containerManager
          ? this.containerManager.getUpdateAPI(activeActor.actor.metadata.id, this.updateAPI)
          : this.updateAPI;

        activeActor.actor.update(actorApi, {
          ...frame,
          frameCount: activeActor.frameCount,
        });
        activeActor.frameCount++;
      } catch (error) {
        console.error(
          `[ActorScheduler] Update failed for ${activeActor.actor.metadata.id}:`,
          error
        );
      }
    }
  }

  /**
   * Check if the current cycle should end.
   */
  shouldEndCycle(): boolean {
    if (this.activeActors.length === 0) return false;
    return performance.now() - this.cycleStartTime >= this.config.cycleDuration;
  }

  /**
   * Get currently active actor IDs.
   */
  getActiveActorIds(): string[] {
    return this.activeActors.map((a) => a.actor.metadata.id);
  }

  /**
   * Get active actor count.
   */
  getActiveActorCount(): number {
    return this.activeActors.length;
  }

  /**
   * Select actors using the weighted selection algorithm.
   */
  private selectActors(count: number): RegisteredActor[] {
    const allActors = this.registry.getAll();
    if (allActors.length === 0) return [];

    // Calculate selection scores
    const scored = allActors.map((registered) => ({
      registered,
      score: this.calculateSelectionScore(registered),
    }));

    // Sort by score (highest first)
    scored.sort((a, b) => b.score - a.score);

    // Select top N with some randomization
    const selected: RegisteredActor[] = [];
    const available = [...scored];

    while (selected.length < count && available.length > 0) {
      // Weighted random selection favoring higher scores
      const totalScore = available.reduce((sum, a) => sum + a.score, 0);
      let random = Math.random() * totalScore;

      for (let i = 0; i < available.length; i++) {
        random -= available[i].score;
        if (random <= 0) {
          selected.push(available[i].registered);
          available.splice(i, 1);
          break;
        }
      }

      // Fallback: take the first available
      if (random > 0 && available.length > 0) {
        selected.push(available[0].registered);
        available.shift();
      }
    }

    return selected;
  }

  /**
   * Calculate selection score for an actor.
   *
   * Formula from PRD:
   * score = 100
   *   + (50 * noveltyBias) if uses == 0       // Never used = high priority
   *   + (25 / log2(uses+1) * noveltyBias)     // Rarely used = medium priority
   *   - 30 if usedRecently                     // Used recently = penalty
   *   +/- reviewFeedbackBonus                  // AI feedback influences selection
   */
  private calculateSelectionScore(registered: RegisteredActor): number {
    const { stats } = registered;
    const { noveltyBias, recentUsePenalty, recentUseWindow } = this.config;

    let score = 100;

    // Novelty bonus for unused actors
    if (stats.totalUses === 0) {
      score += 50 * noveltyBias;
    } else {
      // Logarithmic bonus for rarely used actors
      score += (25 / Math.log2(stats.totalUses + 1)) * noveltyBias;
    }

    // Penalty for recently used actors
    if (stats.lastUsedAt) {
      const timeSinceUse = Date.now() - stats.lastUsedAt.getTime();
      if (timeSinceUse < recentUseWindow) {
        score -= 30 * recentUsePenalty;
      }
    }

    // Review feedback bonus
    if (stats.averageReviewScore !== null) {
      // Scale review score (-10 to +10 range)
      const reviewBonus = (stats.averageReviewScore - 50) / 5;
      score += reviewBonus;
    }

    // Ensure minimum score
    return Math.max(score, 1);
  }

  /**
   * Generate random integer in range [min, max].
   */
  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Register callback for cycle start.
   */
  onCycleStart(callback: (actorIds: string[]) => void): () => void {
    this.onCycleStartCallbacks.push(callback);
    return () => {
      const index = this.onCycleStartCallbacks.indexOf(callback);
      if (index > -1) this.onCycleStartCallbacks.splice(index, 1);
    };
  }

  /**
   * Register callback for cycle end.
   */
  onCycleEnd(callback: (actorIds: string[], duration: number) => void): () => void {
    this.onCycleEndCallbacks.push(callback);
    return () => {
      const index = this.onCycleEndCallbacks.indexOf(callback);
      if (index > -1) this.onCycleEndCallbacks.splice(index, 1);
    };
  }

  /**
   * Get current cycle info.
   */
  getCycleInfo(): {
    cycleNumber: number;
    elapsed: number;
    remaining: number;
    progress: number;
    actorIds: string[];
  } {
    const elapsed = performance.now() - this.cycleStartTime;
    const remaining = Math.max(0, this.config.cycleDuration - elapsed);
    const progress = Math.min(1, elapsed / this.config.cycleDuration);

    return {
      cycleNumber: this.cycleNumber,
      elapsed,
      remaining,
      progress,
      actorIds: this.getActiveActorIds(),
    };
  }

  /**
   * Update configuration.
   */
  setConfig(config: Partial<SchedulerConfig>): void {
    Object.assign(this.config, config);
  }

  /**
   * Get current configuration.
   */
  getConfig(): SchedulerConfig {
    return { ...this.config };
  }
}
