# Polychorus

**polychorus.art** — An interactive digital art installation where multiple AI-driven "actors" collaboratively paint on a shared 2D canvas.

> **chorus** *noun* — (in ancient Greek tragedy) a group of performers who comment together on the main action.

Built for the [CloudFest Hackathon 2026](https://www.cloudfest.com/hackathon).

## How It Works

Every 60 seconds, a new group of actors is selected to paint on a shared canvas. Each actor is a small program that draws shapes, patterns, and effects — but no actor controls the full picture. The beauty lies in what emerges from their uncoordinated collaboration.

Completed artworks are automatically submitted to the gallery, where an AI reviewer (Gemini 3.1 Pro via OpenRouter) evaluates them across six dimensions: color harmony, composition, visual unity, depth & layering, rhythm & flow, and intentional complexity. Perceptual hashing detects and archives near-duplicate images.

Visitors can browse the gallery and vote on their favorites.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                RUNTIME (live.polychorus.art)             │
│  Pixi.js canvas · Actor selection · Snapshot capture    │
└──────────────────────────┬──────────────────────────────┘
                           │ POST /api/artworks
                           ▼
┌─────────────────────────────────────────────────────────┐
│                 GALLERY (polychorus.art)                 │
│  Express API · File storage · AI review · Dedup         │
│  React frontend · Voting · Auto-refresh polling         │
└─────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Requirements: Node.js >= 22, pnpm >= 9
pnpm install
pnpm dev              # Runtime on :3000
pnpm dev:gallery      # Gallery API on :3001, frontend on :5173
```

## Creating Actors

```bash
pnpm new:actor my-actor-name
# Edit actors/community/my-actor-name/src/index.ts
# Preview: pnpm --filter @art/actor-my-actor-name dev
# Restart runtime to pick up new actors
```

See [CLAUDE.md](CLAUDE.md) for the full actor API, rendering best practices, and memory management rules.

## Project Structure

```
apps/
  runtime/          # Pixi.js renderer (live canvas)
  gallery/          # Express API + React frontend
    server/         # API, AI reviewer, dedup, storage
    src/            # React gallery UI
packages/
  types/            # Shared TypeScript interfaces
  actor-sdk/        # Actor self-registration helper
  actor-devtools/   # Validators, mocks
  actor-template/   # Template for new actors
actors/
  builtin/          # ~40 built-in actors
  community/        # Hackathon participant actors
```

## Deployment

Deployed on Coolify (Hetzner VPS) with Traefik reverse proxy and Let's Encrypt SSL.

| Service | Domain | Dockerfile |
|---------|--------|------------|
| Gallery | `polychorus.art` | `apps/gallery/Dockerfile` |
| Runtime | `live.polychorus.art` | `apps/runtime/Dockerfile` |

Gallery data (artworks + images) persists via a Docker volume mount at `/app/apps/gallery/data`.

## Environment Variables

### Gallery
| Variable | Description |
|----------|-------------|
| `OPENROUTER_API_KEY` | OpenRouter API key for AI reviews (optional, uses mock if not set) |
| `GALLERY_PORT` | API server port (default: 3001) |
| `GALLERY_MAX_ARTWORKS` | Max artworks before pruning (default: 100) |
| `GALLERY_OFFICIAL_RUNTIME_ID` | Secret ID for official display submissions |
| `RUNTIME_URL` | Runtime URL for CORS |

### Runtime
| Variable | Description |
|----------|-------------|
| `VITE_GALLERY_URL` | Gallery frontend URL (for QR code) |
| `VITE_GALLERY_API_URL` | Gallery API URL (for submitting artworks) |

## License

MIT

## Author

[Alain Schlesser](https://github.com/schlessera) — CloudFest Hackathon 2026
