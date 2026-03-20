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
  ActorRole,
} from '@art/types';
import { getActorRole } from '@art/types';
import type { ActorRegistry } from './ActorRegistry';
import type { CanvasManager } from '../engine/CanvasManager';
import type { ContextAPI } from '@art/types';
import type { ActorContainerManager } from './ActorContainerManager';

/**
 * Configuration for the scheduler.
 */
export interface SchedulerConfig {
  /** Minimum foreground actors per cycle (default: 2) */
  minActors: number;

  /** Maximum foreground actors per cycle (default: 5) */
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

  /** Fixed background actor ID (bypasses random selection) */
  fixedBackgroundActorId?: string;

  /** Fixed background filter actor IDs (bypasses random selection) */
  fixedBackgroundFilterIds?: string[];

  /** Fixed foreground filter actor IDs (bypasses random selection) */
  fixedForegroundFilterIds?: string[];

  /** Weight distribution for background filter count [0, 1, 2] (default: [0.5, 0.35, 0.15]) */
  backgroundFilterWeights: number[];

  /** Weight distribution for foreground filter count [0, 1, 2] (default: [0.2, 0.45, 0.35]) */
  foregroundFilterWeights: number[];
}

const DEFAULT_CONFIG: SchedulerConfig = {
  minActors: 2,
  maxActors: 5,
  cycleDuration: 60000,
  noveltyBias: 0.7,
  recentUsePenalty: 0.3,
  recentUseWindow: 300000,
  fixedActorIds: undefined,
  fixedBackgroundActorId: undefined,
  fixedBackgroundFilterIds: undefined,
  fixedForegroundFilterIds: undefined,
  // Background filters: weighted towards 0 (50% chance of 0, 35% of 1, 15% of 2)
  backgroundFilterWeights: [0.5, 0.35, 0.15],
  // Foreground filters: weighted towards 0-1 (45% chance of 0, 40% of 1, 15% of 2)
  foregroundFilterWeights: [0.45, 0.4, 0.15],
};

/**
 * Active actor instance with runtime state.
 */
interface ActiveActor {
  registered: RegisteredActor;
  actor: Actor;
  startTime: number;
  frameCount: number;
  role: ActorRole;
}

/**
 * Manages actor selection and lifecycle.
 */
export class ActorScheduler {
  private registry: ActorRegistry;
  private config: SchedulerConfig;

  // Active cycle state - organized by role
  private backgroundActor: ActiveActor | null = null;
  private backgroundFilterActors: ActiveActor[] = [];
  private foregroundActors: ActiveActor[] = [];
  private foregroundFilterActors: ActiveActor[] = [];
  private cycleStartTime = 0;
  private cycleNumber = 0;
  private transitioning = false;

  /** @deprecated Use role-specific arrays instead */
  private get activeActors(): ActiveActor[] {
    const all: ActiveActor[] = [];
    if (this.backgroundActor) all.push(this.backgroundActor);
    all.push(...this.backgroundFilterActors);
    all.push(...this.foregroundActors);
    all.push(...this.foregroundFilterActors);
    return all;
  }

  // APIs for actors
  private canvasManager: CanvasManager | null = null;
  private contextAPI: ContextAPI | null = null;
  private setupAPI: ActorSetupAPI | null = null;
  private updateAPI: ActorUpdateAPI | null = null;
  private containerManager: ActorContainerManager | null = null;

  // Callbacks
  private onCycleStartCallbacks: ((actorIds: string[]) => void)[] = [];
  private onCycleEndCallbacks: ((actorIds: string[], duration: number) => void | Promise<void>)[] = [];
  private onPrepareNewCycleCallback: (() => void) | null = null;

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
   * Selects actors by role:
   * - 1 background actor (or solid color fallback)
   * - 0-2 background filters (weighted towards 0)
   * - 2-5 foreground actors
   * - 0-2 foreground filters (weighted towards 1-2)
   */
  async startCycle(): Promise<string[]> {
    // Guard against concurrent cycle transitions
    if (this.transitioning) return [];
    this.transitioning = true;

    try {
    return await this._startCycleImpl();
    } finally {
      this.transitioning = false;
    }
  }

