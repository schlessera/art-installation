/**
 * Dutch Master
 *
 * A procedurally generated Dutch Golden Age landscape inspired by
 * Jacob van Ruisdael, Johannes Vermeer, and Aelbert Cuyp.
 * The horizon features Europapark-inspired silhouettes — roller coaster
 * arcs, towers, and spires — rendered as if painted by a 17th-century master.
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
  id: 'dutch-master',
  name: 'Dutch Master',
  description:
    'A Dutch Golden Age landscape with Europapark silhouettes — dramatic skies, golden light, and shimmering water in the style of Ruisdael and Cuyp',
  author: {
    name: 'Taco Verdonschot',
    github: 'tacoverdonschot',
  },
  version: '1.0.0',
  tags: ['landscape', 'dutch', 'golden-age', 'europapark', 'atmospheric'],
  createdAt: new Date('2026-03-20'),
  preferredDuration: 60,
  requiredContexts: ['display'],
};

// ============================================================
// CONSTANTS
// ============================================================

const MAX_CLOUDS = 10;
const MAX_PUFFS = 6;
const MAX_SHIMMER = 25;
const MAX_RAYS = 6;
const MAX_REEDS = 20;
const HORIZON_POINTS = 32;

// ============================================================
// PRE-ALLOCATED STATE
// ============================================================

interface CloudPuff {
  ox: number;       // offset from cloud center
  oy: number;
  w: number;
  h: number;
  layer: number;    // 0=shadow base, 1=mid, 2=highlight top
}

interface Cloud {
  x: number;
  y: number;
  baseY: number;
  scale: number;    // overall size multiplier
  alpha: number;
  speed: number;
  puffCount: number;
  puffs: CloudPuff[];
  nearHorizon: boolean;
}

interface Shimmer {
  x: number;
  y: number;
  width: number;
  alpha: number;
  speed: number;
  phase: number;
}

interface Reed {
  x: number;
  height: number;
  phase: number;
  sway: number;
}

let clouds: Cloud[] = [];
let shimmers: Shimmer[] = [];
let reeds: Reed[] = [];
let horizonPts: { x: number; y: number }[] = [];
let horizonCount = 0;

let W = 0;
let H = 0;
let horizY = 0;
let sunX = 0;
let sunY = 0;

// Reusable style objects to avoid allocations in update()
const skyStyle = {
  fill: {
    type: 'linear' as const,
    x0: 0.5,
    y0: 0,
    x1: 0.5,
    y1: 1,
    stops: [
      { offset: 0, color: 0x1a3050 },
      { offset: 0.4, color: 0x3a5570 },
      { offset: 0.7, color: 0x8a6a40 },
      { offset: 0.85, color: 0xc49030 },
      { offset: 1, color: 0xd4a040 },
    ],
  },
  alpha: 1,
};

const waterStyle = {
  fill: {
    type: 'linear' as const,
    x0: 0.5,
    y0: 0,
    x1: 0.5,
    y1: 1,
    stops: [
      { offset: 0, color: 0x2a3a30 },
      { offset: 0.3, color: 0x1a2a28 },
      { offset: 1, color: 0x101a18 },
    ],
  },
  alpha: 1,
};

const reflectionStyle = {
  fill: {
    type: 'linear' as const,
    x0: 0.5,
    y0: 0,
    x1: 0.5,
    y1: 1,
    stops: [
      { offset: 0, color: 0xd4a040 },
      { offset: 0.5, color: 0x8a6020 },
      { offset: 1, color: 0x2a1a08 },
    ],
  },
  alpha: 0.4,
  blendMode: 'add' as const,
};

// ============================================================
// HORIZON BUILDER
// ============================================================

function buildHorizon() {
  let i = 0;
  const add = (xFrac: number, yOff: number) => {
    if (i < HORIZON_POINTS) {
      horizonPts[i].x = xFrac * W;
      horizonPts[i].y = horizY + yOff;
      i++;
    }
  };

  // Bottom-left corner
  add(0, 120);
  add(0, 5);

  // Gentle terrain with tree clusters
  add(0.05, 2);
  add(0.09, -8);
  add(0.13, -14);
  add(0.16, -6);
  add(0.19, 0);

  // Tree cluster
  add(0.23, -4);
  add(0.26, -16);
  add(0.29, -20);
  add(0.31, -10);

  // Roller coaster base (Silver Star) — keep silhouette low, track drawn separately
  add(0.34, -5);
  add(0.37, -10);
  add(0.41, -12);
  add(0.45, -10);
  add(0.48, -5);

  // Valley before tower
  add(0.51, -4);

  // Euro-Tower spire
  add(0.54, -8);
  add(0.555, -55);
  add(0.57, -8);

  // Low terrain
  add(0.60, -3);

  // Windmill structure
  add(0.63, -8);
  add(0.65, -22);
  add(0.67, -38);
  add(0.69, -22);
  add(0.71, -5);

  // Trees near sun
  add(0.76, -10);
  add(0.80, -16);
  add(0.84, -10);
  add(0.88, -3);
  add(0.94, 0);
  add(1, 5);

  // Bottom-right corner
  add(1, 120);

  horizonCount = i;
}

// ============================================================
// DRAW HELPERS
// ============================================================

function drawSky(api: ActorUpdateAPI, isDark: boolean) {
  if (isDark) {
    skyStyle.fill.stops[0].color = 0x0a1628;
    skyStyle.fill.stops[1].color = 0x1a2a48;
    skyStyle.fill.stops[2].color = 0x4a3a28;
    skyStyle.fill.stops[3].color = 0x6a4a20;
    skyStyle.fill.stops[4].color = 0x7a5520;
  } else {
    skyStyle.fill.stops[0].color = 0x1a3050;
    skyStyle.fill.stops[1].color = 0x3a5570;
    skyStyle.fill.stops[2].color = 0x8a6a40;
    skyStyle.fill.stops[3].color = 0xc49030;
    skyStyle.fill.stops[4].color = 0xd4a040;
  }
  api.brush.rect(0, 0, W, horizY + 10, skyStyle);
}

function drawSun(api: ActorUpdateAPI, t: number, isDark: boolean) {
  const pulse = 1 + Math.sin(t * 0.3) * 0.05;
  const outerR = W * 0.35 * pulse;

  // Outer glow
  api.brush.circle(sunX, sunY, outerR, {
    fill: {
      type: 'radial',
      cx: 0.5,
      cy: 0.5,
      radius: 0.5,
      stops: [
        { offset: 0, color: isDark ? 0xc49030 : 0xd4a840 },
        { offset: 0.3, color: isDark ? 0x8a6020 : 0xc49030 },
        { offset: 1, color: isDark ? 0x3a2a10 : 0x8a6a30 },
      ],
    },
    alpha: isDark ? 0.4 : 0.5,
    blendMode: 'add',
  });

  // Inner disc
  api.brush.circle(sunX, sunY, W * 0.06, {
    fill: {
      type: 'radial',
      cx: 0.5,
      cy: 0.5,
      radius: 0.5,
      stops: [
        { offset: 0, color: 0xfff0c0 },
        { offset: 0.6, color: 0xddb040 },
        { offset: 1, color: 0xc49030 },
      ],
    },
    alpha: isDark ? 0.7 : 0.85,
    blendMode: 'add',
  });
}

function drawRays(api: ActorUpdateAPI, t: number, isDark: boolean) {
  const rayColor = isDark ? 0xc49030 : 0xd4a840;
  for (let i = 0; i < MAX_RAYS; i++) {
    const angle = -0.6 + (i / MAX_RAYS) * 1.2 + Math.sin(t * 0.1 + i) * 0.05;
    const len = H * 0.5;
    const ex = sunX + Math.cos(angle - Math.PI / 2) * len;
    const ey = sunY - Math.sin(angle - Math.PI / 2) * len * 0.3;
    const a = 0.06 + Math.sin(t * 0.2 + i * 1.5) * 0.03;
    if (a < 0.05) continue;
    api.brush.line(sunX, sunY, ex, ey, {
      color: rayColor,
      width: 3 + Math.sin(t * 0.15 + i) * 1.5,
      alpha: a,
      blendMode: 'add',
    });
  }
}

function drawClouds(api: ActorUpdateAPI, t: number, dt: number, isDark: boolean) {
  for (let i = 0; i < MAX_CLOUDS; i++) {
    const c = clouds[i];

    // Drift
    c.x += c.speed * dt * 0.003;
    const cloudSpan = 60 * c.scale;
    if (c.x > W + cloudSpan) c.x = -cloudSpan;
    c.y = c.baseY + Math.sin(t * 0.15 + i * 0.7) * (c.nearHorizon ? 1 : 3);

    // Warmth: how close to the sun (affects highlight color)
    const warmth = 1 - Math.min(Math.abs(c.x - sunX) / W, 1);

    // Color palette per layer
    // Shadow base: dark blue-gray / warm brown-gray
    const shadowR = isDark ? 30 + (warmth * 15) | 0 : 60 + (warmth * 25) | 0;
    const shadowG = isDark ? 25 + (warmth * 10) | 0 : 50 + (warmth * 15) | 0;
    const shadowB = isDark ? 35 : 65;
    const shadowCol = (shadowR << 16) | (shadowG << 8) | shadowB;

    // Mid tone: warm gray
    const midR = isDark ? 80 + (warmth * 30) | 0 : 140 + (warmth * 30) | 0;
    const midG = isDark ? 70 + (warmth * 20) | 0 : 125 + (warmth * 20) | 0;
    const midB = isDark ? 60 + (warmth * 10) | 0 : 105 + (warmth * 10) | 0;
    const midCol = (midR << 16) | (midG << 8) | midB;

    // Highlight: bright golden-white where sun catches
    const hiR = Math.min(255, isDark ? 180 + (warmth * 50) | 0 : 220 + (warmth * 35) | 0);
    const hiG = Math.min(255, isDark ? 160 + (warmth * 40) | 0 : 200 + (warmth * 30) | 0);
    const hiB = isDark ? 120 + (warmth * 20) | 0 : 160 + (warmth * 15) | 0;
    const hiCol = (hiR << 16) | (hiG << 8) | hiB;

    const s = c.scale;

    // Draw puffs back-to-front: shadows first, then mids, then highlights
    for (let layer = 0; layer < 3; layer++) {
      for (let p = 0; p < c.puffCount; p++) {
        const puff = c.puffs[p];
        if (puff.layer !== layer) continue;

        const px = c.x + puff.ox * s;
        const py = c.y + puff.oy * s;
        const pw = puff.w * s;
        const ph = puff.h * s;

        if (layer === 0) {
          // Shadow base — flat, dark, slightly translucent
          api.brush.ellipse(px, py, pw, ph, {
            fill: {
              type: 'radial',
              cx: 0.5, cy: 0.4, radius: 0.5,
              stops: [
                { offset: 0, color: midCol },
                { offset: 0.6, color: shadowCol },
                { offset: 1, color: shadowCol },
              ],
            },
            alpha: c.alpha * 0.8,
          });
        } else if (layer === 1) {
          // Mid body — the main volume, sun-side lit
          const gcx = 0.35 + warmth * 0.25; // gradient center shifts toward sun
          api.brush.ellipse(px, py, pw, ph, {
            fill: {
              type: 'radial',
              cx: gcx, cy: 0.35, radius: 0.5,
              stops: [
                { offset: 0, color: hiCol },
                { offset: 0.5, color: midCol },
                { offset: 1, color: shadowCol },
              ],
            },
            alpha: c.alpha * 0.9,
          });
        } else {
          // Highlight caps — bright sunlit tops
          api.brush.ellipse(px + warmth * 4 * s, py, pw, ph, {
            fill: {
              type: 'radial',
              cx: 0.5, cy: 0.45, radius: 0.5,
              stops: [
                { offset: 0, color: hiCol },
                { offset: 0.7, color: midCol },
                { offset: 1, color: midCol },
              ],
            },
            alpha: c.alpha,
          });
          // Bright edge highlight where sun catches the rim
          const rimAlpha = c.alpha * 0.35 * warmth;
          if (rimAlpha >= 0.05) {
            api.brush.ellipse(px + warmth * 6 * s, py - ph * 0.15, pw * 0.6, ph * 0.5, {
              fill: hiCol,
              alpha: rimAlpha,
              blendMode: 'add',
            });
          }
        }
      }
    }
  }
}

function drawLand(api: ActorUpdateAPI, isDark: boolean) {
  api.brush.polygon(horizonPts.slice(0, horizonCount), {
    fill: isDark ? 0x0a0804 : 0x1a1408,
    alpha: 1,
  });
}

function drawStructures(api: ActorUpdateAPI, t: number, isDark: boolean) {
  const col = isDark ? 0x080604 : 0x120e06;

  // Windmill sails at x=0.67
  const wmX = W * 0.67;
  const wmY = horizY - 38;
  api.brush.pushMatrix();
  api.brush.translate(wmX, wmY);
  api.brush.rotate(t * 0.3);
  for (let s = 0; s < 4; s++) {
    api.brush.pushMatrix();
    api.brush.rotate(s * Math.PI / 2);
    api.brush.rect(-1.5, 0, 3, 24, { fill: col, alpha: 0.9 });
    api.brush.popMatrix();
  }
  api.brush.popMatrix();

  // Tower window glows
  const twX = W * 0.555;
  api.brush.circle(twX, horizY - 30, 2, {
    fill: 0xd4a040,
    alpha: 0.5 + Math.sin(t * 0.5) * 0.2,
    blendMode: 'add',
  });
  api.brush.circle(twX, horizY - 40, 1.5, {
    fill: 0xd4a040,
    alpha: 0.4 + Math.sin(t * 0.7 + 1) * 0.2,
    blendMode: 'add',
  });

  // Roller coaster (Silver Star) — tall arc rising well above treeline
  const rcLeft = W * 0.33;
  const rcRight = W * 0.49;
  const rcPeakY = horizY - 75;
  const rcGroundY = horizY - 5;
  const rcCol = isDark ? 0x1a1810 : 0x2a2418;

  // Main rail
  api.brush.bezier(
    { x: rcLeft, y: rcGroundY },
    { x: rcLeft + W * 0.03, y: rcPeakY - 10 },
    { x: rcRight - W * 0.03, y: rcPeakY - 10 },
    { x: rcRight, y: rcGroundY },
    { color: rcCol, width: 3, alpha: 0.9 },
  );

  // Second rail (slightly inset for depth)
  api.brush.bezier(
    { x: rcLeft + 4, y: rcGroundY },
    { x: rcLeft + W * 0.03 + 3, y: rcPeakY - 5 },
    { x: rcRight - W * 0.03 - 3, y: rcPeakY - 5 },
    { x: rcRight - 4, y: rcGroundY },
    { color: rcCol, width: 2, alpha: 0.75 },
  );

  // Support struts from ground up to track
  const strutCount = 7;
  for (let s = 0; s < strutCount; s++) {
    const frac = (s + 0.5) / strutCount;
    const sx = rcLeft + (rcRight - rcLeft) * frac;
    const archHeight = Math.sin(frac * Math.PI);
    const trackY = rcGroundY - (rcGroundY - rcPeakY + 10) * archHeight;
    api.brush.line(sx, rcGroundY, sx, trackY, {
      color: rcCol,
      width: 2,
      alpha: 0.8,
    });
    // Cross-bracing on taller struts
    if (s > 0 && archHeight > 0.3) {
      const prevFrac = (s - 0.5) / strutCount;
      const prevX = rcLeft + (rcRight - rcLeft) * prevFrac;
      const prevArch = Math.sin(prevFrac * Math.PI);
      const prevTrackY = rcGroundY - (rcGroundY - rcPeakY + 10) * prevArch;
      const midY = rcGroundY - (rcGroundY - trackY) * 0.45;
      api.brush.line(prevX, prevTrackY, sx, midY, {
        color: rcCol,
        width: 1.5,
        alpha: 0.6,
      });
    }
  }
}

function drawWater(api: ActorUpdateAPI, t: number, isDark: boolean) {
  // Water base
  if (isDark) {
    waterStyle.fill.stops[0].color = 0x1a2a20;
    waterStyle.fill.stops[1].color = 0x0a1a18;
    waterStyle.fill.stops[2].color = 0x060e0c;
  } else {
    waterStyle.fill.stops[0].color = 0x2a3a30;
    waterStyle.fill.stops[1].color = 0x1a2a28;
    waterStyle.fill.stops[2].color = 0x101a18;
  }
  api.brush.rect(0, horizY, W, H - horizY, waterStyle);

  // Sun reflection column
  const reflW = W * 0.08;
  reflectionStyle.alpha = isDark ? 0.3 : 0.4;
  api.brush.rect(sunX - reflW / 2, horizY, reflW, H - horizY, reflectionStyle);

  // Shimmer lines
  for (let i = 0; i < MAX_SHIMMER; i++) {
    const s = shimmers[i];
    const wave = Math.sin(t * s.speed + s.phase);
    const sx = s.x + wave * 8;
    const a = s.alpha * (0.6 + wave * 0.4);
    if (a < 0.05) continue;

    const nearSun = Math.abs(sx - sunX) < W * 0.15;
    api.brush.line(sx, s.y, sx + s.width, s.y + wave * 2, {
      color: nearSun
        ? (isDark ? 0xc49030 : 0xd4a840)
        : (isDark ? 0x3a5a5a : 0x5a7a7a),
      width: 1.5,
      alpha: a,
      blendMode: nearSun ? 'add' : 'normal',
    });
  }
}

function drawReeds(api: ActorUpdateAPI, t: number, isDark: boolean) {
  const col = isDark ? 0x0a0804 : 0x1a1408;
  const headCol = isDark ? 0x1a1408 : 0x2a2010;

  for (let i = 0; i < MAX_REEDS; i++) {
    const r = reeds[i];
    const sway = Math.sin(t * 0.5 + r.phase) * r.sway;
    const tipX = r.x + sway;
    const tipY = H - r.height;

    api.brush.line(r.x, H, tipX, tipY, {
      color: col,
      width: 2,
      alpha: 0.8,
    });
    api.brush.ellipse(tipX, tipY - 3, 2, 4, {
      fill: headCol,
      alpha: 0.7,
    });
  }
}

// ============================================================
// ACTOR
// ============================================================

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI) {
    const size = api.canvas.getSize();
    W = size.width;
    H = size.height;
    horizY = H * 0.67;
    sunX = W * 0.72;
    sunY = horizY - H * 0.03;

    // Pre-allocate clouds as multi-puff clusters
    clouds = new Array(MAX_CLOUDS);
    for (let i = 0; i < MAX_CLOUDS; i++) {
      const nearHorizon = i < 3; // first few clouds hug the horizon (flat, hazy)
      const y = nearHorizon
        ? horizY * 0.7 + Math.random() * horizY * 0.2
        : H * 0.05 + Math.random() * horizY * 0.5;
      const scale = nearHorizon
        ? 0.6 + Math.random() * 0.4
        : 0.8 + Math.random() * 0.7;

      const puffs: CloudPuff[] = new Array(MAX_PUFFS);
      const puffCount = nearHorizon
        ? 3 + Math.floor(Math.random() * 2)
        : 4 + Math.floor(Math.random() * 3);

      for (let p = 0; p < MAX_PUFFS; p++) {
        if (p < puffCount) {
          const layer = p < 2 ? 0 : p < puffCount - 1 ? 1 : 2;
          // Shadow base puffs: wide, flat, lower
          // Mid puffs: medium, offset sideways for volume
          // Highlight puffs: smaller, high, on sun-facing side
          const baseSpreadX = nearHorizon ? 50 : 35;
          const baseSpreadY = nearHorizon ? 8 : 18;
          puffs[p] = {
            ox: (Math.random() - 0.5) * baseSpreadX * (layer === 0 ? 1.2 : layer === 1 ? 1 : 0.6),
            oy: layer === 0
              ? (Math.random() * 6)                    // base: slightly below center
              : layer === 1
                ? -(Math.random() * baseSpreadY * 0.6)   // mid: above center
                : -(baseSpreadY * 0.5 + Math.random() * baseSpreadY * 0.4), // top: highest
            w: layer === 0
              ? 28 + Math.random() * 22    // base: wide
              : layer === 1
                ? 20 + Math.random() * 18    // mid: medium
                : 14 + Math.random() * 12,   // top: compact
            h: layer === 0
              ? (nearHorizon ? 8 + Math.random() * 5 : 12 + Math.random() * 10)
              : layer === 1
                ? 14 + Math.random() * 10
                : 10 + Math.random() * 8,
            layer,
          };
        } else {
          puffs[p] = { ox: 0, oy: 0, w: 0, h: 0, layer: 0 };
        }
      }

      clouds[i] = {
        x: Math.random() * W * 1.5 - W * 0.25,
        y,
        baseY: y,
        scale,
        alpha: nearHorizon ? 0.3 + Math.random() * 0.2 : 0.5 + Math.random() * 0.4,
        speed: 0.2 + Math.random() * 0.6,
        puffCount: Math.min(puffCount, MAX_PUFFS),
        puffs,
        nearHorizon,
      };
    }

    // Pre-allocate water shimmer
    shimmers = new Array(MAX_SHIMMER);
    for (let i = 0; i < MAX_SHIMMER; i++) {
      shimmers[i] = {
        x: Math.random() * W,
        y: horizY + 10 + Math.random() * (H - horizY - 20),
        width: 15 + Math.random() * 40,
        alpha: 0.2 + Math.random() * 0.4,
        speed: 0.5 + Math.random() * 1.5,
        phase: Math.random() * Math.PI * 2,
      };
    }

    // Pre-allocate reeds
    reeds = new Array(MAX_REEDS);
    for (let i = 0; i < MAX_REEDS; i++) {
      reeds[i] = {
        x: Math.random() * W,
        height: 15 + Math.random() * 30,
        phase: Math.random() * Math.PI * 2,
        sway: 1.5 + Math.random() * 2.5,
      };
    }

    // Pre-allocate horizon points
    horizonPts = new Array(HORIZON_POINTS);
    for (let i = 0; i < HORIZON_POINTS; i++) {
      horizonPts[i] = { x: 0, y: 0 };
    }
    buildHorizon();
  },

  update(api: ActorUpdateAPI, frame: FrameContext) {
    const t = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();

    drawSky(api, isDark);
    drawSun(api, t, isDark);
    drawRays(api, t, isDark);
    drawClouds(api, t, frame.deltaTime, isDark);
    drawLand(api, isDark);
    drawStructures(api, t, isDark);
    drawWater(api, t, isDark);
    drawReeds(api, t, isDark);
  },

  async teardown() {
    clouds = [];
    shimmers = [];
    reeds = [];
    horizonPts = [];
    horizonCount = 0;
    W = 0;
    H = 0;
  },
};

registerActor(actor);
export default actor;
