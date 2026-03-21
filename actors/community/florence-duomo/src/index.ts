/**
 * Florence Duomo — Foreground Actor
 *
 * The iconic Cathedral of Santa Maria del Fiore with Brunelleschi's
 * octagonal dome, white marble lantern with gold cross, green/pink/white
 * marble facade bands, and the Campanile bell tower to one side.
 * Warm light pulses from the lantern with subtle atmospheric haze.
 *
 * Foreground actor for 360x640 portrait canvas.
 */

import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorMetadata,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';

// ============================================================
// METADATA
// ============================================================

const metadata: ActorMetadata = {
  id: 'florence-duomo',
  name: 'Florence Duomo',
  description:
    'Brunelleschi\'s iconic octagonal dome with terracotta tiles, white marble lantern, green/pink/white facade bands, and the Campanile bell tower',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'italy', 'florence', 'architecture', 'landmark'],
  createdAt: new Date('2026-03-21'),
  role: 'foreground',
  preferredDuration: 60,
  requiredContexts: ['display'],
};

// ============================================================
// CONSTANTS
// ============================================================

// Terracotta dome colors
const COL_TERRA_BASE = 0xc85a30;
const COL_TERRA_DARK = 0xa84a28;
const COL_TERRA_LIGHT = 0xe86a38;

// Marble colors
const COL_MARBLE_WHITE = 0xf0ece0;
const COL_MARBLE_GREEN = 0x3a7a4a;
const COL_MARBLE_PINK = 0xc88a8a;
const COL_MARBLE_SHADOW = 0xd8d0c0;

// Lantern / cross
const COL_LANTERN = 0xf0ece0;
const COL_GOLD = 0xdaa520;

// Structure
const COL_STONE_DARK = 0x8a7a5a;

// Sky
const COL_SKY_DARK_TOP = 0x0a0a2e;
const COL_SKY_DARK_MID = 0x1a1a3e;
const COL_SKY_LIGHT_TOP = 0x5a7ab0;
const COL_SKY_LIGHT_MID = 0x90aad0;

// Ground
const COL_GROUND_DARK = 0x4a3a28;
const COL_GROUND_LIGHT = 0x9a8a6a;

// Glow
const COL_GLOW_WARM = 0xffddaa;

// Rib count
const RIB_COUNT = 8;

// Campanile bands
const CAMPANILE_BANDS = 6;

// ============================================================
// STATE
// ============================================================

let canvasW = 0;
let canvasH = 0;

// Dome layout
let domeBaseY = 0;
let domeCenterX = 0;
let domeRadiusX = 0;
let domeRadiusY = 0;

// Facade layout
let facadeTop = 0;
let facadeLeft = 0;
let facadeRight = 0;
let facadeWidth = 0;
let facadeHeight = 0;

// Campanile layout
let campLeft = 0;
let campWidth = 0;
let campTop = 0;
let campBottom = 0;

// Lantern layout
let lanternCX = 0;
let lanternBaseY = 0;
let lanternTopY = 0;

// Ground
let groundY = 0;

// Glow texture
let glowDataUrl = '';

// Pre-allocated rib endpoints (x,y pairs for 8 ribs at dome surface)
let ribStartX: number[] = [];
let ribStartY: number[] = [];
let ribEndX: number[] = [];
let ribEndY: number[] = [];

// Animation
let glowPhase = 0;

