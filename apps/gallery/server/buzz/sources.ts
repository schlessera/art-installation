/**
 * Buzz Sources
 *
 * Implementations for fetching social media posts about CloudFest/hackathon
 * from various platforms. Each source monitors the same hashtags:
 * #CFHack, #CFHACK2026, #CFHack26, #Cloudfest
 */

// ============ Types ============

export interface BuzzResult {
  /** Raw post texts from this source */
  texts: string[];
  /** Source identifier */
  source: string;
  /** When the data was fetched */
  fetchedAt: Date;
}

export interface BuzzSource {
  readonly id: string;
  readonly name: string;
  fetch(): Promise<BuzzResult>;
}

// ============ Keyword Extraction ============

const STOPWORDS = new Set([
  // English stopwords
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
  'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
  'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her',
  'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there',
  'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get',
  'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no',
  'just', 'him', 'know', 'take', 'people', 'into', 'year', 'your',
  'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then',
  'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also',
  'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first',
  'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these',
  'give', 'day', 'most', 'us', 'are', 'has', 'was', 'were', 'been',
  'being', 'had', 'did', 'does', 'doing', 'is', 'am', 'more', 'very',
  'here', 'too', 'really', 'much', 'still', 'own', 'got', 'such',
  // Chat filler
  'yeah', 'yes', 'yep', 'nah', 'nope', 'lol', 'lmao', 'omg', 'wow',
  'haha', 'hehe', 'gonna', 'wanna', 'gotta', 'kinda', 'thanks',
  'thank', 'please', 'sorry', 'hey', 'hello', 'right', 'sure',
  'maybe', 'though', 'already', 'actually', 'literally', 'basically',
  'definitely', 'probably', 'pretty', 'quite', 'thing', 'things',
  'stuff', 'bit', 'lot', 'lots', 'great', 'nice', 'cool', 'awesome',
  'amazing', 'love', 'hate', 'best', 'worst', 'check', 'looking',
  // Event-obvious words (we already know the context)
  'cloudfest', 'hackathon', 'cfhack', 'cfhack2026', 'cfhack26',
  'hack', 'hacking', 'event', 'conference',
]);

/**
 * Strip HTML tags from text.
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ');
}

/**
 * Extract meaningful keywords from an array of post texts.
 */
export function extractKeywords(texts: string[]): string[] {
  const wordCounts = new Map<string, number>();

  for (const text of texts) {
    // Strip HTML, URLs, mentions, hashtags, emoji
    const cleaned = stripHtml(text)
      .replace(/https?:\/\/\S+/g, '')
      .replace(/@\S+/g, '')
      .replace(/#\S+/g, '')
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
      .toLowerCase();

    // Split on non-alpha characters
    const words = cleaned.split(/[^a-z]+/).filter(
      (w) => w.length > 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w),
    );

    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }
  }

  // Sort by frequency descending, return top keywords
  return [...wordCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word);
}

// ============ Shared fetch helper ============

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// ============ Mastodon Source ============

const MASTODON_HASHTAGS = ['CFHack', 'CFHACK2026', 'CFHack26', 'Cloudfest'];
const MASTODON_INSTANCES = ['mastodon.social', 'fosstodon.org'];

export class MastodonBuzzSource implements BuzzSource {
  readonly id = 'mastodon';
  readonly name = 'Mastodon';
  private instanceIndex = 0;

  async fetch(): Promise<BuzzResult> {
    const texts: string[] = [];
    const instance = MASTODON_INSTANCES[this.instanceIndex % MASTODON_INSTANCES.length];
    this.instanceIndex++;

    // Pick 2 random hashtags to check (rotate through them)
    const hashtags = [...MASTODON_HASHTAGS]
      .sort(() => Math.random() - 0.5)
      .slice(0, 2);

    for (const hashtag of hashtags) {
      try {
        const url = `https://${instance}/api/v1/timelines/tag/${hashtag}?limit=20`;
        const response = await fetchWithTimeout(url);
        if (!response.ok) {
          console.warn(`[Buzz:Mastodon] ${instance} /tag/${hashtag} returned ${response.status}`);
          continue;
        }
        const statuses = (await response.json()) as { content: string }[];
        for (const status of statuses) {
          if (status.content) {
            texts.push(status.content);
          }
        }
      } catch (err) {
        console.warn(`[Buzz:Mastodon] Failed to fetch ${hashtag} from ${instance}:`, err instanceof Error ? err.message : err);
      }
    }

    console.log(`[Buzz:Mastodon] Fetched ${texts.length} posts from ${instance}`);
    return { texts, source: this.id, fetchedAt: new Date() };
  }
}

