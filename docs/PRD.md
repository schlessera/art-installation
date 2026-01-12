# Product Requirements Document
## Collaborative Digital Art Installation

**Version:** 1.0
**Date:** January 2026
**Event:** Cloudfest Hackathon 2026

---

## Executive Summary

An interactive digital art installation where multiple AI-driven "actors" collaboratively paint on a shared canvas. Hackathon attendees can deploy their own actors to participate in the creation. An AI reviewer periodically evaluates the artwork, and a public gallery showcases the best creations with voting capabilities.

---

## Vision & Goals

### Vision Statement
Create a living, evolving artwork that represents the collective creativity of both AI agents and human developers, showcasing the collaborative potential of human-AI interaction in creative endeavors.

### Primary Goals
1. **Engagement**: Provide hackathon attendees with a unique way to participate beyond traditional projects
2. **Showcase**: Display visually compelling generative art on monitors throughout the venue
3. **Collaboration**: Enable multiple independent actors to create cohesive artwork together
4. **Community**: Build a gallery of creations attributed to their contributing actors/authors

### Success Metrics
- 20+ actors deployed by hackathon attendees
- 50+ artworks saved to gallery
- 100+ votes cast by attendees
- Continuous 60 FPS display throughout the event

---

## System Overview

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           DISPLAY MONITORS                          │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                      Live Canvas + QR Code                      ││
│  └─────────────────────────────────────────────────────────────────┘│
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                         RUNTIME ENGINE                              │
│  ┌────────────┐  ┌─────────────┐  ┌───────────┐  ┌───────────────┐ │
│  │ Canvas     │  │ Actor       │  │ Review    │  │ Context       │ │
│  │ Manager    │  │ Scheduler   │  │ Engine    │  │ Providers     │ │
│  │ (Pixi.js)  │  │ (3-6/cycle) │  │ (Claude)  │  │ (T/W/A/V/S)   │ │
│  └────────────┘  └─────────────┘  └───────────┘  └───────────────┘ │
│                         │                                           │
│  ┌──────────────────────▼──────────────────────────────────────────┐│
│  │                    ACTOR SANDBOX (Web Workers)                  ││
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            ││
│  │  │Actor A  │  │Actor B  │  │Actor C  │  │Actor D  │  ...       ││
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘            ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                         GALLERY WEB APP                             │
│  ┌───────────────┐  ┌───────────────┐  ┌──────────────────────────┐│
│  │ Artwork Grid  │  │ Voting System │  │ Actor Profiles           ││
│  │ (QR access)   │  │ (1-5 stars)   │  │ (Attribution)            ││
│  └───────────────┘  └───────────────┘  └──────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

### Core Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| Graphics Engine | Pixi.js 8.x | GPU-accelerated 2D rendering |
| Actor Sandbox | Web Workers | Secure isolated execution |
| AI Review | Claude API | Artwork evaluation |
| Gallery | React | Artwork viewing and voting |
| Context APIs | Various | Environmental data |

---

## Detailed Requirements

### 1. Runtime Engine

#### 1.1 Canvas Management
- **Resolution**: 1920x1080 (configurable)
- **Frame Rate**: Target 60 FPS
- **Color Depth**: 32-bit RGBA
- **Rendering**: Pixi.js with WebGL backend
- **Snapshot**: `preserveDrawingBuffer: true` for capture

#### 1.2 Actor Lifecycle
1. **Discovery**: Scan `actors/builtin/` and `actors/community/` directories
2. **Validation**: Security checks + API compliance
3. **Registration**: Store in ActorRegistry with metadata
4. **Selection**: Random 3-6 actors per cycle (favor unused)
5. **Loading**: Spawn Web Worker sandbox
6. **Execution**: Call `setup()` once, `update()` each frame
7. **Teardown**: Call `teardown()` on deactivation

#### 1.3 Actor Selection Algorithm

**Per cycle:**
```
actorCount = random(3, 6)
```

**Per actor selection:**
```
score = 100
+ (50 * noveltyBias) if uses == 0
+ (25 / log2(uses + 1) * noveltyBias) if uses > 0
- 30 if usedRecently
+ reviewFeedbackBonus
```

Priority: Never-used actors > Rarely-used actors > Average-used actors

### 2. Actors

#### 2.1 Actor Interface
```typescript
interface Actor {
  metadata: ActorMetadata;
  setup?(api: ActorSetupAPI): Promise<void>;
  update(api: ActorUpdateAPI, frame: FrameContext): void;
  teardown?(): Promise<void>;
}
```

