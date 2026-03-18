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
import compression from 'compression';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GalleryStorage } from './storage';
import { ArtworkReviewer } from './reviewer';
import { createApiRoutes } from './routes';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration from environment variables
const PORT = parseInt(process.env.GALLERY_PORT || process.env.PORT || '3001', 10);
const DATA_DIR = process.env.GALLERY_DATA_DIR
  ? path.resolve(__dirname, '..', process.env.GALLERY_DATA_DIR)
  : path.join(__dirname, '../data');
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const MAX_ARTWORKS = parseInt(process.env.GALLERY_MAX_ARTWORKS || '100', 10);
const PRUNE_PERCENTAGE = parseFloat(process.env.GALLERY_PRUNE_PERCENTAGE || '0.1');
const MIN_SCORE_THRESHOLD = parseInt(process.env.GALLERY_MIN_SCORE || '40', 10);

// Runtime ID gating
const SAMPLE_RUNTIME_ID = process.env.GALLERY_SAMPLE_RUNTIME_ID || '';
const OFFICIAL_RUNTIME_ID = process.env.GALLERY_OFFICIAL_RUNTIME_ID || '';

// Allowed origins for CORS (runtime URL)
const RUNTIME_URL = process.env.RUNTIME_URL || 'http://localhost:3000';
const EXTRA_ORIGINS = (process.env.CORS_ORIGINS || '').split(',').filter(Boolean);
const IS_DEV = process.env.NODE_ENV !== 'production';
const ALLOWED_ORIGINS = [
  RUNTIME_URL,
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  ...EXTRA_ORIGINS,
];

async function main() {
  console.log('[Gallery] Starting server...');
  console.log(`[Gallery] Data directory: ${DATA_DIR}`);
  console.log(`[Gallery] OpenRouter API Key: ${OPENROUTER_API_KEY ? 'configured' : 'not configured (using mock reviews)'}`);
  console.log(`[Gallery] Runtime ID gating: sample=${SAMPLE_RUNTIME_ID ? 'configured' : 'not set'}, official=${OFFICIAL_RUNTIME_ID ? 'configured' : 'not set'}`);

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
    apiKey: OPENROUTER_API_KEY,
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
      // In development mode, allow any origin
      if (IS_DEV) return callback(null, true);
      // In production, check against allowed origins
      if (ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }));

  app.use(compression()); // gzip responses (API JSON, HTML; images already compressed)
  app.use(express.json({ limit: '50mb' })); // Large limit for base64 images

  // Request logging
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });

  // API routes
  app.use('/api', createApiRoutes(storage, {
    sampleRuntimeId: SAMPLE_RUNTIME_ID,
    officialRuntimeId: OFFICIAL_RUNTIME_ID,
  }, reviewer));

  // Static file serving for images — immutable once written, cache aggressively
  app.use('/images', express.static(path.join(DATA_DIR, 'images'), {
    maxAge: '7d',
    immutable: true,
  }));

  // In production, serve the built frontend
  if (IS_DEV) {
    // Dev mode: health check at root (frontend served by Vite dev server)
    app.get('/', (_req, res) => {
      res.json({
        name: 'Polychorus Gallery API',
        version: '1.0.0',
        endpoints: {
          artworks: '/api/artworks',
          stats: '/api/stats',
          health: '/api/health',
        },
      });
    });
  } else {
    // Production: serve Vite build output (hashed filenames are immutable)
    const frontendDir = path.join(__dirname, '../dist');
    app.use(express.static(frontendDir, {
      maxAge: '7d',
      immutable: true,
    }));
    // SPA fallback — serve index.html for non-API, non-image routes
    // Express 5 requires named catch-all parameter (path-to-regexp v8)
    app.get('{*path}', (_req, res) => {
      res.sendFile(path.join(frontendDir, 'index.html'));
    });
  }

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
