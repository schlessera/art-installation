# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Art Installation - Cloudfest Hackathon 2026

Interactive digital art installation where multiple AI-driven "actors" collaboratively paint on a shared 2D canvas. Hackathon attendees can deploy their own actors via Git.

## Requirements

- Node.js >= 22.0.0
- pnpm >= 9.0.0

## Quick Commands

```bash
pnpm dev              # Start runtime development server (port 3000)
pnpm dev:gallery      # Start gallery (API server + React frontend)
pnpm build            # Build all packages
pnpm lint             # Lint all packages
pnpm test             # Run all tests
pnpm test:watch       # Run tests in watch mode
pnpm new:actor        # Create new actor from template
pnpm validate:actors  # Validate all community actors
```

### Running Single Package Commands
```bash
# Runtime (port 3000)
pnpm --filter @art/runtime dev                # Dev server
pnpm --filter @art/runtime exec tsc --noEmit  # Type-check

# Gallery (API on port 3001, frontend on port 5173)
pnpm --filter @art/gallery dev                # Both server + client
pnpm --filter @art/gallery dev:server         # API server only
pnpm --filter @art/gallery dev:client         # React frontend only

# Actor development
pnpm --filter @art/actor-wave-painter dev     # Preview actor
pnpm --filter @art/actor-wave-painter build   # Build actor bundle
```

## Project Structure

```
apps/
  runtime/              # Main Pixi.js renderer (frontend only)
    src/
      main.ts           # Entry point
      engine/           # CanvasManager, RenderLoop
      drawing/          # BrushAPIImpl, FilterAPIImpl
      actors/           # ActorRegistry, ActorScheduler, ActorLoader
      context/          # TimeProvider, WeatherProvider, AudioProvider
      api/              # GalleryClient (sends snapshots to Gallery API)
      ui/               # QROverlay
  gallery/              # Gallery app (API server + React frontend)
    server/             # Express API server
      index.ts          # Server entry point
      storage.ts        # File-based artwork storage
      reviewer.ts       # Async AI review using Claude API
      routes.ts         # REST API endpoints
    src/                # React frontend
      App.tsx           # Main app component
      hooks/            # useGalleryApi, useLocalStorage
      components/       # GalleryGrid, ArtworkCard, StarRating, etc.

packages/
  types/                # @art/types - Shared TypeScript interfaces
  actor-sdk/            # @art/actor-sdk - Self-registration helper
  actor-devtools/       # @art/actor-devtools - Validators, mocks
  actor-template/       # Template for new actors

actors/
  builtin/              # Built-in actors (wave-painter, particle-flow, etc.)
  community/            # Hackathon participant actors

docs/
  PRD.md                # Product requirements document
  MEMORY_MANAGEMENT.md  # Memory management best practices (MUST READ)
```

## Architecture

- **Runtime**: Pixi.js 8.x renderer, captures snapshots, sends to Gallery API
- **Gallery Server**: Express API, file-based storage, async AI review via Claude
- **Gallery Frontend**: React app for viewing/voting on artworks
- **Actor Selection per Cycle**:
  - 1 background actor (or solid color fallback)
  - 0-2 background filters (weighted towards 0)
  - 2-5 foreground actors (favoring unused)
  - 0-2 foreground filters (weighted towards 1-2)

### System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                           RUNTIME (port 3000)                        │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────────────────┐  │
│  │ ActorSystem  │──▶│ RenderLoop   │──▶│ SnapshotCapture         │  │
│  │              │   │ (60fps)      │   │ (end of cycle)          │  │
│  └──────────────┘   └──────────────┘   └───────────┬─────────────┘  │
│                                                     │                │
│                                         POST /api/artworks           │
│                                                     │                │
└─────────────────────────────────────────────────────┼────────────────┘
                                                      │
                                                      ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      GALLERY SERVER (port 3001)                      │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────────────────┐  │
