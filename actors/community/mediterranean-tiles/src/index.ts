/**
 * Mediterranean Tiles — Background Actor
 *
 * Geometric tile pattern inspired by Amalfi Coast ceramic tiles.
 * A grid of tiles, each containing a slowly morphing geometric pattern
 * (diamonds, crosses, stars) in cobalt blue, white, yellow, and terracotta.
 */

import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'mediterranean-tiles',
  name: 'Mediterranean Tiles',
  description:
    'Geometric tile pattern inspired by Amalfi Coast ceramics — diamonds, crosses, and stars in cobalt blue, white, yellow, and terracotta',
  author: {
    name: 'Joost de Valk',
    github: 'jdevalk',
  },
  version: '1.0.0',
  tags: ['background', 'italy', 'tiles', 'pattern', 'amalfi'],
  createdAt: new Date('2026-03-20'),
  preferredDuration: 60,
  role: 'background',
  requiredContexts: ['display'],
};

// ============================================================
// CONSTANTS
// ============================================================

// Grid: 6 columns x 10 rows = 60 tiles.
// Each tile draws at most 4 shapes => ~240 draw calls max (well under 300).
const COLS = 6;
const ROWS = 10;
const TILE_COUNT = COLS * ROWS;

// Pattern types per tile
const PATTERN_DIAMOND = 0;
const PATTERN_CROSS = 1;
const PATTERN_STAR = 2;
const PATTERN_COUNT = 3;

// Color palettes (0xRRGGBB)
// Dark mode: slightly muted
const DARK_BG = 0x1a1a2e;
const DARK_COBALT = 0x2856a6;
const DARK_WHITE = 0xc8c8d8;
const DARK_YELLOW = 0xc49a30;
const DARK_TERRACOTTA = 0xa04828;
const DARK_GROUT = 0x101020;

// Light mode: vibrant
const LIGHT_BG = 0xf0ece4;
const LIGHT_COBALT = 0x1e4d8c;
const LIGHT_WHITE = 0xfaf8f0;
const LIGHT_YELLOW = 0xe8b830;
const LIGHT_TERRACOTTA = 0xc85a30;
const LIGHT_GROUT = 0x8a8070;

// ============================================================
// PRE-ALLOCATED STATE
// ============================================================

interface TileState {
  pattern: number;       // current pattern type (0-2)
  nextPattern: number;   // pattern we are morphing toward
  morph: number;         // 0..1 progress of morph
  morphSpeed: number;    // how fast this tile morphs
  colorIndex: number;    // which accent color (0=cobalt, 1=yellow, 2=terracotta)
  phase: number;         // animation phase offset
}

let tiles: TileState[] = [];
let cellW = 0;
let cellH = 0;
let W = 0;
let H = 0;

// Reusable point arrays for polygon drawing (pre-allocated)
const polyPoints: { x: number; y: number }[] = [];
for (let i = 0; i < 8; i++) {
  polyPoints.push({ x: 0, y: 0 });
}

// ============================================================
// HELPERS
// ============================================================

function pickRandom(max: number): number {
  return Math.floor(Math.random() * max);
}

function getAccentColor(colorIndex: number, isDark: boolean): number {
  if (colorIndex === 0) return isDark ? DARK_COBALT : LIGHT_COBALT;
  if (colorIndex === 1) return isDark ? DARK_YELLOW : LIGHT_YELLOW;
  return isDark ? DARK_TERRACOTTA : LIGHT_TERRACOTTA;
}

// ============================================================
// TILE DRAWING
// ============================================================

