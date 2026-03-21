/**
 * Clothesline — Foreground Actor
 *
 * Italian-style clotheslines strung between terracotta buildings,
 * with laundry flapping gently in the breeze.
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
  id: 'clothesline',
  name: 'Clothesline',
  description: 'Italian clotheslines with laundry flapping in the breeze between terracotta walls',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'italy', 'laundry', 'urban', 'charming'],
  createdAt: new Date('2026-03-21'),
  preferredDuration: 60,
  requiredContexts: ['display'],
};

// --- Constants ---
const LINE_COUNT = 4;
const MAX_LAUNDRY = 24; // max pieces across all lines
const LINE_SEGMENTS = 12; // segments for catenary approximation
const LINE_COLOR = 0x4a4a4a;
const LINE_COLOR_DARK = 0x888888;
const WALL_COLOR = 0xc8845a;
const WALL_COLOR_DARK = 0x8a5c3a;
const WALL_SHADOW_COLOR = 0xa06838;
const WALL_SHADOW_DARK = 0x6a4028;
const PIN_COLOR = 0x8b7355;
const PIN_COLOR_DARK = 0xb0a080;

// Laundry colors
const CLOTH_WHITE = 0xf0ece0;
const CLOTH_BLUE = 0x8ab8d8;
const CLOTH_RED = 0xcc4444;
const CLOTH_YELLOW = 0xe8d040;
const CLOTH_COLORS = [CLOTH_WHITE, CLOTH_BLUE, CLOTH_RED, CLOTH_YELLOW];

// Laundry types
const TYPE_TOWEL = 0;    // rectangle
const TYPE_SHIRT = 1;    // T-shape
const TYPE_SOCK = 2;     // triangle
const LAUNDRY_TYPES = [TYPE_TOWEL, TYPE_SHIRT, TYPE_SOCK, TYPE_TOWEL, TYPE_SHIRT];

// --- Types ---
interface ClothesLine {
  y: number;          // base y position
  leftX: number;      // left attachment x
  rightX: number;     // right attachment x
  sag: number;        // how much the line sags
}

interface LaundryPiece {
  active: boolean;
  lineIdx: number;     // which line it hangs from
  t: number;           // position along line (0-1)
  type: number;        // TYPE_TOWEL, TYPE_SHIRT, TYPE_SOCK
  color: number;
  hasStripe: boolean;
  stripeColor: number;
  width: number;
  height: number;
  phaseOffset: number; // for wind animation
  windSpeed: number;   // individual flapping speed
}

// --- Pre-allocated state ---
let canvasW = 0;
let canvasH = 0;
let lines: ClothesLine[] = [];
let laundry: LaundryPiece[] = [];
// Reusable array for catenary y-values
let catenaryY: number[] = [];

function getCatenaryY(line: ClothesLine, t: number): number {
  // Approximate catenary with parabola: sag * 4 * t * (1 - t)
  const sagAmount = line.sag * 4 * t * (1 - t);
  return line.y + sagAmount;
}

function getLineX(line: ClothesLine, t: number): number {
  return line.leftX + (line.rightX - line.leftX) * t;
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    // Pre-allocate catenary buffer
    catenaryY = new Array(LINE_SEGMENTS + 1);
    for (let i = 0; i <= LINE_SEGMENTS; i++) {
      catenaryY[i] = 0;
    }

    // Create clotheslines at different heights
    const wallWidth = canvasW * 0.08;
    lines = [];
    const lineYPositions = [0.2, 0.38, 0.55, 0.72];
    for (let i = 0; i < LINE_COUNT; i++) {
      lines.push({
        y: canvasH * lineYPositions[i],
        leftX: wallWidth + 5 + Math.random() * 8,
        rightX: canvasW - wallWidth - 5 - Math.random() * 8,
        sag: 12 + Math.random() * 10,
      });
    }

    // Pre-allocate laundry pool
    laundry = [];
    for (let i = 0; i < MAX_LAUNDRY; i++) {
      laundry.push({
        active: false,
        lineIdx: 0,
        t: 0,
        type: 0,
        color: 0,
        hasStripe: false,
        stripeColor: 0,
        width: 0,
        height: 0,
        phaseOffset: 0,
        windSpeed: 0,
      });
    }

    // Place laundry on lines
    let pieceIdx = 0;
    for (let li = 0; li < LINE_COUNT; li++) {
      // 4-6 pieces per line, spaced evenly with jitter
      const count = 4 + Math.floor(Math.random() * 3);
      const spacing = 1.0 / (count + 1);

      for (let j = 0; j < count && pieceIdx < MAX_LAUNDRY; j++) {
        const p = laundry[pieceIdx];
        p.active = true;
        p.lineIdx = li;
        p.t = spacing * (j + 1) + (Math.random() - 0.5) * spacing * 0.4;
        p.type = LAUNDRY_TYPES[Math.floor(Math.random() * LAUNDRY_TYPES.length)];
        p.color = CLOTH_COLORS[Math.floor(Math.random() * CLOTH_COLORS.length)];
        p.hasStripe = Math.random() < 0.25;
        p.stripeColor = CLOTH_COLORS[Math.floor(Math.random() * CLOTH_COLORS.length)];
        p.phaseOffset = Math.random() * Math.PI * 2;
        p.windSpeed = 1.5 + Math.random() * 1.5;

        // Size varies by type
        if (p.type === TYPE_TOWEL) {
          p.width = 18 + Math.random() * 14;
          p.height = 24 + Math.random() * 16;
        } else if (p.type === TYPE_SHIRT) {
          p.width = 20 + Math.random() * 10;
          p.height = 22 + Math.random() * 10;
        } else {
          // Sock - smaller
          p.width = 10 + Math.random() * 6;
          p.height = 16 + Math.random() * 8;
        }
        pieceIdx++;
      }
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const tSec = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();

    const wallW = canvasW * 0.08;
    const wallColor = isDark ? WALL_COLOR_DARK : WALL_COLOR;
    const wallShadow = isDark ? WALL_SHADOW_DARK : WALL_SHADOW_COLOR;
    const lineColor = isDark ? LINE_COLOR_DARK : LINE_COLOR;
    const pinColor = isDark ? PIN_COLOR_DARK : PIN_COLOR;

    // Global wind pattern: combination of slow and fast oscillation
    const windBase = Math.sin(tSec * 0.3) * 0.5 + Math.sin(tSec * 0.7) * 0.3;

    // Draw left wall
    api.brush.rect(0, 0, wallW, canvasH, {
      fill: wallColor,
      alpha: 0.9,
      blendMode: 'normal',
    });
    // Wall shadow edge
    api.brush.rect(wallW - 3, 0, 3, canvasH, {
      fill: wallShadow,
      alpha: 0.6,
      blendMode: 'normal',
    });

    // Draw right wall
    api.brush.rect(canvasW - wallW, 0, wallW, canvasH, {
      fill: wallColor,
      alpha: 0.9,
      blendMode: 'normal',
    });
    // Wall shadow edge
    api.brush.rect(canvasW - wallW, 0, 3, canvasH, {
      fill: wallShadow,
      alpha: 0.6,
      blendMode: 'normal',
    });

    // Draw wall attachment points (small brackets)
    for (let li = 0; li < LINE_COUNT; li++) {
      const line = lines[li];
      // Left bracket
      api.brush.rect(wallW - 2, line.y - 3, 8, 6, {
        fill: 0x555555,
        alpha: 0.8,
        blendMode: 'normal',
      });
      // Right bracket
      api.brush.rect(canvasW - wallW - 6, line.y - 3, 8, 6, {
        fill: 0x555555,
        alpha: 0.8,
        blendMode: 'normal',
      });
    }

    // Draw clotheslines as segmented catenary curves
    for (let li = 0; li < LINE_COUNT; li++) {
      const line = lines[li];
      // Light wind sway on the line itself
      const lineSway = Math.sin(tSec * 0.5 + li * 1.2) * 2;

      for (let s = 0; s < LINE_SEGMENTS; s++) {
        const t0 = s / LINE_SEGMENTS;
        const t1 = (s + 1) / LINE_SEGMENTS;
        const x0 = getLineX(line, t0);
        const x1 = getLineX(line, t1);
        const y0 = getCatenaryY(line, t0) + lineSway * t0 * (1 - t0) * 4;
        const y1 = getCatenaryY(line, t1) + lineSway * t1 * (1 - t1) * 4;

        api.brush.line(x0, y0, x1, y1, {
          color: lineColor,
          width: 1.5,
          alpha: 0.8,
          blendMode: 'normal',
        });
      }
    }

    // Draw laundry pieces
    for (let i = 0; i < MAX_LAUNDRY; i++) {
      const p = laundry[i];
      if (!p.active) continue;

      const line = lines[p.lineIdx];
      const lineSway = Math.sin(tSec * 0.5 + p.lineIdx * 1.2) * 2;
      const sagT = p.t;
      const px = getLineX(line, p.t);
      const py = getCatenaryY(line, p.t) + lineSway * sagT * (1 - sagT) * 4;

      // Wind-driven rotation for flapping effect
      const windForPiece = windBase + Math.sin(tSec * p.windSpeed + p.phaseOffset) * 0.4;
      const flapAngle = windForPiece * 0.12;

      // Draw clothespin at attachment point
      api.brush.rect(px - 1.5, py - 2, 3, 6, {
        fill: pinColor,
        alpha: 0.9,
        blendMode: 'normal',
      });

      // Draw the laundry piece
      api.brush.pushMatrix();
      api.brush.translate(px, py + 2);
      api.brush.rotate(flapAngle);

      if (p.type === TYPE_TOWEL) {
        // Rectangle towel/sheet
        api.brush.rect(-p.width / 2, 0, p.width, p.height, {
          fill: p.color,
          alpha: 0.85,
          blendMode: 'normal',
        });
        // Stripe pattern
        if (p.hasStripe) {
          const stripeH = p.height * 0.15;
          api.brush.rect(-p.width / 2, p.height * 0.3, p.width, stripeH, {
            fill: p.stripeColor,
            alpha: 0.7,
            blendMode: 'normal',
          });
          api.brush.rect(-p.width / 2, p.height * 0.6, p.width, stripeH, {
            fill: p.stripeColor,
            alpha: 0.7,
            blendMode: 'normal',
          });
        }
        // Bottom edge shadow for depth
        api.brush.rect(-p.width / 2, p.height - 2, p.width, 2, {
          fill: 0x000000,
          alpha: 0.1,
          blendMode: 'normal',
        });
      } else if (p.type === TYPE_SHIRT) {
        // T-shirt shape: body + sleeves
        const bodyW = p.width * 0.6;
        const bodyH = p.height;
        const sleeveW = p.width * 0.35;
        const sleeveH = bodyH * 0.35;

        // Body
        api.brush.rect(-bodyW / 2, 0, bodyW, bodyH, {
          fill: p.color,
          alpha: 0.85,
          blendMode: 'normal',
        });
        // Left sleeve
        api.brush.rect(-bodyW / 2 - sleeveW, bodyH * 0.02, sleeveW, sleeveH, {
          fill: p.color,
          alpha: 0.8,
          blendMode: 'normal',
        });
        // Right sleeve
        api.brush.rect(bodyW / 2, bodyH * 0.02, sleeveW, sleeveH, {
          fill: p.color,
          alpha: 0.8,
          blendMode: 'normal',
        });
        // Stripe on shirt
        if (p.hasStripe) {
          api.brush.rect(-bodyW / 2, bodyH * 0.4, bodyW, bodyH * 0.12, {
            fill: p.stripeColor,
            alpha: 0.65,
            blendMode: 'normal',
          });
        }
      } else {
        // Sock — triangle shape hanging down
        // Fill the sock with stacked horizontal lines
        const halfW = p.width / 2;
        const steps = 6;
        for (let s = 0; s <= steps; s++) {
          const st = s / steps;
          const lw = halfW * (1 - st);
          const sy = st * p.height;
          api.brush.line(-lw, sy, lw, sy, {
            color: p.color,
            width: p.height / steps + 1,
            alpha: 0.8,
            blendMode: 'normal',
          });
        }
      }

      api.brush.popMatrix();
    }
  },

  async teardown(): Promise<void> {
    lines = [];
    laundry = [];
    catenaryY = [];
    canvasW = 0;
    canvasH = 0;
  },
};

registerActor(actor);
export default actor;
