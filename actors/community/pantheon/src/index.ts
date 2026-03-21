/**
 * Pantheon — Foreground Actor
 *
 * The Roman Pantheon with its iconic portico of 8 Corinthian columns,
 * triangular pediment, great dome behind, and the famous oculus at top
 * streaming golden light that slowly sweeps across the interior.
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
  id: 'pantheon',
  name: 'Pantheon',
  description:
    'Roman Pantheon with portico of 8 columns, triangular pediment, great dome, and oculus streaming golden light that slowly sweeps',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'italy', 'rome', 'architecture', 'landmark'],
  createdAt: new Date('2026-03-21'),
  role: 'foreground',
  preferredDuration: 60,
  requiredContexts: ['display'],
};

// ── Constants ────────────────────────────────────────────────
const NUM_COLUMNS = 8;
const NUM_STEPS = 5;

// Stone colors (numeric 0xRRGGBB)
const COL_STONE_LIGHT = 0xd8d0c0;
const COL_STONE_MID = 0xc8c0b0;
const COL_STONE_DARK = 0xa8a090;
const COL_STONE_SHADOW = 0x8a8278;
const COL_DOME = 0xb8b0a0;
const COL_DOME_LIGHT = 0xd0c8b8;
const COL_DOME_SHADOW = 0x9a9288;
const COL_PEDIMENT = 0xcec6b6;
const COL_BEAM_GOLD = 0xffd700;
const COL_OCULUS_RIM = 0xe0d8c8;
const COL_INTERIOR = 0x2a2420;
const COL_INTERIOR_LIGHT = 0x4a4438;

// ── Pre-allocated state ──────────────────────────────────────
let canvasW = 0;
let canvasH = 0;

// Layout dimensions
let groundY = 0;
let porticoLeft = 0;
let porticoRight = 0;
let porticoWidth = 0;
let porticoTopY = 0;        // top of columns
let porticoBottomY = 0;     // bottom of columns (top of steps)
let columnWidth = 0;
let columnSpacing = 0;
let capitalHeight = 0;
let pedimentPeakY = 0;
let domeTopY = 0;
let domeCenterX = 0;
let domeCenterY = 0;
let domeRadiusX = 0;
let domeRadiusY = 0;
let oculusCX = 0;
let oculusCY = 0;
let oculusRadius = 0;
let stepHeight = 0;
let stepBaseY = 0;
let beamLength = 0;

// Column x-positions, pre-allocated
let columnXPositions: number[] = [];

// Glow texture data URL
let glowDataUrl = '';

// Reusable style objects
const rectStyle = { fill: 0, alpha: 1.0, blendMode: 'normal' as const };
const circleStyle = { fill: 0, alpha: 1.0, blendMode: 'normal' as const };
const ellipseStyle = { fill: 0, alpha: 1.0, blendMode: 'normal' as const };
const imageStyle = { width: 0, height: 0, tint: 0, alpha: 1.0, blendMode: 'add' as const };

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    // Layout: Pantheon centered in lower portion of 360x640 portrait
    groundY = canvasH * 0.82;

    // Portico dimensions
    porticoLeft = canvasW * 0.08;
    porticoRight = canvasW * 0.92;
    porticoWidth = porticoRight - porticoLeft;

    porticoBottomY = groundY;
    const columnHeight = canvasH * 0.28;
    porticoTopY = porticoBottomY - columnHeight;

    columnSpacing = porticoWidth / (NUM_COLUMNS + 1);
    columnWidth = columnSpacing * 0.22;
    capitalHeight = columnHeight * 0.06;

    // Pediment (triangle above columns)
    const pedimentHeight = canvasH * 0.08;
    pedimentPeakY = porticoTopY - pedimentHeight;

    // Steps below columns
    stepHeight = canvasH * 0.015;
    stepBaseY = groundY + stepHeight * NUM_STEPS;

    // Dome behind the portico
    domeCenterX = canvasW * 0.5;
    domeRadiusX = porticoWidth * 0.52;
    domeRadiusY = canvasH * 0.22;
    domeCenterY = porticoTopY + capitalHeight;
    domeTopY = domeCenterY - domeRadiusY;

    // Oculus at top of dome
    oculusCX = domeCenterX;
    oculusCY = domeTopY + domeRadiusY * 0.12;
    oculusRadius = domeRadiusX * 0.1;

    // Light beam length
    beamLength = groundY - oculusCY;

    // Pre-allocate column positions
    columnXPositions = [];
    for (let i = 0; i < NUM_COLUMNS; i++) {
      columnXPositions.push(porticoLeft + columnSpacing * (i + 1));
    }

    // Pre-render glow texture
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.3)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    glowDataUrl = c.toDataURL();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const tSec = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();

    // ── DOME (behind everything) ─────────────────────────────
    // Dome body: large semicircle
    const domeColor = isDark ? COL_DOME : COL_DOME_LIGHT;
    ellipseStyle.fill = domeColor;
    ellipseStyle.alpha = 0.95;
    ellipseStyle.blendMode = 'normal';
    api.brush.ellipse(domeCenterX, domeCenterY, domeRadiusX, domeRadiusY, ellipseStyle);

    // Clip the bottom of the dome with the wall behind portico
    rectStyle.fill = isDark ? COL_DOME_SHADOW : COL_DOME;
    rectStyle.alpha = 0.95;
    rectStyle.blendMode = 'normal';
    api.brush.rect(
      domeCenterX - domeRadiusX,
      domeCenterY,
      domeRadiusX * 2,
      domeRadiusY * 0.3,
      rectStyle
    );

    // Dome ribs (decorative lines)
    for (let i = 1; i < 6; i++) {
      const ribAngle = (Math.PI / 6) * i;
      const ribX = domeCenterX + Math.cos(Math.PI + ribAngle) * domeRadiusX * 0.95;
      const ribTopY = domeCenterY - Math.sin(ribAngle) * domeRadiusY * 0.95;

      rectStyle.fill = isDark ? COL_STONE_SHADOW : COL_STONE_DARK;
      rectStyle.alpha = 0.3;
      rectStyle.blendMode = 'normal';
      api.brush.rect(ribX - 1, ribTopY, 2, domeCenterY - ribTopY, rectStyle);
    }

    // Dome shadow/highlight bands
    ellipseStyle.fill = isDark ? COL_DOME_SHADOW : COL_STONE_MID;
    ellipseStyle.alpha = 0.2;
    ellipseStyle.blendMode = 'normal';
    api.brush.ellipse(domeCenterX, domeCenterY, domeRadiusX * 0.85, domeRadiusY * 0.85, ellipseStyle);

    // ── OCULUS ────────────────────────────────────────────────
    // Oculus opening
    circleStyle.fill = isDark ? 0x1a1a3e : 0x6a8ab5;
    circleStyle.alpha = 0.95;
    circleStyle.blendMode = 'normal';
    api.brush.circle(oculusCX, oculusCY, oculusRadius, circleStyle);

    // Oculus rim
    circleStyle.fill = COL_OCULUS_RIM;
    circleStyle.alpha = 0.8;
    circleStyle.blendMode = 'normal';
    api.brush.circle(oculusCX, oculusCY, oculusRadius + 3, circleStyle);
    // Inner circle to make it a ring
    circleStyle.fill = isDark ? 0x1a1a3e : 0x6a8ab5;
    circleStyle.alpha = 0.95;
    circleStyle.blendMode = 'normal';
    api.brush.circle(oculusCX, oculusCY, oculusRadius, circleStyle);

    // ── LIGHT BEAM from oculus ────────────────────────────────
    // Beam sweeps slowly left and right
    const sweepAngle = Math.sin(tSec * 0.15) * 0.35;  // slow sweep
    const beamBottomX = oculusCX + Math.sin(sweepAngle) * beamLength * 0.6;
    const beamWidth = oculusRadius * 3;

    // Draw beam as a series of transparent rects (trapezoid approximation)
    const beamSegments = 12;
    const segHeight = beamLength / beamSegments;

    api.brush.pushMatrix();
    for (let i = 0; i < beamSegments; i++) {
      const t = i / beamSegments;
      const tNext = (i + 1) / beamSegments;

      const topX = oculusCX + (beamBottomX - oculusCX) * t;
      const botX = oculusCX + (beamBottomX - oculusCX) * tNext;
      const topW = beamWidth * (0.3 + t * 0.7);
      const segY = oculusCY + beamLength * t;

      // Fade out toward bottom
      const beamAlpha = (1.0 - t * 0.7) * (isDark ? 0.25 : 0.12);
      if (beamAlpha < 0.05) continue;

      const segCenterX = (topX + botX) * 0.5;

      rectStyle.fill = COL_BEAM_GOLD;
      rectStyle.alpha = beamAlpha;
      rectStyle.blendMode = 'add' as const;
      api.brush.rect(segCenterX - topW / 2, segY, topW, segHeight + 1, rectStyle);
    }
    api.brush.popMatrix();

    // Bright glow at oculus
    imageStyle.width = oculusRadius * 6;
    imageStyle.height = oculusRadius * 6;
    imageStyle.tint = COL_BEAM_GOLD;
    imageStyle.alpha = isDark ? 0.4 : 0.2;
    imageStyle.blendMode = 'add';
    api.brush.image(glowDataUrl, oculusCX, oculusCY, imageStyle);

    // ── ENTABLATURE (beam above columns, below pediment) ─────
    const entablatureH = canvasH * 0.025;
    rectStyle.fill = isDark ? COL_STONE_MID : COL_STONE_LIGHT;
    rectStyle.alpha = 0.95;
    rectStyle.blendMode = 'normal';
    api.brush.rect(porticoLeft - 4, porticoTopY - capitalHeight, porticoWidth + 8, entablatureH, rectStyle);

    // Lower entablature detail line
    rectStyle.fill = isDark ? COL_STONE_SHADOW : COL_STONE_DARK;
    rectStyle.alpha = 0.6;
    api.brush.rect(porticoLeft - 4, porticoTopY - capitalHeight + entablatureH - 2, porticoWidth + 8, 2, rectStyle);

    // ── PEDIMENT (triangle) ──────────────────────────────────
    // Draw as a filled triangle using overlapping rects (trapezoid approach)
    const pedBaseY = porticoTopY - capitalHeight;
    const pedHeight = pedBaseY - pedimentPeakY;
    const pedSegments = 16;
    const pedSegH = pedHeight / pedSegments;

    for (let i = 0; i < pedSegments; i++) {
      const t = i / pedSegments;
      const segW = porticoWidth * (1.0 - t) + 8 * (1.0 - t);
      const segY = pedBaseY - pedSegH * (i + 1);

      rectStyle.fill = isDark ? COL_PEDIMENT : COL_STONE_LIGHT;
      rectStyle.alpha = 0.95;
      rectStyle.blendMode = 'normal';
      api.brush.rect(domeCenterX - segW / 2, segY, segW, pedSegH + 1, rectStyle);
    }

    // Pediment shadow line at base
    rectStyle.fill = isDark ? COL_STONE_SHADOW : COL_STONE_DARK;
    rectStyle.alpha = 0.4;
    rectStyle.blendMode = 'normal';
    api.brush.rect(porticoLeft - 4, pedBaseY - 2, porticoWidth + 8, 2, rectStyle);

    // Tympanum (recessed triangular center) - slightly smaller triangle
    const tympSegments = 12;
    const tympInset = porticoWidth * 0.06;
    const tympBaseY = pedBaseY - entablatureH * 0.3;
    const tympPeakY = pedimentPeakY + pedHeight * 0.15;
    const tympHeight = tympBaseY - tympPeakY;
    const tympSegH = tympHeight / tympSegments;

    for (let i = 0; i < tympSegments; i++) {
      const t = i / tympSegments;
      const segW = (porticoWidth - tympInset * 2) * (1.0 - t);
      const segY = tympBaseY - tympSegH * (i + 1);

      rectStyle.fill = isDark ? COL_STONE_SHADOW : COL_STONE_DARK;
      rectStyle.alpha = 0.25;
      rectStyle.blendMode = 'normal';
      api.brush.rect(domeCenterX - segW / 2, segY, segW, tympSegH + 1, rectStyle);
    }

    // ── INTERIOR (dark space behind columns) ─────────────────
    const interiorColor = isDark ? COL_INTERIOR : COL_INTERIOR_LIGHT;
    rectStyle.fill = interiorColor;
    rectStyle.alpha = 0.85;
    rectStyle.blendMode = 'normal';
    api.brush.rect(porticoLeft + columnSpacing * 0.5, porticoTopY, porticoWidth - columnSpacing, porticoBottomY - porticoTopY, rectStyle);

    // ── COLUMNS (8 tall rectangles with capitals) ────────────
    for (let i = 0; i < NUM_COLUMNS; i++) {
      const cx = columnXPositions[i];

      api.brush.pushMatrix();
      api.brush.translate(cx, 0);

      // Column shaft
      rectStyle.fill = isDark ? COL_STONE_MID : COL_STONE_LIGHT;
      rectStyle.alpha = 0.95;
      rectStyle.blendMode = 'normal';
      api.brush.rect(-columnWidth / 2, porticoTopY, columnWidth, porticoBottomY - porticoTopY, rectStyle);

      // Column fluting (dark vertical lines for depth)
      const fluteW = 1;
      rectStyle.fill = isDark ? COL_STONE_SHADOW : COL_STONE_DARK;
      rectStyle.alpha = 0.2;
      rectStyle.blendMode = 'normal';
      api.brush.rect(-columnWidth * 0.25, porticoTopY + 4, fluteW, porticoBottomY - porticoTopY - 8, rectStyle);
      api.brush.rect(columnWidth * 0.1, porticoTopY + 4, fluteW, porticoBottomY - porticoTopY - 8, rectStyle);

      // Column highlight (light strip)
      rectStyle.fill = isDark ? COL_STONE_LIGHT : 0xe8e0d0;
      rectStyle.alpha = 0.3;
      rectStyle.blendMode = 'normal';
      api.brush.rect(-columnWidth * 0.08, porticoTopY + 4, fluteW + 1, porticoBottomY - porticoTopY - 8, rectStyle);

      // Capital (wider block at top)
      const capW = columnWidth * 1.6;
      rectStyle.fill = isDark ? COL_STONE_LIGHT : 0xe0d8c8;
      rectStyle.alpha = 0.9;
      rectStyle.blendMode = 'normal';
      api.brush.rect(-capW / 2, porticoTopY - capitalHeight, capW, capitalHeight, rectStyle);

      // Capital decorative line
      rectStyle.fill = isDark ? COL_STONE_SHADOW : COL_STONE_DARK;
      rectStyle.alpha = 0.4;
      rectStyle.blendMode = 'normal';
      api.brush.rect(-capW / 2, porticoTopY - capitalHeight * 0.4, capW, 1.5, rectStyle);

      // Column base (wider block at bottom)
      const baseW = columnWidth * 1.3;
      rectStyle.fill = isDark ? COL_STONE_LIGHT : 0xe0d8c8;
      rectStyle.alpha = 0.85;
      rectStyle.blendMode = 'normal';
      api.brush.rect(-baseW / 2, porticoBottomY - 6, baseW, 6, rectStyle);

      api.brush.popMatrix();
    }

    // ── STEPS at the base ────────────────────────────────────
    for (let s = 0; s < NUM_STEPS; s++) {
      const stepW = porticoWidth + 16 + s * 8;
      const stepY = groundY + s * stepHeight;
      const stepColor = isDark
        ? (s % 2 === 0 ? COL_STONE_MID : COL_STONE_DARK)
        : (s % 2 === 0 ? COL_STONE_LIGHT : COL_STONE_MID);

      rectStyle.fill = stepColor;
      rectStyle.alpha = 0.9;
      rectStyle.blendMode = 'normal';
      api.brush.rect(domeCenterX - stepW / 2, stepY, stepW, stepHeight + 1, rectStyle);

      // Step edge highlight
      rectStyle.fill = isDark ? COL_STONE_LIGHT : 0xe8e0d0;
      rectStyle.alpha = 0.3;
      rectStyle.blendMode = 'normal';
      api.brush.rect(domeCenterX - stepW / 2, stepY, stepW, 1, rectStyle);
    }

    // ── WARM ATMOSPHERE GLOW (dark mode) ─────────────────────
    if (isDark) {
      // Subtle warm glow from the light beam hitting the floor
      imageStyle.width = beamWidth * 3;
      imageStyle.height = beamWidth * 2;
      imageStyle.tint = COL_BEAM_GOLD;
      imageStyle.alpha = 0.08;
      imageStyle.blendMode = 'add';

      const spotX = oculusCX + Math.sin(sweepAngle) * beamLength * 0.5;
      api.brush.image(glowDataUrl, spotX, groundY - 10, imageStyle);
    }
  },

  async teardown(): Promise<void> {
    canvasW = 0;
    canvasH = 0;
    columnXPositions = [];
    glowDataUrl = '';
  },
};

registerActor(actor);
export default actor;
