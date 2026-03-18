/**
 * Artwork Reviewer
 *
 * Uses Gemini 3.1 Pro via OpenRouter to review and rate submitted artworks.
 * Runs asynchronously in the background.
 */

import type { ArtworkReview, SavedArtwork } from '@art/types';
import type { GalleryStorage } from './storage';
import { DedupProcessor } from './dedup';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface ReviewerConfig {
  /** OpenRouter API key */
  apiKey: string;
  /** Model to use for reviews */
  model?: string;
  /** Minimum score threshold for visibility (0-100) */
  minScoreThreshold?: number;
  /** Review interval in milliseconds */
  reviewInterval?: number;
}

const DEFAULT_CONFIG = {
  model: 'google/gemini-3.1-pro-preview',
  minScoreThreshold: 40,
  reviewInterval: 5000, // Check every 5 seconds
};

const SCORE_DIMENSIONS = [
  'colorHarmony',
  'composition',
  'visualUnity',
  'depthAndLayering',
  'rhythmAndFlow',
  'intentionalComplexity',
] as const;

const REVIEW_PROMPT = `You are an art critic specializing in generative and algorithmic art, reviewing artworks from an interactive digital art installation at CloudFest Hackathon 2026.

**About the installation:** Multiple AI-driven "actors" — small programs written by hackathon attendees — collaboratively paint on a shared 2D canvas. Each artwork is the result of 2–5 foreground actors plus a background actor, all contributing to a single composition over a 60-second cycle. No actor controls the full picture; the beauty lies in what emerges from their uncoordinated collaboration. Some pieces will be strikingly coherent, others charmingly chaotic — both can have genuine appeal.

**Your role:** Evaluate each artwork across 6 specific dimensions. Be generous but honest — these are the outputs of code-driven creativity, and even simple compositions can have real merit. Appreciate what works before noting what doesn't.

### Scoring Dimensions (each 0–100)

1. **Color Harmony** (colorHarmony): Does the artwork use a coherent color palette?
   - 80–100: Clear palette strategy (monochromatic, complementary, analogous, triadic, split-complementary). Colors feel intentionally chosen and work together beautifully.
   - 50–79: Some color relationships present but inconsistent. A few clashing colors dilute an otherwise workable palette.
   - 20–49: Colors appear mostly random with occasional accidental harmony.
   - 0–19: Chaotic with no discernible color relationships; visually jarring.

2. **Composition** (composition): Is the spatial arrangement intentional and pleasing?
   - 80–100: Clear compositional structure — rule of thirds, golden ratio, radial symmetry, balanced asymmetry, strong focal points. Negative space used effectively.
   - 50–79: Some structural intention but uneven. Parts of the canvas feel deliberate, others neglected or overfilled.
   - 20–49: Mostly random distribution. Elements fill space without clear organization.
   - 0–19: Canvas is either nearly empty or uniformly filled with no structure.

3. **Visual Unity** (visualUnity): Do the contributions from different actors feel like one cohesive piece?
   - 80–100: All elements seem to belong together. Consistent visual language, shared motifs, or complementary styles create a unified whole.
   - 50–79: Moderate cohesion — some actors' contributions blend well, others feel disconnected.
   - 20–49: Visually fragmented. Individual actor outputs are clearly separable and don't relate to each other.
   - 0–19: Completely disjointed; looks like unrelated images overlaid.

4. **Depth & Layering** (depthAndLayering): Does the image create a sense of visual depth?
   - 80–100: Strong sense of foreground, midground, and background. Effective use of overlap, transparency, atmospheric perspective, or scale variation.
   - 50–79: Some layering apparent but depth is shallow or inconsistent.
   - 20–49: Mostly flat with minimal depth cues.
   - 0–19: Completely flat; no sense of spatial dimension.

5. **Rhythm & Flow** (rhythmAndFlow): Is there visual movement and energy?
   - 80–100: Strong sense of flow — the eye is naturally guided through the composition. Repetition with variation creates visual rhythm. Dynamic energy is palpable.
   - 50–79: Some movement or rhythm, but it doesn't carry through the whole piece.
   - 20–49: Static composition with minimal visual energy.
   - 0–19: No perceptible flow or rhythm.

6. **Intentional Complexity** (intentionalComplexity): Does the artwork exhibit structured, purposeful detail?
   - 80–100: Rich detail that rewards closer inspection. Complexity feels purposeful, not chaotic. Interesting patterns emerge at multiple scales.
   - 50–79: Moderate detail with some structure. Parts are interesting but complexity is uneven.
   - 20–49: Either too sparse (mostly empty canvas) or too busy (visual noise without structure).
   - 0–19: Extreme: nearly blank or pure visual noise with no discernible structure.

### Response Format

Respond with ONLY this JSON — no markdown fences, no explanation:
{
  "colorHarmony": <0-100>,
  "composition": <0-100>,
  "visualUnity": <0-100>,
  "depthAndLayering": <0-100>,
  "rhythmAndFlow": <0-100>,
  "intentionalComplexity": <0-100>,
  "feedback": "<1-2 sentence UNIQUE comment specific to THIS artwork — mention concrete visual elements, colors, or patterns you see. Never use generic phrases like 'captivating blend' or 'colors and movement'.>",
  "recognizedElements": ["element1", "element2"],
  "suggestedTags": ["tag1", "tag2"]
}`;

