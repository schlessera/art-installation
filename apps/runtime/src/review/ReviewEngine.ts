/**
 * Review Engine
 *
 * Integrates with Claude API to evaluate artwork quality.
 * Generates aesthetic scores, feedback, and suggested tags.
 */

import type { ArtworkReview } from '@art/types';
import type { CapturedSnapshot } from './SnapshotCapture';

export interface ReviewConfig {
  /** Anthropic API key */
  apiKey: string;

  /** API endpoint (defaults to Anthropic's API) */
  apiEndpoint?: string;

  /** Model to use for reviews */
  model?: string;

  /** Maximum tokens in response */
  maxTokens?: number;

  /** Review interval in milliseconds */
  reviewInterval?: number;

  /** Minimum score threshold for saving to gallery */
  minScoreThreshold?: number;
}

export interface ReviewResult {
  /** Whether review was successful */
  success: boolean;

  /** Review data (if successful) */
  review?: ArtworkReview;

  /** Error message (if failed) */
  error?: string;

  /** API latency in milliseconds */
  latencyMs?: number;
}

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: Array<{
    type: 'text' | 'image';
    text?: string;
    source?: {
      type: 'base64';
      media_type: string;
      data: string;
    };
  }>;
}

interface ClaudeResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

const DEFAULT_CONFIG: Required<Omit<ReviewConfig, 'apiKey'>> = {
  apiEndpoint: 'https://api.anthropic.com/v1/messages',
  model: 'claude-sonnet-4-20250514',
  maxTokens: 1024,
  reviewInterval: 60000, // 1 minute
  minScoreThreshold: 50,
};

const REVIEW_PROMPT = `You are an art critic reviewing a digital artwork created collaboratively by AI-driven "actors" in an interactive installation.

Analyze this artwork and provide a structured evaluation. Be concise but insightful.

Respond ONLY with valid JSON in this exact format:
{
  "colorHarmony": <number 0-100>,
  "composition": <number 0-100>,
  "visualUnity": <number 0-100>,
  "depthAndLayering": <number 0-100>,
  "rhythmAndFlow": <number 0-100>,
  "intentionalComplexity": <number 0-100>,
  "overallScore": <number 0-100>,
  "feedback": "<2-3 sentences describing the artwork's strengths and areas for improvement>",
  "recognizedElements": ["<element1>", "<element2>", ...],
  "suggestedTags": ["<tag1>", "<tag2>", ...]
}

Scoring guidelines:
- colorHarmony: Coherent color palette (monochromatic, complementary, analogous, etc.)
- composition: Intentional spatial structure (rule of thirds, symmetry, focal points)
- visualUnity: Multi-actor contributions meshing into one cohesive piece
- depthAndLayering: Sense of spatial depth through foreground/background interaction
- rhythmAndFlow: Visual movement, eye guidance, dynamic energy
- intentionalComplexity: Structured detail at appropriate level (not empty, not noisy)
- overallScore: Average of all dimension scores

Be honest but constructive. A blank or very sparse canvas should score low.`;

/**
 * Review engine for evaluating artwork using Claude API.
 */
export class ReviewEngine {
  private config: Required<ReviewConfig>;
  private lastReviewTime = 0;
  private reviewCount = 0;

  constructor(config: ReviewConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as Required<ReviewConfig>;
  }

  /**
   * Check if enough time has passed since the last review.
   */
  canReview(): boolean {
    const now = Date.now();
    return now - this.lastReviewTime >= this.config.reviewInterval;
  }

  /**
   * Get time until next review is allowed (in ms).
   */
  timeUntilNextReview(): number {
    const elapsed = Date.now() - this.lastReviewTime;
    return Math.max(0, this.config.reviewInterval - elapsed);
  }

