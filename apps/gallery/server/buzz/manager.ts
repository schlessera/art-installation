/**
 * Buzz Manager
 *
 * Coordinates polling of multiple social media sources, aggregates keywords
 * into a sliding window, and optionally distills them via LLM into
 * 1-3 evocative words for the art installation canvas.
 */

import type { BuzzSource } from './sources';
import { extractKeywords } from './sources';
import type { BuzzDistiller } from './distiller';

// ============ Types ============

export interface BuzzData {
  /** 1-3 distilled or top raw words (primary output for canvas) */
  keywords: string[];
  /** All aggregated raw keywords (up to maxRawKeywords) */
  rawKeywords: string[];
  /** Which sources contributed recently */
  sources: string[];
  /** Slowly-drifting sentiment value (-1 to 1) */
  sentiment: number;
  /** ISO timestamp of last update */
  updatedAt: string;
  /** Whether LLM distillation was applied */
  distilled: boolean;
}

export interface BuzzManagerConfig {
  /** Available buzz sources */
  sources: BuzzSource[];
  /** Optional LLM distiller */
  distiller?: BuzzDistiller;
  /** Polling interval in ms (default: 300000 = 5 min) */
  pollInterval?: number;
  /** Distillation interval in ms (default: 360000 = 6 min) */
  distillInterval?: number;
  /** Max raw keywords to retain (default: 30) */
  maxRawKeywords?: number;
}

// ============ Default fallback keywords ============

const FALLBACK_KEYWORDS = ['creative', 'digital', 'code'];

// ============ Manager ============

export class BuzzManager {
  private sources: BuzzSource[];
  private distiller?: BuzzDistiller;
  private pollInterval: number;
  private distillInterval: number;
  private maxRawKeywords: number;

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private distillTimer: ReturnType<typeof setInterval> | null = null;

  /** Keyword frequency tracking: word → { count, lastSeen timestamp } */
  private keywordMap = new Map<string, { count: number; lastSeen: number }>();
  /** Which sources have contributed data */
  private activeSources = new Set<string>();
  /** Cached output */
  private cachedData: BuzzData;

  /** Max age for keywords before eviction (60 min) */
  private readonly maxKeywordAge = 60 * 60 * 1000;
  /** Max entries in keyword map before forced eviction */
  private readonly maxMapSize = 50;

  constructor(config: BuzzManagerConfig) {
    this.sources = config.sources;
    this.distiller = config.distiller;
    this.pollInterval = config.pollInterval ?? 300000;
    this.distillInterval = config.distillInterval ?? 360000;
    this.maxRawKeywords = config.maxRawKeywords ?? 30;

    this.cachedData = {
      keywords: [],
      rawKeywords: [],
      sources: [],
      sentiment: 0,
      updatedAt: new Date().toISOString(),
      distilled: false,
    };
  }

  /**
   * Start polling sources and optionally distilling.
   * Immediately fetches ALL sources to seed initial data.
   */
  start(): void {
    if (this.pollTimer) return;

    console.log(`[BuzzManager] Starting with ${this.sources.length} sources, poll every ${this.pollInterval / 1000}s`);

    // Seed: fetch all sources immediately
    this.fetchAllSources().then(() => {
      // After seeding, run distillation immediately if available
      if (this.distiller) {
        this.runDistillation();
      }
    });

    // Set up rotating poll
    this.pollTimer = setInterval(() => this.pollRotation(), this.pollInterval);

    // Set up distillation timer
    if (this.distiller) {
      this.distillTimer = setInterval(() => this.runDistillation(), this.distillInterval);
    }
  }