  private async _startCycleImpl(): Promise<string[]> {
    // End previous cycle if active
    if (this.activeActors.length > 0) {
      await this.endCycle();
    }

    // Clear canvas between cycles (RenderTextures, stale pixels)
    if (this.canvasManager) {
      this.canvasManager.clearBetweenCycles();
    }

    // Prepare for new cycle (e.g., randomize display mode)
    if (this.onPrepareNewCycleCallback) {
      this.onPrepareNewCycleCallback();
    }

    this.cycleStartTime = performance.now();
    this.cycleNumber++;

    // Reset role-specific arrays
    this.backgroundActor = null;
    this.backgroundFilterActors = [];
    this.foregroundActors = [];
    this.foregroundFilterActors = [];

    // 1. Select background actor
    const bgActorId = await this.selectAndSetupBackgroundActor();

    // 2. Select background filters
    const bgFilterIds = await this.selectAndSetupBackgroundFilters();

    // 3. Select foreground actors
    const fgActorIds = await this.selectAndSetupForegroundActors();

    // 4. Select foreground filters
    const fgFilterIds = await this.selectAndSetupForegroundFilters();

    // Setup containers
    if (this.containerManager) {
      this.containerManager.setupBackgroundActor(bgActorId);
      this.containerManager.setupBackgroundFilters(bgFilterIds);
      this.containerManager.setupForegroundActors(fgActorIds);
      this.containerManager.setupForegroundFilters(fgFilterIds);
    }

    // Get all actor IDs for logging and callbacks
    const allActorIds = this.activeActors.map((a) => a.actor.metadata.id);

    console.log(`[ActorScheduler] Started cycle ${this.cycleNumber}:`);
    console.log(`  - Background: ${bgActorId || 'solid color'}`);
    console.log(`  - Background filters: ${bgFilterIds.length > 0 ? bgFilterIds.join(', ') : 'none'}`);
    console.log(`  - Foreground: ${fgActorIds.join(', ')}`);
    console.log(`  - Foreground filters: ${fgFilterIds.length > 0 ? fgFilterIds.join(', ') : 'none'}`);

    // Notify callbacks
    for (const callback of this.onCycleStartCallbacks) {
      callback(allActorIds);
    }

    return allActorIds;
  }

  /**
   * Select and setup the background actor.
   * @returns Actor ID or null for solid color fallback
   */
  private async selectAndSetupBackgroundActor(): Promise<string | null> {
    let registered: RegisteredActor | undefined;

    if (this.config.fixedBackgroundActorId) {
      registered = this.registry.get(this.config.fixedBackgroundActorId);
      if (!registered) {
        console.warn(`[ActorScheduler] Fixed background actor not found: ${this.config.fixedBackgroundActorId}`);
      }
    } else {
      // Select from background actors
      const bgActors = this.selectActorsByRole('background', 1);
      registered = bgActors[0];
    }

    if (!registered) {
      // No background actor available - solid color fallback
      return null;
    }

    // Setup the actor
    const activeActor = await this.setupActor(registered, 'background');
    if (activeActor) {
      this.backgroundActor = activeActor;
      return activeActor.actor.metadata.id;
    }

    return null;
  }

  /**
   * Select and setup background filter actors.
   * @returns Array of filter actor IDs
   */
  private async selectAndSetupBackgroundFilters(): Promise<string[]> {
    let selectedActors: RegisteredActor[];

    // Check if fixed filter IDs are specified (including empty array to disable filters)
    if (this.config.fixedBackgroundFilterIds !== undefined) {
      // Empty array means no filters (disabled)
      if (this.config.fixedBackgroundFilterIds.length === 0) {
        return [];
      }
      selectedActors = this.config.fixedBackgroundFilterIds
        .map(id => this.registry.get(id))
        .filter((r): r is RegisteredActor => r !== undefined);
    } else {
      const count = this.weightedRandomCount(this.config.backgroundFilterWeights);
      selectedActors = this.selectActorsByRole('filter', count);
    }

    const ids: string[] = [];
    for (const registered of selectedActors) {
      const activeActor = await this.setupActor(registered, 'filter');
      if (activeActor) {
        this.backgroundFilterActors.push(activeActor);
        ids.push(activeActor.actor.metadata.id);
      }
    }

    return ids;
  }

