/**
 * Vineyard Rows — Background Actor
 *
 * Perspective rows of grapevines converging to a vanishing point
 * in the Italian countryside. Wooden posts connected by wire lines
 * with green leaf clusters, brown earth between rows, and rolling
 * hills behind the vanishing point. Time-aware sky transitions.
 */

import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
  Point,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'vineyard-rows',
  name: 'Vineyard Rows',
  description: 'Perspective rows of grapevines converging to a vanishing point with wooden posts, wire lines, and leaf clusters',
  author: {
    name: 'Joost de Valk',
    github: 'jdevalk',
  },
  version: '1.0.0',
  tags: ['background', 'italy', 'vineyard', 'wine', 'landscape'],
  createdAt: new Date('2026-03-21'),
  preferredDuration: 60,
  role: 'background',
  requiredContexts: ['time', 'display'],
};

// --- Sky colors ---
const SKY_DAWN_LIGHT   = 0xf0c060;
const SKY_DAWN_DARK    = 0x8a6830;
const SKY_DAY_LIGHT    = 0x87ceeb;
const SKY_DAY_DARK     = 0x2a4a6a;
const SKY_SUNSET_LIGHT = 0xe07830;
const SKY_SUNSET_DARK  = 0x7a3a18;
const SKY_NIGHT_LIGHT  = 0x1a1a3a;
const SKY_NIGHT_DARK   = 0x0a0a1a;

// --- Vineyard constants ---
const VANISHING_Y_FRAC = 0.30;    // vanishing point at 30% canvas height
const ROW_COUNT = 9;               // number of vine rows (left + right of center)
const ROW_SPACING = 0.08;          // spacing between rows as fraction of half-width at bottom
const POSTS_PER_ROW = 8;           // posts per vine row
const POST_START_DEPTH = 0.08;     // nearest post depth
const POST_END_DEPTH = 0.70;       // farthest post depth
const FADE_START_DEPTH = 0.50;     // depth at which things start fading

// --- Earth color ---
const EARTH_LIGHT = 0x8a6a40;
const EARTH_DARK  = 0x5a4428;

// --- Vine foliage colors ---
const LEAF_LIGHT_1 = 0x4a8a3a;
const LEAF_LIGHT_2 = 0x5a9a4a;
const LEAF_DARK_1  = 0x2a5a22;
const LEAF_DARK_2  = 0x3a6a32;

// --- Post color ---
const POST_LIGHT = 0x6a5030;
const POST_DARK  = 0x4a3820;

// --- Wire color ---
const WIRE_LIGHT = 0x888888;
const WIRE_DARK  = 0x555555;

// --- Hill constants ---
const HILL_STEP = 5;
const MAX_HILL_POINTS = Math.ceil(360 / HILL_STEP) + 4;

interface HillConfig {
  baseY: number;
  amplitude: number;
  freq1: number;
  freq2: number;
  speed: number;
  lightColor: number;
  darkColor: number;
  alpha: number;
}

const HILLS: HillConfig[] = [
  { baseY: 0.26, amplitude: 0.035, freq1: 0.007, freq2: 0.015, speed: 1.5, lightColor: 0x7a9db5, darkColor: 0x3a5a6e, alpha: 0.7 },
  { baseY: 0.30, amplitude: 0.030, freq1: 0.009, freq2: 0.019, speed: 3, lightColor: 0x6a8a5e, darkColor: 0x3a5a38, alpha: 0.8 },
  { baseY: 0.34, amplitude: 0.025, freq1: 0.011, freq2: 0.023, speed: 5, lightColor: 0x5a7a40, darkColor: 0x354a22, alpha: 0.85 },
];

// --- Leaf cluster along a wire ---
interface LeafCluster {
  tFrac: number;  // 0-1 position along the wire between two posts
  radius: number; // base radius
  colorIdx: number;
}

// --- Pre-allocated state ---
let canvasW = 0;
let canvasH = 0;
let vanishX = 0;
let vanishY = 0;

// Hill point arrays
const hillPoints: Point[][] = [];

// Pre-generated leaf clusters per row (shared pattern)
let leafClusters: LeafCluster[] = [];

// --- Utility ---
function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

function getSkyColor(hour: number, isDark: boolean): number {
  if (hour >= 6 && hour < 8) {
    const t = (hour - 6) / 2;
    return lerpColor(isDark ? SKY_NIGHT_DARK : SKY_NIGHT_LIGHT, isDark ? SKY_DAWN_DARK : SKY_DAWN_LIGHT, t);
  }
  if (hour >= 8 && hour < 9) {
    const t = hour - 8;
    return lerpColor(isDark ? SKY_DAWN_DARK : SKY_DAWN_LIGHT, isDark ? SKY_DAY_DARK : SKY_DAY_LIGHT, t);
  }
  if (hour >= 9 && hour < 17) {
    return isDark ? SKY_DAY_DARK : SKY_DAY_LIGHT;
  }
  if (hour >= 17 && hour < 20) {
    const t = (hour - 17) / 3;
    return lerpColor(isDark ? SKY_DAY_DARK : SKY_DAY_LIGHT, isDark ? SKY_SUNSET_DARK : SKY_SUNSET_LIGHT, t);
  }
  if (hour >= 20 && hour < 21) {
    const t = hour - 20;
    return lerpColor(isDark ? SKY_SUNSET_DARK : SKY_SUNSET_LIGHT, isDark ? SKY_NIGHT_DARK : SKY_NIGHT_LIGHT, t);
  }
  return isDark ? SKY_NIGHT_DARK : SKY_NIGHT_LIGHT;
}

