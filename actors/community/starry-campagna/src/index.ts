/**
 * Starry Campagna — Background Actor
 *
 * Night sky over flat Roman countryside with slowly rotating stars,
 * a faint Milky Way band, twinkling star field, and dark landscape
 * silhouette with a lone tree on the horizon.
 *
 * Canvas: 360x640 portrait (Pixi.js)
 */

import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

// ── Metadata ────────────────────────────────────────────────

const metadata: ActorMetadata = {
  id: 'starry-campagna',
  name: 'Starry Campagna',
  description:
    'Night sky over flat Roman countryside with slowly rotating stars and a faint Milky Way suggestion.',
  author: {
    name: 'Joost de Valk',
    github: 'jdevalk',
  },
  version: '1.0.0',
  tags: ['background', 'italy', 'night', 'stars', 'countryside'],
  createdAt: new Date('2026-03-21'),
  preferredDuration: 60,
  role: 'background',
  requiredContexts: ['display'],
};

// ── Constants ───────────────────────────────────────────────

const STAR_COUNT = 70;
const BRIGHT_STAR_COUNT = 6;
const MILKY_WAY_DOTS = 40;
const SKY_STRIPS = 16;

// Sky gradient top-to-bottom
const SKY_TOP = 0x050510;
const SKY_BOTTOM = 0x101830;

// Landscape
const LAND_COLOR = 0x0a1a0a;
const TREE_COLOR = 0x071207;

// Celestial pole position (fraction of canvas)
const POLE_X = 0.7;
const POLE_Y = 0.15;
const ROTATION_SPEED = 0.0001; // radians per second — barely perceptible

// ── Pre-allocated state ─────────────────────────────────────

interface Star {
  // Position relative to celestial pole (polar coords)
  angle: number;
  dist: number;
  radius: number;
  twinklePhase: number;
  twinkleSpeed: number;
  color: number;
  bright: number; // 1 = bright star with glow, 0 = normal
}

interface MilkyDot {
  angle: number;
  dist: number;
  radius: number;
  alpha: number;
}

interface LandPoint {
  xFrac: number; // fraction 0-1
  yFrac: number; // fraction 0-1 from bottom
}

let canvasW = 0;
let canvasH = 0;
let stars: Star[] = [];
let milkyDots: MilkyDot[] = [];
let landProfile: LandPoint[] = [];
let rotationOffset = 0;
let poleXPx = 0;
let poleYPx = 0;

// Pre-computed sky strip colors
const skyColors: number[] = new Array(SKY_STRIPS);

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

