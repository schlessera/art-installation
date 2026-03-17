/**
 * Gallery API Routes
 *
 * REST API for artwork submission, retrieval, and voting.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { GalleryStorage, ArtworkSubmission } from './storage';

export interface RuntimeIdConfig {
  sampleRuntimeId: string;
  officialRuntimeId: string;
}

export function createApiRoutes(storage: GalleryStorage, runtimeIdConfig: RuntimeIdConfig): Router {
  const router = Router();

  /**
   * POST /api/artworks
   * Submit a new artwork from the runtime.
   */
  router.post('/artworks', async (req: Request, res: Response) => {
    try {
      const submission: ArtworkSubmission = req.body;

      // Validate runtime ID (when gating is configured)
      const gatingEnabled = !!(runtimeIdConfig.sampleRuntimeId || runtimeIdConfig.officialRuntimeId);
      let isSample = false;

      if (gatingEnabled) {
        const runtimeId = submission.runtimeId;
        if (!runtimeId || (runtimeId !== runtimeIdConfig.sampleRuntimeId && runtimeId !== runtimeIdConfig.officialRuntimeId)) {
          res.status(403).json({ error: 'Submission rejected' });
          return;
        }
        isSample = runtimeId === runtimeIdConfig.sampleRuntimeId;
      }

      // Validate required fields
      if (!submission.imageData || !submission.thumbnailData) {
        res.status(400).json({ error: 'Missing image data' });
        return;
      }
      if (!submission.contributingActors || submission.contributingActors.length === 0) {
        res.status(400).json({ error: 'Missing contributing actors' });
        return;
      }

      const artwork = await storage.submitArtwork(submission, isSample);
      res.status(201).json(artwork);
    } catch (err) {
      console.error('[API] Failed to submit artwork:', err);
      res.status(500).json({ error: 'Failed to submit artwork' });
    }
  });

  /**
   * GET /api/artworks
   * Get all artworks with optional filters.
   */
  router.get('/artworks', async (req: Request, res: Response) => {
    try {
      const filters = {
        isVisible: req.query.visible === 'true' ? true : req.query.visible === 'false' ? false : undefined,
        isArchived: req.query.archived === 'true' ? true : req.query.archived === 'false' ? false : undefined,
        sortBy: req.query.sortBy as 'createdAt' | 'combinedScore' | 'voteCount' | undefined,
        sortDirection: req.query.sortDir as 'asc' | 'desc' | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
        actorId: req.query.actor as string | undefined,
      };

      const artworks = await storage.getArtworks(filters);
      res.json(artworks);
    } catch (err) {
      console.error('[API] Failed to get artworks:', err);
      res.status(500).json({ error: 'Failed to get artworks' });
    }
  });

  /**
   * GET /api/artworks/:id
   * Get a single artwork by ID.
   */
  router.get('/artworks/:id', async (req: Request, res: Response) => {
    try {
      const artwork = await storage.getArtwork(req.params.id);
      if (!artwork) {
        res.status(404).json({ error: 'Artwork not found' });
        return;
      }
      res.json(artwork);
    } catch (err) {
      console.error('[API] Failed to get artwork:', err);
      res.status(500).json({ error: 'Failed to get artwork' });
    }
  });

  /**
   * POST /api/artworks/:id/vote
   * Like an artwork (toggle-style, but only allows adding - no unlike).
   */
  router.post('/artworks/:id/vote', async (req: Request, res: Response) => {
    try {
      const { voterName } = req.body;

      if (!voterName || typeof voterName !== 'string') {
        res.status(400).json({ error: 'Missing voter name' });
        return;
      }

      const vote = await storage.addVote(req.params.id, voterName);
      if (!vote) {
        res.status(404).json({ error: 'Artwork not found' });
        return;
      }

      res.status(201).json(vote);
    } catch (err) {
      if (err instanceof Error && err.message === 'Already liked this artwork') {
        res.status(409).json({ error: err.message });
        return;
      }
      console.error('[API] Failed to add vote:', err);
      res.status(500).json({ error: 'Failed to add vote' });
    }
  });

  /**
   * GET /api/artworks/:id/voted
   * Check if a voter has voted on an artwork.
   */
  router.get('/artworks/:id/voted', async (req: Request, res: Response) => {
    try {
      const voterName = req.query.voter as string;
      if (!voterName) {
        res.status(400).json({ error: 'Missing voter parameter' });
        return;
      }

      const hasVoted = await storage.hasVoted(req.params.id, voterName);
      res.json({ hasVoted });
    } catch (err) {
      console.error('[API] Failed to check vote:', err);
      res.status(500).json({ error: 'Failed to check vote' });
    }
  });

  /**
   * GET /api/stats
   * Get gallery statistics.
   */
  router.get('/stats', async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getStats();
      res.json(stats);
    } catch (err) {
      console.error('[API] Failed to get stats:', err);
      res.status(500).json({ error: 'Failed to get stats' });
    }
  });

  /**
   * GET /api/health
   * Health check endpoint.
   */
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return router;
}
