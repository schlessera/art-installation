import { useMemo } from 'react';
import type { SavedArtwork, GalleryStats, ArtworkQueryFilters, ArtworkVote } from '@art/types';

// API is served from the same origin via Vite proxy in dev, or same server in prod
const API_BASE = import.meta.env.VITE_API_URL || '/api';

/**
 * API client for the gallery.
 */
class GalleryApi {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * Fetch with error handling.
   */
  private async fetch<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get all artworks with optional filters.
   */
  async getArtworks(filters: ArtworkQueryFilters = {}): Promise<SavedArtwork[]> {
    const params = new URLSearchParams();

    if (filters.isVisible !== undefined) params.set('visible', String(filters.isVisible));
    if (filters.isArchived !== undefined) params.set('archived', String(filters.isArchived));
    if (filters.sortBy) params.set('sortBy', filters.sortBy);
    if (filters.sortDirection) params.set('sortDir', filters.sortDirection);
    if (filters.limit) params.set('limit', String(filters.limit));
    if (filters.offset) params.set('offset', String(filters.offset));
    if (filters.actorId) params.set('actor', filters.actorId);

    const query = params.toString();
    return this.fetch<SavedArtwork[]>(`/artworks${query ? `?${query}` : ''}`);
  }

  /**
   * Get a single artwork by ID.
   */
  async getArtwork(id: string): Promise<SavedArtwork | null> {
    try {
      return await this.fetch<SavedArtwork>(`/artworks/${id}`);
    } catch {
      return null;
    }
  }

  /**
   * Get gallery statistics.
   */
  async getStats(): Promise<GalleryStats> {
    return this.fetch<GalleryStats>('/stats');
  }