export class ArtworkReviewer {
  private config: ReviewerConfig & typeof DEFAULT_CONFIG;
  private storage: GalleryStorage;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private processing = false;
  private dedupRunning = false;
  private dedup: DedupProcessor;

  constructor(storage: GalleryStorage, config: ReviewerConfig) {
    this.storage = storage;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.dedup = new DedupProcessor(storage);
  }

  /**
   * Get the dedup processor (for route access).
   */
  getDedup(): DedupProcessor {
    return this.dedup;
  }

  /**
   * Start the background review process.
   */
  start(): void {
    if (this.intervalId) return;

    console.log('[Reviewer] Starting background review process');
    this.intervalId = setInterval(() => this.processQueue(), this.config.reviewInterval);

    // Process immediately on start
    this.processQueue();
  }

  /**
   * Stop the background review process.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[Reviewer] Stopped background review process');
    }
  }

  /**
   * Process pending artworks in the queue.
   */
  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      const pending = await this.storage.getPendingReview();
      if (pending.length === 0) {
        this.processing = false;
        return;
      }

      const CONCURRENCY = 10;
      console.log(`[Reviewer] Processing ${pending.length} pending artwork(s) (concurrency=${CONCURRENCY})`);

      // Process in batches of CONCURRENCY
      for (let i = 0; i < pending.length; i += CONCURRENCY) {
        const batch = pending.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map(async (artwork) => {
            const review = await this.reviewArtwork(artwork);
            await this.storage.updateReview(artwork.id, review);
          })
        );