  /**
   * Select and setup foreground actors.
   * @returns Array of actor IDs
   */
  private async selectAndSetupForegroundActors(): Promise<string[]> {
    let selectedActors: RegisteredActor[];

    if (this.config.fixedActorIds && this.config.fixedActorIds.length > 0) {
      // Filter to only foreground actors
      selectedActors = this.config.fixedActorIds
        .map(id => this.registry.get(id))
        .filter((r): r is RegisteredActor => {
          if (!r) return false;
          return getActorRole(r.actor.metadata) === 'foreground';
        });
    } else {
      const count = this.randomInt(this.config.minActors, this.config.maxActors);
      selectedActors = this.selectActorsByRole('foreground', count);
    }

    const ids: string[] = [];
    for (const registered of selectedActors) {
      const activeActor = await this.setupActor(registered, 'foreground');
      if (activeActor) {
        this.foregroundActors.push(activeActor);
        ids.push(activeActor.actor.metadata.id);
      }
    }

    return ids;
  }

  /**
   * Select and setup foreground filter actors.
   * @returns Array of filter actor IDs
   */
  private async selectAndSetupForegroundFilters(): Promise<string[]> {
    let selectedActors: RegisteredActor[];

    // Check if fixed filter IDs are specified (including empty array to disable filters)
    if (this.config.fixedForegroundFilterIds !== undefined) {
      // Empty array means no filters (disabled)
      if (this.config.fixedForegroundFilterIds.length === 0) {
        return [];
      }
      selectedActors = this.config.fixedForegroundFilterIds
        .map(id => this.registry.get(id))
        .filter((r): r is RegisteredActor => r !== undefined);
    } else {
      const count = this.weightedRandomCount(this.config.foregroundFilterWeights);
      // Exclude filters already used for background
      const usedFilterIds = new Set(this.backgroundFilterActors.map(a => a.actor.metadata.id));
      selectedActors = this.selectActorsByRole('filter', count, usedFilterIds);
    }

    const ids: string[] = [];
    for (const registered of selectedActors) {
      const activeActor = await this.setupActor(registered, 'filter');
      if (activeActor) {
        this.foregroundFilterActors.push(activeActor);
        ids.push(activeActor.actor.metadata.id);
      }
    }

    return ids;
  }

  /**
   * Setup a single actor (call setup() if defined).
   */
  private async setupActor(registered: RegisteredActor, role: ActorRole): Promise<ActiveActor | null> {
    const activeActor: ActiveActor = {
      registered,
      actor: registered.actor,
      startTime: this.cycleStartTime,
      frameCount: 0,
      role,
    };

    if (activeActor.actor.setup && this.setupAPI) {
      try {
        await activeActor.actor.setup(this.setupAPI);
      } catch (error) {
        console.error(
          `[ActorScheduler] Setup failed for ${registered.actor.metadata.id}:`,
          error
        );
        return null;
      }
    }

    return activeActor;
  }