// ============ Bluesky Trending Source (no auth) ============

export class BlueskyTrendingSource implements BuzzSource {
  readonly id = 'bluesky-trending';
  readonly name = 'Bluesky Trending';

  async fetch(): Promise<BuzzResult> {
    try {
      const url = 'https://public.api.bsky.app/xrpc/app.bsky.unspecced.getTrendingTopics';
      const response = await fetchWithTimeout(url);
      if (!response.ok) {
        console.warn(`[Buzz:BlueskyTrending] Returned ${response.status}`);
        return { texts: [], source: this.id, fetchedAt: new Date() };
      }

      const data = (await response.json()) as {
        topics?: { topic?: string }[];
      };
      const texts = (data.topics || [])
        .map((t) => t.topic || '')
        .filter(Boolean);

      console.log(`[Buzz:BlueskyTrending] Fetched ${texts.length} trending topics`);
      return { texts, source: this.id, fetchedAt: new Date() };
    } catch (err) {
      console.warn('[Buzz:BlueskyTrending] Failed:', err instanceof Error ? err.message : err);
      return { texts: [], source: this.id, fetchedAt: new Date() };
    }
  }
}

// ============ Bluesky Search Source (requires auth) ============

export interface BlueskySearchConfig {
  identifier: string; // Bluesky handle or email
  password: string;   // App password
}

const BLUESKY_QUERY = '#CFHack OR #CFHACK2026 OR #CFHack26 OR #Cloudfest';

export class BlueskySearchSource implements BuzzSource {
  readonly id = 'bluesky-search';
  readonly name = 'Bluesky Search';
  private accessJwt: string | null = null;
  private tokenExpiry = 0;

  constructor(private config: BlueskySearchConfig) {}

  async fetch(): Promise<BuzzResult> {
    try {
      // Ensure we have a valid auth token
      await this.ensureAuth();
      if (!this.accessJwt) {
        return { texts: [], source: this.id, fetchedAt: new Date() };
      }

      const url = `https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(BLUESKY_QUERY)}&limit=25`;
      const response = await fetchWithTimeout(url, {
        headers: { 'Authorization': `Bearer ${this.accessJwt}` },
      });

      if (response.status === 401) {
        // Token expired, clear and retry next time
        this.accessJwt = null;
        this.tokenExpiry = 0;
        console.warn('[Buzz:BlueskySearch] Token expired, will re-auth on next poll');
        return { texts: [], source: this.id, fetchedAt: new Date() };
      }

      if (!response.ok) {
        console.warn(`[Buzz:BlueskySearch] Search returned ${response.status}`);
        return { texts: [], source: this.id, fetchedAt: new Date() };
      }

      const data = (await response.json()) as {
        posts?: { record?: { text?: string } }[];
      };
      const texts = (data.posts || [])
        .map((p) => p.record?.text || '')
        .filter(Boolean);

      console.log(`[Buzz:BlueskySearch] Fetched ${texts.length} posts`);
      return { texts, source: this.id, fetchedAt: new Date() };
    } catch (err) {
      console.warn('[Buzz:BlueskySearch] Failed:', err instanceof Error ? err.message : err);
      return { texts: [], source: this.id, fetchedAt: new Date() };
    }
  }

  private async ensureAuth(): Promise<void> {
    // Re-auth every 30 minutes (tokens last ~2 hours but be conservative)
    if (this.accessJwt && Date.now() < this.tokenExpiry) return;

    try {
      const response = await fetchWithTimeout('https://bsky.social/xrpc/com.atproto.server.createSession', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: this.config.identifier,
          password: this.config.password,
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        console.warn(`[Buzz:BlueskySearch] Auth failed ${response.status}: ${body.slice(0, 200)}`);
        this.accessJwt = null;
        return;
      }

      const data = (await response.json()) as { accessJwt?: string };
      this.accessJwt = data.accessJwt || null;
      this.tokenExpiry = Date.now() + 30 * 60 * 1000; // 30 min
      console.log('[Buzz:BlueskySearch] Authenticated successfully');
    } catch (err) {
      console.warn('[Buzz:BlueskySearch] Auth error:', err instanceof Error ? err.message : err);
      this.accessJwt = null;
    }
  }
}

// ============ Twitter/X via RapidAPI ============

