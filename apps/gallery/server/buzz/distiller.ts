/**
 * Buzz Distiller
 *
 * Uses an LLM (via OpenRouter) to distill raw keywords from social media
 * posts into 1-3 short, evocative words for the art installation canvas.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface BuzzDistillerConfig {
  /** OpenRouter API key */
  apiKey: string;
  /** Model to use (default: gemini-2.5-flash-preview) */
  model?: string;
}

const DISTILL_PROMPT = `You curate words for a live digital art installation at CloudFest hackathon.
Below are keywords extracted from recent social media posts about the event.

Pick 1-3 short, evocative English words that capture the current mood or
topics people are excited about. Avoid generic words like "great" or "fun".
Prefer concrete, vivid, or poetic words.

Return ONLY a JSON array of lowercase strings, e.g. ["spark", "collaborate", "neon"].

Keywords from recent posts:`;

export class BuzzDistiller {
  private config: Required<BuzzDistillerConfig>;

  constructor(config: BuzzDistillerConfig) {
    this.config = {
      apiKey: config.apiKey,
      model: config.model || 'google/gemini-2.5-flash',
    };
  }

  /**
   * Distill raw keywords into 1-3 evocative words.
   * Returns the input keywords (top 3) on any failure.
   */
  async distill(rawKeywords: string[]): Promise<string[]> {
    if (rawKeywords.length === 0) {
      return [];
    }

    const fallback = rawKeywords.slice(0, 3);

    if (!this.config.apiKey) {
      return fallback;
    }

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
              content: `${DISTILL_PROMPT} ${rawKeywords.join(', ')}`,
            },
          ],
          max_tokens: 100,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        console.warn(`[BuzzDistiller] OpenRouter ${response.status}: ${body.slice(0, 200)}`);
        return fallback;
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) {
        console.warn('[BuzzDistiller] Empty response from OpenRouter');
        return fallback;
      }

      // Parse JSON array from response (handle markdown code blocks)
      const jsonMatch = text.match(/\[[\s\S]*?\]/);
      if (!jsonMatch) {
        console.warn(`[BuzzDistiller] Could not find JSON array in response: ${text}`);
        return fallback;
      }

      const parsed = JSON.parse(jsonMatch[0]) as unknown;
      if (!Array.isArray(parsed) || parsed.length === 0) {
        console.warn('[BuzzDistiller] Parsed result is not a non-empty array');
        return fallback;
      }

      const words = parsed
        .filter((w): w is string => typeof w === 'string')
        .map((w) => w.toLowerCase().trim())
        .filter((w) => w.length > 0)
        .slice(0, 3);

      if (words.length === 0) {
        return fallback;
      }

      console.log(`[BuzzDistiller] Distilled ${rawKeywords.length} keywords → [${words.join(', ')}]`);
      return words;
    } catch (err) {
      console.warn('[BuzzDistiller] Failed:', err instanceof Error ? err.message : err);
      return fallback;
    }
  }
}
