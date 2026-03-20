# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# PRODUCTION MODE

This project is running live in production at Cloudfest Hackathon 2026. The runtime is at `https://live.polychorus.art` and the gallery at `https://polychorus.art`.

**All changes should add new actors to `actors/community/` only.** Do not modify runtime, gallery, packages, builtin actors, or infrastructure code.

## Workflow for Adding a New Actor

1. `pnpm new:actor <name>` — scaffold from template
2. Edit `actors/community/<name>/src/index.ts` — implement your actor
3. Preview: restart `pnpm dev`, visit `http://localhost:3000?actor=<name>`
4. Validate: `cd actors/community/<name> && pnpm validate`
5. Submit: `pnpm submit:actor <name>` — creates PR, CI auto-validates and auto-merges
6. Once merged, the actor deploys automatically and appears on the live canvas within 30 seconds

**Complete API reference with examples:** See [`docs/ACTOR_GUIDE.md`](docs/ACTOR_GUIDE.md)

## Requirements

- Node.js >= 22.0.0
- pnpm >= 9.0.0

## Quick Commands

```bash
pnpm new:actor <name>       # Create new actor from template
pnpm submit:actor <name>    # Validate, build, and submit actor as PR
pnpm generate:actor "<desc>"  # Generate actor from description using AI (requires ANTHROPIC_API_KEY)
pnpm dev                    # Start runtime dev server (port 3000)
pnpm validate:actors        # Validate all community actors
```

## Project Structure

```
actors/
  builtin/              # Built-in actors (52 actors — DO NOT MODIFY)
  community/            # Community actors (add yours here)

packages/
  types/                # @art/types — Shared TypeScript interfaces
  actor-sdk/            # @art/actor-sdk — Self-registration helper
  actor-devtools/       # @art/actor-devtools — Validators, mocks
  actor-template/       # Template for new actors

apps/
  runtime/              # Main Pixi.js renderer (DO NOT MODIFY)
  gallery/              # Gallery API + React frontend (DO NOT MODIFY)

docs/
  ACTOR_GUIDE.md        # Complete API reference for actor development
  MEMORY_MANAGEMENT.md  # Memory management best practices (MUST READ)
```

## Architecture Overview

The runtime renders art using actors at 60fps, captures snapshots at cycle end, and sends them to the gallery for AI review and public voting. Community actors are deployed via GitHub Actions and hot-loaded by the runtime within 30 seconds of merge.

**Actor Selection per Cycle:**
- 1 background actor (or solid color fallback)
- 0-2 background filters (weighted towards 0)
- 2-5 foreground actors (favoring unused/new actors)
- 0-2 foreground filters (weighted towards 1-2)

## Actor Development

### Creating an Actor

1. Run `pnpm new:actor my-actor-name`
2. Edit `actors/community/my-actor-name/src/index.ts`
3. Preview: `pnpm dev` then visit `http://localhost:3000?actor=my-actor-name`
4. Validate: `cd actors/community/my-actor-name && pnpm validate`
5. Submit: `pnpm submit:actor my-actor-name`

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

**Full API signatures and examples:** See [`docs/ACTOR_GUIDE.md`](docs/ACTOR_GUIDE.md)

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

- `docs/ACTOR_GUIDE.md` - Complete API reference with signatures and examples
- `packages/types/src/actor.ts` - Actor interface definition
- `packages/types/src/brush.ts` - BrushAPI definition
- `packages/types/src/filter.ts` - FilterAPI definition
- `packages/types/src/canvas.ts` - CanvasReadAPI definition
- `packages/types/src/context.ts` - Context API definitions
- `packages/actor-template/src/index.ts` - Actor template
- `docs/MEMORY_MANAGEMENT.md` - Memory management best practices

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

## Actor Discovery and Loading (IMPORTANT)

### Development Mode (`pnpm dev`)

Actors are discovered via Vite's `import.meta.glob()` at dev server startup.

**CRITICAL**: If you create new actors while the dev server is running, they **will not be detected** until you restart the server.

### For New Actors to Appear in Runtime

1. **Create the actor files** with `pnpm new:actor <name>`
2. **Run `pnpm install`** to register the new workspace package
3. **Restart the dev server** (`pnpm dev`)

### Production Mode

Community actors are built and deployed by GitHub Actions on merge to main. The runtime's ActorLoader polls for new bundles every 30 seconds and hot-loads them without restart.

### Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| New actor not in runtime | Dev server not restarted | Restart `pnpm dev` |
| Actor not discovered | Missing `src/index.ts` | Ensure file path is `actors/community/{name}/src/index.ts` |
| TypeScript errors | Missing config files | Use `pnpm new:actor` to scaffold correctly |
| Actor not registering | Missing `registerActor()` call | Add `registerActor(actor)` at end of index.ts |
| `TypeError: null (reading 'style')` | Gradient with pixel coordinates | Use 0-1 range for gradient coords |
| Objects drift off-screen | Transform state not restored | Pair `pushMatrix()` / `popMatrix()` |
| Flickering blend modes | `setBlendMode()` in update loop | Pass `blendMode` in each shape's style |
| Shapes nearly invisible | Alpha too low | Use alpha >= 0.6, test on dark backgrounds |
| Shapes flicker during fade-out | Alpha near zero | Skip rendering when `alpha < 0.05` |
| Snapshot shows wrong portion | Using `scale < 1` | Always use `scale=1.0` |

## Memory Management (CRITICAL)

**All actors MUST follow memory management best practices.** See `docs/MEMORY_MANAGEMENT.md` for detailed guidelines.

### Mandatory Rules

1. **Pre-allocate in setup()** - Never allocate arrays/objects during `update()`
2. **Use object pools** - Reuse objects via `active` flag instead of create/destroy
3. **Use circular buffers** - For history/trail data, not push/shift or push/slice
4. **Cap all collections** - Define MAX constants, enforce limits

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

Review the builtin actors (`wave-painter`, `particle-flow`, `constellation-weaver`) for reference implementations.
