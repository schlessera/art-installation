# Memory Management Best Practices

This document outlines memory management best practices for the Art Installation project. Following these guidelines prevents memory leaks and ensures smooth 60fps performance.

## Core Principles

1. **Pre-allocate everything at setup time** - Never allocate memory during the render loop
2. **Use object pools** - Reuse objects instead of creating/destroying them
3. **Use circular buffers** - For fixed-size history/trail data
4. **Destroy Pixi.js resources explicitly** - WebGL resources aren't garbage collected automatically

---

## Actor Development

### DO: Pre-allocate Arrays and Objects

```typescript
// GOOD: Pre-allocate in setup()
const MAX_PARTICLES = 500;

interface Particle {
  x: number;
  y: number;
  active: boolean;  // Use flag for pooling
}

let particlePool: Particle[] = [];

async setup() {
  // Allocate once
  particlePool = new Array(MAX_PARTICLES);
  for (let i = 0; i < MAX_PARTICLES; i++) {
    particlePool[i] = { x: 0, y: 0, active: false };
  }
}
```

```typescript
// BAD: Allocating every frame
update() {
  const particles: Particle[] = [];  // New array every frame!
  particles.push({ x: 0, y: 0 });    // New object every frame!
}
```

### DO: Use Object Pools

```typescript
// GOOD: Reuse objects from pool
function spawnParticle(): Particle | null {
  const p = particlePool.find(p => !p.active);
  if (!p) return null;

  p.x = Math.random() * width;
  p.y = 0;
  p.active = true;
  return p;
}

function despawnParticle(p: Particle) {
  p.active = false;  // Just mark inactive, don't delete
}
```

```typescript
// BAD: Creating and filtering arrays
state.particles.push(createParticle());  // Creates new object
state.particles = state.particles.filter(p => p.alive);  // Creates new array!
```

### DO: Use Circular Buffers for History Data

```typescript
// GOOD: Circular buffer - no allocations
const HISTORY_SIZE = 100;
let history: number[] = new Array(HISTORY_SIZE).fill(0);
let historyHead = 0;
let historyLength = 0;

function addToHistory(value: number) {
  history[historyHead] = value;
  historyHead = (historyHead + 1) % HISTORY_SIZE;
  if (historyLength < HISTORY_SIZE) historyLength++;
}

function getFromHistory(index: number): number {
  const startIdx = (historyHead - historyLength + HISTORY_SIZE) % HISTORY_SIZE;
  return history[(startIdx + index) % HISTORY_SIZE];
}
```

```typescript
// BAD: Array push/shift or push/slice
history.push(value);
history.shift();  // O(n) and modifies array

history.push(value);
history = history.slice(-100);  // Creates new array every time!
```

### DO: Pre-allocate Point Arrays for Drawing

```typescript
// GOOD: Reuse pre-allocated points
const MAX_POINTS = 100;
const points: { x: number; y: number }[] = new Array(MAX_POINTS);
for (let i = 0; i < MAX_POINTS; i++) {
  points[i] = { x: 0, y: 0 };
}

update() {
  const segmentCount = Math.min(width / 20, MAX_POINTS);
  for (let i = 0; i < segmentCount; i++) {
    points[i].x = /* calculate x */;
    points[i].y = /* calculate y */;
  }
  api.brush.stroke(points.slice(0, segmentCount), style);
}
```

```typescript
// BAD: Creating new array every frame
update() {
  const points: { x: number; y: number }[] = [];  // New array!
  for (let i = 0; i < segments; i++) {
    points.push({ x: ..., y: ... });  // New objects!
  }
}
```

---

## Runtime Development

### DO: Use Graphics Object Pools (Pixi.js)

The BrushAPIImpl uses a GraphicsPool to avoid creating/destroying Graphics objects:

```typescript
class GraphicsPool {
  private pool: Graphics[] = [];
  private activeCount = 0;

  constructor(container: Container, initialSize = 2000) {
    for (let i = 0; i < initialSize; i++) {
      const g = new Graphics();
      g.visible = false;
      this.pool.push(g);
      container.addChild(g);
    }
  }

  acquire(): Graphics {
    const g = this.pool[this.activeCount++];
    g.clear();
    g.visible = true;
    return g;
  }

  releaseAll(): void {
    for (let i = 0; i < this.activeCount; i++) {
      this.pool[i].visible = false;
    }
    this.activeCount = 0;
  }
}
```

### Sprite and Texture Management

The BrushAPIImpl also includes pools for sprites and textures:

**TextureCache:**
- Textures from data URLs are cached automatically by BrushAPIImpl
- Cache uses LRU eviction (max 100 textures)
- Textures are destroyed explicitly when evicted with `texture.destroy(true)`

**SpritePool:**
- Sprites are pooled similar to Graphics objects (pre-allocated, reused each frame)
- Transforms reset in `acquire()` to prevent drift across frames
- Hidden with `visible = false` in `releaseAll()`

**Best Practices for Actors Using Images:**
- Create data URL textures in `setup()`, not in `update()`
- Reuse the same data URL string for cache hits
- Don't create unique data URLs per frame (defeats caching)

```typescript
// GOOD - create once in setup, reuse in update
let glowTexture: string;

async setup(api: ActorSetupAPI): Promise<void> {
  glowTexture = createSoftCircleDataUrl();
}

update(api: ActorUpdateAPI, frame: FrameContext): void {
  // Same data URL string = cache hit = fast
  api.brush.image(glowTexture, x, y, { width: size, height: size, tint: color });
}

// BAD - creates new texture every frame (memory leak!)
update(api: ActorUpdateAPI, frame: FrameContext): void {
  api.brush.image(createSoftCircleDataUrl(), x, y, opts);
}
```

