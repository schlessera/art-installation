/**
 * Gallery Storage
 *
 * Manages artwork persistence, voting, and gallery pruning.
 * Uses IndexedDB for local storage with optional API sync.
 */

import type {
  SavedArtwork,
  ArtworkReview,
  ArtworkVote,
  ActorContribution,
  GalleryStats,
  ArtworkQueryFilters,
  PruningResult,
  ContextSnapshot,
} from '@art/types';
import { calculateCombinedScore, shouldPrune } from '@art/types';
import type { CapturedSnapshot } from './SnapshotCapture';

const DB_NAME = 'art-installation-gallery';
const DB_VERSION = 1;
const STORE_ARTWORKS = 'artworks';
const STORE_VOTES = 'votes';

export interface GalleryStorageConfig {
  /** Maximum artworks before pruning */
  maxArtworks?: number;

  /** Percentage to prune when limit exceeded */
  prunePercentage?: number;

  /** Gallery API URL for remote sync (optional) */
  apiUrl?: string;
}

const DEFAULT_CONFIG: Required<GalleryStorageConfig> = {
  maxArtworks: 30,
  prunePercentage: 0.1,
  apiUrl: '',
};

/**
 * Local storage for gallery artworks using IndexedDB.
 */
export class GalleryStorage {
  private config: Required<GalleryStorageConfig>;
  private db: IDBDatabase | null = null;
  private initialized = false;

