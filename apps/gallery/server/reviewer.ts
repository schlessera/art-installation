/**
 * Artwork Reviewer
 *
 * Uses Claude API to review and rate submitted artworks.
 * Runs asynchronously in the background.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ArtworkReview, SavedArtwork } from '@art/types';
import type { GalleryStorage } from './storage';

export interface ReviewerConfig {
  /** Anthropic API key */
  apiKey: string;
  /** Model to use for reviews */
  model?: string;
  /** Minimum score threshold for visibility (0-100) */
  minScoreThreshold?: number;
  /** Review interval in milliseconds */
  reviewInterval?: number;
}

const DEFAULT_CONFIG = {
  model: 'claude-sonnet-4-20250514',
  minScoreThreshold: 40,
  reviewInterval: 5000, // Check every 5 seconds
};

const REVIEW_PROMPT = `You are an art critic evaluating digital generative artwork created by AI actors collaborating on a shared canvas.

Analyze this artwork and provide scores from 0-100 for each criterion:

1. **Aesthetic Score**: Visual appeal, color harmony, composition, balance
2. **Creativity Score**: Originality, uniqueness, innovative use of elements
3. **Coherence Score**: How well elements work together, visual unity, intentionality

Also provide:
- A brief feedback comment (1-2 sentences) suitable for gallery display
- List of recognized visual elements (e.g., "waves", "particles", "gradients")
- Suggested tags for categorization

Respond in this exact JSON format:
{
  "aestheticScore": <number 0-100>,
  "creativityScore": <number 0-100>,
  "coherenceScore": <number 0-100>,
  "feedback": "<brief comment>",
  "recognizedElements": ["element1", "element2"],
  "suggestedTags": ["tag1", "tag2"]
}`;

export class ArtworkReviewer {
  private config: ReviewerConfig & typeof DEFAULT_CONFIG;
  private client: Anthropic | null = null;
  private storage: GalleryStorage;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private processing = false;

  constructor(storage: GalleryStorage, config: ReviewerConfig) {
    this.storage = storage;
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (this.config.apiKey) {
      this.client = new Anthropic({ apiKey: this.config.apiKey });
    }
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

      console.log(`[Reviewer] Processing ${pending.length} pending artwork(s)`);

      for (const artwork of pending) {
        try {
          const review = await this.reviewArtwork(artwork);
          await this.storage.updateReview(artwork.id, review);
        } catch (err) {
          console.error(`[Reviewer] Failed to review ${artwork.id}:`, err);
          // Mark as reviewed with low score to prevent infinite retry
          await this.storage.updateReview(artwork.id, this.createFailedReview());
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
    if (!this.client) {
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

    try {
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: imageUrl.replace(/^data:image\/\w+;base64,/, ''),
                },
              },
              {
                type: 'text',
                text: REVIEW_PROMPT,
              },
            ],
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      const parsed = this.parseReviewResponse(content.text);
      return {
        ...parsed,
        reviewedAt: new Date(),
        modelId: this.config.model,
      };
    } catch (err) {
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
   * Parse the JSON response from Claude.
   */
  private parseReviewResponse(text: string): Omit<ArtworkReview, 'reviewedAt' | 'modelId'> {
    try {
      // Extract JSON from response (might be wrapped in markdown code block)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');

      const data = JSON.parse(jsonMatch[0]);

      return {
        aestheticScore: this.clampScore(data.aestheticScore),
        creativityScore: this.clampScore(data.creativityScore),
        coherenceScore: this.clampScore(data.coherenceScore),
        overallScore: Math.round(
          (this.clampScore(data.aestheticScore) +
            this.clampScore(data.creativityScore) +
            this.clampScore(data.coherenceScore)) / 3
        ),
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
    return {
      aestheticScore: base + Math.floor(Math.random() * 10 - 5),
      creativityScore: base + Math.floor(Math.random() * 10 - 5),
      coherenceScore: base + Math.floor(Math.random() * 10 - 5),
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
      aestheticScore: 30,
      creativityScore: 30,
      coherenceScore: 30,
      overallScore: 30,
      feedback: 'Review unavailable.',
      recognizedElements: [],
      suggestedTags: [],
      reviewedAt: new Date(),
      modelId: 'failed',
    };
  }
}
