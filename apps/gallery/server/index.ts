/**
 * Gallery Server
 *
 * Express server that handles:
 * - Artwork submission from runtime
 * - Async AI review of submitted artworks
 * - Voting API for gallery visitors
 * - Static file serving for images
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GalleryStorage } from './storage';
import { ArtworkReviewer } from './reviewer';
import { createApiRoutes } from './routes';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration from environment variables
const PORT = parseInt(process.env.GALLERY_PORT || process.env.PORT || '3001', 10);
const DATA_DIR = process.env.GALLERY_DATA_DIR || path.join(__dirname, '../data');
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MAX_ARTWORKS = parseInt(process.env.GALLERY_MAX_ARTWORKS || '30', 10);
const PRUNE_PERCENTAGE = parseFloat(process.env.GALLERY_PRUNE_PERCENTAGE || '0.1');
const MIN_SCORE_THRESHOLD = parseInt(process.env.GALLERY_MIN_SCORE || '40', 10);

// Allowed origins for CORS (runtime URL)
const RUNTIME_URL = process.env.RUNTIME_URL || 'http://localhost:3000';
const ALLOWED_ORIGINS = [
  RUNTIME_URL,
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
];

async function main() {
  console.log('[Gallery] Starting server...');
  console.log(`[Gallery] Data directory: ${DATA_DIR}`);
  console.log(`[Gallery] API Key: ${ANTHROPIC_API_KEY ? 'configured' : 'not configured (using mock reviews)'}`);

  // Initialize storage
  const storage = new GalleryStorage({
    dataDir: DATA_DIR,
    imagesDir: path.join(DATA_DIR, 'images'),
    maxArtworks: MAX_ARTWORKS,
    prunePercentage: PRUNE_PERCENTAGE,
  });
  await storage.init();

  // Initialize reviewer
  const reviewer = new ArtworkReviewer(storage, {
    apiKey: ANTHROPIC_API_KEY,
    minScoreThreshold: MIN_SCORE_THRESHOLD,
  });
  reviewer.start();

  // Create Express app
  const app = express();

  // Middleware
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }));

  app.use(express.json({ limit: '50mb' })); // Large limit for base64 images

  // Request logging
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });

  // API routes
  app.use('/api', createApiRoutes(storage));

  // Static file serving for images
  app.use('/images', express.static(path.join(DATA_DIR, 'images')));

  // Health check at root
  app.get('/', (_req, res) => {
    res.json({
      name: 'Art Installation Gallery API',
      version: '1.0.0',
      endpoints: {
        artworks: '/api/artworks',
        stats: '/api/stats',
        health: '/api/health',
      },
    });
  });

  // Error handling
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Gallery] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  // Start server
  app.listen(PORT, () => {
    console.log(`[Gallery] Server running on http://localhost:${PORT}`);
    console.log(`[Gallery] API available at http://localhost:${PORT}/api`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('[Gallery] Shutting down...');
    reviewer.stop();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('[Gallery] Shutting down...');
    reviewer.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[Gallery] Fatal error:', err);
  process.exit(1);
});