**Gradient Cache:**
- FillGradient objects are cached by the BrushAPIImpl
- Cache key is based on gradient type, position, and color stops
- Safe to create gradient objects in `update()` - they'll be reused if identical

### Filter Management

Filters applied via `api.filter.*` are GPU resources that must be managed carefully.

**Automatic Cleanup:**
- The runtime automatically destroys filters when calling `clearFilters()` or at cycle/actor teardown
- Each filter type (blur, vignette, etc.) replaces any previous filter of the same type
- Actors don't need to manually destroy filters - the FilterAPIImpl handles this

**Best Practices:**
```typescript
// GOOD - Apply filter once per frame when needed
update(api: ActorUpdateAPI, frame: FrameContext): void {
  if (shouldApplyVignette) {
    api.filter.vignette(0.3, 0.5);
  }
}

// BAD - Multiple filter calls per frame creates/destroys repeatedly
update(api: ActorUpdateAPI, frame: FrameContext): void {
  for (const obj of objects) {
    api.filter.dropShadow('black', 5, 2, 2); // Wasteful!
  }
}
```

**Performance Guidelines:**
- Most expensive: dropShadow, blur, gaussianBlur (multi-pass rendering)
- Moderate cost: bulge, twist, chromaticAberration
- Low cost: pixelate, vignette, noise, colorMatrix
- **Use 3-5 filters max per frame** for 60fps performance
- Filters apply to entire actor container, not individual shapes

### DO: Destroy Pixi.js Resources Explicitly

```typescript
// GOOD: Destroy when removing
const children = container.removeChildren();
for (const child of children) {
  child.destroy({ children: true });
}

// For filters
filter.destroy();

// For textures/sprites
sprite.destroy({ texture: true, textureSource: true });
```

```typescript
// BAD: Just removing without destroying
container.removeChildren();  // LEAK! WebGL resources not freed
```

### DO: Clean Up DOM Elements

```typescript
// GOOD: Clean up Image and Canvas elements
const img = new Image();
img.onload = () => {
  // ... use image ...
  img.src = '';  // Release memory

  canvas.width = 0;  // Release canvas memory
  canvas.height = 0;
};
```

```typescript
// BAD: Creating and abandoning
const img = new Image();
img.src = dataUrl;
// img never cleaned up - memory leak!
```

---

## Common Anti-Patterns

### 1. Array Filter in Render Loop

```typescript
// BAD - creates new array every frame
state.items = state.items.filter(item => item.alive);

// GOOD - iterate and mark inactive
for (const item of state.itemPool) {
  if (!item.active) continue;
  if (!item.alive) {
    item.active = false;
    continue;
  }
  // process item
}
```

### 2. Array Push Without Cap

```typescript
// BAD - unbounded growth
state.particles.push(newParticle);

// GOOD - use pool with fixed size
if (activeCount < MAX_PARTICLES) {
  activateParticle();
}
```

### 3. String Concatenation in Hot Path

```typescript
// BAD - creates new strings every frame
const color = `rgba(${r}, ${g}, ${b}, ${a})`;

// BETTER - cache common colors or use numeric colors where possible
const colorCache = new Map<string, string>();
function getColorString(r: number, g: number, b: number, a: number): string {
  const key = `${r},${g},${b},${a}`;
  let cached = colorCache.get(key);
  if (!cached) {
    cached = `rgba(${r}, ${g}, ${b}, ${a})`;
    colorCache.set(key, cached);
  }
  return cached;
}
```

### 4. Creating Objects in Loops

```typescript
// BAD - new object every iteration
for (let i = 0; i < 1000; i++) {
  api.brush.circle(x, y, r, { fill: color });  // New options object!
}

// BETTER - reuse style object
const style = { fill: '' };
for (let i = 0; i < 1000; i++) {
  style.fill = color;
  api.brush.circle(x, y, r, style);
}
```

---

## Debugging Memory Issues

### Chrome DevTools

1. **Memory Tab** - Take heap snapshots before/after to find leaks
2. **Performance Tab** - Look for GC spikes (sawtooth pattern = allocations)
3. **Task Manager** - Watch JS memory growth over time

### What to Look For

- Memory that grows unbounded over time
- Frequent GC pauses (stuttering)
- Objects with high allocation counts in hot paths
- Detached DOM nodes
- WebGL context loss (too many resources)

### Performance Targets

- **Frame budget**: 16.67ms (60fps)
- **Allocations per frame**: Ideally 0 in render loop
- **Graphics objects per frame**: Use pool, not new instances
- **Max particles/entities**: Cap based on performance testing

---

## Checklist for New Actors

- [ ] All arrays pre-allocated in `setup()`
- [ ] All objects use pooling pattern with `active` flag
- [ ] History/trail data uses circular buffers
- [ ] No `push()` followed by `filter()`/`slice()`/`shift()`
- [ ] Maximum entity counts defined and enforced
- [ ] `teardown()` properly resets state (not re-allocates)
- [ ] No allocations inside `update()` loop

---

## Checklist for Runtime Changes

- [ ] Pixi.js Graphics use object pool
- [ ] All `removeChildren()` calls followed by `destroy()`
- [ ] Filters destroyed when removed/cleared
- [ ] Image/Canvas elements cleaned up after use
- [ ] Script elements removed from DOM when actors unload
- [ ] Event listeners removed on cleanup