function drawTile(
  api: ActorUpdateAPI,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  tile: TileState,
  time: number,
  isDark: boolean,
): void {
  const accent = getAccentColor(tile.colorIndex, isDark);
  const white = isDark ? DARK_WHITE : LIGHT_WHITE;
  const bg = isDark ? DARK_BG : LIGHT_BG;

  // Tile background
  api.brush.rect(cx - hw, cy - hh, hw * 2, hh * 2, {
    fill: bg,
    alpha: 1,
    blendMode: 'normal',
  });

  // Morph factor modulates the inner shape size
  const breathe = Math.sin(time * 0.4 + tile.phase) * 0.08;
  const sizeFactor = 0.65 + breathe;

  // Blend between current and next pattern
  const m = tile.morph;
  const pattern = m < 0.5 ? tile.pattern : tile.nextPattern;
  // Scale shrinks at midpoint of morph, then grows back
  const morphScale = 1 - Math.sin(m * Math.PI) * 0.15;
  const s = sizeFactor * morphScale;

  const iw = hw * s; // inner half-width
  const ih = hh * s; // inner half-height

  if (pattern === PATTERN_DIAMOND) {
    // Diamond shape
    polyPoints[0].x = cx;
    polyPoints[0].y = cy - ih;
    polyPoints[1].x = cx + iw;
    polyPoints[1].y = cy;
    polyPoints[2].x = cx;
    polyPoints[2].y = cy + ih;
    polyPoints[3].x = cx - iw;
    polyPoints[3].y = cy;

    api.brush.polygon(
      [polyPoints[0], polyPoints[1], polyPoints[2], polyPoints[3]],
      { fill: accent, alpha: 0.85, blendMode: 'normal' },
    );

    // Inner diamond (smaller, white)
    const si = 0.4;
    polyPoints[4].x = cx;
    polyPoints[4].y = cy - ih * si;
    polyPoints[5].x = cx + iw * si;
    polyPoints[5].y = cy;
    polyPoints[6].x = cx;
    polyPoints[6].y = cy + ih * si;
    polyPoints[7].x = cx - iw * si;
    polyPoints[7].y = cy;

    api.brush.polygon(
      [polyPoints[4], polyPoints[5], polyPoints[6], polyPoints[7]],
      { fill: white, alpha: 0.8, blendMode: 'normal' },
    );
  } else if (pattern === PATTERN_CROSS) {
    // Cross shape: two overlapping rectangles
    const armW = iw * 0.35;
    const armH = ih * 0.35;

    // Vertical bar
    api.brush.rect(cx - armW, cy - ih, armW * 2, ih * 2, {
      fill: accent,
      alpha: 0.85,
      blendMode: 'normal',
    });

    // Horizontal bar
    api.brush.rect(cx - iw, cy - armH, iw * 2, armH * 2, {
      fill: accent,
      alpha: 0.85,
      blendMode: 'normal',
    });

    // Center circle
    const cr = Math.min(iw, ih) * 0.25;
    api.brush.circle(cx, cy, cr, {
      fill: white,
      alpha: 0.8,
      blendMode: 'normal',
    });
  } else {
    // Star shape: 8-pointed star via two overlapping rotated squares
    // First square (axis-aligned diamond)
    polyPoints[0].x = cx;
    polyPoints[0].y = cy - ih;
    polyPoints[1].x = cx + iw;
    polyPoints[1].y = cy;
    polyPoints[2].x = cx;
    polyPoints[2].y = cy + ih;
    polyPoints[3].x = cx - iw;
    polyPoints[3].y = cy;

    api.brush.polygon(
      [polyPoints[0], polyPoints[1], polyPoints[2], polyPoints[3]],
      { fill: accent, alpha: 0.85, blendMode: 'normal' },
    );

    // Second square (rotated 45 degrees = axis-aligned rectangle)
    const d = Math.min(iw, ih) * 0.72;
    api.brush.rect(cx - d, cy - d, d * 2, d * 2, {
      fill: accent,
      alpha: 0.75,
      blendMode: 'normal',
    });

    // Center dot
    const cr = Math.min(iw, ih) * 0.2;
    api.brush.circle(cx, cy, cr, {
      fill: white,
      alpha: 0.8,
      blendMode: 'normal',
    });
  }
}

// ============================================================
// ACTOR
// ============================================================

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    W = size.width;
    H = size.height;
    cellW = W / COLS;
    cellH = H / ROWS;

    // Pre-allocate all tile state
    tiles = new Array(TILE_COUNT);
    for (let i = 0; i < TILE_COUNT; i++) {
      const pattern = pickRandom(PATTERN_COUNT);
      let next = pickRandom(PATTERN_COUNT);
      while (next === pattern) next = pickRandom(PATTERN_COUNT);

      tiles[i] = {
        pattern,
        nextPattern: next,
        morph: 0,
        morphSpeed: 0.03 + Math.random() * 0.04, // varies per tile
        colorIndex: pickRandom(3),
        phase: Math.random() * Math.PI * 2,
      };
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const time = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();
    const dt = frame.deltaTime / 1000;

    // Background (grout color)
    api.brush.background(isDark ? DARK_GROUT : LIGHT_GROUT);

    // Draw tiles
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const idx = row * COLS + col;
        const tile = tiles[idx];

        // Update morph
        tile.morph += tile.morphSpeed * dt;
        if (tile.morph >= 1) {
          tile.morph = 0;
          tile.pattern = tile.nextPattern;
          let next = pickRandom(PATTERN_COUNT);
          while (next === tile.pattern) next = pickRandom(PATTERN_COUNT);
          tile.nextPattern = next;
        }

        // Tile center
        const cx = col * cellW + cellW * 0.5;
        const cy = row * cellH + cellH * 0.5;

        // Half-sizes with a small gap for grout
        const gap = 1.5;
        const hw = cellW * 0.5 - gap;
        const hh = cellH * 0.5 - gap;

        drawTile(api, cx, cy, hw, hh, tile, time, isDark);
      }
    }
  },

  async teardown(): Promise<void> {
    tiles = [];
    cellW = 0;
    cellH = 0;
    W = 0;
    H = 0;
  },
};

registerActor(actor);
export default actor;
