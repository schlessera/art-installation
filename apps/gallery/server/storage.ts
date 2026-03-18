/**
 * Gallery Storage Service
 *
 * File-based storage for artworks. Uses JSON files for simplicity.
 * For production, consider using SQLite or a proper database.
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
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
import sharp from 'sharp';
import { applyStampOverlay } from './stamp';
import { computeDHash } from './phash';

export interface StorageConfig {
  /** Directory for storing data */
  dataDir: string;
  /** Directory for storing images */
  imagesDir: string;
  /** Maximum artworks before pruning */
  maxArtworks: number;
  /** Percentage to prune when limit exceeded */
  prunePercentage: number;
}

export interface ArtworkSubmission {
  /** Base64 encoded image data */
  imageData: string;
  /** Base64 encoded thumbnail data */
  thumbnailData: string;
  /** Contributing actors */
  contributingActors: ActorContribution[];
  /** Context snapshot */
  context: ContextSnapshot;
  /** Cycle number */
  cycleNumber: number;
  /** Cycle duration in seconds */
  cycleDuration: number;
  /** Total frames rendered */
  frameCount: number;
  /** Runtime instance ID (used for gating, not persisted) */
  runtimeId?: string;
}

interface StoredData {
  artworks: SavedArtwork[];
  version: number;
}

const DEFAULT_CONFIG: StorageConfig = {
  dataDir: './data',
  imagesDir: './data/images',
  maxArtworks: 30,
  prunePercentage: 0.1,
};

export class GalleryStorage {
  private config: StorageConfig;
  private artworks: SavedArtwork[] = [];
  private initialized = false;
  private dataFile: string;

  constructor(config: Partial<StorageConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.dataFile = path.join(this.config.dataDir, 'gallery.json');
  }

  /**
   * Initialize storage, create directories and load data.
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // Create directories
    await fs.mkdir(this.config.dataDir, { recursive: true });
    await fs.mkdir(this.config.imagesDir, { recursive: true });

    // Load existing data
    try {
      const data = await fs.readFile(this.dataFile, 'utf-8');
      const parsed: StoredData = JSON.parse(data);
      this.artworks = parsed.artworks || [];
      console.log(`[Storage] Loaded ${this.artworks.length} artworks`);
    } catch (err) {
      // File doesn't exist yet, start fresh
      this.artworks = [];
      console.log('[Storage] Starting with empty gallery');
    }

    // Remove artworks whose image files are missing from disk
    const before = this.artworks.length;
    this.artworks = this.artworks.filter(a => {
      const thumbFile = path.join(this.config.imagesDir, path.basename(a.thumbnailPath));
      try {
        fsSync.accessSync(thumbFile);
        return true;
      } catch {
        return false;
      }
    });
    const removed = before - this.artworks.length;
    if (removed > 0) {
      console.log(`[Storage] Removed ${removed} artworks with missing image files`);
      await this.save();
    }

    // Backfill perceptual hashes for existing artworks
    await this.backfillHashes();

    this.initialized = true;
  }

  /**
   * Compute dHash for artworks that don't have one yet.
   */
  private async backfillHashes(): Promise<void> {
    const missing = this.artworks.filter(a => !a.dHash);
    if (missing.length === 0) return;

    console.log(`[Storage] Backfilling hashes for ${missing.length} artworks...`);
    for (const artwork of missing) {
      try {
        const fullPath = path.join(this.config.imagesDir, path.basename(artwork.imagePath));
        const buffer = await fs.readFile(fullPath);
        artwork.dHash = await computeDHash(buffer);
      } catch {
        // Image file missing or unreadable — skip
      }
    }
    await this.save();
    console.log(`[Storage] Backfilled hashes for ${missing.length} artworks`);
  }

  /**
   * Persist data to disk.
   */
  private async save(): Promise<void> {
    const data: StoredData = {
      artworks: this.artworks,
      version: 1,
    };
    await fs.writeFile(this.dataFile, JSON.stringify(data, null, 2));
  }

  /**
   * Save image to disk and return path.
   */
  private async saveImage(base64Data: string, id: string, suffix: string): Promise<string> {
    // Remove data URL prefix if present
    const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');

    const filename = `${id}-${suffix}.png`;
    const filepath = path.join(this.config.imagesDir, filename);
    await fs.writeFile(filepath, buffer);

    return `/images/${filename}`;
  }

  /**
   * Extract PNG dimensions from buffer.
   * PNG header: 8 bytes signature, then IHDR chunk with width/height at bytes 16-23
   */
  private extractPngDimensions(base64Data: string): { width: number; height: number } | null {
    try {
      const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64, 'base64');

      // Check PNG signature
      const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
      for (let i = 0; i < 8; i++) {
        if (buffer[i] !== pngSignature[i]) return null;
      }

      // Read width and height from IHDR chunk (bytes 16-23)
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);

