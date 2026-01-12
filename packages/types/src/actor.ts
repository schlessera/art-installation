/**
 * Actor Types
 *
 * Defines the interfaces for actors in the art installation.
 * Actors are sandboxed plugins that paint on the shared canvas.
 */

import type { BrushAPI } from './brush';
import type { FilterAPI } from './filter';
import type { CanvasReadAPI } from './canvas';
import type { ContextAPI } from './context';

/**
 * Actor metadata for gallery display and attribution.
 */
export interface ActorMetadata {
  /** Unique identifier (kebab-case, e.g., "wave-painter") */
  id: string;

  /** Display name (e.g., "Wave Painter") */
  name: string;

  /** Short description of what the actor does */
  description: string;

  /** Author information */
  author: ActorAuthor;

  /** Semantic version (e.g., "1.0.0") */
  version: string;

  /** Categories/tags for filtering (e.g., ["geometric", "audio-reactive"]) */
  tags: string[];

  /** When the actor was first deployed */
  createdAt: Date;

  /** Preview image path (auto-generated or custom) */
  thumbnail?: string;

  /** Preferred activation duration in seconds */
  preferredDuration?: number;

  /** Context APIs this actor wants to use */
  requiredContexts?: ContextType[];
}

/**
 * Actor author information.
 */
export interface ActorAuthor {
  /** Creator's display name */
  name: string;

  /** GitHub username (optional) */
  github?: string;

  /** Personal website URL (optional) */
  url?: string;

  /** Email address (optional) */
  email?: string;
}

/**
 * Available context types.
 */
export type ContextType = 'time' | 'weather' | 'audio' | 'video' | 'social';

/**
 * API provided to actors during setup phase.
 */
export interface ActorSetupAPI {
  /** Read-only canvas access */
  canvas: CanvasReadAPI;

  /** Context APIs */
  context: ContextAPI;

  /**
   * Load an asset (image, font).
   * @param url - Asset URL
   * @param type - Asset type
   * @returns Promise resolving to the loaded asset
   */
  loadAsset(url: string, type: 'image' | 'font'): Promise<unknown>;
}

/**
 * API provided to actors during update (each frame).
 */
export interface ActorUpdateAPI {
  /** Read-only canvas access */
  canvas: CanvasReadAPI;

  /** Drawing API */
  brush: BrushAPI;

  /** Filter/effect API */
  filter: FilterAPI;

  /** Context APIs */
  context: ContextAPI;
}

/**
 * Frame context passed to actor's update method.
 */
export interface FrameContext {
  /** Milliseconds since last frame */
  deltaTime: number;

  /** Total frames since actor was loaded */
  frameCount: number;

  /** Current timestamp (performance.now()) */
  time: number;
}

/**
 * Actor interface - all actors must implement this.
 */
export interface Actor {
  /** Actor metadata */
  readonly metadata: ActorMetadata;

  /**
   * Called once when actor is loaded.
   * Use for initialization, resource loading.
   */
  setup?(api: ActorSetupAPI): Promise<void>;

  /**
   * Called each frame while actor is active.
   * This is where the actor paints on the canvas.
   *
   * @param api - Drawing and context APIs
   * @param frame - Frame timing information
   */
  update(api: ActorUpdateAPI, frame: FrameContext): void;

  /**
   * Called when actor is being deactivated.
   * Clean up resources, finish animations gracefully.
   */
  teardown?(): Promise<void>;

  /**
   * Called when context changes (optional).
   * React to weather changes, audio events, etc.
   */
  onContextChange?(context: ContextAPI): void;
}

/**
 * Actor module export type.
 * Actors must export their implementation as default.
 */
export type ActorModule = {
  default: Actor;
};

/**
 * Actor registration info stored in registry.
 */
export interface RegisteredActor {
  /** Actor implementation */
  actor: Actor;

  /** Path to actor source */
  sourcePath: string;

  /** When actor was registered */
  registeredAt: Date;

  /** Usage statistics */
  stats: ActorUsageStats;
}

/**
 * Actor usage statistics for selection algorithm.
 */
export interface ActorUsageStats {
  /** Total number of times actor has been used */
  totalUses: number;

  /** Total time actor has been active (ms) */
  totalActiveTime: number;

  /** When actor was last used */
  lastUsedAt: Date | null;

  /** Average review score when this actor participated */
  averageReviewScore: number | null;

  /** Number of artworks this actor contributed to */
  artworkContributions: number;
}