// ============================================================
// ACTOR
// ============================================================

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    // Ground line
    groundY = canvasH * 0.86;

    // Dome positioning - large dome in center-upper area
    domeCenterX = canvasW * 0.52;
    domeBaseY = canvasH * 0.56;
    domeRadiusX = canvasW * 0.30;
    domeRadiusY = canvasH * 0.22;

    // Lantern sits on top of dome
    lanternCX = domeCenterX;
    lanternBaseY = domeBaseY - domeRadiusY + 4;
    lanternTopY = lanternBaseY - canvasH * 0.07;

    // Facade below the dome
    facadeTop = domeBaseY - 10;
    facadeLeft = canvasW * 0.15;
    facadeRight = canvasW * 0.85;
    facadeWidth = facadeRight - facadeLeft;
    facadeHeight = groundY - facadeTop;

    // Campanile to the left
    campWidth = canvasW * 0.10;
    campLeft = facadeLeft - campWidth - canvasW * 0.03;
    campBottom = groundY;
    campTop = canvasH * 0.22;

    // Pre-compute rib endpoints on the dome ellipse
    ribStartX = [];
    ribStartY = [];
    ribEndX = [];
    ribEndY = [];

    for (let i = 0; i < RIB_COUNT; i++) {
      // Ribs distributed across the visible face of the dome
      // Angles from roughly PI (left edge) to 0 (right edge)
      const angle = Math.PI - (i / (RIB_COUNT - 1)) * Math.PI;
      const ex = domeCenterX + Math.cos(angle) * domeRadiusX * 0.95;
      const ey = domeBaseY + Math.sin(angle) * domeRadiusY * 0.1 - 2;

      ribStartX.push(ex);
      ribStartY.push(ey);

      // Ribs converge toward the lantern base
      const topAngle = Math.PI - (i / (RIB_COUNT - 1)) * Math.PI;
      const topSpread = 12;
      ribEndX.push(lanternCX + Math.cos(topAngle) * topSpread);
      ribEndY.push(lanternBaseY + 8);
    }

    // Glow texture
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.3)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    glowDataUrl = c.toDataURL();

    glowPhase = 0;
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();
    glowPhase = t;

    // ── SKY ──────────────────────────────────────────────────
    const skyTop = isDark ? COL_SKY_DARK_TOP : COL_SKY_LIGHT_TOP;
    const skyMid = isDark ? COL_SKY_DARK_MID : COL_SKY_LIGHT_MID;

    api.brush.rect(0, 0, canvasW, groundY, {
      fill: {
        type: 'linear',
        x0: 0.5, y0: 0,
        x1: 0.5, y1: 1,
        stops: [
          { offset: 0, color: skyTop },
          { offset: 0.7, color: skyMid },
          { offset: 1, color: isDark ? 0x2a2a3e : 0xbbccdd },
        ],
      },
      alpha: 0.9,
      blendMode: 'normal',
    });

    // ── GROUND ───────────────────────────────────────────────
    api.brush.rect(0, groundY, canvasW, canvasH - groundY, {
      fill: isDark ? COL_GROUND_DARK : COL_GROUND_LIGHT,
      alpha: 0.95,
      blendMode: 'normal',
    });

    // Piazza surface
    api.brush.rect(facadeLeft - 20, groundY, facadeWidth + 60, canvasH * 0.05, {
      fill: isDark ? 0x5a4a36 : 0xb8a888,
      alpha: 0.7,
      blendMode: 'normal',
    });

    // ── CAMPANILE (bell tower) ───────────────────────────────
    // Main shaft
    api.brush.rect(campLeft, campTop, campWidth, campBottom - campTop, {
      fill: isDark ? 0xc8b898 : COL_MARBLE_WHITE,
      alpha: 0.9,
      blendMode: 'normal',
    });

    // Horizontal marble band decorations
    const bandHeight = (campBottom - campTop) / CAMPANILE_BANDS;
    for (let b = 0; b < CAMPANILE_BANDS; b++) {
      const bandY = campTop + b * bandHeight;
      const bandColor = b % 3 === 0 ? COL_MARBLE_GREEN
        : b % 3 === 1 ? COL_MARBLE_PINK
        : (isDark ? COL_MARBLE_SHADOW : COL_MARBLE_WHITE);

      // Thin decorative band
      api.brush.rect(campLeft + 2, bandY + bandHeight * 0.7, campWidth - 4, bandHeight * 0.15, {
        fill: bandColor,
        alpha: 0.8,
        blendMode: 'normal',
      });

      // Window openings in upper tiers
      if (b >= 3) {
        const winW = campWidth * 0.3;
        const winH = bandHeight * 0.4;
        const winX = campLeft + (campWidth - winW) / 2;
        const winY = bandY + bandHeight * 0.15;

        api.brush.rect(winX, winY, winW, winH, {
          fill: isDark ? 0x2a2a3e : 0x6a6a7a,
          alpha: 0.8,
          blendMode: 'normal',
        });

        // Arch top on window
        api.brush.ellipse(winX + winW / 2, winY, winW, winW * 0.5, {
          fill: isDark ? 0x2a2a3e : 0x6a6a7a,
          alpha: 0.8,
          blendMode: 'normal',
        });
      }
    }

    // Campanile top (pyramidal cap)
    api.brush.pushMatrix();
    api.brush.translate(campLeft + campWidth / 2, campTop);

    api.brush.rect(-campWidth / 2 - 2, -3, campWidth + 4, 5, {
      fill: isDark ? COL_MARBLE_SHADOW : COL_MARBLE_WHITE,
      alpha: 0.85,
      blendMode: 'normal',
    });

    // Pointed top
    api.brush.rect(-3, -18, 6, 16, {
      fill: isDark ? COL_MARBLE_SHADOW : COL_MARBLE_WHITE,
      alpha: 0.85,
      blendMode: 'normal',
    });

    api.brush.rect(-1, -24, 2, 8, {
      fill: COL_GOLD,
      alpha: 0.9,
      blendMode: 'normal',
    });

    api.brush.popMatrix();

    // Shadow on campanile right side
    api.brush.rect(campLeft + campWidth - 5, campTop, 5, campBottom - campTop, {
      fill: isDark ? 0x5a4a2a : COL_STONE_DARK,
      alpha: 0.3,
      blendMode: 'normal',
    });

    // ── FACADE (cathedral body below dome) ───────────────────
    // Main facade wall
    api.brush.rect(facadeLeft, facadeTop, facadeWidth, facadeHeight, {
      fill: isDark ? 0xc8b898 : COL_MARBLE_WHITE,
      alpha: 0.92,
      blendMode: 'normal',
    });

    // Marble band decorations on facade (green/pink/white)
    const facadeBandCount = 8;
    const facadeBandH = facadeHeight / facadeBandCount;
    for (let b = 0; b < facadeBandCount; b++) {
      const bandY = facadeTop + b * facadeBandH;
      const bandColor = b % 3 === 0 ? COL_MARBLE_GREEN
        : b % 3 === 1 ? COL_MARBLE_PINK
        : (isDark ? COL_MARBLE_SHADOW : COL_MARBLE_WHITE);

      api.brush.rect(facadeLeft + 4, bandY + facadeBandH * 0.4, facadeWidth - 8, facadeBandH * 0.2, {
        fill: bandColor,
        alpha: 0.7,
        blendMode: 'normal',
      });
    }

    // Central door
    const doorW = facadeWidth * 0.14;
    const doorH = facadeHeight * 0.35;
    const doorX = facadeLeft + (facadeWidth - doorW) / 2;
    const doorY = groundY - doorH;

    api.brush.rect(doorX, doorY, doorW, doorH, {
      fill: isDark ? 0x2a1a0a : 0x5a3a1a,
      alpha: 0.85,
      blendMode: 'normal',
    });

    // Door arch
    api.brush.ellipse(doorX + doorW / 2, doorY, doorW, doorW * 0.6, {
      fill: isDark ? 0x2a1a0a : 0x5a3a1a,
      alpha: 0.85,
      blendMode: 'normal',
    });

    // Side doors (smaller)
    const sideDoorW = doorW * 0.65;
    const sideDoorH = doorH * 0.7;
    const sideDoorOffsets = [-facadeWidth * 0.22, facadeWidth * 0.22];

    for (let d = 0; d < 2; d++) {
      const sdx = doorX + (doorW - sideDoorW) / 2 + sideDoorOffsets[d];
      const sdy = groundY - sideDoorH;

      api.brush.rect(sdx, sdy, sideDoorW, sideDoorH, {
        fill: isDark ? 0x2a1a0a : 0x5a3a1a,
        alpha: 0.8,
        blendMode: 'normal',
      });

      api.brush.ellipse(sdx + sideDoorW / 2, sdy, sideDoorW, sideDoorW * 0.5, {
        fill: isDark ? 0x2a1a0a : 0x5a3a1a,
        alpha: 0.8,
        blendMode: 'normal',
      });
    }

    // Rose window on facade
    const roseY = facadeTop + facadeHeight * 0.3;
    const roseR = facadeWidth * 0.06;

    api.brush.circle(domeCenterX, roseY, roseR + 3, {
      fill: isDark ? COL_MARBLE_SHADOW : COL_MARBLE_WHITE,
      alpha: 0.85,
      blendMode: 'normal',
    });

    api.brush.circle(domeCenterX, roseY, roseR, {
      fill: isDark ? 0x3a4a6a : 0x6a8aba,
      alpha: 0.8,
      blendMode: 'normal',
    });

    // ── DOME (the main octagonal dome) ───────────────────────
    // Drum/base of dome (octagonal wall below dome curve)
    const drumH = canvasH * 0.06;
    api.brush.rect(domeCenterX - domeRadiusX * 0.85, domeBaseY - drumH, domeRadiusX * 1.7, drumH, {
      fill: isDark ? 0xb8a070 : COL_MARBLE_WHITE,
      alpha: 0.9,
      blendMode: 'normal',
    });

    // Windows on the drum
    const drumWinCount = 5;
    const drumWinSpacing = (domeRadiusX * 1.5) / drumWinCount;
    for (let w = 0; w < drumWinCount; w++) {
      const wx = domeCenterX - domeRadiusX * 0.7 + drumWinSpacing * (w + 0.5);
      const wy = domeBaseY - drumH * 0.7;
      const ww = drumWinSpacing * 0.3;
      const wh = drumH * 0.5;

      api.brush.rect(wx - ww / 2, wy, ww, wh, {
        fill: isDark ? 0x2a2a3e : 0x6a7a8a,
        alpha: 0.75,
        blendMode: 'normal',
      });

      // Round top
      api.brush.ellipse(wx, wy, ww, ww * 0.6, {
        fill: isDark ? 0x2a2a3e : 0x6a7a8a,
        alpha: 0.75,
        blendMode: 'normal',
      });
    }

    // Main dome shape - large ellipse with terracotta gradient
    api.brush.ellipse(domeCenterX, domeBaseY - domeRadiusY * 0.45, domeRadiusX, domeRadiusY, {
      fill: {
        type: 'radial',
        cx: 0.45, cy: 0.35, radius: 0.6,
        stops: [
          { offset: 0, color: isDark ? COL_TERRA_LIGHT : COL_TERRA_LIGHT },
          { offset: 0.5, color: isDark ? COL_TERRA_BASE : COL_TERRA_BASE },
          { offset: 1, color: isDark ? COL_TERRA_DARK : COL_TERRA_DARK },
        ],
      },
      alpha: 0.95,
      blendMode: 'normal',
    });

    // Clip the bottom half of the dome (cover with facade color so dome appears to sit on drum)
    // The dome should only show the upper half
    api.brush.rect(domeCenterX - domeRadiusX - 5, domeBaseY, domeRadiusX * 2 + 10, domeRadiusY, {
      fill: isDark ? 0xc8b898 : COL_MARBLE_WHITE,
      alpha: 0.95,
      blendMode: 'normal',
    });

    // ── DOME RIBS (8 structural ribs) ────────────────────────
    for (let i = 0; i < RIB_COUNT; i++) {
      const sx = ribStartX[i];
      const sy = ribStartY[i];
      const ex = ribEndX[i];
      const ey = ribEndY[i];

      // Draw rib as a thin line from base to lantern
      // Use a series of small rects to approximate the curved rib
      const steps = 8;
      for (let s = 0; s < steps; s++) {
        const t0 = s / steps;
        const t1 = (s + 1) / steps;

        // Quadratic bezier: control point above center for dome curvature
        const cpX = (sx + ex) / 2;
        const cpY = Math.min(sy, ey) - domeRadiusY * 0.6;

        const x0 = (1 - t0) * (1 - t0) * sx + 2 * (1 - t0) * t0 * cpX + t0 * t0 * ex;
        const y0 = (1 - t0) * (1 - t0) * sy + 2 * (1 - t0) * t0 * cpY + t0 * t0 * ey;
        const x1 = (1 - t1) * (1 - t1) * sx + 2 * (1 - t1) * t1 * cpX + t1 * t1 * ex;
        const y1 = (1 - t1) * (1 - t1) * sy + 2 * (1 - t1) * t1 * cpY + t1 * t1 * ey;

        const segLen = Math.hypot(x1 - x0, y1 - y0);
        if (segLen < 0.5) continue;

        const midX = (x0 + x1) / 2;
        const midY = (y0 + y1) / 2;

        api.brush.pushMatrix();
        api.brush.translate(midX, midY);
        api.brush.rotate(Math.atan2(y1 - y0, x1 - x0));

        api.brush.rect(-segLen / 2, -1.5, segLen, 3, {
          fill: isDark ? COL_MARBLE_SHADOW : COL_MARBLE_WHITE,
          alpha: 0.75,
          blendMode: 'normal',
        });

        api.brush.popMatrix();
      }
    }

    // ── LANTERN (white marble cupola on top) ──────────────────
    api.brush.pushMatrix();
    api.brush.translate(lanternCX, lanternBaseY);

    // Lantern base ring
    api.brush.ellipse(0, 0, 22, 8, {
      fill: isDark ? COL_MARBLE_SHADOW : COL_MARBLE_WHITE,
      alpha: 0.9,
      blendMode: 'normal',
    });

    // Lantern body (cylindrical with columns)
    const lantH = lanternBaseY - lanternTopY;
    api.brush.rect(-14, -lantH, 28, lantH, {
      fill: isDark ? COL_MARBLE_SHADOW : COL_MARBLE_WHITE,
      alpha: 0.9,
      blendMode: 'normal',
    });

    // Lantern openings (dark slits between columns)
    for (let col = 0; col < 4; col++) {
      const cx = -10 + col * 7;
      api.brush.rect(cx, -lantH + 4, 4, lantH * 0.6, {
        fill: isDark ? 0x2a2a3e : 0x7a7a8a,
        alpha: 0.7,
        blendMode: 'normal',
      });
    }

    // Lantern cone/dome top
    api.brush.ellipse(0, -lantH - 4, 16, 10, {
      fill: isDark ? COL_MARBLE_SHADOW : COL_MARBLE_WHITE,
      alpha: 0.9,
      blendMode: 'normal',
    });

    // Lantern pointed cap
    api.brush.rect(-2, -lantH - 14, 4, 12, {
      fill: isDark ? COL_MARBLE_SHADOW : COL_MARBLE_WHITE,
      alpha: 0.85,
      blendMode: 'normal',
    });

    // Gold orb
    api.brush.circle(0, -lantH - 16, 5, {
      fill: COL_GOLD,
      alpha: 0.9,
      blendMode: 'normal',
    });

    // Gold cross
    api.brush.rect(-1, -lantH - 28, 2, 14, {
      fill: COL_GOLD,
      alpha: 0.9,
      blendMode: 'normal',
    });
    api.brush.rect(-5, -lantH - 24, 10, 2, {
      fill: COL_GOLD,
      alpha: 0.9,
      blendMode: 'normal',
    });

    api.brush.popMatrix();

    // ── LANTERN GLOW (warm pulsing light) ────────────────────
    const glowPulse = 0.5 + 0.3 * Math.sin(glowPhase * 0.8);
    const glowAlpha = glowPulse * (isDark ? 0.35 : 0.12);

    if (glowAlpha >= 0.05) {
      api.brush.image(glowDataUrl, lanternCX, lanternTopY - 10, {
        width: 80,
        height: 80,
        tint: COL_GLOW_WARM,
        alpha: glowAlpha,
        blendMode: 'add',
      });
    }

    // Secondary wider glow around the lantern
    const wideGlowAlpha = glowPulse * (isDark ? 0.15 : 0.05);
    if (wideGlowAlpha >= 0.05) {
      api.brush.image(glowDataUrl, lanternCX, lanternTopY, {
        width: 160,
        height: 140,
        tint: COL_GLOW_WARM,
        alpha: wideGlowAlpha,
        blendMode: 'add',
      });
    }

    // ── ATMOSPHERIC HAZE ─────────────────────────────────────
    // Subtle haze around the base of the dome
    api.brush.image(glowDataUrl, domeCenterX, domeBaseY - domeRadiusY * 0.3, {
      width: domeRadiusX * 2.5,
      height: domeRadiusY * 1.5,
      tint: isDark ? 0x4a4a6a : 0xccccdd,
      alpha: isDark ? 0.08 : 0.06,
      blendMode: 'add',
    });

    // ── FACADE SHADOW ────────────────────────────────────────
    // Right side shadow on facade
    api.brush.rect(facadeRight - 8, facadeTop, 8, facadeHeight, {
      fill: isDark ? 0x4a3a1a : COL_STONE_DARK,
      alpha: 0.25,
      blendMode: 'normal',
    });
  },

  async teardown(): Promise<void> {
    canvasW = 0;
    canvasH = 0;
    ribStartX = [];
    ribStartY = [];
    ribEndX = [];
    ribEndY = [];
    glowDataUrl = '';
    glowPhase = 0;
  },
};

registerActor(actor);
export default actor;