#### 2.2 Actor Metadata
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Unique identifier (kebab-case) |
| name | string | Yes | Display name |
| description | string | Yes | What the actor does |
| author.name | string | Yes | Creator's name |
| author.github | string | No | GitHub username |
| version | string | Yes | Semver version |
| tags | string[] | Yes | Categories |

#### 2.3 Actor APIs

**CanvasReadAPI** (read-only):
- `getSize()` - Canvas dimensions
- `getPixel(x, y)` - Color at point
- `getDominantColors(count)` - Dominant colors
- `findEmptyRegions(minSize)` - Available painting areas

**BrushAPI** (drawing):
- Shapes: `ellipse()`, `rect()`, `polygon()`, `star()`
- Lines: `line()`, `stroke()`, `bezier()`, `arc()`
- Text: `text()`
- Images: `image()`
- Transform: `translate()`, `rotate()`, `scale()`

**FilterAPI** (effects):
- Color: `brightness()`, `contrast()`, `saturate()`, `hueRotate()`
- Blur: `blur()`, `gaussianBlur()`, `motionBlur()`
- Effects: `noise()`, `pixelate()`, `vignette()`, `glow()`
- Custom: `colorMatrix()`, `customShader()`

**ContextAPI** (environment):
- Time: `time.hour()`, `time.dayProgress()`, `time.season()`
- Weather: `weather.temperature()`, `weather.condition()`
- Audio: `audio.bass()`, `audio.isBeat()`, `audio.bpm()`
- Video: `video.getMotion()`, `video.getDominantColor()`
- Social: `social.sentiment()`, `social.viewerCount()`

#### 2.4 Security Constraints

Actors **CANNOT** access:
- Network (`fetch`, `XMLHttpRequest`, `WebSocket`)
- Storage (`localStorage`, `sessionStorage`, `indexedDB`)
- DOM (`document`, `window`)
- Dynamic code (`eval`, `new Function`, `import()`)

### 3. Review System

#### 3.1 Review Cycle
| Interval | Action |
|----------|--------|
| 60 seconds | Capture canvas snapshot |
| 5 minutes | Send snapshot batch to Claude for review |
| N reviews | Reset canvas with fresh actor selection |

#### 3.2 Review Criteria
Claude evaluates each snapshot on:
- **Aesthetic Score** (0-100): Visual appeal, color harmony
- **Creativity Score** (0-100): Originality, uniqueness
- **Coherence Score** (0-100): Composition, element relationships
- **Overall Score** (0-100): Combined evaluation

#### 3.3 Review Actions
Based on evaluation, the system may:
- Continue current actors
- Slow down/speed up activity
- Favor specific actors in selection
- Reset canvas early
- Save artwork to gallery

### 4. Gallery

#### 4.1 Artwork Entry
- Only AI-approved artworks (overallScore >= threshold)
- Includes full attribution to contributing actors
- Stores context snapshot (time, weather, etc.)

#### 4.2 Voting System
- Users identify with name (stored in localStorage)
- 1-5 star rating per artwork
- One vote per user per artwork
- Combined score: `AI(60%) + UserRating(40%)`

#### 4.3 Gallery Pruning
When gallery exceeds 30 artworks:
1. Calculate combined scores
2. Sort ascending by combined score
3. Archive bottom 10% (3 artworks)
4. Archived artworks hidden but not deleted

#### 4.4 Gallery Features
- Grid view of artworks
- Artwork detail with voting
- Actor profile pages
- Attribution display: "Created by Actor1 + Actor2 + Actor3"

### 5. Display

#### 5.1 QR Code Overlay
- Persistent QR code in corner of display
- Links to gallery URL
- Position: configurable (default: bottom-right)
- Style: semi-transparent, non-intrusive

#### 5.2 Display Requirements
- Full-screen canvas
- No UI chrome during display
- Optional debug overlay (development mode)

---

## Actor Development

### Getting Started

1. Fork the repository
2. Run `pnpm new:actor my-actor-name`
3. Edit `actors/community/my-actor-name/src/index.ts`
4. Preview with `pnpm --filter @art/actor-my-actor-name dev`
5. Validate with `pnpm --filter @art/actor-my-actor-name validate`
6. Submit Pull Request

### Development Tools

**PreviewHarness**: Local preview environment with:
- Real-time canvas display
- Debug overlay (FPS, brush calls, filter calls)
- Mock context controls (time, weather, audio simulation)
- Vite HMR for instant updates

**ActorValidator CLI**: Pre-submission validation
```bash
pnpm validate        # Quick check
pnpm validate:full   # Full check with performance
```