/** Get y position at a given depth (0=bottom, 1=vanishing point). */
function depthToY(depth: number): number {
  return vanishY + (canvasH - vanishY) * (1 - depth);
}

/** Get the x offset for a row at a given depth. Rows converge to vanishX. */
function rowXAt(rowIndex: number, depth: number): number {
  // rowIndex: -4..+4 (center row = 0, negative = left, positive = right)
  const bottomOffset = rowIndex * canvasW * ROW_SPACING;
  // Converge toward vanishing point
  return vanishX + bottomOffset * (1 - depth);
}

/** Scale factor at a given depth. */
function scaleAt(depth: number): number {
  return Math.max(1 - depth * 0.85, 0.05);
}

/** Alpha with depth fade. */
function alphaAt(depth: number, baseAlpha: number): number {
  if (depth > FADE_START_DEPTH) {
    const fadeFrac = (depth - FADE_START_DEPTH) / (POST_END_DEPTH - FADE_START_DEPTH);
    return Math.max(baseAlpha * (1 - fadeFrac), 0);
  }
  return baseAlpha;
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    vanishX = canvasW * 0.5;
    vanishY = canvasH * VANISHING_Y_FRAC;

    // Pre-allocate hill point arrays
    hillPoints.length = 0;
    for (let i = 0; i < HILLS.length; i++) {
      const pts: Point[] = [];
      for (let j = 0; j < MAX_HILL_POINTS; j++) {
        pts.push({ x: 0, y: 0 });
      }
      hillPoints.push(pts);
    }

    // Pre-generate leaf cluster pattern (reused across rows and posts)
    leafClusters = [];
    for (let i = 0; i < 5; i++) {
      leafClusters.push({
        tFrac: 0.12 + i * 0.19 + (i % 2 === 0 ? 0.03 : -0.02),
        radius: 3 + (i % 3),
        colorIdx: i % 2,
      });
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const tSec = frame.time / 1000;
    const hour = api.context.time.hour();
    const isDark = api.context.display.isDarkMode();

    // --- Sky ---
    const skyColor = getSkyColor(hour, isDark);
    api.brush.background(skyColor);

    // --- Hills (behind vanishing point) ---
    for (let li = 0; li < HILLS.length; li++) {
      const hill = HILLS[li];
      const pts = hillPoints[li];
      const offset = tSec * hill.speed;
      const baseYPx = canvasH * hill.baseY;
      const ampPx = canvasH * hill.amplitude;

      let idx = 0;
      for (let x = -HILL_STEP; x <= canvasW + HILL_STEP; x += HILL_STEP) {
        const xOff = x + offset;
        const h = Math.sin(xOff * hill.freq1) * 0.6 + Math.sin(xOff * hill.freq2 + 1.7) * 0.4;
        pts[idx].x = x;
        pts[idx].y = baseYPx - h * ampPx;
        idx++;
      }
      // Close polygon
      pts[idx].x = canvasW + HILL_STEP;
      pts[idx].y = canvasH * (hill.baseY + 0.12);
      idx++;
      pts[idx].x = -HILL_STEP;
      pts[idx].y = canvasH * (hill.baseY + 0.12);
      idx++;

      const color = isDark ? hill.darkColor : hill.lightColor;
      api.brush.polygon(pts.slice(0, idx), { fill: color, alpha: hill.alpha });
    }

    // --- Earth ground (below hills) ---
    const earthColor = isDark ? EARTH_DARK : EARTH_LIGHT;
    api.brush.rect(0, canvasH * 0.38, canvasW, canvasH * 0.62, {
      fill: earthColor,
      alpha: 0.95,
    });

    // --- Between-row earth variation: slightly darker furrows ---
    const furrowColor = isDark ? 0x4a3820 : 0x7a5a30;
    const halfRowCount = Math.floor(ROW_COUNT / 2);

    for (let ri = -halfRowCount; ri <= halfRowCount; ri++) {
      // Draw a narrow strip between this row and the next
      const riNext = ri + 1;
      if (riNext > halfRowCount) continue;

      // Draw furrow as a polygon converging to vanishing point
      const nearDepth = POST_START_DEPTH;
      const farDepth = POST_END_DEPTH;

      const nearY = depthToY(nearDepth);
      const farY = depthToY(farDepth);

      const x0Near = rowXAt(ri, nearDepth) + canvasW * ROW_SPACING * 0.3 * scaleAt(nearDepth);
      const x1Near = rowXAt(riNext, nearDepth) - canvasW * ROW_SPACING * 0.3 * scaleAt(nearDepth);
      const x0Far = rowXAt(ri, farDepth) + canvasW * ROW_SPACING * 0.3 * scaleAt(farDepth);
      const x1Far = rowXAt(riNext, farDepth) - canvasW * ROW_SPACING * 0.3 * scaleAt(farDepth);

      api.brush.polygon(
        [
          { x: x0Near, y: nearY },
          { x: x1Near, y: nearY },
          { x: x1Far, y: farY },
          { x: x0Far, y: farY },
        ],
        { fill: furrowColor, alpha: 0.6 }
      );
    }

    // --- Vine rows: posts, wires, leaves ---
    const postColor = isDark ? POST_DARK : POST_LIGHT;
    const wireColor = isDark ? WIRE_DARK : WIRE_LIGHT;
    const leafColors = isDark
      ? [LEAF_DARK_1, LEAF_DARK_2]
      : [LEAF_LIGHT_1, LEAF_LIGHT_2];

    // Draw rows from farthest to nearest for correct overlap
    for (let ri = -halfRowCount; ri <= halfRowCount; ri++) {
      // Draw posts from far to near
      for (let pi = POSTS_PER_ROW - 1; pi >= 0; pi--) {
        const depth = POST_START_DEPTH + (pi / (POSTS_PER_ROW - 1)) * (POST_END_DEPTH - POST_START_DEPTH);
        const scale = scaleAt(depth);
        const y = depthToY(depth);
        const x = rowXAt(ri, depth);
        const alpha = alphaAt(depth, 0.85);

        if (alpha < 0.01) continue;

        // Post dimensions
        const postW = Math.max(2 * scale, 1);
        const postH = Math.max(25 * scale, 3);

        // Draw post
        api.brush.rect(x - postW * 0.5, y - postH, postW, postH, {
          fill: postColor,
          alpha: alpha,
        });

        // Draw wire to next post (if not last post)
        if (pi < POSTS_PER_ROW - 1) {
          const nextDepth = POST_START_DEPTH + ((pi + 1) / (POSTS_PER_ROW - 1)) * (POST_END_DEPTH - POST_START_DEPTH);
          const nextY = depthToY(nextDepth);
          const nextX = rowXAt(ri, nextDepth);
          const nextScale = scaleAt(nextDepth);

          // Two horizontal wires at different heights on the posts
          const wireH1 = 18 * scale;
          const wireH1Next = 18 * nextScale;
          const wireH2 = 10 * scale;
          const wireH2Next = 10 * nextScale;

          const wireAlpha = alphaAt(depth, 0.7);
          if (wireAlpha > 0.01) {
            // Upper wire
            api.brush.line(x, y - wireH1, nextX, nextY - wireH1Next, {
              color: wireColor,
              width: Math.max(1, scale),
              alpha: wireAlpha,
            });
            // Lower wire
            api.brush.line(x, y - wireH2, nextX, nextY - wireH2Next, {
              color: wireColor,
              width: Math.max(1, scale),
              alpha: wireAlpha,
            });

            // Leaf clusters along the upper wire
            for (let li = 0; li < leafClusters.length; li++) {
              const lc = leafClusters[li];
              const t = lc.tFrac;
              const lx = x + (nextX - x) * t;
              const ly = (y - wireH1) + ((nextY - wireH1Next) - (y - wireH1)) * t;
              const lDepth = depth + (nextDepth - depth) * t;
              const lScale = scaleAt(lDepth);
              const lr = lc.radius * lScale;
              const leafAlpha = alphaAt(lDepth, 0.75);

              if (lr > 0.5 && leafAlpha > 0.01) {
                // Gentle sway
                const sway = Math.sin(tSec * 1.2 + ri * 2 + pi * 0.7 + li * 1.3) * 1.5 * lScale;
                api.brush.circle(lx + sway, ly - lr * 0.5, lr, {
                  fill: leafColors[lc.colorIdx],
                  alpha: leafAlpha,
                });
              }
            }

            // Leaf clusters along the lower wire (fewer)
            for (let li = 0; li < 3; li++) {
              const lc = leafClusters[li];
              const t = lc.tFrac + 0.08;
              if (t > 1) continue;
              const lx = x + (nextX - x) * t;
              const ly = (y - wireH2) + ((nextY - wireH2Next) - (y - wireH2)) * t;
              const lDepth = depth + (nextDepth - depth) * t;
              const lScale = scaleAt(lDepth);
              const lr = lc.radius * lScale * 0.8;
              const leafAlpha = alphaAt(lDepth, 0.65);

              if (lr > 0.5 && leafAlpha > 0.01) {
                const sway = Math.sin(tSec * 1.0 + ri * 1.5 + pi * 0.9 + li * 1.7) * 1.2 * lScale;
                api.brush.circle(lx + sway, ly - lr * 0.3, lr, {
                  fill: leafColors[(lc.colorIdx + 1) % 2],
                  alpha: leafAlpha,
                });
              }
            }
          }
        }
      }
    }
  },

  async teardown(): Promise<void> {
    canvasW = 0;
    canvasH = 0;
    vanishX = 0;
    vanishY = 0;
    hillPoints.length = 0;
    leafClusters = [];
  },
};

registerActor(actor);
export default actor;