  /**
   * Select actors by role using weighted selection.
   */
  private selectActorsByRole(role: ActorRole, count: number, exclude?: Set<string>): RegisteredActor[] {
    const allActors = this.registry.getAll().filter(r => {
      const actorRole = getActorRole(r.actor.metadata);
      if (actorRole !== role) return false;
      if (exclude && exclude.has(r.actor.metadata.id)) return false;
      return true;
    });

    if (allActors.length === 0) return [];

    // Calculate selection scores
    const scored = allActors.map((registered) => ({
      registered,
      score: this.calculateSelectionScore(registered),
    }));

    // Sort by score (highest first)
    scored.sort((a, b) => b.score - a.score);

    // Weighted random selection
    const selected: RegisteredActor[] = [];
    const available = [...scored];

    while (selected.length < count && available.length > 0) {
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
   * Get a random count based on weight distribution.
   * @param weights - Array of weights for [0, 1, 2, ...] counts
   */
  private weightedRandomCount(weights: number[]): number {
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < weights.length; i++) {
      random -= weights[i];
      if (random <= 0) return i;
    }

    return weights.length - 1;
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

    // Notify callbacks (await to ensure snapshots are captured before clearing)
    for (const callback of this.onCycleEndCallbacks) {
      await callback(actorIds, duration);
    }

    // Brief delay to ensure snapshot capture completes
    await new Promise(resolve => setTimeout(resolve, 100));

    // Clear per-actor containers
    if (this.containerManager) {
      this.containerManager.clearCycle();
    }

    // Clear role-specific arrays
    this.backgroundActor = null;
    this.backgroundFilterActors = [];
    this.foregroundActors = [];
    this.foregroundFilterActors = [];
  }

  /**
   * Update all active actors (called each frame).
   * For three-phase rendering, use individual update methods instead:
   * 1. updateBackgroundActor()
   * 2. updateBackgroundFilters()
   * 3. updateForegroundActors()
   * 4. updateForegroundFilters()
   */
  update(frame: FrameContext): void {
    this.updateBackgroundActor(frame);
    this.updateBackgroundFilters(frame);
    this.updateForegroundActors(frame);
    this.updateForegroundFilters(frame);
  }

  /**
   * Update the background actor.
   * Call this first in the render loop.
   */
  updateBackgroundActor(frame: FrameContext): void {
    if (!this.updateAPI || !this.backgroundActor) return;

    try {
      const actorApi = this.containerManager
        ? this.containerManager.getUpdateAPI(this.backgroundActor.actor.metadata.id, this.updateAPI)
        : this.updateAPI;

      this.backgroundActor.actor.update(actorApi, {
        ...frame,
        frameCount: this.backgroundActor.frameCount,
      });
      this.backgroundActor.frameCount++;
    } catch (error) {
      console.error(
        `[ActorScheduler] Background update failed for ${this.backgroundActor.actor.metadata.id}:`,
        error
      );
    }
  }

  /**
   * Update background filter actors.
   * Call this after background actor, before foreground actors.
   */
  updateBackgroundFilters(frame: FrameContext): void {
    if (!this.updateAPI) return;

    for (const activeActor of this.backgroundFilterActors) {
      try {
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
          `[ActorScheduler] Background filter update failed for ${activeActor.actor.metadata.id}:`,
          error
        );
      }
    }
  }

  /**
   * Update foreground actors.
   * Call this after background filters.
   */
  updateForegroundActors(frame: FrameContext): void {
    if (!this.updateAPI) return;

    for (const activeActor of this.foregroundActors) {
      try {
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
          `[ActorScheduler] Foreground update failed for ${activeActor.actor.metadata.id}:`,
          error
        );
      }
    }
  }

  /**
   * Update foreground filter actors.
   * Call this last in the render loop.
   */
  updateForegroundFilters(frame: FrameContext): void {
    if (!this.updateAPI) return;

    for (const activeActor of this.foregroundFilterActors) {
      try {
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
          `[ActorScheduler] Foreground filter update failed for ${activeActor.actor.metadata.id}:`,
          error
        );
      }
    }
  }

  /**
   * @deprecated Use updateForegroundActors() instead.
   */
  updateRegularActors(frame: FrameContext): void {
    this.updateForegroundActors(frame);
  }

  /**
   * @deprecated Use updateForegroundFilters() instead.
   */
  updateFilterActors(frame: FrameContext): void {
    this.updateForegroundFilters(frame);
  }

  /**
   * Check if any background filter actors are active.
   */
  hasBackgroundFilters(): boolean {
    return this.backgroundFilterActors.length > 0;
  }

  /**
   * Check if any foreground filter actors are active.
   */
  hasForegroundFilters(): boolean {
    return this.foregroundFilterActors.length > 0;
  }

  /**
   * @deprecated Use hasForegroundFilters() instead.
   */
  hasFilterActors(): boolean {
    return this.hasForegroundFilters();
  }

  /**
   * Check if a background actor is active.
   */
  hasBackgroundActor(): boolean {
    return this.backgroundActor !== null;
  }

  /**
   * Check if a cycle transition is in progress.
   */
  isTransitioning(): boolean {
    return this.transitioning;
  }

  /**
   * Check if the current cycle should end.
   */
  shouldEndCycle(): boolean {
    if (this.transitioning) return false;
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

    // Community actor boost: 4x selection weight over builtins
    if (registered.sourcePath && registered.sourcePath.includes('community')) {
      score *= 4;
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
   * Register callback for preparing a new cycle.
   * This is called before actor selection, allowing context to be randomized
   * (e.g., display mode light/dark).
   */
  onPrepareNewCycle(callback: () => void): () => void {
    this.onPrepareNewCycleCallback = callback;
    return () => {
      this.onPrepareNewCycleCallback = null;
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
