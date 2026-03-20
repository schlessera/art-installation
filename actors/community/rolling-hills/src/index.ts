/**
 * Rolling Hills — Background Actor
 *
 * Five layered Tuscan hillside silhouettes with parallax scrolling
 * against a time-aware sky. Distant blue-green mountains give way
 * to olive-toned mid-ground and dark green foreground hills.
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
  id: 'rolling-hills',
  name: 'Rolling Hills',
  description: 'Layered Tuscan hillside silhouettes with parallax scrolling and time-aware sky',
  author: {
    name: 'Joost de Valk',
    github: 'jdevalk',
  },
  version: '1.0.0',
  tags: ['background', 'landscape', 'italy', 'tuscany', 'hills'],
  createdAt: new Date('2026-03-20'),
  preferredDuration: 60,
  role: 'background',
  requiredContexts: ['time', 'display'],
};

// Hill layer configuration (back to front)
interface HillLayer {
  baseY: number;       // fraction of canvas height where hill center sits
  speed: number;       // parallax scroll speed (pixels per second)
  amplitude: number;   // height variation as fraction of canvas height
  freq1: number;       // primary sine frequency
  freq2: number;       // secondary sine frequency
  freq3: number;       // tertiary sine frequency
  amp1: number;        // primary amplitude weight
  amp2: number;        // secondary amplitude weight
  amp3: number;        // tertiary amplitude weight
  lightColor: number;  // color in light mode
  darkColor: number;   // color in dark mode
  alpha: number;       // opacity
}

const LAYERS: HillLayer[] = [
  // Layer 0: distant blue-green mountains
  {
    baseY: 0.35, speed: 3, amplitude: 0.08,
    freq1: 0.004, freq2: 0.009, freq3: 0.002,
    amp1: 0.6, amp2: 0.25, amp3: 0.15,
    lightColor: 0x7a9db5, darkColor: 0x3a5a6e,
    alpha: 0.7,
  },
  // Layer 1: blue-grey mid-mountains
  {
    baseY: 0.44, speed: 6, amplitude: 0.07,
    freq1: 0.005, freq2: 0.012, freq3: 0.003,
    amp1: 0.55, amp2: 0.3, amp3: 0.15,
    lightColor: 0x6a8a6e, darkColor: 0x3a5a42,
    alpha: 0.75,
  },
  // Layer 2: olive mid-ground
  {
    baseY: 0.53, speed: 10, amplitude: 0.06,
    freq1: 0.006, freq2: 0.015, freq3: 0.003,
    amp1: 0.5, amp2: 0.3, amp3: 0.2,
    lightColor: 0x7a8a45, darkColor: 0x4a5a28,
    alpha: 0.8,
  },
  // Layer 3: green near hills
  {
    baseY: 0.62, speed: 16, amplitude: 0.05,
    freq1: 0.008, freq2: 0.018, freq3: 0.004,
    amp1: 0.5, amp2: 0.3, amp3: 0.2,
    lightColor: 0x5a7a30, darkColor: 0x354a1e,
    alpha: 0.85,
  },
  // Layer 4: dark foreground
  {
    baseY: 0.68, speed: 24, amplitude: 0.04,
    freq1: 0.01, freq2: 0.022, freq3: 0.005,
    amp1: 0.45, amp2: 0.35, amp3: 0.2,
    lightColor: 0x3a5520, darkColor: 0x1e2e12,
    alpha: 0.9,
  },
];

// Sky colors for different times of day (numeric RGB)
const SKY_DAWN_LIGHT    = 0xf0c060;
const SKY_DAWN_DARK     = 0x8a6830;
const SKY_DAY_LIGHT     = 0x87ceeb;
const SKY_DAY_DARK      = 0x2a4a6a;
const SKY_SUNSET_LIGHT  = 0xe07830;
const SKY_SUNSET_DARK   = 0x7a3a18;
const SKY_NIGHT_LIGHT   = 0x1a1a3a;
const SKY_NIGHT_DARK    = 0x0a0a1a;

// Pre-allocated state
let canvasW = 0;
let canvasH = 0;
const STEP = 4; // pixel step for hill profile (fewer points = better perf)
const MAX_POINTS = Math.ceil(360 / STEP) + 4; // max points per polygon (+bottom corners +margin)
const layerPoints: Point[][] = [];

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
  // Dawn: 6-8, Day: 9-17, Sunset: 17-20, Night: rest
  if (hour >= 6 && hour < 8) {
    const t = (hour - 6) / 2;
    const from = isDark ? SKY_NIGHT_DARK : SKY_NIGHT_LIGHT;
    const to = isDark ? SKY_DAWN_DARK : SKY_DAWN_LIGHT;
    return lerpColor(from, to, t);
  }
  if (hour >= 8 && hour < 9) {
    const t = hour - 8;
    const from = isDark ? SKY_DAWN_DARK : SKY_DAWN_LIGHT;
    const to = isDark ? SKY_DAY_DARK : SKY_DAY_LIGHT;
    return lerpColor(from, to, t);
  }
  if (hour >= 9 && hour < 17) {
    return isDark ? SKY_DAY_DARK : SKY_DAY_LIGHT;
  }
  if (hour >= 17 && hour < 20) {
    const t = (hour - 17) / 3;
    const from = isDark ? SKY_DAY_DARK : SKY_DAY_LIGHT;
    const to = isDark ? SKY_SUNSET_DARK : SKY_SUNSET_LIGHT;
    return lerpColor(from, to, t);
  }
  if (hour >= 20 && hour < 21) {
    const t = hour - 20;
    const from = isDark ? SKY_SUNSET_DARK : SKY_SUNSET_LIGHT;
    const to = isDark ? SKY_NIGHT_DARK : SKY_NIGHT_LIGHT;
    return lerpColor(from, to, t);
  }
  // Night
  return isDark ? SKY_NIGHT_DARK : SKY_NIGHT_LIGHT;
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    // Pre-allocate point arrays for each layer
    layerPoints.length = 0;
    for (let i = 0; i < LAYERS.length; i++) {
      const points: Point[] = [];
      for (let j = 0; j < MAX_POINTS; j++) {
        points.push({ x: 0, y: 0 });
      }
      layerPoints.push(points);
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const tSec = frame.time / 1000;
    const hour = api.context.time.hour();
    const isDark = api.context.display.isDarkMode();

    // Draw sky background
    const skyColor = getSkyColor(hour, isDark);
    api.brush.background(skyColor);

    // Draw each hill layer back to front
    for (let li = 0; li < LAYERS.length; li++) {
      const layer = LAYERS[li];
      const points = layerPoints[li];
      const offset = tSec * layer.speed;
      const baseYPx = canvasH * layer.baseY;
      const ampPx = canvasH * layer.amplitude;

      // Build hill profile points along x-axis
      let pointIndex = 0;
      for (let x = -STEP; x <= canvasW + STEP; x += STEP) {
        const xOff = x + offset;
        const h =
          Math.sin(xOff * layer.freq1) * layer.amp1 +
          Math.sin(xOff * layer.freq2 + 1.3) * layer.amp2 +
          Math.sin(xOff * layer.freq3 + 2.7) * layer.amp3;

        points[pointIndex].x = x;
        points[pointIndex].y = baseYPx - h * ampPx;
        pointIndex++;
      }

      // Close the polygon along the bottom
      points[pointIndex].x = canvasW + STEP;
      points[pointIndex].y = canvasH + 1;
      pointIndex++;
      points[pointIndex].x = -STEP;
      points[pointIndex].y = canvasH + 1;
      pointIndex++;

      // Draw the polygon using a slice of the pre-allocated array
      const color = isDark ? layer.darkColor : layer.lightColor;
      api.brush.polygon(points.slice(0, pointIndex), {
        fill: color,
        alpha: layer.alpha,
      });
    }
  },

  async teardown(): Promise<void> {
    canvasW = 0;
    canvasH = 0;
    layerPoints.length = 0;
  },
};

registerActor(actor);
export default actor;
