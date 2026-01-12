/**
 * Gallery API Client
 *
 * Sends artwork snapshots to the Gallery backend for storage and review.
 */

import type { ActorContribution, ContextSnapshot, SavedArtwork } from '@art/types';

export interface GalleryClientConfig {
  /** Gallery API base URL */
  apiUrl: string;
  /** Request timeout in milliseconds */
  timeout?: number;
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
}

const DEFAULT_TIMEOUT = 30000;

export class GalleryClient {
  private config: Required<GalleryClientConfig>;

  constructor(config: GalleryClientConfig) {
    this.config = {
      timeout: DEFAULT_TIMEOUT,
      ...config,
    };
  }

  /**
   * Submit a new artwork to the gallery.
   * The gallery will handle async review and storage.
   */
  async submitArtwork(submission: ArtworkSubmission): Promise<SavedArtwork> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.config.apiUrl}/artworks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submission),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to submit artwork: ${response.status} ${error}`);
      }

      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Check if the gallery API is available.
   */
  async checkHealth(): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    try {
      const response = await fetch(`${this.config.apiUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get gallery statistics.
   */
  async getStats(): Promise<{ totalCreated: number; visibleCount: number } | null> {
    try {
      const response = await fetch(`${this.config.apiUrl}/stats`);
      if (!response.ok) return null;
      return response.json();
    } catch {
      return null;
    }
  }
}