### Example Actor

```typescript
import type { Actor, ActorUpdateAPI, FrameContext } from '@art/types';

const actor: Actor = {
  metadata: {
    id: 'wave-painter',
    name: 'Wave Painter',
    description: 'Paints flowing wave patterns',
    author: { name: 'Your Name', github: 'yourname' },
    version: '1.0.0',
    tags: ['geometric', 'animated'],
    createdAt: new Date(),
  },

  update(api: ActorUpdateAPI, frame: FrameContext) {
    const { width, height } = api.canvas.getSize();
    const time = frame.time / 1000;

    // Paint wave patterns
    for (let i = 0; i < 5; i++) {
      const x = (width / 5) * i + Math.sin(time + i) * 50;
      const y = height / 2 + Math.cos(time * 2 + i) * 100;

      api.brush.circle(x, y, 20, {
        fill: `hsl(${(time * 50 + i * 30) % 360}, 70%, 60%)`,
        alpha: 0.7,
      });
    }
  },
};

export default actor;
```

---

## Technical Specifications

### Performance Requirements
| Metric | Target |
|--------|--------|
| Frame Rate | 60 FPS sustained |
| Frame Time | < 16.67ms |
| Memory Growth | < 10MB/hour |
| Actor Load Time | < 100ms |
| Snapshot Capture | < 50ms |

### Browser Support
- Chrome 120+ (primary)
- Firefox 120+
- Safari 17+
- Edge 120+

### Dependencies

**Runtime:**
- Pixi.js 8.x
- qrcode (QR generation)

**Development:**
- TypeScript 5.x
- Vite 6.x
- Vitest 4.x (with Browser Mode)
- Playwright (visual regression)
- MSW (API mocking)

---

## Deployment

### Git-based Actor Submission

```
1. Fork repository
2. Create actor in actors/community/
3. Submit Pull Request
4. CI validates (security, compliance, performance)
5. Merge deploys automatically
6. Runtime hot-reloads new actor
```

### CI Pipeline

**On PR to actors/community/:**
- Static analysis (forbidden patterns)
- API compliance check
- Sandbox isolation test
- Performance test (55+ FPS)
- Generate preview image

### Infrastructure

| Component | Hosting |
|-----------|---------|
| Runtime | Local machine at venue |
| Gallery | Static hosting (Vercel/Netlify) |
| Artwork Storage | S3-compatible storage |
| Claude API | Anthropic cloud |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Malicious actor code | High | Web Worker sandbox, static analysis |
| Performance degradation | Medium | Actor timeout, FPS monitoring |
| API rate limits (Claude) | Medium | Batched reviews, caching |
| Actor crashes | Low | Error isolation, auto-recovery |
| Network failures | Low | Local fallbacks, queue retry |

---

## Timeline

| Phase | Focus |
|-------|-------|
| Setup | Repository structure, types, tooling |
| Core | Runtime engine, canvas management |
| Actors | Actor system, built-in actors |
| Review | AI review integration |
| Gallery | Web app, voting system |
| Polish | Testing, optimization, documentation |

---

## Appendices

### A. Actor API Quick Reference

```typescript
// Canvas (read-only)
api.canvas.getSize(): { width, height }
api.canvas.getPixel(x, y): RGBA
api.canvas.getDominantColors(count): RGBA[]

// Brush (drawing)
api.brush.circle(x, y, radius, style?)
api.brush.rect(x, y, width, height, style?)
api.brush.stroke(points, style?)
api.brush.text(content, x, y, style?)

// Filter (effects)
api.filter.blur(amount, region?)
api.filter.brightness(amount, region?)
api.filter.colorMatrix(matrix, region?)

// Context
api.context.time.hour(): number
api.context.weather.condition(): WeatherCondition
api.context.audio.isBeat(): boolean
```

### B. Color Matrix Examples

```typescript
import { COLOR_MATRICES } from '@art/types';

// Predefined matrices
api.filter.colorMatrix(COLOR_MATRICES.grayscale);
api.filter.colorMatrix(COLOR_MATRICES.sepia);
api.filter.colorMatrix(COLOR_MATRICES.vintage);
```

### C. Artwork Score Calculation

```typescript
// Combined score for gallery ranking
combinedScore = (aiOverallScore * 0.6) + ((userRating - 1) * 25 * 0.4)

// Example:
// AI score: 80, User rating: 4.5
// Combined: (80 * 0.6) + ((4.5 - 1) * 25 * 0.4) = 48 + 35 = 83
```
