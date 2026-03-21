/**
 * Rialto Bridge — Foreground Actor
 *
 * A stylized view of Venice's iconic Rialto Bridge: a single-span
 * stone arch across the lower-middle portion of a 360x640 portrait
 * canvas. Features a covered arcade with repeated small arches and
 * columns, animated water ripples below in blue-green hues, and a
 * semi-transparent reflection of the bridge in the canal.
 */

import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

// ============================================================
// METADATA
// ============================================================

const metadata: ActorMetadata = {
  id: 'rialto-bridge',
  name: 'Rialto Bridge',
  description:
    'Stylized Venice Rialto Bridge with parabolic stone arch, covered arcade, animated water ripples, and canal reflections',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'italy', 'venice', 'architecture', 'landmark'],
  createdAt: new Date('2026-03-21'),
  role: 'foreground',
  preferredDuration: 60,
  requiredContexts: ['display'],
};

// ============================================================
// CONSTANTS
// ============================================================

// Stone palette
const COL_STONE_LIGHT = 0xd4c8b0;
const COL_STONE_MID = 0xc4b8a0;
const COL_STONE_DARK = 0xa49880;

// Water palette
const COL_WATER_DEEP = 0x2a6a7a;
const COL_WATER_LIGHT = 0x3a8a9a;

// Arcade columns / small arches
const ARCADE_ARCH_COUNT = 9;

// Water ripple lines
const RIPPLE_COUNT = 14;

// ============================================================
// STATE
// ============================================================

interface RippleLine {
  baseY: number;
  amplitude: number;
  frequency: number;
  phase: number;
  speed: number;
}

let canvasW = 0;
let canvasH = 0;

// Bridge geometry (computed in setup)
let bridgeLeft = 0;
let bridgeRight = 0;
let bridgeSpan = 0;
let bridgeMidX = 0;
let archApexY = 0;       // top of the parabolic arch opening
let archBaseY = 0;        // bottom of the arch (water level)
let deckY = 0;            // top of the bridge deck / road surface
let arcadeTopY = 0;       // top of the covered arcade
let waterTopY = 0;        // where the water area begins
let waterBottomY = 0;     // bottom of the water area

// Ripple state (pre-allocated)
let ripples: RippleLine[] = [];

// Pre-allocated polygon point arrays for the arch shape
let archTopPoints: Array<{ x: number; y: number }> = [];
let archBottomPoints: Array<{ x: number; y: number }> = [];
let reflArchTopPoints: Array<{ x: number; y: number }> = [];
let reflArchBottomPoints: Array<{ x: number; y: number }> = [];

// Pre-allocated reusable style objects
const rectStyle = { fill: 0, alpha: 1.0, blendMode: 'normal' as const };
const polyStyle = { fill: 0, alpha: 1.0, blendMode: 'normal' as const };
const circleStyle = { fill: 0, alpha: 1.0, blendMode: 'normal' as const };
const lineStyle = { color: 0, width: 1.5, alpha: 0.5, blendMode: 'normal' as const };

// Number of points on the parabolic curve
const ARCH_CURVE_POINTS = 20;

// ============================================================
// HELPERS
// ============================================================

/** Return the Y position on the parabolic arch curve for a given X. */
function archCurveY(x: number): number {
  // Parabola: y = archBaseY - height * (1 - ((x - midX) / halfSpan)^2)
  const halfSpan = bridgeSpan / 2;
  const dx = (x - bridgeMidX) / halfSpan;
  const height = archBaseY - archApexY;
  return archBaseY - height * (1 - dx * dx);
}

/**
 * Build the polygon points for the arch opening shape.
 * The arch opening is a parabola across the bottom, straight line across the
 * top (the underside of the deck).
 */