        // Check for rate limits — stop if any request was rate limited
        let rateLimited = false;
        for (let j = 0; j < results.length; j++) {
          const result = results[j];
          if (result.status === 'rejected') {
            const errMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
            if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota') || errMsg.includes('Rate limited')) {
              rateLimited = true;
            } else {
              console.error(`[Reviewer] Failed to review ${batch[j].id}:`, result.reason);
              await this.storage.updateReview(batch[j].id, this.createFailedReview());
            }
          }
        }

        // Run dedup after each batch (hash comparison is instant)
        if (!this.dedupRunning) {
          this.dedupRunning = true;
          this.dedup.run()
            .catch(err => console.error('[Reviewer] Dedup failed:', err))
            .finally(() => { this.dedupRunning = false; });
        }

        if (rateLimited) {
          console.warn('[Reviewer] Rate limited, pausing review queue');
          break;
        }
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Review a single artwork.
   */
  private async reviewArtwork(artwork: SavedArtwork): Promise<ArtworkReview> {
    if (!this.config.apiKey) {
      console.log('[Reviewer] No API key, using mock review');
      return this.createMockReview();
    }

    console.log(`[Reviewer] Reviewing artwork ${artwork.id}`);

    // Load image from disk
    const imagePath = artwork.imagePath;
    const imageUrl = imagePath.startsWith('data:')
      ? imagePath
      : await this.loadImageAsDataUrl(imagePath);

    if (!imageUrl) {
      console.warn(`[Reviewer] Could not load image for ${artwork.id}`);
      return this.createMockReview();
    }

    // Build context about contributing actors
    const actorContext = artwork.contributingActors
      .map((a) => `${a.actorName} by ${a.authorName}`)
      .join(', ');

    try {
      const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: { url: imageUrl },
                },
                {
                  type: 'text',
                  text: `Contributing actors for this piece: ${actorContext}\n\n${REVIEW_PROMPT}`,
                },
              ],
            },
          ],
          max_tokens: 1024,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        if (response.status === 429) {
          console.warn(`[Reviewer] Rate limited, will retry later: ${artwork.id}`);
          throw new Error(`Rate limited (429): ${body}`);
        }
        throw new Error(`OpenRouter API error ${response.status}: ${body}`);
      }

      const data = await response.json() as {
        choices?: { message?: { content?: string } }[];
      };
      const text = data.choices?.[0]?.message?.content;
      if (!text) {
        throw new Error('Empty response from OpenRouter');
      }

      const parsed = this.parseReviewResponse(text);
      return {
        ...parsed,
        reviewedAt: new Date(),
        modelId: this.config.model,
      };
    } catch (err: unknown) {
      // Re-throw rate limit errors so the artwork stays pending for retry
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota') || errMsg.includes('Rate limited')) {
        throw err;
      }
      console.error('[Reviewer] API call failed:', err);
      return this.createMockReview();
    }
  }

  /**
   * Load image from disk as data URL.
   */
  private async loadImageAsDataUrl(imagePath: string): Promise<string | null> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      // imagePath is like /images/xxx.png, convert to actual file path
      const fullPath = path.join(this.storage.getImagesDir(), '..', imagePath);
      const buffer = await fs.readFile(fullPath);
      return `data:image/png;base64,${buffer.toString('base64')}`;
    } catch {
      return null;
    }
  }

  /**
   * Parse the JSON response from Gemini.
   */
  private parseReviewResponse(text: string): Omit<ArtworkReview, 'reviewedAt' | 'modelId'> {
    try {
      // Extract JSON from response (might be wrapped in markdown code block)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');

      const data = JSON.parse(jsonMatch[0]);

      const scores = {
        colorHarmony: this.clampScore(data.colorHarmony),
        composition: this.clampScore(data.composition),
        visualUnity: this.clampScore(data.visualUnity),
        depthAndLayering: this.clampScore(data.depthAndLayering),
        rhythmAndFlow: this.clampScore(data.rhythmAndFlow),
        intentionalComplexity: this.clampScore(data.intentionalComplexity),
      };

      const overallScore = Math.round(
        SCORE_DIMENSIONS.reduce((sum, dim) => sum + scores[dim], 0) / SCORE_DIMENSIONS.length
      );

      return {
        ...scores,
        overallScore,
        feedback: data.feedback || 'An interesting piece.',
        recognizedElements: Array.isArray(data.recognizedElements) ? data.recognizedElements : [],
        suggestedTags: Array.isArray(data.suggestedTags) ? data.suggestedTags : [],
      };
    } catch (err) {
      console.warn('[Reviewer] Failed to parse response:', err);
      return this.createMockReview();
    }
  }

  /**
   * Clamp score to 0-100.
   */
  private clampScore(score: unknown): number {
    if (typeof score !== 'number') return 50;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Create a mock review for development/fallback.
   */
  private createMockReview(): Omit<ArtworkReview, 'reviewedAt' | 'modelId'> & { reviewedAt: Date; modelId: string } {
    const base = 50 + Math.floor(Math.random() * 40);
    const jitter = () => Math.floor(Math.random() * 10 - 5);
    return {
      colorHarmony: base + jitter(),
      composition: base + jitter(),
      visualUnity: base + jitter(),
      depthAndLayering: base + jitter(),
      rhythmAndFlow: base + jitter(),
      intentionalComplexity: base + jitter(),
      overallScore: base,
      feedback: 'A captivating blend of colors and movement.',
      recognizedElements: ['patterns', 'colors', 'motion'],
      suggestedTags: ['abstract', 'generative', 'dynamic'],
      reviewedAt: new Date(),
      modelId: 'mock',
    };
  }

  /**
   * Create a failed review placeholder.
   */
  private createFailedReview(): ArtworkReview {
    return {
      colorHarmony: 30,
      composition: 30,
      visualUnity: 30,
      depthAndLayering: 30,
      rhythmAndFlow: 30,
      intentionalComplexity: 30,
      overallScore: 30,
      feedback: 'Review unavailable.',
      recognizedElements: [],
      suggestedTags: [],
      reviewedAt: new Date(),
      modelId: 'failed',
    };
  }
}
