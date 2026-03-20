/**
 * Actor Registry
 *
 * Two-tier actor management to bound memory usage:
 * - Catalog: lightweight metadata + stats for ALL known actors (used for selection)
 * - Loaded cache: full Actor objects, bounded by LRU eviction (used during cycles)
 *
 * Actors are loaded on demand when selected for a cycle and evicted when the
 * cache exceeds MAX_LOADED_ACTORS. No actor is permanently lost — evicted actors
 * stay in the catalog and can be re-loaded when selected again.
 */

import type {
  Actor,
  ActorMetadata,
  ActorCatalogEntry,
  RegisteredActor,
  ActorUsageStats,
  ActorModule,
} from '@art/types';

const MAX_LOADED_ACTORS = 25;

/**
 * Actor registration result.
 */
export interface RegistrationResult {
  success: boolean;
  actorId: string;
  error?: string;
}

/** Internal catalog entry with loader function */
interface CatalogEntryInternal extends ActorCatalogEntry {
  loader: () => Promise<Actor>;
}

/**
 * Manages all known actors with bounded memory via LRU eviction.
 */
export class ActorRegistry {
  /** Catalog: metadata + stats + loader for ALL known actors */
  private catalog: Map<string, CatalogEntryInternal> = new Map();

  /** Loaded cache: full Actor objects, bounded by LRU */
  private loaded: Map<string, Actor> = new Map();

  /** LRU access order: most recently accessed at end */
  private accessOrder: string[] = [];

  /** Actor IDs currently active in a cycle (protected from eviction) */
  private activeActorIds: Set<string> = new Set();

  /** Legacy: loaded modules tracking */
  private loadedModules: Map<string, ActorModule> = new Map();

  // ============ Catalog Registration ============

  /**
   * Register an actor to the catalog with a deferred loader.
   * Does NOT load the actor into memory — only stores metadata.
   */
  registerCatalog(
    metadata: ActorMetadata,
    sourcePath: string,
    loader: () => Promise<Actor>
  ): RegistrationResult {
    const actorId = metadata.id;

    const validationError = this.validateMetadata(metadata);
    if (validationError) {
      return { success: false, actorId, error: validationError };
    }

    if (this.catalog.has(actorId)) {
      return { success: false, actorId, error: `Actor ${actorId} already registered` };
    }

    const stats: ActorUsageStats = {
      totalUses: 0,
      totalActiveTime: 0,
      lastUsedAt: null,
      averageReviewScore: null,
      artworkContributions: 0,
    };

    this.catalog.set(actorId, {
      metadata,
      sourcePath,
      registeredAt: new Date(),
      stats,
      loader,
    });

    console.log(`[ActorRegistry] Cataloged actor: ${actorId}`);
    return { success: true, actorId };
  }

  /**
   * Register a fully-loaded actor (backward-compatible).
   * Adds to both catalog and loaded cache.
   */
  register(actor: Actor, sourcePath: string): RegistrationResult {
    const result = this.registerCatalog(
      actor.metadata,
      sourcePath,
      () => Promise.resolve(actor)
    );
    if (result.success) {
      // Also put it in the loaded cache
      this.loaded.set(actor.metadata.id, actor);
      this.markAccessed(actor.metadata.id);
      this.evictIfNeeded();
    }
    return result;
  }

  // ============ Catalog Access (for selection) ============

  /**
   * Get catalog entries for all known actors (lightweight, for selection).
   */
  getCatalog(): ActorCatalogEntry[] {
    return Array.from(this.catalog.values()).map(({ loader: _loader, ...entry }) => entry);
  }

  /**
   * Get catalog entry by ID.
   */
  getCatalogEntry(actorId: string): ActorCatalogEntry | undefined {
    const entry = this.catalog.get(actorId);
    if (!entry) return undefined;
    const { loader: _loader, ...catalogEntry } = entry;
    return catalogEntry;
  }

  /**
   * Get total count of known actors (catalog size).
   */
  get count(): number {
    return this.catalog.size;
  }

  /**
   * Get count of currently loaded actors.
   */
  get loadedCount(): number {
    return this.loaded.size;
  }