│  │ REST API     │──▶│ Storage      │──▶│ Async Reviewer          │  │
│  │ /api/*       │   │ (file-based) │   │ (Claude API)            │  │
│  └──────────────┘   └──────────────┘   └─────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                                                      │
                                               GET /api/artworks
                                                      │
                                                      ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    GALLERY FRONTEND (port 5173)                      │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────────────────┐  │
│  │ GalleryGrid  │   │ ArtworkModal │   │ VotingUI                │  │
│  │              │   │              │   │                         │  │
│  └──────────────┘   └──────────────┘   └─────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Runtime** renders art using actors, captures snapshot at cycle end
2. **Runtime** sends snapshot + metadata to Gallery API (POST /api/artworks)
3. **Gallery Server** stores artwork (pending review), queues for async review
4. **Async Reviewer** processes queue, calls Claude API, updates artwork scores
5. **Gallery Frontend** displays reviewed artworks, allows voting
6. **Pruning** removes lowest-scoring artworks when limit exceeded

### Hot-Loading Architecture

Actors can be deployed while the runtime is running - no restart needed:

```
┌─────────────────────────────────────────────────────────────┐
│                     RUNTIME (always running)                 │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │ ActorLoader │───▶│ ActorRegistry│───▶│ ActorScheduler│  │
│  │  (scans)    │    │  (stores)    │    │  (selects)    │  │
│  └─────────────┘    └──────────────┘    └───────────────┘  │
│         ▲                                                   │
│         │ window.__registerActor()                          │
└─────────│───────────────────────────────────────────────────┘
          │
┌─────────▼───────────────────────────────────────────────────┐
│                    ACTOR BUNDLES (deployed separately)       │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │wave-painter │    │weather-mood │    │user-actor-X │     │
│  │   .js       │    │    .js      │    │    .js      │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

**Deployment flow:**
1. Build actor: `pnpm --filter @art/actor-my-actor build`
2. Deploy bundle to `/actors/deployed/`
3. ActorLoader scans every 30s, loads new bundles
4. Actor self-registers via `registerActor()`
5. Available for next selection cycle (high novelty score)

## Actor Development

### Creating an Actor

1. Run `pnpm new:actor my-actor-name`
2. Edit `actors/community/my-actor-name/src/index.ts`
3. Preview: `pnpm --filter @art/actor-my-actor-name dev`
4. Validate: `pnpm --filter @art/actor-my-actor-name validate`
5. Submit PR

### Actor Interface

```typescript
interface Actor {
  metadata: ActorMetadata;          // id, name, author, etc.
  setup?(api: ActorSetupAPI): Promise<void>;
  update(api: ActorUpdateAPI, frame: FrameContext): void;
  teardown?(): Promise<void>;
}
```

### Actor Roles

Actors have one of three roles that determine where they render in the layer stack:

| Role | Description | Count per Cycle |
|------|-------------|-----------------|
| `background` | Single actor that renders behind everything | Exactly 1 (or solid color fallback) |
| `foreground` | Standard drawing actors (default) | 2-5 per cycle |
| `filter` | Post-processing effects (can be assigned to either layer) | 0-2 per layer |

**Rendering Pipeline:**
```
┌─────────────────────────────────────────────────────────────┐
│  [Overlay]        - UI elements (future)                    │
│  [Foreground Effects] - 0-2 filter actors                   │
│  [Foreground]     - 2-5 foreground actors (z-ordered)       │
│  [Background Effects] - 0-2 filter actors                   │
│  [Background]     - 1 background actor OR solid color       │
└─────────────────────────────────────────────────────────────┘
```

**Declaring Actor Roles:**

```typescript
// Background actor - renders behind everything
const starfield: Actor = {
  metadata: {
    id: 'starfield-background',
    name: 'Starfield Background',
    role: 'background',  // Required for background actors
    // ... other metadata
  },
  // ...
};

// Foreground actor (default - can omit role)
const particles: Actor = {
  metadata: {
    id: 'particle-flow',
    name: 'Particle Flow',
    // role: 'foreground' is implied when omitted
    // ... other metadata
  },
  // ...
};

// Filter actor - post-processing effects
const filmGrain: Actor = {
  metadata: {
    id: 'film-grain',
    name: 'Film Grain',
    role: 'filter',  // Required for filter actors
    // ... other metadata
  },
  update(api, frame) {
    // Filter actors use api.filter.*, NOT api.brush.*
    api.filter.noise(0.1);
    api.filter.vignette(0.3);
  },
};
```

**Filter Assignment:**
- Filter actors don't declare which layer they affect
- The scheduler randomly assigns filters to background (0-2, weighted towards 0) or foreground (0-2, weighted towards 1-2)
- The same filter actor can be used on either layer in different cycles

**Background Fallback:**
When no background actors are registered, a random solid color (max 50% brightness) is used as fallback. This ensures the canvas always has a background.

### Available APIs

- `api.canvas.*` - Read canvas state (getSize, getPixel, getDominantColors)
- `api.brush.*` - Draw shapes, lines, text (circle, rect, stroke, text)
- `api.brush.image(src, x, y, options)` - Draw image/texture with tint, scale, rotation
- `api.brush.circle(x, y, r, { fill: gradient })` - Supports radial/linear gradient fills
- `api.filter.*` - Apply effects (blur, brightness, colorMatrix)
- `api.context.time.*` - Time data (hour, dayProgress, season)
- `api.context.weather.*` - Weather data (temperature, condition)
- `api.context.audio.*` - Audio data (bass, isBeat, bpm)
- `api.context.video.*` - Video data (getMotion, getDominantColor)
- `api.context.social.*` - Social data (sentiment, viewerCount)

### Rendering Best Practices

**Blend Modes:**
- **NEVER** use `api.brush.setBlendMode()` inside the update loop - it sets global state and causes flickering
- **ALWAYS** pass `blendMode` in each shape's style object instead:
  ```typescript
  // BAD - causes flickering
  api.brush.setBlendMode('add');
  api.brush.circle(x, y, r, { fill: color });

  // GOOD - per-shape blend mode
  api.brush.circle(x, y, r, { fill: color, blendMode: 'add' });
  ```
- Avoid `overlay` blend mode on dark backgrounds - use `normal`, `add`, or `screen` instead

**Visibility:**
- Use alpha values of **0.6 or higher** for main shapes (lower values are nearly invisible)
- Use stroke widths of **2.5px or higher** for visible lines
- Test actors on dark backgrounds (the canvas background is typically dark)

**Transforms:**
- Always pair `pushMatrix()` with `popMatrix()` to restore transform state
- Don't set global state (like blend mode) inside a push/pop block

**Graphics Pool Implementation (Internal):**
The BrushAPI uses a GraphicsPool that reuses Pixi.js Graphics objects across frames to avoid allocation/destruction overhead. Key implementation details:
- Graphics objects are pooled and reused each frame
- `acquire()` MUST reset transform state (position, rotation, scale, alpha) before returning the object
- Without reset, transforms accumulate across frames causing objects to drift off-screen
- The `applyTransform()` method uses `+=` operators, so any leftover state from previous frames will compound
- If objects appear for 1 frame then disappear, or positions drift, check that `acquire()` resets transforms

**Gradients (CRITICAL - Use Relative Coordinates):**

Gradients use `textureSpace: 'local'` internally, meaning **all coordinates MUST be in the 0-1 range** relative to the shape's bounding box. Using absolute pixel values will cause runtime errors:
```
TypeError: Cannot read properties of null (reading 'style')
```

**Coordinate system:**
- `0` = left/top edge of shape
- `0.5` = center of shape
- `1` = right/bottom edge of shape

**Radial gradient parameters:**
- `cx`, `cy`: Center point (0.5, 0.5 = centered)
- `radius`: Size relative to shape (0.5 = 50% of shape size)

**Linear gradient parameters:**
- `x0`, `y0`: Start point
- `x1`, `y1`: End point
- Horizontal: `x0: 0, y0: 0.5, x1: 1, y1: 0.5`
- Vertical: `x0: 0.5, y0: 0, x1: 0.5, y1: 1`
- Diagonal: `x0: 0, y0: 0, x1: 1, y1: 1`

```typescript
// BAD - absolute coordinates cause runtime errors!
api.brush.circle(x, y, 100, {
  fill: {
    type: 'radial',
    cx: 0, cy: 0, radius: 50,  // WRONG - these are pixel values
    stops: [...],
  },
});

// GOOD - relative coordinates (0-1 range)
api.brush.circle(x, y, 100, {
  fill: {
    type: 'radial',
    cx: 0.5, cy: 0.5, radius: 0.5,  // CORRECT - centered, 50% size
    stops: [
      { offset: 0, color: 'rgba(255,255,255,1)' },
      { offset: 0.5, color: 'rgba(255,255,255,0.3)' },
      { offset: 1, color: 'rgba(255,255,255,0)' },
    ],
  },
  blendMode: 'add',
});
```

**Best practices:**
- Use radial gradients for soft glow effects instead of blur filters (much more efficient)
- Gradient fills are cached internally - safe to create in update loop
- For dynamic gradients, vary the `stops` colors/offsets, NOT the coordinate parameters
- If you need different gradient shapes, adjust the shape size instead of gradient coordinates

**Images/Sprites:**
- Use `api.brush.image()` for pre-rendered textures (more efficient than gradients for many repeated elements)
- Data URLs are cached automatically - create texture once in setup(), reuse in update()
- Supports tinting: `{ tint: 0xff0000 }` multiplies texture color (use numeric colors for performance)
- **Data URL loading:** Data URLs may take 1-2 frames to decode before rendering. The runtime handles this automatically by caching pending images - sprites simply won't appear until the texture is ready. This is normal behavior.
- Example pre-rendered glow:
  ```typescript
  // In setup(): create soft circle texture
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.3)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);
  const glowDataUrl = canvas.toDataURL();

  // In update(): use with tinting for colored glow
  api.brush.image(glowDataUrl, x, y, {
    width: size, height: size,
    tint: 0xff6600,  // Numeric color for performance
    blendMode: 'add',
  });
  ```

**Canvas Snapshots (IMPORTANT):**

The `api.canvas.getCanvasSnapshotAsync()` method reads pixel data from the canvas. Key considerations:

- **Scale parameter is broken** - Using `scale < 1` crops the canvas instead of scaling. Always use `scale=1.0`:
  ```typescript
  // BAD - crops bottom-left portion of canvas
  api.canvas.getCanvasSnapshotAsync(0.5).then(...)

  // GOOD - reads full canvas
  api.canvas.getCanvasSnapshotAsync(1.0).then(...)
  ```

- **Layer-aware snapshots are opt-in** - To see only content below your actor (excluding yourself and actors above), pass `belowActorId: 'self'`:
  ```typescript
  // Default - sees entire canvas including all actors
  api.canvas.getCanvasSnapshotAsync(1.0).then(...)

  // Layer-aware - sees only content below this actor
  api.canvas.getCanvasSnapshotAsync(1.0, { belowActorId: 'self' }).then(...)
  ```
  Note: Layer-aware snapshots trigger an extra render mid-frame, which can impact performance.

- **Coordinate conversion** - WebGL Y-axis is flipped. Convert canvas→snapshot coordinates:
  ```typescript
  const snapX = Math.floor(canvasX * snap.width / canvasWidth);
  const snapY = snap.height - 1 - Math.floor(canvasY * snap.height / canvasHeight);
  const i = (snapY * snap.width + snapX) * 4;
  const r = snap.data[i], g = snap.data[i+1], b = snap.data[i+2];
  ```

**Animation & Fade Best Practices:**

- **Minimum alpha threshold** - Very low alpha values (< 0.05) can cause flickering during fade-out due to rendering precision. Skip rendering when alpha is too low:
  ```typescript
  const alpha = element.alpha * 0.7;
  if (alpha < 0.05) {
    // Don't render, just update state
    continue;
  }
  ```

- **Grow-in animation** - For smooth appear effects, scale from small to full size:
  ```typescript
  let scale = 1;
  if (progress < 0.2) {
    // Ease-out cubic for natural deceleration
    const t = progress / 0.2;
    scale = 0.3 + 0.7 * (1 - Math.pow(1 - t, 3));
  }
  api.brush.circle(x, y, baseSize * scale, { ... });
  ```

- **Fade timing** - Common pattern: 20% fade-in, 60% full visibility, 20% fade-out:
  ```typescript
  const progress = element.progress / element.maxProgress;
  if (progress < 0.2) {
    element.alpha = progress / 0.2;
  } else if (progress > 0.8) {
    element.alpha = (1 - progress) / 0.2;
  } else {
    element.alpha = 1;
  }
  ```

**Filters:**
- Filters are GPU-accelerated via pixi-filters - use for effects like blur, vignette, distortion
- **One filter per type per frame** - calling the same filter method twice replaces the previous instance
- Avoid calling filter methods every frame if parameters don't change
- **Performance tiers:**
  - Low cost: pixelate, vignette, noise, colorMatrix adjustments
  - Moderate: bulge, twist, chromaticAberration
  - High cost: dropShadow, blur, gaussianBlur (multi-pass)
- **Max 3-5 filters** per actor for 60fps performance
- Filters apply to entire actor container, not individual shapes
- For soft glow effects, prefer gradients or pre-rendered textures over blur filters

**Performance Optimization:**
- **Target <300 draw calls per frame** for smooth 60fps
- **Pre-render textures** for repeated elements with varying alpha/tint:
  ```typescript
  // BAD - gradient cache misses when alpha changes each frame
  api.brush.circle(x, y, r, { fill: { type: 'radial', stops: [...] } });

  // GOOD - pre-render once, tint per-instance
  // setup(): glowDataUrl = createGlowTexture();
  // update():
  api.brush.image(glowDataUrl, x, y, { tint: color, alpha: alpha });
  ```
- **Use numeric colors + alpha** instead of rgba/hsla strings (avoids string allocation):
  ```typescript
  // BAD - creates new string every frame
  api.brush.line(x1, y1, x2, y2, { color: `rgba(255,128,0,${alpha})` });

  // GOOD - numeric color with separate alpha
  api.brush.line(x1, y1, x2, y2, { color: 0xff8000, alpha: alpha });
  ```
- **Avoid O(n²) algorithms** or use early-out optimizations:
  ```typescript
  // Use squared distance to skip sqrt for distant pairs
  const distSq = dx * dx + dy * dy;
  if (distSq > thresholdSq) continue; // Skip without sqrt
  const dist = Math.sqrt(distSq); // Only when needed
  ```
- **Reduce draw calls** by combining visual elements where possible:
  - Use single sprite with tint instead of multiple gradient circles
  - Use single line instead of glow + core lines
- See `constellation-weaver` actor for a reference implementation

### Security Constraints

Actors **CANNOT** access:
- Network (fetch, WebSocket)
- Storage (localStorage, indexedDB)
- DOM (document, window)
- Dynamic code (eval, new Function)

## Key Files

- `packages/types/src/actor.ts` - Actor interface definition
- `packages/types/src/brush.ts` - BrushAPI definition
- `packages/types/src/filter.ts` - FilterAPI definition
- `packages/actor-template/src/index.ts` - Actor template
- `docs/PRD.md` - Full product requirements

## Environment Variables

### Runtime (`apps/runtime/.env`)
```bash
VITE_GALLERY_URL=http://localhost:5173        # Gallery frontend URL (for QR code)
VITE_GALLERY_API_URL=http://localhost:3001/api # Gallery API URL (for submitting artworks)
```

### Gallery (`apps/gallery/.env`)
```bash
GALLERY_PORT=3001                    # API server port
GALLERY_DATA_DIR=./data              # Data storage directory
GEMINI_API_KEY=...                   # Gemini API key (optional, uses mock if not set)
GALLERY_MAX_ARTWORKS=30              # Max artworks before pruning
GALLERY_PRUNE_PERCENTAGE=0.1         # Prune bottom 10%
GALLERY_MIN_SCORE=40                 # Minimum AI score for visibility
RUNTIME_URL=http://localhost:3000    # Runtime URL for CORS
```

## Gallery Features

- QR code overlay on display links to gallery
- Artworks submitted from runtime, reviewed asynchronously
- User voting (1-5 stars) with name attribution
- Pruning: remove bottom 10% when >30 artworks
- Combined score: AI(60%) + UserRating(40%)

## Development Progress

Check `.claude/progress/current-session.md` for ongoing work.
Check `.claude/progress/decisions.md` for architectural decisions.

## Canvas Resolution and Aspect Ratio

The runtime renders at a fixed resolution and scales to fit the viewport with letterboxing/pillarboxing (black bars) to maintain aspect ratio.

### Default Configuration

- **Resolution**: 360x640 pixels (9:16 portrait)
- **Aspect Ratio**: 0.5625 (9:16)

### URL Parameters

Configure canvas via query parameters:

```
http://localhost:3000/?width=360&height=640&maxActors=4&cycleDuration=30000
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `width` | 360 | Canvas width in pixels |
| `height` | 640 | Canvas height in pixels |
| `maxActors` | 5 | Maximum foreground actors per cycle |
| `minActors` | 2 | Minimum foreground actors per cycle |
| `cycleDuration` | 60000 | Cycle duration in milliseconds |
| `debug` | true (dev) | Enable debug panel |
| `actor` | - | Solo mode: run only this actor (e.g., `?actor=wave-painter`) |
| `actors` | - | Fixed foreground actor list for testing (e.g., `?actors=wave-painter,particle-flow`) |
| `bgActor` | random | Fixed background actor ID (e.g., `?bgActor=starfield-background`) |
| `bgFilters` | random 0-2 | Fixed background filter IDs (e.g., `?bgFilters=film-grain,vhs-tracking`) |
| `fgFilters` | random 0-2 | Fixed foreground filter IDs (e.g., `?fgFilters=chromatic-pulse`) |

### Display Scaling

The canvas maintains its native resolution and is scaled via CSS to fit the viewport:

- **Portrait canvas on landscape screen**: Fills height, black bars on left/right (pillarbox)
- **Landscape canvas on portrait screen**: Fills width, black bars on top/bottom (letterbox)
- **Matching aspect ratio**: Fills entire viewport

### Gallery Aspect Ratio

The Gallery automatically detects the aspect ratio from the first submitted artwork:

1. Runtime sends artwork with `width` and `height` metadata
2. Gallery stores dimensions and returns `aspectRatio` in stats API
3. Frontend sets `--artwork-aspect-ratio` CSS variable
4. All thumbnail cards and modal images use the dynamic aspect ratio

## Actor Discovery and Loading (IMPORTANT)

Actors are discovered and loaded differently in development vs production:

### Development Mode (`pnpm dev`)

Actors are discovered via Vite's `import.meta.glob()` in `apps/runtime/src/main.ts`:

```typescript
const actorModules = import.meta.glob<{ default: Actor }>(
  '../../../actors/**/src/index.ts',
  { eager: false }
);
```

**CRITICAL**: `import.meta.glob()` is evaluated at dev server startup. If you create new actors while the dev server is running, they **will not be detected** until you restart the server.

### For New Actors to Appear in Runtime

1. **Create the actor files** in `actors/community/{name}/` or `actors/builtin/{name}/`:
   - `package.json` - Package definition with `@art/actor-{name}` naming
   - `src/index.ts` - Actor implementation that calls `registerActor()`
   - `tsconfig.json` - TypeScript config extending `../../../tsconfig.base.json`
   - `vite.config.ts` - Vite build config

2. **Run `pnpm install`** to register the new workspace package

3. **Restart the dev server** (`pnpm dev`) - This is required because Vite's glob patterns are evaluated at startup

4. **Build the actor** (for production): `pnpm --filter @art/actor-{name} build`

### Production Mode (Built/Deployed)

The ActorLoader (`apps/runtime/src/actors/ActorLoader.ts`) scans for built bundles:
1. Looks for `/actors/manifest.json` (if exists)
2. Falls back to probing known paths: `/actors/*/dist/index.js`
3. Loads bundles via dynamic `<script type="module">` injection
4. Actors self-register via `window.__registerActor()`

### Troubleshooting: Actors Not Appearing

| Symptom | Cause | Fix |
|---------|-------|-----|
| New actor not in runtime | Dev server not restarted | Restart `pnpm dev` |
| Actor not discovered | Missing `src/index.ts` | Ensure file path is `actors/{type}/{name}/src/index.ts` |
| TypeScript errors | Missing config files | Add `tsconfig.json` and `vite.config.ts` |
| Actor not registering | Missing `registerActor()` call | Add `registerActor(actor)` at end of index.ts |

### Troubleshooting: Runtime Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `TypeError: Cannot read properties of null (reading 'style')` at `generateTextureMatrix` | Gradient using absolute pixel coordinates instead of relative (0-1) | Change gradient `cx`, `cy`, `radius`, `x0`, `y0`, `x1`, `y1` to use 0-1 range. See **Gradients** section above. |
| Objects drift off-screen or appear for 1 frame | Graphics pool not resetting transforms | Check that `GraphicsPool.acquire()` resets position, rotation, scale, alpha |
| Flickering blend modes | Using `setBlendMode()` in update loop | Pass `blendMode` in each shape's style object instead |
| Shapes nearly invisible | Alpha too low or colors too dark | Use alpha >= 0.6 for main shapes, test on dark backgrounds |
| Shapes flicker during fade-out | Alpha values near zero cause rendering instability | Add minimum alpha threshold: skip rendering when `alpha < 0.05` |
| Entire actor flickers when using snapshots | Layer-aware snapshots do extra render with container hidden | Don't use `belowActorId: 'self'` unless you specifically need layer-aware behavior |
| Snapshot shows wrong portion of canvas | Using `scale < 1` with `getCanvasSnapshotAsync` | Always use `scale=1.0` - the scale parameter crops instead of scaling |

## Important Notes

- Keep frame time under 16.67ms for 60 FPS
- Use `preserveDrawingBuffer: true` for canvas snapshots
- MSW is used for mocking Claude API in tests
- Vitest Browser Mode required for WebGL tests (JSDOM doesn't support it)
- Actor bundles are ES modules that self-register on load
- Type-check with `pnpm --filter @art/runtime exec tsc --noEmit`

## Memory Management (CRITICAL)

**All code changes MUST follow memory management best practices.** See `docs/MEMORY_MANAGEMENT.md` for detailed guidelines.

### Mandatory Rules

1. **Pre-allocate in setup()** - Never allocate arrays/objects during `update()`
2. **Use object pools** - Reuse objects via `active` flag instead of create/destroy
3. **Use circular buffers** - For history/trail data, not push/shift or push/slice
4. **Cap all collections** - Define MAX constants, enforce limits
5. **Destroy Pixi.js resources** - Always call `.destroy()` when removing Graphics/Filters/Textures

### Quick Reference

```typescript
// BAD - allocates every frame
state.particles.push(createParticle());
state.particles = state.particles.filter(p => p.alive);

// GOOD - uses pre-allocated pool
const p = particlePool.find(p => !p.active);
if (p) { p.active = true; initParticle(p); }
// ... later ...
p.active = false;  // "despawn" without allocation
```

### When Adding New Features

- Update `docs/MEMORY_MANAGEMENT.md` if you discover new pitfalls or best practices
- Review the builtin actors (`wave-painter`, `particle-flow`, `weather-mood`, `audio-reactive`) for reference implementations
- Run memory profiling in Chrome DevTools to verify no leaks
