/**
 * Retry Queue
 *
 * Queues failed artwork submissions for retry when connectivity is restored.
 * Drops oldest entries if queue exceeds max size (prefer recent artworks).
 */

import type { GalleryClient, ArtworkSubmission } from './GalleryClient';

const MAX_QUEUE_SIZE = 10;

interface QueueEntry {
  submission: ArtworkSubmission;
  enqueuedAt: number;
}

export class RetryQueue {
  private queue: QueueEntry[] = [];
  private draining = false;
  private galleryClient: GalleryClient;

  constructor(galleryClient: GalleryClient) {
    this.galleryClient = galleryClient;
  }

  /**
   * Add a submission to the retry queue.
   */
  enqueue(submission: ArtworkSubmission): void {
    this.queue.push({ submission, enqueuedAt: Date.now() });

    // Drop oldest entries if over limit
    while (this.queue.length > MAX_QUEUE_SIZE) {
      const dropped = this.queue.shift();
      if (dropped) {
        console.log(
          `[RetryQueue] Dropped oldest entry (cycle ${dropped.submission.cycleNumber}) — queue full`
        );
      }
    }

    console.log(`[RetryQueue] Enqueued submission (queue size: ${this.queue.length})`);
  }

  /**
   * Attempt to drain the queue — submit all pending entries.
   */
  async drain(): Promise<void> {
    if (this.draining || this.queue.length === 0) return;

    this.draining = true;
    console.log(`[RetryQueue] Draining ${this.queue.length} queued submissions...`);

    while (this.queue.length > 0) {
      const entry = this.queue[0];
      try {
        const saved = await this.galleryClient.submitArtwork(entry.submission);
        console.log(`[RetryQueue] Successfully submitted queued artwork: ${saved.id}`);
        this.queue.shift(); // Remove successful entry
      } catch (error) {
        console.error('[RetryQueue] Failed to submit queued entry — stopping drain:', error);
        break; // Stop on first failure — will retry later
      }
    }

    this.draining = false;

    if (this.queue.length === 0) {
      console.log('[RetryQueue] Queue fully drained');
    } else {
      console.log(`[RetryQueue] ${this.queue.length} entries remaining`);
    }
  }

  /**
   * Get current queue size.
   */
  get size(): number {
    return this.queue.length;
  }

  /**
   * Check if currently draining.
   */
  get isDraining(): boolean {
    return this.draining;
  }
}