      return { width, height };
    } catch {
      return null;
    }
  }

  /**
   * Extract dimensions from any image format using sharp.
   */
  private async extractImageDimensions(base64Data: string): Promise<{ width: number; height: number } | null> {
    try {
      const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64, 'base64');
      const metadata = await sharp(buffer).metadata();
      if (metadata.width && metadata.height) {
        return { width: metadata.width, height: metadata.height };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Apply "SAMPLE" stamp overlay to a base64-encoded image.
   */
  private async applyStamp(base64Data: string, width: number, height: number): Promise<string> {
    const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    const stamped = await applyStampOverlay(buffer, width, height);
    return `data:image/png;base64,${stamped.toString('base64')}`;
  }

  /**
   * Submit a new artwork (without review - review happens async).
   */
  async submitArtwork(submission: ArtworkSubmission, isSample: boolean = false): Promise<SavedArtwork> {
    const id = uuidv4();
    const createdAt = new Date();

    // Extract dimensions from image
    const dimensions = this.extractPngDimensions(submission.imageData);

    // Apply "SAMPLE" stamp overlay to sample submissions
    let imageData = submission.imageData;
    let thumbnailData = submission.thumbnailData;
    if (isSample && dimensions) {
      imageData = await this.applyStamp(imageData, dimensions.width, dimensions.height);
      const thumbDimensions = await this.extractImageDimensions(thumbnailData);
      if (thumbDimensions) {
        thumbnailData = await this.applyStamp(thumbnailData, thumbDimensions.width, thumbDimensions.height);
      }
    }

    // Save images
    const imagePath = await this.saveImage(imageData, id, 'full');
    const thumbnailPath = await this.saveImage(thumbnailData, id, 'thumb');

    // Compute perceptual hash for dedup
    const base64Clean = imageData.replace(/^data:image\/\w+;base64,/, '');
    const dHash = await computeDHash(Buffer.from(base64Clean, 'base64'));

    const artwork: SavedArtwork = {
      id,
      imagePath,
      thumbnailPath,
      dHash,
      width: dimensions?.width,
      height: dimensions?.height,
      createdAt,
      contributingActors: submission.contributingActors,
      review: {
        colorHarmony: 0,
        composition: 0,
        visualUnity: 0,
        depthAndLayering: 0,
        rhythmAndFlow: 0,
        intentionalComplexity: 0,
        overallScore: 0,
        feedback: 'Pending review...',
        recognizedElements: [],
        suggestedTags: [],
        reviewedAt: createdAt,
        modelId: 'pending',
      },
      votes: [],
      voteCount: 0,
      combinedScore: 0,
      context: submission.context,
      cycleNumber: submission.cycleNumber,
      cycleDuration: submission.cycleDuration,
      frameCount: submission.frameCount,
      isVisible: false, // Not visible until reviewed
      isSample,
      isArchived: false,
    };

    this.artworks.push(artwork);
    await this.save();

    console.log(`[Storage] Saved artwork ${id}`);
    return artwork;
  }

  /**
   * Update artwork with review results.
   */
  async updateReview(id: string, review: ArtworkReview): Promise<SavedArtwork | null> {
    const artwork = this.artworks.find(a => a.id === id);
    if (!artwork) return null;

    artwork.review = review;
    artwork.combinedScore = calculateCombinedScore(review.overallScore, artwork.voteCount);
    artwork.isVisible = true; // Make visible after review

    await this.save();
    await this.checkAndPrune();

    console.log(`[Storage] Updated review for ${id}, score: ${review.overallScore}`);
    return artwork;
  }

  /**
   * Get artwork by ID.
   */
  async getArtwork(id: string): Promise<SavedArtwork | null> {
    return this.artworks.find(a => a.id === id) || null;
  }

  /**
   * Get all artworks matching filters.
   */
  async getArtworks(filters: ArtworkQueryFilters = {}): Promise<SavedArtwork[]> {
    let result = [...this.artworks];

    // Apply filters
    if (filters.isVisible !== undefined) {
      result = result.filter(a => a.isVisible === filters.isVisible);
    }
    if (filters.isArchived !== undefined) {
      result = result.filter(a => a.isArchived === filters.isArchived);
    }
    if (filters.minAIScore !== undefined) {
      result = result.filter(a => a.review.overallScore >= filters.minAIScore!);
    }
    if (filters.minRating !== undefined) {
      result = result.filter(a => a.averageRating >= filters.minRating!);
    }
    if (filters.actorId) {
      result = result.filter(a =>
        a.contributingActors.some(c => c.actorId === filters.actorId)
      );
    }

    // Sort
    const sortBy = filters.sortBy ?? 'createdAt';
    const sortDir = filters.sortDirection ?? 'desc';
    result.sort((a, b) => {
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
    const limit = filters.limit ?? result.length;
    return result.slice(offset, offset + limit);
  }

  /**
   * Get pending artworks that need review.
   */
  async getPendingReview(): Promise<SavedArtwork[]> {
    return this.artworks.filter(a => a.review.modelId === 'pending' || a.review.modelId === 'mock');
  }

  /**
   * Reset all artworks to pending review status.
   * The background reviewer will re-review them.
   */
  async resetAllReviews(): Promise<number> {
    let count = 0;
    for (const artwork of this.artworks) {
      if (artwork.review.modelId !== 'pending') {
        artwork.review.modelId = 'pending';
        artwork.review.overallScore = 0;
        artwork.isVisible = false;
        artwork.isArchived = false;
        artwork.archivedAt = undefined;
        artwork.archiveReason = undefined;
        count++;
      }
    }
    if (count > 0) {
      await this.save();
      console.log(`[Storage] Reset ${count} artwork(s) to pending review`);
    }
    return count;
  }

  /**
   * Archive an artwork as a duplicate.
   */
  async archiveAsDuplicate(id: string): Promise<boolean> {
    const artwork = this.artworks.find(a => a.id === id);
    if (!artwork) return false;
    artwork.isVisible = false;
    artwork.isArchived = true;
    artwork.archivedAt = new Date();
    artwork.archiveReason = 'duplicate';
    await this.save();
    return true;
  }

  /**
   * Add vote (like) to artwork.
   */
  async addVote(artworkId: string, voterName: string): Promise<ArtworkVote | null> {
    const artwork = this.artworks.find(a => a.id === artworkId);
    if (!artwork) return null;

    // Check if already voted
    if (artwork.votes.some(v => v.voterName.toLowerCase() === voterName.toLowerCase())) {
      throw new Error('Already liked this artwork');
    }

    const vote: ArtworkVote = {
      id: uuidv4(),
      voterName,
      votedAt: new Date(),
    };

    artwork.votes.push(vote);
    artwork.voteCount = artwork.votes.length;
    artwork.combinedScore = calculateCombinedScore(artwork.review.overallScore, artwork.voteCount);

    await this.save();
    return vote;
  }

  /**
   * Check if voter has voted on artwork.
   */
  async hasVoted(artworkId: string, voterName: string): Promise<boolean> {
    const artwork = this.artworks.find(a => a.id === artworkId);
    if (!artwork) return false;
    return artwork.votes.some(v => v.voterName.toLowerCase() === voterName.toLowerCase());
  }

  /**
   * Check and prune if needed.
   */
  async checkAndPrune(): Promise<PruningResult | null> {
    const visible = this.artworks.filter(a => a.isVisible && !a.isArchived);
    const { shouldPrune: needsPruning, pruneCount } = shouldPrune(
      visible.length,
      this.config.maxArtworks,
      this.config.prunePercentage
    );

    if (!needsPruning) return null;

    // Sort by combined score ascending (lowest first)
    const sorted = [...visible].sort((a, b) => a.combinedScore - b.combinedScore);
    const toPrune = sorted.slice(0, pruneCount);

    const prunedIds: string[] = [];
    for (const artwork of toPrune) {
      artwork.isVisible = false;
      artwork.isArchived = true;
      artwork.archivedAt = new Date();
      artwork.archiveReason = 'pruned';
      prunedIds.push(artwork.id);
    }

    await this.save();

    console.log(`[Storage] Pruned ${prunedIds.length} artworks`);
    return {
      prunedArtworks: prunedIds,
      count: prunedIds.length,
      prunedAt: new Date(),
      thresholdScore: toPrune[toPrune.length - 1]?.combinedScore ?? 0,
    };
  }

  /**
   * Delete all artworks and their images.
   */
  async clearAll(): Promise<number> {
    const count = this.artworks.length;
    // Delete image files
    for (const artwork of this.artworks) {
      try {
        const fullPath = path.join(this.config.imagesDir, path.basename(artwork.imagePath));
        const thumbPath = path.join(this.config.imagesDir, path.basename(artwork.thumbnailPath));
        await fs.unlink(fullPath).catch(() => {});
        await fs.unlink(thumbPath).catch(() => {});
      } catch {
        // Ignore missing files
      }
    }
    this.artworks = [];
    await this.save();
    console.log(`[Storage] Cleared ${count} artworks`);
    return count;
  }

  /**
   * Get gallery statistics.
   */
  async getStats(): Promise<GalleryStats> {
    const visible = this.artworks.filter(a => a.isVisible && !a.isArchived);
    const archived = this.artworks.filter(a => a.isArchived);
    const allVotes = this.artworks.flatMap(a => a.votes);
    const uniqueVoters = new Set(allVotes.map(v => v.voterName.toLowerCase()));

    // Detect aspect ratio from oldest artwork with dimensions
    let aspectRatio: number | undefined;
    const sortedByDate = [...this.artworks].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const firstWithDimensions = sortedByDate.find(a => a.width && a.height);
    if (firstWithDimensions?.width && firstWithDimensions?.height) {
      aspectRatio = firstWithDimensions.width / firstWithDimensions.height;
    }

    return {
      totalCreated: this.artworks.length,
      visibleCount: visible.length,
      archivedCount: archived.length,
      totalVotes: allVotes.length,
      uniqueVoters: uniqueVoters.size,
      averageAIScore: visible.length > 0
        ? visible.reduce((sum, a) => sum + a.review.overallScore, 0) / visible.length
        : 0,
      cyclesCompleted: Math.max(0, ...this.artworks.map(a => a.cycleNumber)),
      aspectRatio,
    };
  }

  /**
   * Get images directory path for serving static files.
   */
  getImagesDir(): string {
    return this.config.imagesDir;
  }
}
