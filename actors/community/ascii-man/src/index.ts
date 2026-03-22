import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'ascii-man',
  name: 'Video Mosaic',
  description:
    'Live camera feed rendered as a colorful grid of rectangular pixels',
  author: {
    name: 'rolf',
    github: 'rolf',
  },
  version: '2.0.0',
  fps: 15,
  tags: ['video', 'mosaic', 'interactive', 'camera', 'pixelated'],
  createdAt: new Date('2026-03-21'),
  preferredDuration: 60,
  requiredContexts: ['video'],
};

// ============================================================
// GRID CONSTANTS
// ============================================================

const GRID_COLS = 50;
const GRID_ROWS = 89; // 640/360 * 50 ≈ 89 for square-ish cells
const TOTAL_CELLS = GRID_COLS * GRID_ROWS;
const COLOR_LERP = 0.35; // smoothing factor (0=frozen, 1=instant)

// ============================================================
// STATE
// ============================================================

let canvasW = 0;
let canvasH = 0;
let cellW = 0;
let cellH = 0;

// Pre-allocated arrays
const cellColors = new Int32Array(TOTAL_CELLS); // current smoothed colors (packed RGB)
const sampleIndices = new Int32Array(TOTAL_CELLS); // byte offset into video ImageData.data

// Pre-computed cell positions
const cellX = new Float32Array(TOTAL_CELLS);
const cellY = new Float32Array(TOTAL_CELLS);

// Track video frame dimensions for recomputation on change
let indicesComputed = false;
let lastFrameW = 0;
let lastFrameH = 0;

// Single reusable style object — mutated per cell in update loop
const cellStyle: { fill: number; alpha: number } = { fill: 0x000000, alpha: 1.0 };

// ============================================================
// HELPERS
// ============================================================

function computeSampleIndices(frameW: number, frameH: number): void {
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const i = row * GRID_COLS + col;
      const nx = (col + 0.5) / GRID_COLS;
      const ny = (row + 0.5) / GRID_ROWS;
      const sx = Math.min(Math.floor(nx * frameW), frameW - 1);
      const sy = Math.min(Math.floor(ny * frameH), frameH - 1);
      sampleIndices[i] = (sy * frameW + sx) * 4;
    }
  }
  indicesComputed = true;
}

function lerpColor(current: number, target: number, t: number): number {
  const cr = (current >> 16) & 0xff;
  const cg = (current >> 8) & 0xff;
  const cb = current & 0xff;
  const tr = (target >> 16) & 0xff;
  const tg = (target >> 8) & 0xff;
  const tb = target & 0xff;
  const r = (cr + (tr - cr) * t) & 0xff;
  const g = (cg + (tg - cg) * t) & 0xff;
  const b = (cb + (tb - cb) * t) & 0xff;
  return (r << 16) | (g << 8) | b;
}

function hslToRgb(h: number, s: number, l: number): number {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  const sector = (h * 6) | 0;
  if (sector === 0) {
    r = c;
    g = x;
  } else if (sector === 1) {
    r = x;
    g = c;
  } else if (sector === 2) {
    g = c;
    b = x;
  } else if (sector === 3) {
    g = x;
    b = c;
  } else if (sector === 4) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return (
    (((r + m) * 255) & 0xff) << 16 |
    (((g + m) * 255) & 0xff) << 8 |
    (((b + m) * 255) & 0xff)
  );
}

// ============================================================
// ACTOR
// ============================================================

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    cellW = canvasW / GRID_COLS;
    cellH = canvasH / GRID_ROWS;

    // Pre-compute cell positions
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const i = row * GRID_COLS + col;
        cellX[i] = col * cellW;
        cellY[i] = row * cellH;
      }
    }

    // Reset state
    cellColors.fill(0);
    sampleIndices.fill(0);
    indicesComputed = false;
    lastFrameW = 0;
    lastFrameH = 0;

    // Try to compute sample indices from video frame
    const frame = api.context.video.getFrame();
    if (frame) {
      computeSampleIndices(frame.width, frame.height);
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const video = api.context.video;
    const frameData = video.isAvailable() ? video.getFrame() : null;

    if (frameData) {
      // Compute sample indices on first frame or when dimensions change
      if (!indicesComputed || frameData.width !== lastFrameW || frameData.height !== lastFrameH) {
        computeSampleIndices(frameData.width, frameData.height);
        lastFrameW = frameData.width;
        lastFrameH = frameData.height;
      }

      // Sample video and update cell colors with smoothing
      const data = frameData.data;
      for (let i = 0; i < TOTAL_CELLS; i++) {
        const idx = sampleIndices[i];
        const target = (data[idx] << 16) | (data[idx + 1] << 8) | data[idx + 2];
        cellColors[i] = lerpColor(cellColors[i], target, COLOR_LERP);
      }
    } else {
      // Fallback: animated color wave
      const t = frame.time * 0.0003;
      for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
          const i = row * GRID_COLS + col;
          const h = (col / GRID_COLS * 0.5 + row / GRID_ROWS * 0.3 + t) % 1;
          const target = hslToRgb(h, 0.7, 0.35);
          cellColors[i] = lerpColor(cellColors[i], target, 0.1);
        }
      }
    }

    // Draw each cell as a colored rectangle
    for (let i = 0; i < TOTAL_CELLS; i++) {
      cellStyle.fill = cellColors[i];
      api.brush.rect(cellX[i], cellY[i], cellW, cellH, cellStyle);
    }
  },

  async teardown(): Promise<void> {
    cellColors.fill(0);
    sampleIndices.fill(0);
    indicesComputed = false;
    lastFrameW = 0;
    lastFrameH = 0;
  },
};

registerActor(actor);
export default actor;
