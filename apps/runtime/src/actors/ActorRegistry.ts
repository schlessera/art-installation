/**
 * Actor Registry
 *
 * Manages the collection of registered actors and their usage statistics.
 */

import type {
  Actor,
  ActorMetadata,
  RegisteredActor,
  ActorUsageStats,
  ActorModule,
} from '@art/types';

/**
 * Actor registration result.
 */
export interface RegistrationResult {
  success: boolean;
  actorId: string;
  error?: string;
}

/**
 * Manages all registered actors.
 */
export class ActorRegistry {
  private actors: Map<string, RegisteredActor> = new Map();
  private loadedModules: Map<string, ActorModule> = new Map();

  /**
   * Register an actor.
   */
  register(actor: Actor, sourcePath: string): RegistrationResult {
    const actorId = actor.metadata.id;

    // Validate metadata
    const validationError = this.validateMetadata(actor.metadata);
    if (validationError) {
      return { success: false, actorId, error: validationError };
    }

    // Check for duplicate
    if (this.actors.has(actorId)) {
      return { success: false, actorId, error: `Actor ${actorId} already registered` };
    }

    // Create initial stats
    const stats: ActorUsageStats = {
      totalUses: 0,
      totalActiveTime: 0,
      lastUsedAt: null,
      averageReviewScore: null,
      artworkContributions: 0,
    };

    // Register
    this.actors.set(actorId, {
      actor,
      sourcePath,
      registeredAt: new Date(),
      stats,
    });

    console.log(`[ActorRegistry] Registered actor: ${actorId}`);
    return { success: true, actorId };
  }

  /**
   * Unregister an actor.
   */
  unregister(actorId: string): boolean {
    if (!this.actors.has(actorId)) {
      return false;
    }
    this.actors.delete(actorId);
    this.loadedModules.delete(actorId);
    console.log(`[ActorRegistry] Unregistered actor: ${actorId}`);
    return true;
  }

  /**
   * Get a registered actor by ID.
   */
  get(actorId: string): RegisteredActor | undefined {
    return this.actors.get(actorId);
  }

  /**
   * Get all registered actors.
   */
  getAll(): RegisteredActor[] {
    return Array.from(this.actors.values());
  }

  /**
   * Get all actor IDs.
   */
  getAllIds(): string[] {
    return Array.from(this.actors.keys());
  }

  /**
   * Get actor count.
   */
  get count(): number {
    return this.actors.size;
  }

  /**
   * Check if an actor is registered.
   */
  has(actorId: string): boolean {
    return this.actors.has(actorId);
  }

  /**
   * Update usage stats for an actor.
   */
  updateStats(
    actorId: string,
    update: Partial<ActorUsageStats>
  ): void {
    const registered = this.actors.get(actorId);
    if (!registered) return;

    Object.assign(registered.stats, update);
  }

  /**
   * Record that an actor was used.
   */
  recordUsage(actorId: string, activeTime: number): void {
    const registered = this.actors.get(actorId);
    if (!registered) return;

    registered.stats.totalUses++;
    registered.stats.totalActiveTime += activeTime;
    registered.stats.lastUsedAt = new Date();
  }

  /**
   * Record an artwork contribution.
   */
  recordContribution(actorId: string, reviewScore: number | null): void {
    const registered = this.actors.get(actorId);
    if (!registered) return;

    registered.stats.artworkContributions++;

    if (reviewScore !== null) {
      // Update running average
      if (registered.stats.averageReviewScore === null) {
        registered.stats.averageReviewScore = reviewScore;
      } else {
        const total = registered.stats.averageReviewScore * (registered.stats.artworkContributions - 1);
        registered.stats.averageReviewScore = (total + reviewScore) / registered.stats.artworkContributions;
      }
    }
  }

  /**
   * Get actors sorted by usage (least used first).
   */
  getByUsage(): RegisteredActor[] {
    return this.getAll().sort((a, b) => a.stats.totalUses - b.stats.totalUses);
  }

  /**
   * Get actors that have never been used.
   */
  getUnused(): RegisteredActor[] {
    return this.getAll().filter((r) => r.stats.totalUses === 0);
  }

  /**
   * Get actors used less than N times.
   */
  getRarelyUsed(maxUses: number): RegisteredActor[] {
    return this.getAll().filter((r) => r.stats.totalUses < maxUses);
  }

  /**
   * Get actors by tag.
   */
  getByTag(tag: string): RegisteredActor[] {
    return this.getAll().filter((r) =>
      r.actor.metadata.tags.includes(tag)
    );
  }

  /**
   * Load actors from a directory (dynamic import).
   */
  async loadFromDirectory(basePath: string, type: 'builtin' | 'community'): Promise<RegistrationResult[]> {
    const results: RegistrationResult[] = [];

    // In a browser environment, we need to use Vite's import.meta.glob
    // This is a placeholder - actual implementation would use dynamic imports
    console.log(`[ActorRegistry] Loading actors from ${basePath}/${type}/`);

    // Note: In production, this would use:
    // const modules = import.meta.glob('/path/to/actors/**/index.ts')
    // for (const [path, module] of Object.entries(modules)) { ... }

    return results;
  }

  /**
   * Load a single actor from a module path.
   */
  async loadActor(modulePath: string): Promise<RegistrationResult> {
    try {
      // Dynamic import
      const module = await import(/* @vite-ignore */ modulePath) as ActorModule;

      if (!module.default) {
        return {
          success: false,
          actorId: 'unknown',
          error: 'Module does not export a default actor',
        };
      }

      return this.register(module.default, modulePath);
    } catch (error) {
      return {
        success: false,
        actorId: 'unknown',
        error: `Failed to load module: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Validate actor metadata.
   */
  private validateMetadata(metadata: ActorMetadata): string | null {
    if (!metadata.id) {
      return 'Actor ID is required';
    }

    if (!/^[a-z0-9-]+$/.test(metadata.id)) {
      return 'Actor ID must be kebab-case (lowercase letters, numbers, hyphens)';
    }

    if (!metadata.name) {
      return 'Actor name is required';
    }

    if (!metadata.author?.name) {
      return 'Author name is required';
    }

    if (!metadata.version) {
      return 'Version is required';
    }

    if (!/^\d+\.\d+\.\d+$/.test(metadata.version)) {
      return 'Version must be semver format (e.g., 1.0.0)';
    }

    return null;
  }

  /**
   * Clear all registered actors.
   */
  clear(): void {
    this.actors.clear();
    this.loadedModules.clear();
    console.log('[ActorRegistry] Cleared all actors');
  }

  /**
   * Export registry stats for debugging.
   */
  getStats(): {
    totalActors: number;
    totalUses: number;
    actorsByUsage: { id: string; uses: number }[];
  } {
    const actors = this.getAll();
    return {
      totalActors: actors.length,
      totalUses: actors.reduce((sum, a) => sum + a.stats.totalUses, 0),
      actorsByUsage: actors
        .map((a) => ({ id: a.actor.metadata.id, uses: a.stats.totalUses }))
        .sort((a, b) => b.uses - a.uses),
    };
  }
}