  /**
   * Stop polling.
   */
  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.distillTimer) {
      clearInterval(this.distillTimer);
      this.distillTimer = null;
    }
    console.log('[BuzzManager] Stopped');
  }

  /**
   * Get current buzz data. Synchronous read of cached state.
   */
  getBuzzData(): BuzzData {
    return this.cachedData;
  }

  // ============ Private ============

  /**
   * Fetch from ALL sources (used for initial seeding).
   */
  private async fetchAllSources(): Promise<void> {
    console.log('[BuzzManager] Seeding: fetching all sources...');
    const results = await Promise.allSettled(
      this.sources.map((source) => source.fetch()),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        this.ingestResult(result.value);
      }
    }

    this.updateCachedData();
    console.log(`[BuzzManager] Seeded with ${this.keywordMap.size} keywords from ${this.activeSources.size} sources`);
  }

  /**
   * Poll 2 random sources (rotation strategy).
   */
  private async pollRotation(): Promise<void> {
    if (this.sources.length === 0) return;

    // Pick 2 random sources (or all if fewer than 2)
    const shuffled = [...this.sources].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(2, shuffled.length));

    const results = await Promise.allSettled(
      selected.map((source) => source.fetch()),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        this.ingestResult(result.value);
      }
    }

    this.evictStaleKeywords();
    this.updateCachedData();
  }

  /**
   * Ingest a BuzzResult: extract keywords and add to the sliding window.
   */
  private ingestResult(result: { texts: string[]; source: string }): void {
    if (result.texts.length === 0) return;

    this.activeSources.add(result.source);
    const keywords = extractKeywords(result.texts);
    const now = Date.now();

    for (const word of keywords) {
      const existing = this.keywordMap.get(word);
      if (existing) {
        existing.count++;
        existing.lastSeen = now;
      } else {
        this.keywordMap.set(word, { count: 1, lastSeen: now });
      }
    }
  }

  /**
   * Remove keywords older than maxKeywordAge or when map is too large.
   */
  private evictStaleKeywords(): void {
    const now = Date.now();
    const cutoff = now - this.maxKeywordAge;

    for (const [word, data] of this.keywordMap) {
      if (data.lastSeen < cutoff) {
        this.keywordMap.delete(word);
      }
    }

    // If still too large, remove oldest entries
    if (this.keywordMap.size > this.maxMapSize) {
      const sorted = [...this.keywordMap.entries()]
        .sort((a, b) => a[1].lastSeen - b[1].lastSeen);
      const toRemove = sorted.slice(0, this.keywordMap.size - this.maxMapSize);
      for (const [word] of toRemove) {
        this.keywordMap.delete(word);
      }
    }
  }

  /**
   * Update the cached BuzzData from current keyword map.
   */
  private updateCachedData(): void {
    // Sort by recency first, then frequency as tiebreaker
    const sorted = [...this.keywordMap.entries()]
      .sort((a, b) => {
        const recencyDiff = b[1].lastSeen - a[1].lastSeen;
        if (Math.abs(recencyDiff) > 60000) return recencyDiff; // >1min apart: sort by recency
        return b[1].count - a[1].count; // Close in time: sort by frequency
      });

    const rawKeywords = sorted.slice(0, this.maxRawKeywords).map(([word]) => word);

    // When no distiller or not yet distilled, use top 3 raw keywords
    const keywords = this.cachedData.distilled
      ? this.cachedData.keywords
      : rawKeywords.slice(0, 3);

    this.cachedData = {
      keywords: keywords.length > 0 ? keywords : FALLBACK_KEYWORDS,
      rawKeywords,
      sources: [...this.activeSources],
      sentiment: this.cachedData.sentiment,
      updatedAt: new Date().toISOString(),
      distilled: this.cachedData.distilled,
    };
  }

  /**
   * Run LLM distillation on current raw keywords.
   */
  private async runDistillation(): Promise<void> {
    if (!this.distiller) return;

    const rawKeywords = this.cachedData.rawKeywords;
    if (rawKeywords.length === 0) return;

    try {
      const distilled = await this.distiller.distill(rawKeywords);
      if (distilled.length > 0) {
        this.cachedData = {
          ...this.cachedData,
          keywords: distilled,
          distilled: true,
          updatedAt: new Date().toISOString(),
        };
        console.log(`[BuzzManager] Distilled keywords: [${distilled.join(', ')}]`);
      }
    } catch (err) {
      console.warn('[BuzzManager] Distillation failed:', err instanceof Error ? err.message : err);
    }
  }
}
