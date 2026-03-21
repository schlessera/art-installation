/**
 * Mosaic Builder — Foreground Actor
 *
 * Tiny colored tiles assembling into a Roman mosaic pattern piece by piece.
 * Tiles appear one at a time in a spiral from the center outward, each
 * growing from zero size with a slight bounce. Once complete, the mosaic
 * pauses briefly and then restarts with a new pattern.
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
  id: 'mosaic-builder',
  name: 'Mosaic Builder',
  description:
    'Tiny colored tiles assemble into a Roman mosaic pattern piece by piece in a spiral from the center outward',
  author: {
    name: 'Joost de Valk',
    github: 'jdevalk',
  },
  version: '1.0.0',
  tags: ['foreground', 'italy', 'rome', 'mosaic', 'pattern'],
  createdAt: new Date('2026-03-21'),
  preferredDuration: 45,
  role: 'foreground',
  requiredContexts: ['display'],
};

// ============================================================
// CONSTANTS
// ============================================================

const COLS = 12;
const ROWS = 20;
const TILE_COUNT = COLS * ROWS;

// Mosaic palette (numeric 0xRRGGBB)
const TERRACOTTA = 0xcc3333;
const CREAM      = 0xf0e8d0;
const BLUE       = 0x2244aa;
const GREEN      = 0x228844;
const GOLD       = 0xddaa22;

// Dark-mode muted variants
const DARK_TERRACOTTA = 0x993030;
const DARK_CREAM      = 0xb0a890;
const DARK_BLUE       = 0x1a3388;
const DARK_GREEN      = 0x1a6636;
const DARK_GOLD       = 0xaa8818;

const LIGHT_PALETTE = [TERRACOTTA, CREAM, BLUE, GREEN, GOLD];
const DARK_PALETTE  = [DARK_TERRACOTTA, DARK_CREAM, DARK_BLUE, DARK_GREEN, DARK_GOLD];

const GROUT_LIGHT = 0x8a7e6e;
const GROUT_DARK  = 0x2a2520;

// Timing
const TILE_INTERVAL = 0.04;   // seconds between tile appearances
const BOUNCE_DURATION = 0.25; // seconds for the grow-bounce animation
const PAUSE_AFTER = 2.0;      // seconds to pause after completion

// ============================================================
// PATTERN GENERATORS
// ============================================================

// Each generator returns a color index (0..4) for a given col, row.
// Patterns are designed to look like Roman geometric mosaics.

type PatternFn = (col: number, row: number, cols: number, rows: number) => number;

function patternDiamondBorder(col: number, row: number, cols: number, rows: number): number {
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  const dx = Math.abs(col - cx) / cx;
  const dy = Math.abs(row - cy) / cy;
  const dist = dx + dy; // Manhattan distance normalized

  if (dist > 0.85) return 0;  // terracotta border
  if (dist > 0.75) return 1;  // cream ring
  if (dist > 0.6)  return 2;  // blue ring
  // Center: checkerboard of green and gold
  return ((col + row) % 2 === 0) ? 3 : 4;
}

function patternConcentricRings(col: number, row: number, cols: number, rows: number): number {
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  const dx = (col - cx) / cx;
  const dy = (row - cy) / cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  const ring = Math.floor(dist * 5) % 5;
  return ring;
}

function patternCross(col: number, row: number, cols: number, rows: number): number {
  const cx = Math.floor(cols / 2);
  const cy = Math.floor(rows / 2);
  const onVertical = Math.abs(col - cx) <= 1;
  const onHorizontal = Math.abs(row - cy) <= 1;

  if (onVertical && onHorizontal) return 4; // gold center cross intersection
  if (onVertical || onHorizontal) return 0; // terracotta cross arms
  // Background: alternating blue and cream with green accents
  if ((col + row) % 3 === 0) return 3;
  return ((col + row) % 2 === 0) ? 1 : 2;
}

function patternChevron(col: number, row: number, _cols: number, _rows: number): number {
  const wave = (col + row) % 5;
  return wave;
}

function patternFrame(col: number, row: number, cols: number, rows: number): number {
  const distEdge = Math.min(col, row, cols - 1 - col, rows - 1 - row);
  if (distEdge === 0) return 0;
  if (distEdge === 1) return 4;
  if (distEdge === 2) return 2;
  if (distEdge === 3) return 1;
  return ((col + row) % 2 === 0) ? 3 : 1;
}

const PATTERNS: PatternFn[] = [
  patternDiamondBorder,
  patternConcentricRings,
  patternCross,
  patternChevron,
  patternFrame,
];

// ============================================================
// SPIRAL ORDER — pre-computed once
// ============================================================

let spiralOrder: number[] = [];

function buildSpiralOrder(cols: number, rows: number): number[] {
  const order: number[] = [];
  const visited = new Uint8Array(cols * rows);

  // Start from center
  let cx = Math.floor(cols / 2);
  let cy = Math.floor(rows / 2);
  // Directions: right, down, left, up
  const dxs = [1, 0, -1, 0];
  const dys = [0, 1, 0, -1];

  let dir = 0;
  let stepsInDir = 1;
  let stepsTaken = 0;
  let turnCount = 0;

  let x = cx;
  let y = cy;

  for (let i = 0; i < cols * rows; i++) {
    if (x >= 0 && x < cols && y >= 0 && y < rows && !visited[y * cols + x]) {
      order.push(y * cols + x);
      visited[y * cols + x] = 1;
    } else {
      // If out of bounds, still consume the step; we'll catch remaining cells below
      // Push nothing, but decrement to retry isn't needed since spiral overshoots grid
    }

    stepsTaken++;
    if (stepsTaken >= stepsInDir) {
      stepsTaken = 0;
      dir = (dir + 1) % 4;
      turnCount++;
      if (turnCount % 2 === 0) stepsInDir++;
    }
    x += dxs[dir];
    y += dys[dir];
  }

  // Collect any cells the spiral missed (edge cases on rectangular grids)
  for (let idx = 0; idx < cols * rows; idx++) {
    if (!visited[idx]) {
      order.push(idx);
    }
  }

  return order;
}

// ============================================================
// STATE
// ============================================================

interface MosaicState {
  tileColors: number[];     // color index per tile (from pattern)
  revealedCount: number;    // how many tiles have been revealed so far
  elapsed: number;          // time since current build started
  patternIndex: number;     // which pattern we're currently building
  pausing: boolean;         // true when all tiles shown, waiting to restart
  pauseTimer: number;       // countdown for pause
  tileRevealTime: number[]; // time each tile was revealed (for bounce anim)
}

let state: MosaicState = {
  tileColors: [],
  revealedCount: 0,
  elapsed: 0,
  patternIndex: 0,
  pausing: false,
  pauseTimer: 0,
  tileRevealTime: [],
};

let cellW = 0;
let cellH = 0;
let offsetX = 0;
let offsetY = 0;

// ============================================================
// HELPERS
// ============================================================

function generatePattern(patternIndex: number): void {
  const fn = PATTERNS[patternIndex % PATTERNS.length];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      state.tileColors[row * COLS + col] = fn(col, row, COLS, ROWS);
    }
  }
}

function resetBuild(nextPattern: number): void {
  state.patternIndex = nextPattern;
  state.revealedCount = 0;
  state.elapsed = 0;
  state.pausing = false;
  state.pauseTimer = 0;
  generatePattern(nextPattern);
  for (let i = 0; i < TILE_COUNT; i++) {
    state.tileRevealTime[i] = -1;
  }
}

// Attempt a slight overshoot bounce easing for 0..1 input
function bounceEase(t: number): number {
  if (t >= 1) return 1;
  if (t < 0) return 0;
  // Overshoot to ~1.15 then settle
  const c = 1.70158;
  const t1 = t - 1;
  return 1 + t1 * t1 * ((c + 1) * t1 + c);
}

// ============================================================
// ACTOR
// ============================================================

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    const W = size.width;
    const H = size.height;

    // Compute tile size so the grid is centered with some margin
    const margin = 0.12; // 12% margin on each side
    const availW = W * (1 - margin * 2);
    const availH = H * (1 - margin * 2);

    cellW = Math.floor(availW / COLS);
    cellH = Math.floor(availH / ROWS);
    // Keep tiles square-ish: use the smaller dimension
    const cellSize = Math.min(cellW, cellH);
    cellW = cellSize;
    cellH = cellSize;

    // Center the grid
    const gridW = cellW * COLS;
    const gridH = cellH * ROWS;
    offsetX = (W - gridW) / 2;
    offsetY = (H - gridH) / 2;

    // Build spiral order
    spiralOrder = buildSpiralOrder(COLS, ROWS);

    // Pre-allocate state arrays
    state.tileColors = new Array(TILE_COUNT);
    state.tileRevealTime = new Array(TILE_COUNT);

    // Start first pattern
    resetBuild(0);
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const dt = frame.deltaTime / 1000;
    const isDark = api.context.display.isDarkMode();
    const palette = isDark ? DARK_PALETTE : LIGHT_PALETTE;
    const groutColor = isDark ? GROUT_DARK : GROUT_LIGHT;

    state.elapsed += dt;

    // Handle pause-after-completion
    if (state.pausing) {
      state.pauseTimer += dt;
      if (state.pauseTimer >= PAUSE_AFTER) {
        resetBuild((state.patternIndex + 1) % PATTERNS.length);
      }
    } else {
      // Reveal tiles based on elapsed time
      const targetCount = Math.min(
        TILE_COUNT,
        Math.floor(state.elapsed / TILE_INTERVAL),
      );
      while (state.revealedCount < targetCount) {
        state.tileRevealTime[spiralOrder[state.revealedCount]] = state.elapsed;
        state.revealedCount++;
      }
      if (state.revealedCount >= TILE_COUNT) {
        state.pausing = true;
        state.pauseTimer = 0;
      }
    }

    // Draw grout background for grid area
    api.brush.rect(offsetX - 1, offsetY - 1, cellW * COLS + 2, cellH * ROWS + 2, {
      fill: groutColor,
      alpha: 0.8,
      blendMode: 'normal',
    });

    // Draw revealed tiles — spiral order means we draw in reveal order,
    // but we iterate all tiles by grid position for correct layering.
    const gap = 1; // grout gap in pixels
    const now = state.elapsed;

    for (let idx = 0; idx < TILE_COUNT; idx++) {
      const revealTime = state.tileRevealTime[idx];
      if (revealTime < 0) continue; // not yet revealed

      const row = Math.floor(idx / COLS);
      const col = idx % COLS;

      const tileX = offsetX + col * cellW;
      const tileY = offsetY + row * cellH;

      // Bounce animation
      const age = now - revealTime;
      const t = Math.min(age / BOUNCE_DURATION, 1);
      const scale = bounceEase(t);

      if (scale <= 0) continue;

      const colorIdx = state.tileColors[idx];
      const color = palette[colorIdx];

      // Tile dimensions with gap and scale
      const innerW = (cellW - gap * 2) * scale;
      const innerH = (cellH - gap * 2) * scale;
      const cx = tileX + cellW / 2;
      const cy = tileY + cellH / 2;

      api.brush.rect(
        cx - innerW / 2,
        cy - innerH / 2,
        innerW,
        innerH,
        {
          fill: color,
          alpha: 0.9,
          blendMode: 'normal',
        },
      );
    }
  },

  async teardown(): Promise<void> {
    state = {
      tileColors: [],
      revealedCount: 0,
      elapsed: 0,
      patternIndex: 0,
      pausing: false,
      pauseTimer: 0,
      tileRevealTime: [],
    };
    spiralOrder = [];
    cellW = 0;
    cellH = 0;
    offsetX = 0;
    offsetY = 0;
  },
};

registerActor(actor);
export default actor;