  /**
   * Check if an actor is known (in catalog).
   */
  has(actorId: string): boolean {
    return this.catalog.has(actorId);
  }

  /**
   * Check if an actor is currently loaded in memory.
   */
  isLoaded(actorId: string): boolean {
    return this.loaded.has(actorId);
  }

  // ============ Loading / Unloading ============

  /**
   * Load an actor into memory. Returns the full Actor object.
   * If already loaded, returns from cache. Otherwise calls the loader.
   */
  async ensureLoaded(actorId: string): Promise<Actor | null> {
    // Already loaded — mark accessed and return
    if (this.loaded.has(actorId)) {
      this.markAccessed(actorId);
      return this.loaded.get(actorId)!;
    }

    // Load from catalog
    const entry = this.catalog.get(actorId);
    if (!entry) {
      console.warn(`[ActorRegistry] Cannot load unknown actor: ${actorId}`);
      return null;
    }

    try {
      const actor = await entry.loader();
      this.loaded.set(actorId, actor);
      this.markAccessed(actorId);
      this.evictIfNeeded();
      console.log(`[ActorRegistry] Loaded actor: ${actorId} (${this.loaded.size}/${MAX_LOADED_ACTORS})`);
      return actor;
    } catch (error) {
      console.error(`[ActorRegistry] Failed to load actor ${actorId}:`, error);
      return null;
    }
  }

  /**
   * Unload an actor from memory (catalog entry stays).
   */
  unloadActor(actorId: string): void {
    if (this.loaded.has(actorId)) {
      this.loaded.delete(actorId);
      const idx = this.accessOrder.indexOf(actorId);
      if (idx !== -1) this.accessOrder.splice(idx, 1);
    }
  }

  /**
   * Mark actors as currently active (protects from eviction).
   */
  setActiveActors(ids: Set<string>): void {
    this.activeActorIds = ids;
  }

  // ============ Backward-Compatible Access ============

  /**
   * Get a registered actor by ID (only if loaded).
   * Returns a RegisteredActor view combining catalog entry + loaded actor.
   */
  get(actorId: string): RegisteredActor | undefined {
    const entry = this.catalog.get(actorId);
    const actor = this.loaded.get(actorId);
    if (!entry || !actor) return undefined;

    return {
      actor,
      sourcePath: entry.sourcePath,
      registeredAt: entry.registeredAt,
      stats: entry.stats,
    };
  }

  /**
   * Get all currently loaded actors as RegisteredActor views.
   */
  getAll(): RegisteredActor[] {
    const result: RegisteredActor[] = [];
    for (const [id, actor] of this.loaded) {
      const entry = this.catalog.get(id);
      if (entry) {
        result.push({
          actor,
          sourcePath: entry.sourcePath,
          registeredAt: entry.registeredAt,
          stats: entry.stats,
        });
      }
    }
    return result;
  }

  /**
   * Get all actor IDs (from catalog — all known actors).
   */
  getAllIds(): string[] {
    return Array.from(this.catalog.keys());
  }

  /**
   * Unregister an actor completely (from both catalog and loaded cache).
   */
  unregister(actorId: string): boolean {
    if (!this.catalog.has(actorId)) {
      return false;
    }
    this.catalog.delete(actorId);
    this.loaded.delete(actorId);
    this.loadedModules.delete(actorId);
    const idx = this.accessOrder.indexOf(actorId);
    if (idx !== -1) this.accessOrder.splice(idx, 1);
    console.log(`[ActorRegistry] Unregistered actor: ${actorId}`);
    return true;
  }

  // ============ Usage Stats ============

  /**
   * Update usage stats for an actor (operates on catalog).
   */
  updateStats(actorId: string, update: Partial<ActorUsageStats>): void {
    const entry = this.catalog.get(actorId);
    if (!entry) return;
    Object.assign(entry.stats, update);
  }

  /**
   * Record that an actor was used.
   */
  recordUsage(actorId: string, activeTime: number): void {
    const entry = this.catalog.get(actorId);
    if (!entry) return;
    entry.stats.totalUses++;
    entry.stats.totalActiveTime += activeTime;
    entry.stats.lastUsedAt = new Date();
  }

