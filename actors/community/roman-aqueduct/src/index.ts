/**
 * Roman Aqueduct — Foreground Actor
 *
 * A long stone aqueduct stretching across the canvas with perspective.
 * Two tiers of arches: larger bottom tier (5-6 arches) and smaller upper
 * tier (8-10 arches). Water channel on top with flowing blue particles.
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
  id: 'roman-aqueduct',
  name: 'Roman Aqueduct',
  description:
    'Long stone aqueduct with two tiers of arches and flowing water animation on top',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'italy', 'rome', 'architecture', 'ancient'],
  createdAt: new Date('2026-03-21'),
  role: 'foreground',
  preferredDuration: 60,
  requiredContexts: ['display'],
};

// -- Constants ---------------------------------------------------------------
const BOTTOM_ARCH_COUNT = 6;
const TOP_ARCH_COUNT = 9;
const TOTAL_ARCHES = BOTTOM_ARCH_COUNT + TOP_ARCH_COUNT;
const WATER_PARTICLE_COUNT = 40;
const PILLAR_EXTRA = 4; // extra width for pillar outlines

// Stone palette (numeric 0xRRGGBB)
const COL_STONE_LIGHT = 0xc8b8a0;
const COL_STONE_MID = 0xb8a890;
const COL_STONE_SHADOW = 0xa89880;
const COL_STONE_DARK = 0x988870;
const COL_ARCH_INTERIOR = 0x3a2a1a;
const COL_ARCH_INTERIOR_LIGHT = 0x5a4a3a;
const COL_WATER = 0x4488cc;
const COL_WATER_LIGHT = 0x66aadd;
const COL_WATER_PARTICLE = 0x88ccff;
const COL_WATER_PARTICLE_LIGHT = 0xaaddff;
const COL_CHANNEL_DARK = 0x907860;
const COL_CHANNEL_LIGHT = 0xb8a888;

// -- State types -------------------------------------------------------------
interface ArchState {
  tier: number;      // 0 = bottom, 1 = top
  index: number;
  cx: number;        // center x
  baseY: number;     // bottom of arch opening
  w: number;         // arch opening width
  h: number;         // arch opening height (including semicircle)
  radius: number;    // semicircle radius
  pillarW: number;   // pillar width
}

interface WaterParticle {
  x: number;
  y: number;
  speed: number;
  size: number;
  phase: number;
}

// -- Pre-allocated state -----------------------------------------------------
let canvasW = 0;
let canvasH = 0;
let arches: ArchState[] = [];
let waterParticles: WaterParticle[] = [];

// Layout values
let groundY = 0;
let aqueductLeft = 0;
let aqueductRight = 0;
let aqueductWidth = 0;
let bottomTierBaseY = 0;  // bottom of bottom tier pillars (on ground)
let bottomTierTopY = 0;   // top of bottom tier / bottom of top tier
let topTierTopY = 0;      // top of top tier
let channelY = 0;         // top of water channel
let channelH = 0;         // water channel height
let bottomTierH = 0;
let topTierH = 0;

// Perspective: aqueduct narrows slightly toward the right
let perspLeft = 0;   // left edge scale (1.0)
let perspRight = 0;  // right edge scale (slightly smaller)

// Reusable style objects -- no allocations in update()
const rectStyle = { fill: 0, alpha: 1.0, blendMode: 'normal' as const };
const circleStyle = { fill: 0, alpha: 1.0, blendMode: 'normal' as const };
const arcStyle = { color: 0, width: 2, alpha: 1.0, blendMode: 'normal' as const };

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    // Layout: aqueduct spans full width, centered vertically
    groundY = canvasH * 0.72;
    aqueductLeft = -10;               // slightly off-screen left
    aqueductRight = canvasW + 10;     // slightly off-screen right
    aqueductWidth = aqueductRight - aqueductLeft;

    // Perspective factors
    perspLeft = 1.0;
    perspRight = 0.82;

    // Tier heights
    bottomTierH = canvasH * 0.22;
    topTierH = canvasH * 0.12;
    channelH = 8;

    bottomTierBaseY = groundY;
    bottomTierTopY = groundY - bottomTierH;
    topTierTopY = bottomTierTopY - topTierH;
    channelY = topTierTopY - channelH;

    // Pre-allocate bottom tier arches
    arches = [];
    const bottomSpacing = aqueductWidth / BOTTOM_ARCH_COUNT;
    const bottomArchW = bottomSpacing * 0.55;
    const bottomArchH = bottomTierH * 0.75;
    const bottomPillarW = bottomSpacing * 0.18;

    for (let i = 0; i < BOTTOM_ARCH_COUNT; i++) {
      const t = (i + 0.5) / BOTTOM_ARCH_COUNT; // 0..1 across width
      const scale = perspLeft + (perspRight - perspLeft) * t;
      const cx = aqueductLeft + bottomSpacing * (i + 0.5);
      const w = bottomArchW * scale;
      const h = bottomArchH * scale;
      arches.push({
        tier: 0,
        index: i,
        cx,
        baseY: bottomTierBaseY,
        w,
        h,
        radius: w / 2,
        pillarW: bottomPillarW * scale,
      });
    }

    // Pre-allocate top tier arches
    const topSpacing = aqueductWidth / TOP_ARCH_COUNT;
    const topArchW = topSpacing * 0.52;
    const topArchH = topTierH * 0.72;
    const topPillarW = topSpacing * 0.16;

    for (let i = 0; i < TOP_ARCH_COUNT; i++) {
      const t = (i + 0.5) / TOP_ARCH_COUNT;
      const scale = perspLeft + (perspRight - perspLeft) * t;
      const cx = aqueductLeft + topSpacing * (i + 0.5);
      const w = topArchW * scale;
      const h = topArchH * scale;
      arches.push({
        tier: 1,
        index: i,
        cx,
        baseY: bottomTierTopY,
        w,
        h,
        radius: w / 2,
        pillarW: topPillarW * scale,
      });
    }

    // Pre-allocate water particles
    waterParticles = [];
    for (let i = 0; i < WATER_PARTICLE_COUNT; i++) {
      waterParticles.push({
        x: aqueductLeft + Math.random() * aqueductWidth,
        y: channelY + 2 + Math.random() * (channelH - 4),
        speed: 18 + Math.random() * 24,
        size: 1.2 + Math.random() * 2.0,
        phase: Math.random() * Math.PI * 2,
      });
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const tSec = frame.time / 1000;
    const dt = frame.delta / 1000;
    const isDark = api.context.display.isDarkMode();

    // -- BOTTOM TIER WALL (full horizontal band) -------------------------
    rectStyle.fill = isDark ? COL_STONE_MID : COL_STONE_LIGHT;
    rectStyle.alpha = 0.9;
    rectStyle.blendMode = 'normal';
    api.brush.rect(aqueductLeft, bottomTierTopY, aqueductWidth, bottomTierH, rectStyle);

    // Horizontal cornice between tiers
    rectStyle.fill = isDark ? COL_STONE_LIGHT : 0xd4c4a8;
    rectStyle.alpha = 0.85;
    api.brush.rect(aqueductLeft, bottomTierTopY, aqueductWidth, 4, rectStyle);

    // Bottom edge
    rectStyle.fill = isDark ? COL_STONE_SHADOW : COL_STONE_MID;
    rectStyle.alpha = 0.7;
    api.brush.rect(aqueductLeft, bottomTierBaseY - 3, aqueductWidth, 3, rectStyle);

    // -- BOTTOM TIER ARCHES ----------------------------------------------
    const archInterior = isDark ? COL_ARCH_INTERIOR : COL_ARCH_INTERIOR_LIGHT;

    for (let a = 0; a < BOTTOM_ARCH_COUNT; a++) {
      const arch = arches[a];
      const archTopY = arch.baseY - arch.h;
      const rectH = arch.h - arch.radius;

      // Dark interior rectangle
      rectStyle.fill = archInterior;
      rectStyle.alpha = 0.85;
      rectStyle.blendMode = 'normal';
      api.brush.rect(arch.cx - arch.w / 2, archTopY + arch.radius, arch.w, rectH, rectStyle);

      // Semicircular top
      circleStyle.fill = archInterior;
      circleStyle.alpha = 0.85;
      circleStyle.blendMode = 'normal';
      api.brush.ellipse(arch.cx, archTopY + arch.radius, arch.radius, arch.radius, circleStyle);

      // Stone arch surround
      arcStyle.color = isDark ? COL_STONE_LIGHT : 0xd4c4a8;
      arcStyle.width = 3;
      arcStyle.alpha = 0.8;
      arcStyle.blendMode = 'normal';
      api.brush.arc(arch.cx, archTopY + arch.radius, arch.radius + 1, Math.PI, 0, arcStyle);

      // Left pillar
      rectStyle.fill = isDark ? COL_STONE_LIGHT : 0xd0c0a4;
      rectStyle.alpha = 0.75;
      rectStyle.blendMode = 'normal';
      api.brush.rect(arch.cx - arch.w / 2 - arch.pillarW, archTopY + arch.radius, arch.pillarW, rectH, rectStyle);

      // Right pillar
      api.brush.rect(arch.cx + arch.w / 2, archTopY + arch.radius, arch.pillarW, rectH, rectStyle);

      // Pillar shadow lines
      rectStyle.fill = isDark ? COL_STONE_SHADOW : COL_STONE_MID;
      rectStyle.alpha = 0.6;
      api.brush.rect(arch.cx - arch.w / 2 - 1, archTopY + arch.radius, 1, rectH, rectStyle);
      api.brush.rect(arch.cx + arch.w / 2, archTopY + arch.radius, 1, rectH, rectStyle);
    }

    // -- TOP TIER WALL ---------------------------------------------------
    rectStyle.fill = isDark ? COL_STONE_MID : COL_STONE_LIGHT;
    rectStyle.alpha = 0.9;
    rectStyle.blendMode = 'normal';
    api.brush.rect(aqueductLeft, topTierTopY, aqueductWidth, topTierH, rectStyle);

    // Top cornice
    rectStyle.fill = isDark ? COL_STONE_LIGHT : 0xd4c4a8;
    rectStyle.alpha = 0.85;
    api.brush.rect(aqueductLeft, topTierTopY, aqueductWidth, 3, rectStyle);

    // -- TOP TIER ARCHES -------------------------------------------------
    for (let a = BOTTOM_ARCH_COUNT; a < TOTAL_ARCHES; a++) {
      const arch = arches[a];
      const archTopY = arch.baseY - arch.h;
      const rectH = arch.h - arch.radius;

      // Dark interior rectangle
      rectStyle.fill = archInterior;
      rectStyle.alpha = 0.8;
      rectStyle.blendMode = 'normal';
      api.brush.rect(arch.cx - arch.w / 2, archTopY + arch.radius, arch.w, rectH, rectStyle);

      // Semicircular top
      circleStyle.fill = archInterior;
      circleStyle.alpha = 0.8;
      circleStyle.blendMode = 'normal';
      api.brush.ellipse(arch.cx, archTopY + arch.radius, arch.radius, arch.radius, circleStyle);

      // Stone arch surround
      arcStyle.color = isDark ? COL_STONE_LIGHT : 0xd4c4a8;
      arcStyle.width = 2;
      arcStyle.alpha = 0.75;
      arcStyle.blendMode = 'normal';
      api.brush.arc(arch.cx, archTopY + arch.radius, arch.radius + 1, Math.PI, 0, arcStyle);

      // Left pillar
      rectStyle.fill = isDark ? COL_STONE_LIGHT : 0xd0c0a4;
      rectStyle.alpha = 0.7;
      rectStyle.blendMode = 'normal';
      api.brush.rect(arch.cx - arch.w / 2 - arch.pillarW, archTopY + arch.radius, arch.pillarW, rectH, rectStyle);

      // Right pillar
      api.brush.rect(arch.cx + arch.w / 2, archTopY + arch.radius, arch.pillarW, rectH, rectStyle);
    }

    // -- WATER CHANNEL ---------------------------------------------------
    // Channel walls (stone)
    rectStyle.fill = isDark ? COL_CHANNEL_DARK : COL_CHANNEL_LIGHT;
    rectStyle.alpha = 0.9;
    rectStyle.blendMode = 'normal';
    api.brush.rect(aqueductLeft, channelY, aqueductWidth, channelH, rectStyle);

    // Channel rim top
    rectStyle.fill = isDark ? COL_STONE_LIGHT : 0xd4c4a8;
    rectStyle.alpha = 0.8;
    api.brush.rect(aqueductLeft, channelY, aqueductWidth, 2, rectStyle);

    // Water surface
    rectStyle.fill = isDark ? COL_WATER : COL_WATER_LIGHT;
    rectStyle.alpha = 0.7;
    rectStyle.blendMode = 'normal';
    api.brush.rect(aqueductLeft, channelY + 2, aqueductWidth, channelH - 3, rectStyle);

    // -- WATER PARTICLES (flowing animation) -----------------------------
    for (let i = 0; i < WATER_PARTICLE_COUNT; i++) {
      const p = waterParticles[i];

      // Move particles to the right (water flowing)
      p.x += p.speed * dt;

      // Wrap around when past right edge
      if (p.x > aqueductRight + 5) {
        p.x = aqueductLeft - 5;
      }

      // Small vertical bob
      const bobY = p.y + Math.sin(tSec * 3 + p.phase) * 1.2;

      circleStyle.fill = isDark ? COL_WATER_PARTICLE : COL_WATER_PARTICLE_LIGHT;
      circleStyle.alpha = 0.6 + 0.2 * Math.sin(tSec * 2 + p.phase);
      circleStyle.blendMode = 'add';
      api.brush.circle(p.x, bobY, p.size, circleStyle);
    }

    // -- STONE TEXTURE DETAILS -------------------------------------------
    // Horizontal mortar lines on bottom tier
    rectStyle.fill = isDark ? COL_STONE_SHADOW : COL_STONE_MID;
    rectStyle.alpha = 0.3;
    rectStyle.blendMode = 'normal';

    const mortarSpacing = bottomTierH / 5;
    for (let m = 1; m < 5; m++) {
      const my = bottomTierTopY + mortarSpacing * m;
      api.brush.rect(aqueductLeft, my, aqueductWidth, 1, rectStyle);
    }

    // Horizontal mortar lines on top tier
    const topMortarSpacing = topTierH / 3;
    for (let m = 1; m < 3; m++) {
      const my = topTierTopY + topMortarSpacing * m;
      api.brush.rect(aqueductLeft, my, aqueductWidth, 1, rectStyle);
    }

    // -- SHADOW beneath aqueduct -----------------------------------------
    rectStyle.fill = 0x000000;
    rectStyle.alpha = isDark ? 0.25 : 0.12;
    rectStyle.blendMode = 'normal';
    api.brush.rect(aqueductLeft + 8, groundY, aqueductWidth - 4, 6, rectStyle);
  },

  async teardown(): Promise<void> {
    arches = [];
    waterParticles = [];
    canvasW = 0;
    canvasH = 0;
  },
};

registerActor(actor);
export default actor;
