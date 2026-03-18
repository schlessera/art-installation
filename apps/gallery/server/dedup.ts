/**
 * Artwork Deduplication
 *
 * Uses perceptual hashing (dHash) to detect visually similar images
 * and archives the lower-scoring duplicate from each similar pair.
 * No external API calls needed — hash comparison is instant.
 */

import type { GalleryStorage } from './storage';
import { hammingDistance, SIMILARITY_THRESHOLD } from './phash';

export interface DedupResult {
  /** IDs of artworks archived as duplicates */
  archived: string[];
  /** Total hash comparisons made */
  comparisons: number;
}

export class DedupProcessor {
  constructor(private storage: GalleryStorage) {}

  /**
   * Run deduplication using perceptual hash comparison.
   * Artworks sorted by score descending — higher-scored ones survive.
   */
  async run(): Promise<DedupResult> {
    console.log('[Dedup] Starting deduplication...');

    const allArtworks = await this.storage.getArtworks({
      isVisible: true,
      isArchived: false,
    });

    // Only consider fully reviewed artworks with hashes
    const reviewed = allArtworks.filter(
      a => a.review.modelId !== 'pending' && a.review.modelId !== 'failed' && a.dHash
    );

    console.log(`[Dedup] ${reviewed.length} reviewed artworks with hashes to check`);

    if (reviewed.length < 2) {
      console.log('[Dedup] Not enough artworks to compare');
      return { archived: [], comparisons: 0 };
    }

    // Sort by score descending — higher-scored artworks survive
    reviewed.sort((a, b) => b.review.overallScore - a.review.overallScore);

    const archived: string[] = [];
    let comparisons = 0;

    for (let i = 0; i < reviewed.length; i++) {
      if (archived.includes(reviewed[i].id)) continue;

      for (let j = i + 1; j < reviewed.length; j++) {
        if (archived.includes(reviewed[j].id)) continue;

        comparisons++;
        const dist = hammingDistance(reviewed[i].dHash!, reviewed[j].dHash!);

        if (dist <= SIMILARITY_THRESHOLD) {
          // j has lower or equal score (sorted desc) — archive it
          await this.storage.archiveAsDuplicate(reviewed[j].id);
          archived.push(reviewed[j].id);
          console.log(
            `[Dedup] Archived ${reviewed[j].id.slice(0, 8)} ` +
            `(similar to ${reviewed[i].id.slice(0, 8)}, ` +
            `distance=${dist}, scores=${reviewed[i].review.overallScore}/${reviewed[j].review.overallScore})`
          );
        }
      }
    }

    console.log(`[Dedup] Done: ${archived.length} archived, ${comparisons} comparisons`);
    return { archived, comparisons };
  }
}