// ── Actor ───────────────────────────────────────────────────

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    poleXPx = canvasW * POLE_X;
    poleYPx = canvasH * POLE_Y;

    // Pre-compute sky gradient colors
    for (let i = 0; i < SKY_STRIPS; i++) {
      skyColors[i] = lerpColor(SKY_TOP, SKY_BOTTOM, i / (SKY_STRIPS - 1));
    }

    // Pre-allocate stars in polar coordinates around celestial pole
    stars = new Array(STAR_COUNT);
    const maxDist = Math.max(canvasW, canvasH) * 0.9;
    for (let i = 0; i < STAR_COUNT; i++) {
      const isBright = i < BRIGHT_STAR_COUNT ? 1 : 0;
      stars[i] = {
        angle: Math.random() * Math.PI * 2,
        dist: 20 + Math.random() * maxDist,
        radius: isBright ? 2 + Math.random() * 1.5 : 0.8 + Math.random() * 1.2,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: 1.0 + Math.random() * 2.0,
        color: isBright
          ? (Math.random() > 0.5 ? 0xaaccff : 0xffddaa)
          : 0xffffff,
        bright: isBright,
      };
    }

    // Pre-allocate Milky Way dots — diagonal band
    milkyDots = new Array(MILKY_WAY_DOTS);
    for (let i = 0; i < MILKY_WAY_DOTS; i++) {
      // Place along a diagonal from upper-left to lower-right area
      const t = Math.random();
      const bandCenterAngle = -Math.PI * 0.3 + t * Math.PI * 0.1;
      const bandDist = 80 + Math.random() * (maxDist * 0.7);
      milkyDots[i] = {
        angle: bandCenterAngle + (Math.random() - 0.5) * 0.4,
        dist: bandDist,
        radius: 1.5 + Math.random() * 2.5,
        alpha: 0.08 + Math.random() * 0.1,
      };
    }

    // Build landscape profile — gentle rolling fields
    landProfile = [];
    const segments = 20;
    for (let i = 0; i <= segments; i++) {
      const xFrac = i / segments;
      // Gentle hills using layered sines
      const yFrac =
        0.12 +
        Math.sin(xFrac * Math.PI * 2.5) * 0.015 +
        Math.sin(xFrac * Math.PI * 5.0 + 1.0) * 0.008 +
        Math.sin(xFrac * Math.PI * 1.2 + 0.5) * 0.01;
      landProfile.push({ xFrac, yFrac });
    }

    rotationOffset = 0;
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const tSec = frame.time / 1000;
    const dt = frame.deltaTime / 1000;
    const _isDark = api.context.display.isDarkMode();

    // Update rotation
    rotationOffset += ROTATION_SPEED * dt * 60;

    // ── Draw sky gradient (horizontal strips) ─────────────
    const stripH = Math.ceil(canvasH * 0.88 / SKY_STRIPS) + 1;
    for (let i = 0; i < SKY_STRIPS; i++) {
      api.brush.rect(0, i * stripH, canvasW, stripH + 1, {
        fill: skyColors[i],
        alpha: 1.0,
        blendMode: 'normal',
      });
    }

    // Fill any remaining area below gradient strips (before landscape)
    const gradientBottom = SKY_STRIPS * stripH;
    if (gradientBottom < canvasH) {
      api.brush.rect(0, gradientBottom, canvasW, canvasH - gradientBottom + 1, {
        fill: SKY_BOTTOM,
        alpha: 1.0,
        blendMode: 'normal',
      });
    }

    // ── Draw Milky Way suggestion ─────────────────────────
    for (let i = 0; i < MILKY_WAY_DOTS; i++) {
      const dot = milkyDots[i];
      const a = dot.angle + rotationOffset;
      const dx = Math.cos(a) * dot.dist;
      const dy = Math.sin(a) * dot.dist;
      const sx = poleXPx + dx;
      const sy = poleYPx + dy;

      // Only draw if on screen
      if (sx > -10 && sx < canvasW + 10 && sy > -10 && sy < canvasH * 0.88) {
        api.brush.circle(sx, sy, dot.radius, {
          fill: 0x8899bb,
          alpha: dot.alpha,
          blendMode: 'add',
        });
      }
    }

    // ── Draw stars ────────────────────────────────────────
    for (let i = 0; i < STAR_COUNT; i++) {
      const star = stars[i];
      const a = star.angle + rotationOffset;
      const dx = Math.cos(a) * star.dist;
      const dy = Math.sin(a) * star.dist;
      const sx = poleXPx + dx;
      const sy = poleYPx + dy;

      // Skip stars off screen or below landscape line
      if (sx < -5 || sx > canvasW + 5 || sy < -5 || sy > canvasH * 0.86) {
        continue;
      }

      // Twinkle via sine wave
      const twinkle = Math.sin(tSec * star.twinkleSpeed + star.twinklePhase);
      const alpha = 0.6 + twinkle * 0.3;

      api.brush.circle(sx, sy, star.radius, {
        fill: star.color,
        alpha,
        blendMode: 'normal',
      });

      // Bright stars get an additive glow
      if (star.bright === 1) {
        api.brush.circle(sx, sy, star.radius * 3, {
          fill: star.color,
          alpha: 0.15 + twinkle * 0.08,
          blendMode: 'add',
        });
      }
    }

    // ── Draw landscape silhouette ─────────────────────────
    // Draw as overlapping rects per segment (polygon not needed for silhouette)
    const landBaseY = canvasH * 0.88;
    const segW = Math.ceil(canvasW / (landProfile.length - 1)) + 1;

    for (let i = 0; i < landProfile.length - 1; i++) {
      const p = landProfile[i];
      const hillY = landBaseY - p.yFrac * canvasH;
      const x = p.xFrac * canvasW;
      const rectH = canvasH - hillY + 1;
      api.brush.rect(x, hillY, segW, rectH, {
        fill: LAND_COLOR,
        alpha: 1.0,
        blendMode: 'normal',
      });
    }

    // ── Draw lone tree silhouette on horizon ──────────────
    const treeX = canvasW * 0.3;
    const treeBaseY = landBaseY - landProfile[6].yFrac * canvasH;

    // Trunk
    api.brush.rect(treeX - 2, treeBaseY - 28, 4, 28, {
      fill: TREE_COLOR,
      alpha: 1.0,
      blendMode: 'normal',
    });

    // Canopy — three overlapping circles
    api.brush.circle(treeX, treeBaseY - 34, 10, {
      fill: TREE_COLOR,
      alpha: 1.0,
      blendMode: 'normal',
    });
    api.brush.circle(treeX - 7, treeBaseY - 28, 8, {
      fill: TREE_COLOR,
      alpha: 1.0,
      blendMode: 'normal',
    });
    api.brush.circle(treeX + 7, treeBaseY - 28, 8, {
      fill: TREE_COLOR,
      alpha: 1.0,
      blendMode: 'normal',
    });

    // ── Small farmhouse silhouette ────────────────────────
    const houseX = canvasW * 0.72;
    const houseBaseY = landBaseY - landProfile[14].yFrac * canvasH;

    // Walls
    api.brush.rect(houseX - 10, houseBaseY - 14, 20, 14, {
      fill: TREE_COLOR,
      alpha: 1.0,
      blendMode: 'normal',
    });

    // Roof (triangle approximation with two rects)
    api.brush.rect(houseX - 12, houseBaseY - 18, 24, 5, {
      fill: TREE_COLOR,
      alpha: 1.0,
      blendMode: 'normal',
    });
    api.brush.rect(houseX - 8, houseBaseY - 21, 16, 4, {
      fill: TREE_COLOR,
      alpha: 1.0,
      blendMode: 'normal',
    });
    api.brush.rect(houseX - 4, houseBaseY - 23, 8, 3, {
      fill: TREE_COLOR,
      alpha: 1.0,
      blendMode: 'normal',
    });
  },

  async teardown(): Promise<void> {
    stars = [];
    milkyDots = [];
    landProfile = [];
    canvasW = 0;
    canvasH = 0;
    rotationOffset = 0;
  },

  onContextChange(_context): void {
    // Display mode changes are read each frame
  },
};

registerActor(actor);
export default actor;