  /**
   * Like an artwork.
   */
  async vote(artworkId: string, voterName: string): Promise<ArtworkVote> {
    return this.fetch<ArtworkVote>(`/artworks/${artworkId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ voterName }),
    });
  }

  /**
   * Check if user has voted on artwork.
   */
  async hasVoted(artworkId: string, voterName: string): Promise<boolean> {
    const result = await this.fetch<{ hasVoted: boolean }>(
      `/artworks/${artworkId}/voted?voter=${encodeURIComponent(voterName)}`
    );
    return result.hasVoted;
  }
}

/**
 * Mock API for development without backend.
 */
class MockGalleryApi extends GalleryApi {
  private artworks: SavedArtwork[] = [];

  constructor() {
    super('');
    this.initMockData();
  }

  private initMockData() {
    // Generate some mock artworks
    this.artworks = Array.from({ length: 12 }, (_, i) => this.createMockArtwork(i));
  }

  private createMockArtwork(index: number): SavedArtwork {
    const id = `mock-artwork-${index}`;
    const createdAt = new Date(Date.now() - index * 3600000);
    const aiScore = 50 + Math.floor(Math.random() * 45);
    const voteCount = Math.floor(Math.random() * 20);

    return {
      id,
      imagePath: this.generatePlaceholderImage(index),
      thumbnailPath: this.generatePlaceholderImage(index),
      createdAt,
      contributingActors: [
        {
          actorId: 'wave-painter',
          actorName: 'Wave Painter',
          authorName: 'Demo Author',
          contributionWeight: 0.6,
          operationCount: 150,
        },
        {
          actorId: 'color-flow',
          actorName: 'Color Flow',
          authorName: 'Demo Author 2',
          authorGithub: 'demo',
          contributionWeight: 0.4,
          operationCount: 100,
        },
      ],
      review: {
        aestheticScore: aiScore + Math.floor(Math.random() * 10 - 5),
        creativityScore: aiScore + Math.floor(Math.random() * 10 - 5),
        coherenceScore: aiScore + Math.floor(Math.random() * 10 - 5),
        overallScore: aiScore,
        feedback: 'A beautiful blend of flowing colors and dynamic patterns.',
        recognizedElements: ['waves', 'gradients', 'particles'],
        suggestedTags: ['abstract', 'colorful', 'dynamic'],
        reviewedAt: createdAt,
        modelId: 'claude-sonnet-4-20250514',
      },
      votes: Array.from({ length: voteCount }, (_, j) => ({
        id: `vote-${index}-${j}`,
        voterName: `Voter ${j + 1}`,
        votedAt: new Date(createdAt.getTime() + j * 60000),
      })),
      voteCount,
      combinedScore: aiScore + Math.min(30, 30 * (1 - Math.exp(-voteCount / 5))),
      context: {
        timestamp: createdAt,
        time: {
          hour: createdAt.getHours(),
          dayProgress: createdAt.getHours() / 24,
          season: 'winter',
        },
      },
      cycleNumber: index + 1,
      cycleDuration: 60,
      frameCount: 3600,
      isVisible: true,
      isArchived: false,
    };
  }

  private generatePlaceholderImage(index: number): string {
    // Generate a simple colored placeholder as data URL
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Create gradient background
      const hue = (index * 30) % 360;
      const gradient = ctx.createLinearGradient(0, 0, 400, 300);
      gradient.addColorStop(0, `hsl(${hue}, 70%, 40%)`);
      gradient.addColorStop(1, `hsl(${(hue + 60) % 360}, 70%, 30%)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 400, 300);

      // Add some circles
      for (let i = 0; i < 5; i++) {
        const x = Math.random() * 400;
        const y = Math.random() * 300;
        const r = 20 + Math.random() * 60;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${(hue + 120 + i * 20) % 360}, 60%, 60%, 0.5)`;
        ctx.fill();
      }
    }
    return canvas.toDataURL('image/png');
  }

  async getArtworks(filters: ArtworkQueryFilters = {}): Promise<SavedArtwork[]> {
    let result = [...this.artworks];

    // Apply filters
    if (filters.isVisible !== undefined) {
      result = result.filter((a) => a.isVisible === filters.isVisible);
    }
    if (filters.isArchived !== undefined) {
      result = result.filter((a) => a.isArchived === filters.isArchived);
    }

    // Sort
    const sortBy = filters.sortBy || 'createdAt';
    const sortDir = filters.sortDirection || 'desc';
    result.sort((a, b) => {
      let aVal: number, bVal: number;
      switch (sortBy) {
        case 'combinedScore':
          aVal = a.combinedScore;
          bVal = b.combinedScore;
          break;
        case 'voteCount':
          aVal = a.voteCount;
          bVal = b.voteCount;
          break;
        default:
          aVal = new Date(a.createdAt).getTime();
          bVal = new Date(b.createdAt).getTime();
      }
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });

    // Pagination
    const offset = filters.offset || 0;
    const limit = filters.limit || result.length;
    return result.slice(offset, offset + limit);
  }

  async getArtwork(id: string): Promise<SavedArtwork | null> {
    return this.artworks.find((a) => a.id === id) || null;
  }

  async getStats(): Promise<GalleryStats> {
    const visible = this.artworks.filter((a) => a.isVisible && !a.isArchived);
    const allVotes = this.artworks.flatMap((a) => a.votes);
    return {
      totalCreated: this.artworks.length,
      visibleCount: visible.length,
      archivedCount: 0,
      totalVotes: allVotes.length,
      uniqueVoters: new Set(allVotes.map((v) => v.voterName)).size,
      averageAIScore:
        visible.reduce((sum, a) => sum + a.review.overallScore, 0) / visible.length,
      cyclesCompleted: this.artworks.length,
    };
  }

  async vote(artworkId: string, voterName: string): Promise<ArtworkVote> {
    const artwork = this.artworks.find((a) => a.id === artworkId);
    if (!artwork) throw new Error('Artwork not found');

    const vote: ArtworkVote = {
      id: `vote-${Date.now()}`,
      voterName,
      votedAt: new Date(),
    };

    artwork.votes.push(vote);
    artwork.voteCount = artwork.votes.length;
    artwork.combinedScore =
      artwork.review.overallScore + Math.min(30, 30 * (1 - Math.exp(-artwork.voteCount / 5)));

    return vote;
  }

  async hasVoted(artworkId: string, voterName: string): Promise<boolean> {
    const artwork = this.artworks.find((a) => a.id === artworkId);
    if (!artwork) return false;
    return artwork.votes.some((v) => v.voterName.toLowerCase() === voterName.toLowerCase());
  }
}

/**
 * Hook to get gallery API instance.
 */
export function useGalleryApi() {
  return useMemo(() => {
    // Use mock API only if explicitly requested via env var
    if (import.meta.env.VITE_USE_MOCK_API === 'true') {
      return new MockGalleryApi();
    }
    return new GalleryApi(API_BASE);
  }, []);
}