  constructor(config: GalleryStorageConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the IndexedDB database.
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error(`Failed to open database: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.initialized = true;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create artworks store
        if (!db.objectStoreNames.contains(STORE_ARTWORKS)) {
          const artworkStore = db.createObjectStore(STORE_ARTWORKS, { keyPath: 'id' });
          artworkStore.createIndex('createdAt', 'createdAt', { unique: false });
          artworkStore.createIndex('combinedScore', 'combinedScore', { unique: false });
          artworkStore.createIndex('isVisible', 'isVisible', { unique: false });
          artworkStore.createIndex('isArchived', 'isArchived', { unique: false });
        }

        // Create votes store
        if (!db.objectStoreNames.contains(STORE_VOTES)) {
          const voteStore = db.createObjectStore(STORE_VOTES, { keyPath: 'id' });
          voteStore.createIndex('artworkId', 'artworkId', { unique: false });
          voteStore.createIndex('voterName', 'voterName', { unique: false });
        }
      };
    });
  }

  /**
   * Ensure the database is initialized.
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.db) {
      throw new Error('GalleryStorage not initialized. Call init() first.');
    }
  }

  /**
   * Generate a unique artwork ID.
   */
  private generateId(): string {
    return `artwork-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Save a new artwork to the gallery.
   */
  async saveArtwork(
    snapshot: CapturedSnapshot,
    thumbnailDataUrl: string,
    review: ArtworkReview,
    contributions: ActorContribution[],
    cycleDuration: number
  ): Promise<SavedArtwork> {
    this.ensureInitialized();

    const artwork: SavedArtwork = {
      id: this.generateId(),
      imagePath: snapshot.dataUrl,
      thumbnailPath: thumbnailDataUrl,
      imageData: snapshot.base64,
      createdAt: snapshot.timestamp,
      contributingActors: contributions,
      review,
      votes: [],
      voteCount: 0,
      combinedScore: review.overallScore, // Initially only AI score, votes add bonus
      context: snapshot.context,
      cycleNumber: snapshot.cycleNumber,
      cycleDuration,
      frameCount: snapshot.frameCount,
      isVisible: true,
      isArchived: false,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_ARTWORKS], 'readwrite');
      const store = transaction.objectStore(STORE_ARTWORKS);
      const request = store.add(artwork);

      request.onsuccess = () => {
        // Check if pruning is needed
        this.checkAndPrune().catch(console.error);
        resolve(artwork);
      };

      request.onerror = () => {
        reject(new Error(`Failed to save artwork: ${request.error?.message}`));
      };
    });
  }

  /**
   * Get an artwork by ID.
   */
  async getArtwork(id: string): Promise<SavedArtwork | null> {
    this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_ARTWORKS], 'readonly');
      const store = transaction.objectStore(STORE_ARTWORKS);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result ?? null);
      };

      request.onerror = () => {
        reject(new Error(`Failed to get artwork: ${request.error?.message}`));
      };
    });
  }

  /**
   * Get all artworks with optional filters.
   */
  async getArtworks(filters: ArtworkQueryFilters = {}): Promise<SavedArtwork[]> {
    this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_ARTWORKS], 'readonly');
      const store = transaction.objectStore(STORE_ARTWORKS);
      const request = store.getAll();

      request.onsuccess = () => {
        let artworks: SavedArtwork[] = request.result;

        // Apply filters
        if (filters.isVisible !== undefined) {
          artworks = artworks.filter((a) => a.isVisible === filters.isVisible);
        }
        if (filters.isArchived !== undefined) {
          artworks = artworks.filter((a) => a.isArchived === filters.isArchived);
        }
        if (filters.minAIScore !== undefined) {
          artworks = artworks.filter((a) => a.review.overallScore >= filters.minAIScore!);
        }
        if (filters.actorId) {
          artworks = artworks.filter((a) =>
            a.contributingActors.some((c) => c.actorId === filters.actorId)
          );
        }
        if (filters.createdAfter) {
          const after = new Date(filters.createdAfter).getTime();
          artworks = artworks.filter((a) => new Date(a.createdAt).getTime() > after);
        }
        if (filters.createdBefore) {
          const before = new Date(filters.createdBefore).getTime();
          artworks = artworks.filter((a) => new Date(a.createdAt).getTime() < before);
        }

        // Sort
        const sortBy = filters.sortBy ?? 'createdAt';
        const sortDir = filters.sortDirection ?? 'desc';
        artworks.sort((a, b) => {
          let aVal: number, bVal: number;
          switch (sortBy) {
            case 'combinedScore':
              aVal = a.combinedScore;
              bVal = b.combinedScore;
              break;
            case 'voteCount':
              aVal = a.voteCount;
              bVal = b.voteCount;
              break;
            default:
              aVal = new Date(a.createdAt).getTime();
              bVal = new Date(b.createdAt).getTime();
          }
          return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        });

        // Pagination
        const offset = filters.offset ?? 0;
        const limit = filters.limit ?? artworks.length;
        artworks = artworks.slice(offset, offset + limit);

        resolve(artworks);
      };

      request.onerror = () => {
        reject(new Error(`Failed to get artworks: ${request.error?.message}`));
      };
    });
  }

  /**
   * Add a vote to an artwork.
   */
  async addVote(artworkId: string, voterName: string): Promise<ArtworkVote> {
    this.ensureInitialized();

    const vote: ArtworkVote & { artworkId: string } = {
      id: `vote-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      voterName,
      votedAt: new Date(),
      artworkId,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_ARTWORKS, STORE_VOTES], 'readwrite');

      // Add vote to votes store
      const votesStore = transaction.objectStore(STORE_VOTES);
      votesStore.add(vote);

      // Update artwork
      const artworkStore = transaction.objectStore(STORE_ARTWORKS);
      const getRequest = artworkStore.get(artworkId);

      getRequest.onsuccess = () => {
        const artwork: SavedArtwork = getRequest.result;
        if (!artwork) {
          reject(new Error('Artwork not found'));
          return;
        }

        // Add vote and recalculate
        artwork.votes.push(vote);
        artwork.voteCount = artwork.votes.length;
        artwork.combinedScore = calculateCombinedScore(
          artwork.review.overallScore,
          artwork.voteCount
        );

        artworkStore.put(artwork);
      };

      transaction.oncomplete = () => {
        resolve(vote);
      };

      transaction.onerror = () => {
        reject(new Error(`Failed to add vote: ${transaction.error?.message}`));
      };
    });
  }

  /**
   * Get votes for an artwork.
   */
  async getVotes(artworkId: string): Promise<ArtworkVote[]> {
    this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_VOTES], 'readonly');
      const store = transaction.objectStore(STORE_VOTES);
      const index = store.index('artworkId');
      const request = index.getAll(artworkId);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(new Error(`Failed to get votes: ${request.error?.message}`));
      };
    });
  }

  /**
   * Check if a voter has already voted on an artwork.
   */
  async hasVoted(artworkId: string, voterName: string): Promise<boolean> {
    const votes = await this.getVotes(artworkId);
    return votes.some((v) => v.voterName.toLowerCase() === voterName.toLowerCase());
  }

  /**
   * Check if pruning is needed and perform it.
   */
  async checkAndPrune(): Promise<PruningResult | null> {
    const allArtworks = await this.getArtworks({ isVisible: true, isArchived: false });
    const { shouldPrune: needsPruning, pruneCount } = shouldPrune(
      allArtworks.length,
      this.config.maxArtworks,
      this.config.prunePercentage
    );

    if (!needsPruning) return null;

    // Sort by combined score ascending (lowest first)
    const sorted = allArtworks.sort((a, b) => a.combinedScore - b.combinedScore);
    const toPrune = sorted.slice(0, pruneCount);

    const thresholdScore = toPrune[toPrune.length - 1]?.combinedScore ?? 0;

    // Archive the lowest scoring artworks
    const prunedIds: string[] = [];
    for (const artwork of toPrune) {
      await this.archiveArtwork(artwork.id, 'pruned');
      prunedIds.push(artwork.id);
    }

    return {
      prunedArtworks: prunedIds,
      count: prunedIds.length,
      prunedAt: new Date(),
      thresholdScore,
    };
  }

  /**
   * Archive an artwork (mark as not visible).
   */
  async archiveArtwork(
    id: string,
    reason: 'pruned' | 'manual' | 'flagged'
  ): Promise<void> {
    this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_ARTWORKS], 'readwrite');
      const store = transaction.objectStore(STORE_ARTWORKS);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const artwork: SavedArtwork = getRequest.result;
        if (!artwork) {
          reject(new Error('Artwork not found'));
          return;
        }

        artwork.isVisible = false;
        artwork.isArchived = true;
        artwork.archivedAt = new Date();
        artwork.archiveReason = reason;

        store.put(artwork);
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => {
        reject(new Error(`Failed to archive artwork: ${transaction.error?.message}`));
      };
    });
  }

  /**
   * Get gallery statistics.
   */
  async getStats(): Promise<GalleryStats> {
    const allArtworks = await this.getArtworks();
    const visibleArtworks = allArtworks.filter((a) => a.isVisible && !a.isArchived);
    const archivedArtworks = allArtworks.filter((a) => a.isArchived);

    const allVotes = allArtworks.flatMap((a) => a.votes);
    const uniqueVoters = new Set(allVotes.map((v) => v.voterName.toLowerCase()));

    return {
      totalCreated: allArtworks.length,
      visibleCount: visibleArtworks.length,
      archivedCount: archivedArtworks.length,
      totalVotes: allVotes.length,
      uniqueVoters: uniqueVoters.size,
      averageAIScore:
        visibleArtworks.length > 0
          ? visibleArtworks.reduce((sum, a) => sum + a.review.overallScore, 0) /
            visibleArtworks.length
          : 0,
      cyclesCompleted: Math.max(0, ...allArtworks.map((a) => a.cycleNumber)),
    };
  }

  /**
   * Get count of visible artworks.
   */
  async getCount(): Promise<number> {
    const artworks = await this.getArtworks({ isVisible: true, isArchived: false });
    return artworks.length;
  }

  /**
   * Delete all data (for testing).
   */
  async clear(): Promise<void> {
    this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_ARTWORKS, STORE_VOTES], 'readwrite');

      transaction.objectStore(STORE_ARTWORKS).clear();
      transaction.objectStore(STORE_VOTES).clear();

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => {
        reject(new Error(`Failed to clear storage: ${transaction.error?.message}`));
      };
    });
  }

  /**
   * Close the database connection.
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }
}