  /**
   * Review a captured snapshot.
   */
  async review(snapshot: CapturedSnapshot): Promise<ReviewResult> {
    const startTime = Date.now();

    try {
      // Build the message with image
      const message: ClaudeMessage = {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: snapshot.base64,
            },
          },
          {
            type: 'text',
            text: REVIEW_PROMPT,
          },
        ],
      };

      // Call Claude API
      const response = await fetch(this.config.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: this.config.maxTokens,
          messages: [message],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error ${response.status}: ${errorText}`);
      }

      const data: ClaudeResponse = await response.json();

      // Extract text response
      const textContent = data.content.find((c) => c.type === 'text');
      if (!textContent?.text) {
        throw new Error('No text response from API');
      }

      // Parse JSON response
      const reviewData = this.parseReviewResponse(textContent.text);

      // Update tracking
      this.lastReviewTime = Date.now();
      this.reviewCount++;

      const review: ArtworkReview = {
        ...reviewData,
        reviewedAt: new Date(),
        modelId: this.config.model,
      };

      return {
        success: true,
        review,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ReviewEngine] Review failed:', errorMessage);

      return {
        success: false,
        error: errorMessage,
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Parse the review response JSON.
   */
  private parseReviewResponse(text: string): Omit<ArtworkReview, 'reviewedAt' | 'modelId'> {
    // Try to extract JSON from the response
    let jsonStr = text.trim();

    // Handle markdown code blocks
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    try {
      const data = JSON.parse(jsonStr);

      // Validate and clamp scores
      const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

      return {
        colorHarmony: clamp(data.colorHarmony ?? 50),
        composition: clamp(data.composition ?? 50),
        visualUnity: clamp(data.visualUnity ?? 50),
        depthAndLayering: clamp(data.depthAndLayering ?? 50),
        rhythmAndFlow: clamp(data.rhythmAndFlow ?? 50),
        intentionalComplexity: clamp(data.intentionalComplexity ?? 50),
        overallScore: clamp(data.overallScore ?? 50),
        feedback: String(data.feedback ?? 'No feedback provided.'),
        recognizedElements: Array.isArray(data.recognizedElements)
          ? data.recognizedElements.map(String)
          : [],
        suggestedTags: Array.isArray(data.suggestedTags)
          ? data.suggestedTags.map(String)
          : [],
      };
    } catch (parseError) {
      console.warn('[ReviewEngine] Failed to parse JSON, using fallback:', parseError);

      // Return default scores if parsing fails
      return {
        colorHarmony: 50,
        composition: 50,
        visualUnity: 50,
        depthAndLayering: 50,
        rhythmAndFlow: 50,
        intentionalComplexity: 50,
        overallScore: 50,
        feedback: 'Review parsing failed. Using default scores.',
        recognizedElements: [],
        suggestedTags: [],
      };
    }
  }

  /**
   * Check if a review score meets the threshold for gallery saving.
   */
  meetsThreshold(review: ArtworkReview): boolean {
    return review.overallScore >= this.config.minScoreThreshold;
  }

  /**
   * Get review statistics.
   */
  getStats(): { reviewCount: number; lastReviewTime: number } {
    return {
      reviewCount: this.reviewCount,
      lastReviewTime: this.lastReviewTime,
    };
  }

  /**
   * Update the review interval.
   */
  setReviewInterval(intervalMs: number): void {
    this.config.reviewInterval = Math.max(10000, intervalMs); // Minimum 10 seconds
  }

  /**
   * Update the minimum score threshold.
   */
  setMinScoreThreshold(threshold: number): void {
    this.config.minScoreThreshold = Math.max(0, Math.min(100, threshold));
  }

  /**
   * Create a mock review for testing (no API call).
   */
  createMockReview(): ArtworkReview {
    const baseScore = 50 + Math.floor(Math.random() * 40);

    return {
      colorHarmony: baseScore + Math.floor(Math.random() * 20 - 10),
      composition: baseScore + Math.floor(Math.random() * 20 - 10),
      visualUnity: baseScore + Math.floor(Math.random() * 20 - 10),
      depthAndLayering: baseScore + Math.floor(Math.random() * 20 - 10),
      rhythmAndFlow: baseScore + Math.floor(Math.random() * 20 - 10),
      intentionalComplexity: baseScore + Math.floor(Math.random() * 20 - 10),
      overallScore: baseScore,
      feedback: 'This is a mock review for testing purposes.',
      recognizedElements: ['abstract shapes', 'flowing lines', 'color gradients'],
      suggestedTags: ['abstract', 'generative', 'colorful'],
      reviewedAt: new Date(),
      modelId: 'mock',
    };
  }
}
