/**
 * Artwork Types
 *
 * Defines interfaces for saved artworks in the gallery.
 */

import type { ContextSnapshot } from './context';

/**
 * Actor contribution to an artwork.
 */
export interface ActorContribution {
  /** Actor ID */
  actorId: string;

  /** Actor display name */
  actorName: string;

  /** Author's display name */
  authorName: string;

  /** Author's GitHub username */
  authorGithub?: string;

  /** Contribution weight (0-1) based on activity during cycle */
  contributionWeight: number;

  /** Number of draw operations by this actor */
  operationCount: number;
}

/**
 * AI review data for an artwork.
 */
export interface ArtworkReview {
  /** Aesthetic quality score (0-100) */
  aestheticScore: number;

  /** Creativity/originality score (0-100) */
  creativityScore: number;

  /** Visual coherence/composition score (0-100) */
  coherenceScore: number;

  /** Overall combined score (0-100) */
  overallScore: number;

  /** AI's descriptive feedback */
  feedback: string;

  /** Elements/objects recognized in the image */
  recognizedElements?: string[];

  /** Suggested tags based on content */
  suggestedTags?: string[];

  /** Review timestamp */
  reviewedAt: Date;

  /** AI model used for review */
  modelId: string;
}

/**
 * User vote (like) on an artwork.
 */
export interface ArtworkVote {
  /** Vote ID */
  id: string;

  /** Voter's name */
  voterName: string;

  /** Vote timestamp */
  votedAt: Date;

  /** Voter's device fingerprint (for vote limiting) */
  deviceId?: string;
}

/**
 * Saved artwork in the gallery.
 */
export interface SavedArtwork {
  /** Unique artwork ID */
  id: string;

  /** Path to high-resolution PNG */
  imagePath: string;

  /** Path to thumbnail image */
  thumbnailPath: string;

  /** Base64 image data (for API responses) */
  imageData?: string;

  /** Image width in pixels */
  width?: number;

  /** Image height in pixels */
  height?: number;

  /** Artwork creation timestamp */
  createdAt: Date;

  // ============ Attribution ============

  /** Actors that contributed to this artwork */
  contributingActors: ActorContribution[];

  // ============ AI Review ============

  /** AI review data */
  review: ArtworkReview;

  // ============ User Voting ============

  /** User votes */
  votes: ArtworkVote[];

  /** Total vote (like) count */
  voteCount: number;

  /** Combined score for ranking (AI score + vote bonus) */
  combinedScore: number;

  // ============ Context ============

  /** Environmental context at creation time */
  context: ContextSnapshot;

  // ============ Cycle Info ============

  /** Cycle number this artwork was created in */
  cycleNumber: number;

  /** Duration of the cycle in seconds */
  cycleDuration: number;

  /** Number of frames in the cycle */
  frameCount: number;

  // ============ Status ============

  /** Whether artwork is visible in gallery */
  isVisible: boolean;

  /** Whether this is a sample submission (not official hackathon) */
  isSample?: boolean;

  /** Whether artwork was archived (pruned) */
  isArchived: boolean;

  /** When artwork was archived (if applicable) */
  archivedAt?: Date;

  /** Reason for archiving */
  archiveReason?: 'pruned' | 'manual' | 'flagged';
}

/**
 * Gallery statistics.
 */
export interface GalleryStats {
  /** Total artworks created (including archived) */
  totalCreated: number;

  /** Currently visible artworks */
  visibleCount: number;

  /** Archived artworks */
  archivedCount: number;

  /** Total votes cast */
  totalVotes: number;

  /** Unique voters */
  uniqueVoters: number;

  /** Average AI score */
  averageAIScore: number;

  /** Total cycles completed */
  cyclesCompleted: number;

  /** Aspect ratio of artworks (width/height), detected from first artwork */
  aspectRatio?: number;
}

/**
 * Artwork query filters.
 */
export interface ArtworkQueryFilters {
  /** Filter by visibility */
  isVisible?: boolean;

  /** Filter by archived status */
  isArchived?: boolean;

  /** Minimum AI score */
  minAIScore?: number;

  /** Filter by contributing actor ID */
  actorId?: string;

  /** Filter by tag */
  tag?: string;

  /** Created after date */
  createdAfter?: Date;

  /** Created before date */
  createdBefore?: Date;

  /** Sort field */
  sortBy?: 'createdAt' | 'combinedScore' | 'voteCount';

  /** Sort direction */
  sortDirection?: 'asc' | 'desc';

  /** Pagination limit */
  limit?: number;

  /** Pagination offset */
  offset?: number;
}

/**
 * Pruning result.
 */
export interface PruningResult {
  /** Artworks that were pruned */
  prunedArtworks: string[];

  /** Number pruned */
  count: number;

  /** Timestamp of pruning */
  prunedAt: Date;

  /** Threshold score used */
  thresholdScore: number;
}

// ============ Score Calculation ============

/**
 * Calculate combined score for an artwork.
 * AI score is the base, with a bonus for votes (likes).
 * Each vote adds 3 points to the score, with diminishing returns.
 * Max vote bonus is 30 points (reached at ~15 votes).
 */
export function calculateCombinedScore(
  aiOverallScore: number,
  voteCount: number
): number {
  // Vote bonus: 3 points per vote, max 30 points
  // Using sqrt for diminishing returns: bonus = 30 * (1 - e^(-voteCount/5))
  const voteBonus = Math.min(30, 30 * (1 - Math.exp(-voteCount / 5)));
  return aiOverallScore + voteBonus;
}

/**
 * Determine if an artwork should be pruned.
 */
export function shouldPrune(
  gallerySize: number,
  maxSize: number = 30,
  prunePercentage: number = 0.1
): { shouldPrune: boolean; pruneCount: number } {
  if (gallerySize <= maxSize) {
    return { shouldPrune: false, pruneCount: 0 };
  }
  const pruneCount = Math.ceil(gallerySize * prunePercentage);
  return { shouldPrune: true, pruneCount };
}