export interface TwitterSourceConfig {
  rapidApiKey: string;
  /** RapidAPI host for the Twitter API provider (default: twitter-api45.p.rapidapi.com) */
  rapidApiHost?: string;
}

const TWITTER_QUERY = '#CFHack OR #CFHACK2026 OR #CFHack26 OR #Cloudfest';

/**
 * Recursively find all `full_text` values in a nested Twitter GraphQL response.
 */
function findTweetTexts(obj: unknown, texts: string[] = []): string[] {
  if (obj && typeof obj === 'object') {
    if (!Array.isArray(obj)) {
      const record = obj as Record<string, unknown>;
      if (typeof record['full_text'] === 'string') {
        texts.push(record['full_text'] as string);
      } else {
        for (const value of Object.values(record)) {
          findTweetTexts(value, texts);
        }
      }
    } else {
      for (const item of obj) {
        findTweetTexts(item, texts);
      }
    }
  }
  return texts;
}

export class TwitterBuzzSource implements BuzzSource {
  readonly id = 'twitter';
  readonly name = 'X/Twitter';
  private host: string;

  constructor(private config: TwitterSourceConfig) {
    this.host = config.rapidApiHost || 'twittr-v2-fastest-twitter-x-api-150k-requests-for-15.p.rapidapi.com';
  }

  async fetch(): Promise<BuzzResult> {
    try {
      const url = `https://${this.host}/search?query=${encodeURIComponent(TWITTER_QUERY)}&count=20`;
      const response = await fetchWithTimeout(url, {
        headers: {
          'X-RapidAPI-Key': this.config.rapidApiKey,
          'X-RapidAPI-Host': this.host,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        if (response.status === 403 && body.includes('not subscribed')) {
          console.warn('[Buzz:Twitter] RapidAPI subscription required — subscribe to a Twitter API at rapidapi.com');
        } else {
          console.warn(`[Buzz:Twitter] Search returned ${response.status}: ${body.slice(0, 200)}`);
        }
        return { texts: [], source: this.id, fetchedAt: new Date() };
      }

      const data = await response.json();
      // Twitter GraphQL responses nest full_text deeply — extract recursively
      const allTexts = findTweetTexts(data);
      // Deduplicate (retweets often duplicate text)
      const texts = [...new Set(allTexts)];

      console.log(`[Buzz:Twitter] Fetched ${texts.length} tweets`);
      return { texts, source: this.id, fetchedAt: new Date() };
    } catch (err) {
      console.warn('[Buzz:Twitter] Failed:', err instanceof Error ? err.message : err);
      return { texts: [], source: this.id, fetchedAt: new Date() };
    }
  }
}

// ============ Mattermost Source ============

export interface MattermostSourceConfig {
  url: string;
  token: string;
  channelIds: string[];
}

export class MattermostBuzzSource implements BuzzSource {
  readonly id = 'mattermost';
  readonly name = 'Mattermost';

  constructor(private config: MattermostSourceConfig) {}

  async fetch(): Promise<BuzzResult> {
    const texts: string[] = [];

    // Pick a random channel to check each time (rotation)
    const channelId = this.config.channelIds[
      Math.floor(Math.random() * this.config.channelIds.length)
    ];

    if (!channelId) {
      return { texts: [], source: this.id, fetchedAt: new Date() };
    }

    try {
      const baseUrl = this.config.url.replace(/\/+$/, '');
      const url = `${baseUrl}/api/v4/channels/${channelId}/posts?per_page=30`;
      const response = await fetchWithTimeout(url, {
        headers: {
          'Authorization': `Bearer ${this.config.token}`,
        },
      });

      if (!response.ok) {
        console.warn(`[Buzz:Mattermost] Channel ${channelId} returned ${response.status}`);
        return { texts: [], source: this.id, fetchedAt: new Date() };
      }

      const data = (await response.json()) as {
        order?: string[];
        posts?: Record<string, { message?: string }>;
      };

      if (data.order && data.posts) {
        for (const postId of data.order) {
          const post = data.posts[postId];
          if (post?.message) {
            texts.push(post.message);
          }
        }
      }

      console.log(`[Buzz:Mattermost] Fetched ${texts.length} messages from channel ${channelId}`);
      return { texts, source: this.id, fetchedAt: new Date() };
    } catch (err) {
      console.warn('[Buzz:Mattermost] Failed:', err instanceof Error ? err.message : err);
      return { texts: [], source: this.id, fetchedAt: new Date() };
    }
  }
}
