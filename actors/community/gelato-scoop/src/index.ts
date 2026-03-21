/**
 * Gelato Scoop — Foreground Actor
 *
 * A waffle cone with three colorful gelato scoops that stack one at a time
 * with grow-in animations, melting drips running down the scoops and cone.
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
  id: 'gelato-scoop',
  name: 'Gelato Scoop',
  description: 'Waffle cone with stacking gelato scoops and melting drips',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'italy', 'gelato', 'food', 'colorful'],
  createdAt: new Date('2026-03-21'),
  preferredDuration: 45,
  requiredContexts: ['display'],
};

// Colors
const CONE_BROWN = 0xc49450;
const CONE_LINE = 0x9a6e30;
const PISTACHIO = 0x8ab848;
const STRAWBERRY = 0xe86888;
const LEMON = 0xf0d848;
const HIGHLIGHT = 0xffffff;

// Scoop config
const SCOOP_COLORS = [PISTACHIO, STRAWBERRY, LEMON];
const SCOOP_COUNT = 3;
const SCOOP_RADIUS = 42;

// Drip pool
const MAX_DRIPS = 24;

interface Drip {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  length: number;
  color: number;
  alpha: number;
}

// Pre-allocated state
let canvasW = 0;
let canvasH = 0;
let coneTopY = 0;
let coneTipY = 0;
let coneCenterX = 0;
let coneHalfW = 0;
let scoopCentersX: number[] = [];
let scoopCentersY: number[] = [];
let scoopScales: number[] = [];
let scoopAppearTimes: number[] = [];
let drips: Drip[] = [];
let nextDripTime = 0;
let crosshatchLines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

function clampToConeBounds(x: number, y: number): number {
  // Linearly interpolate cone width at given y
  const t = (y - coneTopY) / (coneTipY - coneTopY);
  const halfW = coneHalfW * (1 - t);
  return Math.max(coneCenterX - halfW, Math.min(coneCenterX + halfW, x));
}

function buildCrosshatch(): void {
  crosshatchLines = [];
  const spacing = 10;
  const top = coneTopY;
  const bot = coneTipY;
  const height = bot - top;

  // Diagonal lines going right-down
  for (let offset = -height; offset < coneHalfW * 2 + height; offset += spacing) {
    const x1Start = coneCenterX - coneHalfW + offset;
    const y1Start = top;
    const x2Start = x1Start + height * 0.4;
    const y2Start = bot;

    // Clip to cone shape
    const clips: Array<{ x: number; y: number }> = [];
    for (let step = 0; step <= 10; step++) {
      const t = step / 10;
      const lx = x1Start + (x2Start - x1Start) * t;
      const ly = y1Start + (y2Start - y1Start) * t;
      const clamped = clampToConeBounds(lx, ly);
      if (Math.abs(clamped - lx) < 1) {
        clips.push({ x: lx, y: ly });
      }
    }
    if (clips.length >= 2) {
      crosshatchLines.push({
        x1: clips[0].x, y1: clips[0].y,
        x2: clips[clips.length - 1].x, y2: clips[clips.length - 1].y,
      });
    }
  }

  // Diagonal lines going left-down
  for (let offset = -height; offset < coneHalfW * 2 + height; offset += spacing) {
    const x1Start = coneCenterX + coneHalfW - offset;
    const y1Start = top;
    const x2Start = x1Start - height * 0.4;
    const y2Start = bot;

    const clips: Array<{ x: number; y: number }> = [];
    for (let step = 0; step <= 10; step++) {
      const t = step / 10;
      const lx = x1Start + (x2Start - x1Start) * t;
      const ly = y1Start + (y2Start - y1Start) * t;
      const clamped = clampToConeBounds(lx, ly);
      if (Math.abs(clamped - lx) < 1) {
        clips.push({ x: lx, y: ly });
      }
    }
    if (clips.length >= 2) {
      crosshatchLines.push({
        x1: clips[0].x, y1: clips[0].y,
        x2: clips[clips.length - 1].x, y2: clips[clips.length - 1].y,
      });
    }
  }
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    // Position the cone in the lower portion of the canvas
    coneCenterX = canvasW / 2;
    coneTopY = canvasH * 0.55;
    coneTipY = canvasH * 0.92;
    coneHalfW = 52;

    // Pre-compute scoop positions (stacking upward from cone top)
    scoopCentersX = [];
    scoopCentersY = [];
    scoopScales = [];
    scoopAppearTimes = [];

    for (let i = 0; i < SCOOP_COUNT; i++) {
      scoopCentersX.push(coneCenterX + (i === 1 ? -6 : i === 2 ? 4 : 0));
      scoopCentersY.push(coneTopY - SCOOP_RADIUS * 0.7 - i * SCOOP_RADIUS * 1.3);
      scoopScales.push(0);
      scoopAppearTimes.push(1500 + i * 1800);
    }

    // Pre-allocate drips
    drips = [];
    for (let i = 0; i < MAX_DRIPS; i++) {
      drips.push({ active: false, x: 0, y: 0, vy: 0, length: 0, color: 0, alpha: 0 });
    }
    nextDripTime = 3000;

    // Pre-compute crosshatch pattern
    buildCrosshatch();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time;
    const tSec = t / 1000;
    const dt = Math.min(frame.deltaTime, 32) / 16;
    const isDark = api.context.display.isDarkMode();

    const coneAlpha = isDark ? 0.85 : 0.9;

    // --- Draw cone (triangle) ---
    api.brush.polygon(
      [
        { x: coneCenterX - coneHalfW, y: coneTopY },
        { x: coneCenterX + coneHalfW, y: coneTopY },
        { x: coneCenterX, y: coneTipY },
      ],
      {
        fill: CONE_BROWN,
        alpha: coneAlpha,
        blendMode: 'normal',
      },
    );

    // Crosshatch pattern on cone
    for (let i = 0; i < crosshatchLines.length; i++) {
      const cl = crosshatchLines[i];
      api.brush.line(cl.x1, cl.y1, cl.x2, cl.y2, {
        color: CONE_LINE,
        width: 1,
        alpha: 0.6,
        blendMode: 'normal',
      });
    }

    // --- Animate and draw scoops ---
    for (let i = 0; i < SCOOP_COUNT; i++) {
      const elapsed = t - scoopAppearTimes[i];
      if (elapsed < 0) continue;

      // Grow-in: ease-out elastic-ish curve
      const growT = Math.min(elapsed / 800, 1);
      const eased = growT < 1
        ? 1 - Math.pow(1 - growT, 3) + Math.sin(growT * Math.PI) * 0.08
        : 1;
      scoopScales[i] = eased;

      const cx = scoopCentersX[i];
      const cy = scoopCentersY[i];
      const r = SCOOP_RADIUS * scoopScales[i];

      if (r < 1) continue;

      // Main scoop body
      api.brush.circle(cx, cy, r, {
        fill: SCOOP_COLORS[i],
        alpha: 0.9,
        blendMode: 'normal',
      });

      // Highlight ellipse (light reflection)
      api.brush.ellipse(cx - r * 0.25, cy - r * 0.3, r * 0.55, r * 0.3, {
        fill: HIGHLIGHT,
        alpha: 0.2,
        blendMode: 'add',
      });

      // Subtle wobble on the scoop surface
      const wobbleX = Math.sin(tSec * 1.2 + i * 2) * 2;
      api.brush.ellipse(cx + wobbleX, cy + r * 0.15, r * 0.7, r * 0.2, {
        fill: SCOOP_COLORS[i],
        alpha: 0.6,
        blendMode: 'normal',
      });
    }

    // --- Spawn drips ---
    if (t > nextDripTime && scoopScales[0] > 0.5) {
      for (let i = 0; i < MAX_DRIPS; i++) {
        if (!drips[i].active) {
          // Pick a random scoop that is visible
          const scoopIdx = Math.floor(Math.random() * SCOOP_COUNT);
          if (scoopScales[scoopIdx] < 0.8) continue;

          const scx = scoopCentersX[scoopIdx];
          const scy = scoopCentersY[scoopIdx];
          const sr = SCOOP_RADIUS * scoopScales[scoopIdx];
          const angle = Math.PI * 0.3 + Math.random() * Math.PI * 0.4;

          drips[i].active = true;
          drips[i].x = scx + Math.cos(angle) * sr * 0.9;
          drips[i].y = scy + Math.sin(angle) * sr * 0.7;
          drips[i].vy = 0.3 + Math.random() * 0.4;
          drips[i].length = 4 + Math.random() * 8;
          drips[i].color = SCOOP_COLORS[scoopIdx];
          drips[i].alpha = 0.8;
          break;
        }
      }
      nextDripTime = t + 600 + Math.random() * 1200;
    }

    // --- Update and draw drips ---
    for (let i = 0; i < MAX_DRIPS; i++) {
      const d = drips[i];
      if (!d.active) continue;

      // Slow gravity
      d.vy += 0.015 * dt;
      d.y += d.vy * dt;
      d.length = Math.min(d.length + 0.1 * dt, 18);

      // Fade out as they fall past the cone tip
      if (d.y > coneTipY) {
        d.alpha -= 0.03 * dt;
      }

      if (d.alpha < 0.05 || d.y > canvasH) {
        d.active = false;
        continue;
      }

      // Draw drip: small circle elongating downward
      api.brush.ellipse(d.x, d.y, 3, d.length * 0.5, {
        fill: d.color,
        alpha: d.alpha,
        blendMode: 'normal',
      });

      // Round tip at bottom of drip
      api.brush.circle(d.x, d.y + d.length * 0.4, 2.5, {
        fill: d.color,
        alpha: d.alpha * 0.9,
        blendMode: 'normal',
      });
    }
  },

  async teardown(): Promise<void> {
    drips = [];
    scoopCentersX = [];
    scoopCentersY = [];
    scoopScales = [];
    scoopAppearTimes = [];
    crosshatchLines = [];
    canvasW = 0;
    canvasH = 0;
  },
};

registerActor(actor);
export default actor;
