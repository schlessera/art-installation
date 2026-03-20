# Actor Template

Template for creating new actors for the Art Installation.

## Quick Start

### 1. Create Your Actor

```bash
# From the repository root
pnpm new:actor my-actor-name

# Or manually copy this template
cp -r packages/actor-template actors/community/my-actor-name
```

### 2. Update Metadata

Edit `src/index.ts` and update the metadata:

```typescript
const metadata: ActorMetadata = {
  id: 'my-actor-name',         // Unique ID (kebab-case)
  name: 'My Actor Name',       // Display name
  description: 'What my actor does',
  author: {
    name: 'Your Name',
    github: 'your-github',
  },
  version: '1.0.0',
  tags: ['your', 'tags'],
  createdAt: new Date(),
};
```

### 3. Implement Your Actor

The main method to implement is `update()`:

```typescript
update(api: ActorUpdateAPI, frame: FrameContext): void {
  const { width, height } = api.canvas.getSize();

  // Draw something!
  api.brush.circle(width / 2, height / 2, 50, {
    fill: '#ff6600',
    alpha: 0.7,
  });
}
```

### 4. Preview

```bash
# Start the preview server
pnpm dev

# Open http://localhost:5173 in your browser
```

### 5. Test

```bash
# Run tests
pnpm test

# Watch mode
pnpm test:watch
```

### 6. Validate

```bash
# Quick validation
pnpm validate

# Full validation (includes performance)
pnpm validate:full
```

### 7. Submit

Create a Pull Request with your actor in `actors/community/`.

## Available APIs

### Canvas (Read-Only)

```typescript
api.canvas.getSize()              // { width, height }
api.canvas.getPixel(x, y)         // RGBA color
api.canvas.getDominantColors(5)   // Top 5 colors
api.canvas.isEmpty(x, y)          // Check if empty
api.canvas.findEmptyRegions(100)  // Find painting areas
```

### Brush (Drawing)

```typescript
// Shapes
api.brush.circle(x, y, radius, style?)
api.brush.ellipse(x, y, width, height, style?)
api.brush.rect(x, y, width, height, style?)
api.brush.polygon(points, style?)
api.brush.star(x, y, outerR, innerR, points, style?)

// Lines
api.brush.line(x1, y1, x2, y2, style?)
api.brush.stroke(points, style?)
api.brush.bezier(start, cp1, cp2, end, style?)

// Text
api.brush.text('Hello', x, y, style?)

// Transform
api.brush.translate(x, y)
api.brush.rotate(angle)
api.brush.scale(sx, sy?)
api.brush.pushMatrix()
api.brush.popMatrix()
```

### Filter (Effects)

```typescript
api.filter.blur(amount)
api.filter.brightness(amount)
api.filter.contrast(amount)
api.filter.saturate(amount)
api.filter.hueRotate(degrees)
api.filter.grayscale(amount?)
api.filter.noise(amount)
api.filter.pixelate(size)
api.filter.glow(color, intensity)
```

### Context (Environment)

```typescript
// Time
api.context.time.hour()           // 0-23
api.context.time.dayProgress()    // 0-1
api.context.time.season()         // 'spring' | 'summer' | 'autumn' | 'winter'

// Weather
api.context.weather.condition()   // 'clear' | 'rain' | etc.
api.context.weather.temperature() // Celsius

// Audio
api.context.audio.bass()          // 0-1
api.context.audio.isBeat()        // true on beat
api.context.audio.bpm()           // BPM or null

// Social
api.context.social.sentiment()    // -1 to 1
api.context.social.viewerCount()  // Number of viewers
```

## Style Options

### ShapeStyle

```typescript
{
  fill: '#ff6600',        // Color, gradient, or pattern
  stroke: '#ffffff',      // Stroke color
  strokeWidth: 2,         // Stroke width
  alpha: 0.7,             // Opacity (0-1)
  blendMode: 'add',       // Blend mode
}
```

### LineStyle

```typescript
{
  color: '#ffffff',
  width: 2,
  alpha: 0.7,
  cap: 'round',           // 'butt' | 'round' | 'square'
  join: 'round',          // 'miter' | 'round' | 'bevel'
  dash: [5, 3],           // Dash pattern
}
```

## Tips

1. **Performance**: Keep frame time under 16.67ms for 60 FPS
2. **Blend Modes**: Use `'add'` for glowing effects
3. **Context**: React to time, weather, and audio for dynamic visuals
4. **State**: Store state outside the actor object for persistence between frames
5. **Cleanup**: Implement `teardown()` to reset state when deactivated

## Security

Actors run in a sandbox and **cannot** access:
- Network (fetch, WebSocket)
- Storage (localStorage)
- DOM (document, window)
- Dynamic code (eval)

## Examples

### Audio-Reactive Circles

```typescript
update(api: ActorUpdateAPI, frame: FrameContext): void {
  const { width, height } = api.canvas.getSize();
  const bass = api.context.audio.bass();

  api.brush.circle(width / 2, height / 2, 50 + bass * 100, {
    fill: `hsl(${bass * 60}, 70%, 60%)`,
    alpha: 0.7,
  });
}
```

### Weather-Based Colors

```typescript
update(api: ActorUpdateAPI, frame: FrameContext): void {
  const weather = api.context.weather.condition();
  const colors = {
    clear: '#ffcc00',
    clouds: '#888888',
    rain: '#4488ff',
    snow: '#ffffff',
  };
  const color = colors[weather] ?? '#ffffff';

  api.brush.background(color, 0.1);
}
```

## Need Help?

- [API Reference](../../docs/api-reference.md)
- [Actor Development Guide](../../docs/actor-development.md)
- [Examples](../../actors/builtin/)