function buildArchPolygon(): void {
  // Top edge of arch opening = underside of deck (flat line)
  // Bottom edge = parabolic curve
  // We build a closed polygon: left-to-right along the deck underside,
  // then right-to-left along the parabola.

  // For the solid bridge body (above the arch), we need a polygon that is:
  //   - top: flat deck line
  //   - bottom: parabolic arch curve
  // Actually, we draw the bridge body as a polygon and the arch void separately.

  // archTopPoints: the solid stone area of the arch (trapezoid-like with curved bottom)
  // Points: top-left, top-right, then curve right-to-left along parabola
  const step = bridgeSpan / ARCH_CURVE_POINTS;

  // Reset arrays (reuse length)
  archTopPoints.length = 0;
  archBottomPoints.length = 0;
  reflArchTopPoints.length = 0;
  reflArchBottomPoints.length = 0;

  // Top polygon: the solid arch body
  // Top edge: from left to right at deckY (underside of road)
  archTopPoints.push({ x: bridgeLeft, y: deckY });
  archTopPoints.push({ x: bridgeRight, y: deckY });

  // Bottom edge: parabolic curve from right to left
  for (let i = ARCH_CURVE_POINTS; i >= 0; i--) {
    const px = bridgeLeft + step * i;
    const py = archCurveY(px);
    archTopPoints.push({ x: px, y: py });
  }

  // Reflection polygon (flipped vertically around waterTopY)
  for (let i = 0; i < archTopPoints.length; i++) {
    const pt = archTopPoints[i];
    reflArchTopPoints.push({
      x: pt.x,
      y: waterTopY + (waterTopY - pt.y),
    });
  }
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

    // Bridge layout: spans most of the canvas width, in the lower-middle area
    bridgeLeft = canvasW * 0.06;
    bridgeRight = canvasW * 0.94;
    bridgeSpan = bridgeRight - bridgeLeft;
    bridgeMidX = canvasW * 0.5;

    // Vertical layout
    waterTopY = canvasH * 0.52;    // water surface / arch base line
    archBaseY = waterTopY;
    archApexY = canvasH * 0.34;    // top of arch opening (highest point of curve)
    deckY = archApexY - 12;        // road surface sits above arch apex
    arcadeTopY = deckY - canvasH * 0.09; // covered arcade height
    waterBottomY = canvasH * 0.82; // bottom of visible water

    // Pre-allocate ripple lines
    ripples = [];
    const rippleZoneH = waterBottomY - waterTopY;
    for (let i = 0; i < RIPPLE_COUNT; i++) {
      ripples.push({
        baseY: waterTopY + (rippleZoneH * (i + 0.5)) / RIPPLE_COUNT,
        amplitude: 1.5 + Math.random() * 2.5,
        frequency: 0.015 + Math.random() * 0.01,
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 0.8,
      });
    }

    // Build arch polygon points
    archTopPoints = [];
    reflArchTopPoints = [];
    archBottomPoints = [];
    reflArchBottomPoints = [];
    buildArchPolygon();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();

    // ── WATER BACKGROUND ──────────────────────────────────────
    // Fill the water area with a gradient
    api.brush.rect(0, waterTopY, canvasW, waterBottomY - waterTopY, {
      fill: {
        type: 'linear',
        x0: 0.5, y0: 0,
        x1: 0.5, y1: 1,
        stops: [
          { offset: 0, color: isDark ? 0x1a4a5a : COL_WATER_LIGHT },
          { offset: 0.5, color: isDark ? 0x1a3a4a : COL_WATER_DEEP },
          { offset: 1, color: isDark ? 0x0a2a3a : 0x1a5a6a },
        ],
      },
      alpha: 0.85,
      blendMode: 'normal',
    });

    // ── BRIDGE REFLECTION (drawn first, under ripples) ────────
    // Semi-transparent flipped version of the arch body
    polyStyle.fill = isDark ? 0x8a7e66 : COL_STONE_MID;
    polyStyle.alpha = 0.2;
    polyStyle.blendMode = 'normal';
    api.brush.polygon(reflArchTopPoints, polyStyle);

    // Reflection of the deck surface
    const reflDeckY = waterTopY + (waterTopY - deckY);
    const reflArcadeTopY = waterTopY + (waterTopY - arcadeTopY);

    rectStyle.fill = isDark ? 0x7a6e56 : COL_STONE_DARK;
    rectStyle.alpha = 0.15;
    rectStyle.blendMode = 'normal';
    api.brush.rect(bridgeLeft, reflDeckY, bridgeSpan, reflArcadeTopY - reflDeckY, rectStyle);

    // ── ANIMATED WATER RIPPLES ────────────────────────────────
    for (let i = 0; i < RIPPLE_COUNT; i++) {
      const r = ripples[i];
      const waveOffset = t * r.speed + r.phase;

      // Draw each ripple as a series of short horizontal line segments
      // Use 4 segments per ripple to keep draw calls low
      const segW = canvasW / 4;
      for (let s = 0; s < 4; s++) {
        const sx = s * segW;
        const sy = r.baseY + Math.sin(sx * r.frequency + waveOffset) * r.amplitude;
        const ex = sx + segW * 0.7;
        const ey = r.baseY + Math.sin(ex * r.frequency + waveOffset) * r.amplitude;

        lineStyle.color = (i % 2 === 0) ? COL_WATER_LIGHT : 0x4aaaba;
        lineStyle.width = 1.2 + Math.sin(t * 0.5 + i) * 0.3;
        lineStyle.alpha = isDark ? 0.25 : 0.35;
        lineStyle.blendMode = 'normal';
        api.brush.line(sx, sy, ex, ey, lineStyle);
      }
    }

    // ── STONE ARCH BODY ───────────────────────────────────────
    // The main arch: solid stone polygon
    polyStyle.fill = isDark ? COL_STONE_DARK : COL_STONE_MID;
    polyStyle.alpha = 0.95;
    polyStyle.blendMode = 'normal';
    api.brush.polygon(archTopPoints, polyStyle);

    // Arch curve highlight (lighter stone along the arch curve underside)
    const step = bridgeSpan / ARCH_CURVE_POINTS;
    for (let i = 0; i < ARCH_CURVE_POINTS; i++) {
      const px1 = bridgeLeft + step * i;
      const py1 = archCurveY(px1);
      const px2 = bridgeLeft + step * (i + 1);
      const py2 = archCurveY(px2);

      lineStyle.color = isDark ? COL_STONE_LIGHT : 0xdfd4bc;
      lineStyle.width = 2.5;
      lineStyle.alpha = 0.7;
      lineStyle.blendMode = 'normal';
      api.brush.line(px1, py1, px2, py2, lineStyle);
    }

    // ── DECK / ROAD SURFACE ───────────────────────────────────
    // Road surface on top of the arch
    const roadH = 8;
    rectStyle.fill = isDark ? 0x8a7e66 : COL_STONE_LIGHT;
    rectStyle.alpha = 0.9;
    rectStyle.blendMode = 'normal';
    api.brush.rect(bridgeLeft, deckY - roadH, bridgeSpan, roadH, rectStyle);

    // Road surface top edge highlight
    rectStyle.fill = isDark ? COL_STONE_LIGHT : 0xe0d8c4;
    rectStyle.alpha = 0.8;
    rectStyle.blendMode = 'normal';
    api.brush.rect(bridgeLeft, deckY - roadH - 2, bridgeSpan, 2, rectStyle);

    // ── COVERED ARCADE ────────────────────────────────────────
    // Back wall of the arcade
    const arcadeH = deckY - roadH - arcadeTopY;
    rectStyle.fill = isDark ? COL_STONE_DARK : COL_STONE_MID;
    rectStyle.alpha = 0.85;
    rectStyle.blendMode = 'normal';
    api.brush.rect(bridgeLeft, arcadeTopY, bridgeSpan, arcadeH, rectStyle);

    // Arcade roof / top cornice
    rectStyle.fill = isDark ? COL_STONE_MID : COL_STONE_LIGHT;
    rectStyle.alpha = 0.9;
    rectStyle.blendMode = 'normal';
    api.brush.rect(bridgeLeft - 3, arcadeTopY - 4, bridgeSpan + 6, 5, rectStyle);

    // Peaked roof ridge (triangular hint via two angled rects at center)
    const roofPeakY = arcadeTopY - 14;
    const roofMidX = bridgeMidX;
    api.brush.polygon(
      [
        { x: bridgeLeft - 3, y: arcadeTopY - 4 },
        { x: roofMidX, y: roofPeakY },
        { x: bridgeRight + 3, y: arcadeTopY - 4 },
      ],
      {
        fill: isDark ? COL_STONE_MID : COL_STONE_LIGHT,
        alpha: 0.85,
        blendMode: 'normal',
      },
    );

    // Roof ridge line
    lineStyle.color = isDark ? COL_STONE_LIGHT : 0xe0d8c4;
    lineStyle.width = 2;
    lineStyle.alpha = 0.8;
    lineStyle.blendMode = 'normal';
    api.brush.line(bridgeLeft - 3, arcadeTopY - 4, roofMidX, roofPeakY, lineStyle);
    api.brush.line(roofMidX, roofPeakY, bridgeRight + 3, arcadeTopY - 4, lineStyle);

    // ── SMALL ARCADE ARCHES & COLUMNS ─────────────────────────
    const arcadeInset = bridgeSpan * 0.04;
    const arcadeZoneW = bridgeSpan - arcadeInset * 2;
    const archSpacing = arcadeZoneW / ARCADE_ARCH_COUNT;
    const smallArchW = archSpacing * 0.6;
    const smallArchH = arcadeH * 0.65;
    const columnW = 3;

    for (let i = 0; i < ARCADE_ARCH_COUNT; i++) {
      const cx = bridgeLeft + arcadeInset + archSpacing * (i + 0.5);
      const archTop = arcadeTopY + arcadeH * 0.1;

      // Arch void (dark interior)
      rectStyle.fill = isDark ? 0x2a2218 : 0x6a5e4e;
      rectStyle.alpha = 0.8;
      rectStyle.blendMode = 'normal';
      api.brush.rect(cx - smallArchW / 2, archTop + smallArchW * 0.3, smallArchW, smallArchH - smallArchW * 0.3, rectStyle);

      // Semicircular arch top
      circleStyle.fill = isDark ? 0x2a2218 : 0x6a5e4e;
      circleStyle.alpha = 0.8;
      circleStyle.blendMode = 'normal';
      api.brush.ellipse(cx, archTop + smallArchW * 0.3, smallArchW / 2, smallArchW * 0.3, circleStyle);

      // Column on left side of arch
      rectStyle.fill = isDark ? COL_STONE_LIGHT : 0xe0d8c4;
      rectStyle.alpha = 0.85;
      rectStyle.blendMode = 'normal';
      api.brush.rect(cx - smallArchW / 2 - columnW, archTop, columnW, smallArchH, rectStyle);

      // Column on right side of arch (last one)
      if (i === ARCADE_ARCH_COUNT - 1) {
        api.brush.rect(cx + smallArchW / 2, archTop, columnW, smallArchH, rectStyle);
      }
    }

    // ── ABUTMENTS (bridge ends touching the banks) ────────────
    // Left abutment
    const abutW = canvasW * 0.08;
    const abutH = archBaseY - arcadeTopY + 20;
    rectStyle.fill = isDark ? COL_STONE_DARK : COL_STONE_MID;
    rectStyle.alpha = 0.9;
    rectStyle.blendMode = 'normal';
    api.brush.rect(0, arcadeTopY - 10, abutW, abutH, rectStyle);

    // Right abutment
    api.brush.rect(canvasW - abutW, arcadeTopY - 10, abutW, abutH, rectStyle);

    // Abutment stone detail lines
    rectStyle.fill = isDark ? COL_STONE_MID : COL_STONE_LIGHT;
    rectStyle.alpha = 0.6;
    rectStyle.blendMode = 'normal';
    // Left
    for (let row = 0; row < 4; row++) {
      const ry = arcadeTopY - 5 + row * (abutH / 4);
      api.brush.rect(0, ry, abutW, 2, rectStyle);
    }
    // Right
    for (let row = 0; row < 4; row++) {
      const ry = arcadeTopY - 5 + row * (abutH / 4);
      api.brush.rect(canvasW - abutW, ry, abutW, 2, rectStyle);
    }

    // ── STONE TEXTURE LINES ON ARCH ───────────────────────────
    // Horizontal mortar lines across the arch body
    const mortarCount = 5;
    for (let i = 1; i < mortarCount; i++) {
      const my = deckY - (deckY - archApexY) * (i / mortarCount);
      // Only draw within the arch body width at this Y level
      // Solve parabola for this Y to find left/right x
      const height = archBaseY - archApexY;
      const fraction = (archBaseY - my) / height;
      if (fraction < 0 || fraction > 1) continue;
      const halfWidth = (bridgeSpan / 2) * Math.sqrt(1 - fraction);
      const lx = bridgeMidX - halfWidth;
      const rx = bridgeMidX + halfWidth;

      // Clamp to deck width
      const drawLx = Math.max(lx, bridgeLeft);
      const drawRx = Math.min(rx, bridgeRight);
      if (drawRx <= drawLx) continue;

      lineStyle.color = isDark ? 0x9a8e76 : COL_STONE_DARK;
      lineStyle.width = 1;
      lineStyle.alpha = 0.3;
      lineStyle.blendMode = 'normal';
      api.brush.line(drawLx, my, drawRx, my, lineStyle);
    }

    // ── EMBANKMENT / CANAL EDGES ──────────────────────────────
    // Stone canal walls on the sides below water level
    rectStyle.fill = isDark ? 0x5a5040 : 0x9a8e76;
    rectStyle.alpha = 0.7;
    rectStyle.blendMode = 'normal';
    api.brush.rect(0, waterTopY, canvasW * 0.06, waterBottomY - waterTopY, rectStyle);
    api.brush.rect(canvasW * 0.94, waterTopY, canvasW * 0.06, waterBottomY - waterTopY, rectStyle);

    // ── WATER SHIMMER (subtle animated highlight) ─────────────
    // A few bright spots on the water that drift
    for (let i = 0; i < 5; i++) {
      const shimX = (canvasW * 0.2 + i * canvasW * 0.15 + t * 8 + i * 50) % canvasW;
      const shimY = waterTopY + 20 + i * 15 + Math.sin(t * 0.7 + i * 2) * 5;
      if (shimY > waterBottomY - 5) continue;

      circleStyle.fill = isDark ? 0x5aaabc : 0x8ad0e0;
      circleStyle.alpha = isDark ? 0.15 : 0.2;
      circleStyle.blendMode = 'add';
      api.brush.ellipse(shimX, shimY, 12 + Math.sin(t + i) * 3, 3, circleStyle);
    }
  },

  async teardown(): Promise<void> {
    ripples = [];
    archTopPoints = [];
    archBottomPoints = [];
    reflArchTopPoints = [];
    reflArchBottomPoints = [];
    canvasW = 0;
    canvasH = 0;
  },
};

registerActor(actor);
export default actor;
