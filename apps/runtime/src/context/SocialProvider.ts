/**
 * Social Context Provider
 *
 * Provides real social media buzz data to actors by polling the gallery
 * server's /api/buzz endpoint. Falls back to mock-like behavior when
 * the gallery server is unavailable.
 */

import type { SocialContext, SocialMention } from '@art/types';

/**
 * Buzz data received from gallery server.
 */
interface BuzzData {
  keywords: string[];
  rawKeywords: string[];
  sources: string[];
  sentiment: number;
  updatedAt: string;
  distilled: boolean;
}

/**
 * Configuration for SocialProvider.
 */
export interface SocialProviderConfig {
  /** Gallery API base URL (e.g., http://localhost:3001/api) */
  galleryApiUrl: string;
  /** Poll interval in ms (default: 120000 = 2 min) */
  pollInterval?: number;
}

/**
 * Provides social context data from real social media buzz.
 * Fetches from the gallery server's /api/buzz endpoint.
 */
export class SocialProvider implements SocialContext {
  private config: Required<SocialProviderConfig>;
  private buzzData: BuzzData | null = null;
  private previousKeywords: string[] = [];
  private available = false;
  private updateTimer: ReturnType<typeof setInterval> | null = null;
  private lastLoggedError = 0;

  constructor(config: SocialProviderConfig) {
    this.config = {
      galleryApiUrl: config.galleryApiUrl,
      pollInterval: config.pollInterval ?? 120000,
    };
  }

  /**
   * Start polling the gallery server for buzz data.
   */
  start(): void {
    if (this.updateTimer) return;

    console.log(`[SocialProvider] Starting, polling ${this.config.galleryApiUrl}/buzz every ${this.config.pollInterval / 1000}s`);

    // Fetch immediately, then on interval
    this.fetchBuzz();
    this.updateTimer = setInterval(() => this.fetchBuzz(), this.config.pollInterval);
  }

  /**
   * Stop polling.
   */
  stop(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
    console.log('[SocialProvider] Stopped');
  }

  // ============ SocialContext interface ============

  isAvailable(): boolean {
    return this.available;
  }

  viewerCount(): number {
    if (!this.buzzData) return Math.floor(Math.random() * 50) + 10;
    // Synthetic: based on number of active sources
    const base = this.buzzData.sources.length * 15;
    return base + Math.floor(Math.random() * 10);
  }

  getMentions(_limit?: number): SocialMention[] {
    // Not populated from buzz data
    return [];
  }

  sentiment(): number {
    if (!this.buzzData) return (Math.random() - 0.5) * 0.4;
    return this.buzzData.sentiment;
  }

  trendingKeywords(): string[] {
    if (!this.buzzData) return ['art', 'hackathon', 'cloudfest'];
    return this.buzzData.keywords;
  }

  engagementLevel(): number {
    if (!this.buzzData) return Math.random() * 0.6 + 0.2;
    // Based on how many sources are active and keyword freshness
    const sourceFactor = Math.min(this.buzzData.sources.length / 4, 1);
    return 0.3 + sourceFactor * 0.5;
  }

  isViralMoment(): boolean {
    if (!this.buzzData || this.previousKeywords.length === 0) return false;
    // Viral = more than 50% of keywords changed since last poll
    const newWords = this.buzzData.keywords.filter(
      (k) => !this.previousKeywords.includes(k),
    );
    return newWords.length > this.buzzData.keywords.length * 0.5;
  }

  mentionCount(_minutes: number): number {
    if (!this.buzzData) return 0;
    return this.buzzData.rawKeywords.length * 3;
  }

  // ============ Private ============

  private async fetchBuzz(): Promise<void> {
    try {
      const url = `${this.config.galleryApiUrl}/buzz`;
      const response = await fetch(url);

      if (!response.ok) {
        this.logError(`Gallery /api/buzz returned ${response.status}`);
        return;
      }

      const data = (await response.json()) as BuzzData;

      // Track previous keywords for viral detection
      if (this.buzzData) {
        this.previousKeywords = [...this.buzzData.keywords];
      }

      this.buzzData = data;
      this.available = true;

      console.log(
        `[SocialProvider] Updated: [${data.keywords.join(', ')}] from ${data.sources.join(', ')} (distilled: ${data.distilled})`,
      );
    } catch {
      this.logError('Failed to fetch /api/buzz');
      // Keep last known data (don't reset available or buzzData)
    }
  }

  /**
   * Log errors at most once per minute to avoid spam.
   */
  private logError(msg: string): void {
    const now = Date.now();
    if (now - this.lastLoggedError > 60000) {
      console.warn(`[SocialProvider] ${msg}`);
      this.lastLoggedError = now;
    }
  }
}
