/**
 * Tuscan Road — Background Actor
 *
 * A perspective winding strade bianche (dusty white gravel road)
 * disappearing into rolling Tuscan hills, lined with cypress trees
 * and wildflowers. Time-aware sky transitions through dawn, day,
 * sunset, and night.
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
  id: 'tuscan-road',
  name: 'Tuscan Road',
  description: 'Perspective winding strade bianche disappearing into rolling Tuscan hills with cypress trees and wildflowers',
  author: {
    name: 'Joost de Valk',
    github: 'jdevalk',
  },
  version: '1.0.0',
  tags: ['background', 'italy', 'tuscany', 'road', 'landscape'],
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

// --- Road constants ---
const VANISHING_Y_FRAC = 0.28;   // vanishing point at 28% canvas height
const ROAD_BOTTOM_HALF_W = 0.38; // half-width of road at bottom as fraction of canvas
const ROAD_STRIPS = 20;          // number of perspective strips
const ROAD_MAX_DEPTH = 0.75;     // road stops before hills
const ROAD_FADE_START = 0.55;    // depth at which road starts fading

// --- Dash constants ---
const DASH_COUNT = 8;
const DASH_LENGTH_FRAC = 0.03;   // length of each dash as fraction of road depth
const DASH_GAP_FRAC = 0.04;     // gap between dashes

// --- Hill constants ---
const HILL_STEP = 4;
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
  // Farthest hills - misty blue-green
  { baseY: 0.24, amplitude: 0.04, freq1: 0.006, freq2: 0.014, speed: 2, lightColor: 0x7a9db5, darkColor: 0x3a5a6e, alpha: 0.7 },
  // Mid hills - olive green
  { baseY: 0.30, amplitude: 0.035, freq1: 0.008, freq2: 0.018, speed: 4, lightColor: 0x6a8a5e, darkColor: 0x3a5a38, alpha: 0.8 },
  // Near hills - darker green
  { baseY: 0.36, amplitude: 0.03, freq1: 0.01, freq2: 0.022, speed: 6, lightColor: 0x5a7a40, darkColor: 0x354a22, alpha: 0.85 },
];

// --- Cypress tree ---
interface CypressTree {
  depth: number;    // 0-1 along road (0=near, 1=far)
  side: number;     // -1 left, +1 right
  offset: number;   // extra lateral offset from road edge
  heightFrac: number;
  widthFrac: number;
  lightColor: number;
  darkColor: number;
}

const CYPRESS_LIGHT_COLORS = [0x2a5a2a, 0x2e6430, 0x264026, 0x326b32];
const CYPRESS_DARK_COLORS  = [0x1a3a1a, 0x1e4420, 0x163016, 0x224b22];

// --- Wildflower ---
interface Wildflower {
  depth: number;
  side: number;     // -1 left, +1 right
  offset: number;   // lateral offset from road edge
  color: number;
  radius: number;
}

const FLOWER_COLORS = [0xe03030, 0xe0a020, 0xd050a0, 0x3060d0, 0xe06020, 0xf0e040];

// --- Pre-allocated state ---
let canvasW = 0;
let canvasH = 0;
let vanishX = 0;
let vanishY = 0;

// Road strip polygons (pre-allocated)
const roadStripPoints: Point[][] = [];

// Hill layer point arrays
const hillPoints: Point[][] = [];

// Cypress trees
let cypressTrees: CypressTree[] = [];

// Wildflowers
let wildflowers: Wildflower[] = [];

// Dash animation offset
let dashOffset = 0;

// Green field polygons (left and right of road)
const fieldLeftPoints: Point[] = [];
const fieldRightPoints: Point[] = [];

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

/** Get road half-width at a given depth fraction (0=near/bottom, 1=vanishing point). */
function roadHalfWidthAt(depth: number): number {
  return canvasW * ROAD_BOTTOM_HALF_W * (1 - depth);
}

/** Get y position at a given depth fraction. */
function roadYAt(depth: number): number {
  return vanishY + (canvasH - vanishY) * (1 - depth);
}