  /**
   * Record an artwork contribution.
   */
  recordContribution(actorId: string, reviewScore: number | null): void {
    const entry = this.catalog.get(actorId);
    if (!entry) return;
    entry.stats.artworkContributions++;
    if (reviewScore !== null) {
      if (entry.stats.averageReviewScore === null) {
        entry.stats.averageReviewScore = reviewScore;
      } else {
        const total = entry.stats.averageReviewScore * (entry.stats.artworkContributions - 1);
        entry.stats.averageReviewScore = (total + reviewScore) / entry.stats.artworkContributions;
      }
    }
  }

  // ============ Query Helpers ============

  getByUsage(): RegisteredActor[] {
    return this.getAll().sort((a, b) => a.stats.totalUses - b.stats.totalUses);
  }

  getUnused(): RegisteredActor[] {
    return this.getAll().filter((r) => r.stats.totalUses === 0);
  }

  getRarelyUsed(maxUses: number): RegisteredActor[] {
    return this.getAll().filter((r) => r.stats.totalUses < maxUses);
  }

  getByTag(tag: string): RegisteredActor[] {
    return this.getAll().filter((r) => r.actor.metadata.tags.includes(tag));
  }

  // ============ Module Loading (legacy) ============

  async loadFromDirectory(basePath: string, type: 'builtin' | 'community'): Promise<RegistrationResult[]> {
    console.log(`[ActorRegistry] Loading actors from ${basePath}/${type}/`);
    return [];
  }

  async loadActor(modulePath: string): Promise<RegistrationResult> {
    try {
      const module = await import(/* @vite-ignore */ modulePath) as ActorModule;
      if (!module.default) {
        return { success: false, actorId: 'unknown', error: 'Module does not export a default actor' };
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

  // ============ Lifecycle ============

  clear(): void {
    this.catalog.clear();
    this.loaded.clear();
    this.loadedModules.clear();
    this.accessOrder = [];
    this.activeActorIds.clear();
    console.log('[ActorRegistry] Cleared all actors');
  }

  getStats(): {
    totalActors: number;
    loadedActors: number;
    totalUses: number;
    actorsByUsage: { id: string; uses: number }[];
  } {
    const entries = Array.from(this.catalog.values());
    return {
      totalActors: entries.length,
      loadedActors: this.loaded.size,
      totalUses: entries.reduce((sum, e) => sum + e.stats.totalUses, 0),
      actorsByUsage: entries
        .map((e) => ({ id: e.metadata.id, uses: e.stats.totalUses }))
        .sort((a, b) => b.uses - a.uses),
    };
  }

  // ============ Internal ============

  private markAccessed(actorId: string): void {
    const idx = this.accessOrder.indexOf(actorId);
    if (idx !== -1) this.accessOrder.splice(idx, 1);
    this.accessOrder.push(actorId);
  }

  private evictIfNeeded(): void {
    while (this.loaded.size > MAX_LOADED_ACTORS) {
      // Find oldest non-active actor to evict
      let evicted = false;
      for (let i = 0; i < this.accessOrder.length; i++) {
        const id = this.accessOrder[i];
        if (!this.activeActorIds.has(id) && this.loaded.has(id)) {
          this.loaded.delete(id);
          this.accessOrder.splice(i, 1);
          console.log(`[ActorRegistry] Evicted LRU actor: ${id} (${this.loaded.size}/${MAX_LOADED_ACTORS})`);
          evicted = true;
          break;
        }
      }
      if (!evicted) break; // All loaded actors are active — can't evict
    }
  }

  private validateMetadata(metadata: ActorMetadata): string | null {
    if (!metadata.id) return 'Actor ID is required';
    if (!/^[a-z0-9-]+$/.test(metadata.id)) return 'Actor ID must be kebab-case';
    if (!metadata.name) return 'Actor name is required';
    if (!metadata.author?.name) return 'Author name is required';
    if (!metadata.version) return 'Version is required';
    if (!/^\d+\.\d+\.\d+$/.test(metadata.version)) return 'Version must be semver format';
    return null;
  }
}
