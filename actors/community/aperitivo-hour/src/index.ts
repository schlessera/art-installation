/**
 * Aperitivo Hour — Background Actor
 *
 * Warm sunset gradient sky with Italian rooftop silhouettes.
 * The gradient slowly shifts over time, animating the sunset
 * through peach, coral, deep orange, and purple tones.
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
  id: 'aperitivo-hour',
  name: 'Aperitivo Hour',
  description: 'Warm sunset gradient sky with Italian rooftop silhouettes that slowly shifts through golden hour colors',
  author: {
    name: 'Joost de Valk',
    github: 'jdevalk',
  },
  version: '1.0.0',
  tags: ['background', 'italy', 'sunset', 'skyline', 'aperitivo'],
  createdAt: new Date('2026-03-20'),
  preferredDuration: 60,
  role: 'background',
  requiredContexts: ['display'],
};

// --- Color palettes ---
// Each palette defines colors from top of sky to horizon
// Light mode: vivid warm sunset
const LIGHT_PALETTE = [
  0x2d1b4e, // deep purple (top)
  0x5c2d6e, // purple
  0x8b3a62, // mauve
  0xc4514a, // deep coral
  0xe8734a, // burnt orange
  0xf4975a, // warm orange
  0xfabb6e, // peach-orange
  0xfdd89b, // pale peach (horizon)
];

// Dark mode: deeper, moodier sunset
const DARK_PALETTE = [
  0x120a24, // very deep purple (top)
  0x2a1540, // dark purple
  0x4e1f3e, // dark mauve
  0x7a2e38, // dark coral
  0xa04030, // dark burnt orange
  0xb85a3a, // muted orange
  0xcc7744, // dusty orange
  0xd99955, // muted peach (horizon)
];

// Silhouette color
const SILHOUETTE_LIGHT = 0x1a0e2e;
const SILHOUETTE_DARK = 0x080410;

// Number of horizontal strips for the gradient
const SKY_STRIPS = 40;

// --- Pre-allocated state ---
let canvasW = 0;
let canvasH = 0;
let skylineY = 0; // y-position where rooftops start
let phase = 0;    // animation phase for color shifting

// Pre-allocated rooftop geometry
interface RoofSegment {
  x: number;
  y: number;
  w: number;
  h: number;
  type: number; // 0=flat, 1=angled, 2=chimney-base, 3=dome
}

const MAX_SEGMENTS = 30;
const roofSegments: RoofSegment[] = [];

// Pre-allocated strip color
let stripColors: number[] = [];

// --- Helper: interpolate between two RGB colors ---
function lerpColor(c1: number, c2: number, t: number): number {
  const r1 = (c1 >> 16) & 0xff;
  const g1 = (c1 >> 8) & 0xff;
  const b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff;
  const g2 = (c2 >> 8) & 0xff;
  const b2 = c2 & 0xff;
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return (r << 16) | (g << 8) | b;
}

// --- Helper: sample a palette at a continuous position ---
function samplePalette(palette: number[], t: number): number {
  const idx = t * (palette.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, palette.length - 1);
  const frac = idx - lo;
  return lerpColor(palette[lo], palette[hi], frac);
}

// --- Generate rooftop silhouette geometry ---
function generateRooftops(): void {
  roofSegments.length = 0;

  let x = -10;
  let segIdx = 0;

  while (x < canvasW + 10 && segIdx < MAX_SEGMENTS) {
    const w = 20 + Math.random() * 40;
    const h = 15 + Math.random() * 45;
    const type = Math.random();

    let roofType: number;
    if (type < 0.35) {
      roofType = 0; // flat roof
    } else if (type < 0.7) {
      roofType = 1; // angled roof
    } else if (type < 0.88) {
      roofType = 2; // chimney on flat roof
    } else {
      roofType = 3; // dome (church)
    }

    roofSegments.push({ x, y: skylineY, w, h, type: roofType });
    segIdx++;
    x += w + Math.random() * 8 - 2;
  }
}

// --- Draw sky gradient using horizontal strips ---
function drawSky(api: ActorUpdateAPI, palette: number[], shift: number): void {
  const stripH = Math.ceil(skylineY / SKY_STRIPS) + 1;

  for (let i = 0; i < SKY_STRIPS; i++) {
    // Position within the sky (0 = top, 1 = horizon)
    const t = i / (SKY_STRIPS - 1);

    // Shift the palette sampling to animate the sunset
    // shift moves the sampling window so colors evolve over time
    const shifted = Math.min(1, Math.max(0, t + shift * 0.15));
    const color = samplePalette(palette, shifted);

    const y = Math.floor(t * skylineY);
    stripColors[i] = color;

    api.brush.rect(0, y, canvasW, stripH, {
      fill: color,
      alpha: 1.0,
      blendMode: 'normal',
    });
  }
}

// --- Draw rooftop silhouettes ---
function drawRooftops(api: ActorUpdateAPI, silColor: number): void {
  for (let i = 0; i < roofSegments.length; i++) {
    const seg = roofSegments[i];
    const baseY = seg.y;
    const topY = baseY - seg.h;

    // Main building body: always fill from top of roof to bottom of canvas
    api.brush.rect(seg.x, topY, seg.w, canvasH - topY, {
      fill: silColor,
      alpha: 1.0,
      blendMode: 'normal',
    });

    if (seg.type === 1) {
      // Angled roof: triangle on top
      const peakX = seg.x + seg.w * 0.5;
      const peakY = topY - seg.h * 0.35;
      api.brush.polygon([
        { x: seg.x - 2, y: topY },
        { x: peakX, y: peakY },
        { x: seg.x + seg.w + 2, y: topY },
      ], {
        fill: silColor,
        alpha: 1.0,
        blendMode: 'normal',
      });
    } else if (seg.type === 2) {
      // Chimney on flat roof
      const chimW = 5 + Math.random() * 3;
      const chimH = 10 + Math.random() * 8;
      const chimX = seg.x + seg.w * 0.7;
      api.brush.rect(chimX, topY - chimH, chimW, chimH, {
        fill: silColor,
        alpha: 1.0,
        blendMode: 'normal',
      });
    } else if (seg.type === 3) {
      // Church dome
      const domeR = seg.w * 0.4;
      const domeCX = seg.x + seg.w * 0.5;
      const domeCY = topY;

      // Semi-circle dome using an ellipse clipped by a rect on top
      api.brush.ellipse(domeCX, domeCY, domeR, domeR * 0.8, {
        fill: silColor,
        alpha: 1.0,
        blendMode: 'normal',
      });

      // Cross on top of dome
      const crossX = domeCX;
      const crossY = domeCY - domeR * 0.8;
      api.brush.rect(crossX - 1, crossY - 8, 2, 10, {
        fill: silColor,
        alpha: 1.0,
        blendMode: 'normal',
      });
      api.brush.rect(crossX - 4, crossY - 5, 8, 2, {
        fill: silColor,
        alpha: 1.0,
        blendMode: 'normal',
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

    // Rooftops occupy the bottom ~25% of the canvas
    skylineY = canvasH * 0.75;
    phase = 0;

    // Pre-allocate strip colors array
    stripColors = new Array(SKY_STRIPS);
    for (let i = 0; i < SKY_STRIPS; i++) {
      stripColors[i] = 0;
    }

    // Generate the rooftop geometry once
    generateRooftops();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const tSec = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();

    // Slowly oscillate the phase to animate the sunset shifting
    // Full cycle over ~60 seconds
    phase = Math.sin(tSec * 0.105) * 0.5 + 0.5; // 0..1

    // Choose palette based on dark mode
    const palette = isDark ? DARK_PALETTE : LIGHT_PALETTE;
    const silColor = isDark ? SILHOUETTE_DARK : SILHOUETTE_LIGHT;

    // Fill base background
    api.brush.background(palette[0]);

    // Draw gradient sky
    drawSky(api, palette, phase);

    // Fill area below skyline with silhouette color
    api.brush.rect(0, skylineY, canvasW, canvasH - skylineY, {
      fill: silColor,
      alpha: 1.0,
      blendMode: 'normal',
    });

    // Draw rooftop silhouettes
    drawRooftops(api, silColor);

    // Subtle warm glow near the horizon
    const glowY = skylineY - 30;
    const horizonColor = samplePalette(palette, 0.85 + phase * 0.1);
    api.brush.rect(0, glowY, canvasW, 60, {
      fill: horizonColor,
      alpha: 0.15,
      blendMode: 'add',
    });
  },

  async teardown(): Promise<void> {
    canvasW = 0;
    canvasH = 0;
    skylineY = 0;
    phase = 0;
    roofSegments.length = 0;
    stripColors = [];
  },
};

registerActor(actor);
export default actor;