/** Slight sine curve for the road's center line. */
function roadCenterXAt(depth: number): number {
  return vanishX + Math.sin(depth * 3.5) * canvasW * 0.06 * (1 - depth);
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    vanishX = canvasW * 0.5;
    vanishY = canvasH * VANISHING_Y_FRAC;

    // Pre-allocate road strip polygons
    roadStripPoints.length = 0;
    for (let i = 0; i < ROAD_STRIPS; i++) {
      const pts: Point[] = [];
      for (let j = 0; j < 4; j++) {
        pts.push({ x: 0, y: 0 });
      }
      roadStripPoints.push(pts);
    }

    // Pre-allocate hill point arrays
    hillPoints.length = 0;
    for (let i = 0; i < HILLS.length; i++) {
      const pts: Point[] = [];
      for (let j = 0; j < MAX_HILL_POINTS; j++) {
        pts.push({ x: 0, y: 0 });
      }
      hillPoints.push(pts);
    }

    // Pre-allocate field points (generous size)
    fieldLeftPoints.length = 0;
    fieldRightPoints.length = 0;
    for (let i = 0; i < ROAD_STRIPS + 4; i++) {
      fieldLeftPoints.push({ x: 0, y: 0 });
      fieldRightPoints.push({ x: 0, y: 0 });
    }

    // Create cypress trees along the road
    cypressTrees = [];
    for (let i = 0; i < 12; i++) {
      const depth = 0.1 + (i / 12) * 0.55; // spread along road depth
      const side = i % 2 === 0 ? -1 : 1;
      cypressTrees.push({
        depth,
        side,
        offset: 8 + Math.random() * 15,
        heightFrac: 0.08 + Math.random() * 0.04,
        widthFrac: 0.015 + Math.random() * 0.008,
        lightColor: CYPRESS_LIGHT_COLORS[i % CYPRESS_LIGHT_COLORS.length],
        darkColor: CYPRESS_DARK_COLORS[i % CYPRESS_DARK_COLORS.length],
      });
    }

    // Create wildflowers
    wildflowers = [];
    for (let i = 0; i < 30; i++) {
      const depth = 0.05 + Math.random() * 0.55;
      const side = Math.random() < 0.5 ? -1 : 1;
      wildflowers.push({
        depth,
        side,
        offset: 5 + Math.random() * 30,
        color: FLOWER_COLORS[i % FLOWER_COLORS.length],
        radius: 2 + Math.random() * 2,
      });
    }

    dashOffset = 0;
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
      // Close polygon at bottom of hill band
      pts[idx].x = canvasW + HILL_STEP;
      pts[idx].y = canvasH * (hill.baseY + 0.12);
      idx++;
      pts[idx].x = -HILL_STEP;
      pts[idx].y = canvasH * (hill.baseY + 0.12);
      idx++;

      const color = isDark ? hill.darkColor : hill.lightColor;
      api.brush.polygon(pts.slice(0, idx), { fill: color, alpha: hill.alpha });
    }

    // --- Green fields (fill area below hills and beside road) ---
    const fieldColor = isDark ? 0x2a4a1a : 0x5a8a30;
    const fieldAlpha = 0.9;

    // Draw a large green rectangle covering the ground area
    api.brush.rect(0, canvasH * 0.34, canvasW, canvasH * 0.66, {
      fill: fieldColor,
      alpha: fieldAlpha,
    });

    // --- Road ---
    const roadColorBase = isDark ? 0x8a8070 : 0xc8bfb0;

    // Draw road as perspective strips
    for (let i = 0; i < ROAD_STRIPS; i++) {
      const d0 = (i / ROAD_STRIPS) * ROAD_MAX_DEPTH;
      const d1 = ((i + 1) / ROAD_STRIPS) * ROAD_MAX_DEPTH;

      const y0 = roadYAt(d0);
      const y1 = roadYAt(d1);
      const cx0 = roadCenterXAt(d0);
      const cx1 = roadCenterXAt(d1);
      const hw0 = roadHalfWidthAt(d0);
      const hw1 = roadHalfWidthAt(d1);

      const pts = roadStripPoints[i];
      pts[0].x = cx0 - hw0;
      pts[0].y = y0;
      pts[1].x = cx0 + hw0;
      pts[1].y = y0;
      pts[2].x = cx1 + hw1;
      pts[2].y = y1;
      pts[3].x = cx1 - hw1;
      pts[3].y = y1;

      // Calculate alpha with fade near vanishing point
      let stripAlpha = 0.9;
      const midDepth = (d0 + d1) / 2;
      if (midDepth > ROAD_FADE_START) {
        const fadeFrac = (midDepth - ROAD_FADE_START) / (ROAD_MAX_DEPTH - ROAD_FADE_START);
        stripAlpha = 0.9 * (1 - fadeFrac);
      }
      stripAlpha = Math.max(stripAlpha, 0.0);

      if (stripAlpha > 0.01) {
        api.brush.polygon(pts, { fill: roadColorBase, alpha: stripAlpha });
      }
    }

    // --- Center dashes ---
    dashOffset = (tSec * 0.15) % (DASH_LENGTH_FRAC + DASH_GAP_FRAC);
    const dashColor = isDark ? 0xb0a890 : 0xf0e8d8;

    for (let i = 0; i < DASH_COUNT; i++) {
      const dStart = dashOffset + i * (DASH_LENGTH_FRAC + DASH_GAP_FRAC);
      const dEnd = dStart + DASH_LENGTH_FRAC;

      if (dStart >= ROAD_MAX_DEPTH || dEnd <= 0) continue;

      const ds = Math.max(dStart, 0);
      const de = Math.min(dEnd, ROAD_FADE_START); // dashes fade with road

      if (ds >= de) continue;

      const y0 = roadYAt(ds);
      const y1 = roadYAt(de);
      const cx0 = roadCenterXAt(ds);
      const cx1 = roadCenterXAt(de);
      const dashW0 = roadHalfWidthAt(ds) * 0.02 + 1;
      const dashW1 = roadHalfWidthAt(de) * 0.02 + 0.5;

      let dashAlpha = 0.8;
      if (ds > ROAD_FADE_START * 0.8) {
        dashAlpha *= 1 - (ds - ROAD_FADE_START * 0.8) / (ROAD_FADE_START * 0.2);
      }
      dashAlpha = Math.max(dashAlpha, 0);

      if (dashAlpha > 0.01) {
        api.brush.polygon(
          [
            { x: cx0 - dashW0, y: y0 },
            { x: cx0 + dashW0, y: y0 },
            { x: cx1 + dashW1, y: y1 },
            { x: cx1 - dashW1, y: y1 },
          ],
          { fill: dashColor, alpha: dashAlpha }
        );
      }
    }

    // --- Wildflowers along road edges ---
    for (let i = 0; i < wildflowers.length; i++) {
      const flower = wildflowers[i];
      const y = roadYAt(flower.depth);
      const cx = roadCenterXAt(flower.depth);
      const hw = roadHalfWidthAt(flower.depth);
      const fx = cx + flower.side * (hw + flower.offset * (1 - flower.depth));
      const scale = 1 - flower.depth * 0.7;
      const r = flower.radius * scale;

      let flowerAlpha = 0.8;
      if (flower.depth > ROAD_FADE_START) {
        flowerAlpha *= 1 - (flower.depth - ROAD_FADE_START) / (ROAD_MAX_DEPTH - ROAD_FADE_START);
      }
      flowerAlpha = Math.max(flowerAlpha, 0);

      if (r > 0.5 && flowerAlpha > 0.01) {
        api.brush.circle(fx, y, r, { fill: flower.color, alpha: flowerAlpha });
      }
    }

    // --- Cypress trees along road ---
    for (let i = 0; i < cypressTrees.length; i++) {
      const tree = cypressTrees[i];
      const y = roadYAt(tree.depth);
      const cx = roadCenterXAt(tree.depth);
      const hw = roadHalfWidthAt(tree.depth);
      const scale = 1 - tree.depth * 0.75;

      const treeX = cx + tree.side * (hw + tree.offset * scale);
      const treeH = canvasH * tree.heightFrac * scale;
      const treeW = canvasW * tree.widthFrac * scale;

      let treeAlpha = 0.6 + (1 - tree.depth) * 0.3;
      if (tree.depth > ROAD_FADE_START) {
        treeAlpha *= 1 - (tree.depth - ROAD_FADE_START) / (ROAD_MAX_DEPTH - ROAD_FADE_START);
      }
      treeAlpha = Math.max(treeAlpha, 0);

      if (treeH < 2 || treeAlpha < 0.01) continue;

      const treeColor = isDark ? tree.darkColor : tree.lightColor;

      // Gentle sway
      const sway = Math.sin(tSec * 0.8 + tree.depth * 5) * 2 * scale;

      // Draw cypress as a tapered column: base wider, top pointed
      api.brush.polygon(
        [
          { x: treeX - treeW, y: y },
          { x: treeX + treeW, y: y },
          { x: treeX + treeW * 0.7 + sway * 0.3, y: y - treeH * 0.3 },
          { x: treeX + treeW * 0.5 + sway * 0.6, y: y - treeH * 0.6 },
          { x: treeX + sway, y: y - treeH },
          { x: treeX - treeW * 0.5 + sway * 0.6, y: y - treeH * 0.6 },
          { x: treeX - treeW * 0.7 + sway * 0.3, y: y - treeH * 0.3 },
        ],
        { fill: treeColor, alpha: treeAlpha }
      );

      // Small trunk
      const trunkColor = isDark ? 0x2a1f0e : 0x3d2f1a;
      const trunkW = treeW * 0.25;
      const trunkH = treeH * 0.06;
      api.brush.rect(treeX - trunkW, y, trunkW * 2, trunkH, {
        fill: trunkColor,
        alpha: treeAlpha * 0.8,
      });
    }
  },

  async teardown(): Promise<void> {
    canvasW = 0;
    canvasH = 0;
    vanishX = 0;
    vanishY = 0;
    roadStripPoints.length = 0;
    hillPoints.length = 0;
    fieldLeftPoints.length = 0;
    fieldRightPoints.length = 0;
    cypressTrees = [];
    wildflowers = [];
    dashOffset = 0;
  },
};

registerActor(actor);
export default actor;
