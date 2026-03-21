/**
 * Colosseum — Foreground Actor
 *
 * A stylized view of the Roman Colosseum with its iconic curved facade
 * featuring 3 tiers of arches. The right side is partially crumbled,
 * with missing or broken arches. Stars twinkle above and warm light
 * glows from the arches.
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
  id: 'colosseum',
  name: 'Colosseum',
  description:
    'Stylized Roman Colosseum with curved facade, three tiers of arches, partially crumbled right side, twinkling stars, and warm arch glow',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'italy', 'rome', 'architecture', 'landmark'],
  createdAt: new Date('2026-03-21'),
  role: 'foreground',
  preferredDuration: 60,
  requiredContexts: ['display'],
};

// ── Constants ────────────────────────────────────────────────
const MAX_STARS = 40;
const MAX_ARCHES_BOTTOM = 8;
const MAX_ARCHES_MIDDLE = 7;
const MAX_ARCHES_TOP = 6;
const TOTAL_ARCHES = MAX_ARCHES_BOTTOM + MAX_ARCHES_MIDDLE + MAX_ARCHES_TOP;

// Stone colors (numeric 0xRRGGBB)
const COL_STONE_LIGHT = 0xd4a574;
const COL_STONE_MID = 0xc49464;
const COL_STONE_DARK = 0xb88454;
const COL_STONE_SHADOW = 0x9a7044;
const COL_ARCH_INTERIOR = 0x3a2a1a;
const COL_ARCH_INTERIOR_LIGHT = 0x5a4a3a;
const COL_GLOW_WARM = 0xffcc80;
const COL_GLOW_ORANGE = 0xff9944;
const COL_GROUND = 0x5a4a32;
const COL_GROUND_LIGHT = 0x8a7a5a;
const COL_SKY_DARK_TOP = 0x0a0a2e;
const COL_SKY_DARK_MID = 0x1a1a3e;
const COL_SKY_LIGHT_TOP = 0x4a6fa5;
const COL_SKY_LIGHT_MID = 0x88aacc;
const COL_STAR = 0xffffff;

// ── State types ──────────────────────────────────────────────
interface StarState {
  x: number;
  y: number;
  size: number;
  phase: number;
  speed: number;
  brightness: number;
}

interface ArchState {
  tier: number;        // 0=bottom, 1=middle, 2=top
  index: number;       // position in tier
  cx: number;          // center x
  cy: number;          // center y (top of arch)
  w: number;           // arch width
  h: number;           // arch height
  radius: number;      // arch curve radius
  intact: boolean;     // false if crumbled
  partial: number;     // 0-1, how much remains (1=full, 0=gone)
  glowPhase: number;   // for warm glow animation
  glowSpeed: number;
}

// ── Pre-allocated state ──────────────────────────────────────
let canvasW = 0;
let canvasH = 0;
let stars: StarState[] = [];
let arches: ArchState[] = [];
let glowDataUrl = '';

// Building layout
let baseY = 0;          // bottom of structure
let facadeLeft = 0;
let facadeRight = 0;
let facadeWidth = 0;
let tier0Y = 0;         // bottom tier top
let tier1Y = 0;         // middle tier top
let tier2Y = 0;         // top tier top
let topY = 0;           // very top of structure
let tierHeight = 0;
let groundY = 0;

// Reusable style objects (no allocations in update)
const rectStyle = { fill: 0, alpha: 1.0, blendMode: 'normal' as const };
const circleStyle = { fill: 0, alpha: 1.0, blendMode: 'normal' as const };
const arcStyle = { color: 0, width: 2, alpha: 1.0, blendMode: 'normal' as const };
const imageStyle = { width: 0, height: 0, tint: 0, alpha: 1.0, blendMode: 'add' as const };

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    // Layout: Colosseum in lower-center of 360x640 portrait
    groundY = canvasH * 0.85;
    baseY = groundY;
    facadeLeft = canvasW * 0.05;
    facadeRight = canvasW * 0.95;
    facadeWidth = facadeRight - facadeLeft;

    // Three tiers of equal height
    const totalHeight = canvasH * 0.4;
    tierHeight = totalHeight / 3;
    tier0Y = baseY - tierHeight;           // bottom tier top
    tier1Y = tier0Y - tierHeight;          // middle tier top
    tier2Y = tier1Y - tierHeight;          // top tier top
    topY = tier2Y - tierHeight * 0.15;     // cornice above top tier

    // Pre-allocate stars
    stars = [];
    for (let i = 0; i < MAX_STARS; i++) {
      stars.push({
        x: Math.random() * canvasW,
        y: Math.random() * (tier2Y - 20),  // above the structure
        size: 0.8 + Math.random() * 2,
        phase: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 2,
        brightness: 0.4 + Math.random() * 0.6,
      });
    }

    // Crumble map: right side arches that are missing or broken
    // Bottom tier: arches 6,7 damaged (index 0-based)
    // Middle tier: arches 5,6 damaged
    // Top tier: arches 4,5 damaged
    const crumbleMap: Record<string, number> = {
      '0-6': 0.6, '0-7': 0.2,   // bottom tier partial/missing
      '1-5': 0.5, '1-6': 0.15,  // middle tier
      '2-4': 0.4, '2-5': 0.0,   // top tier
    };

    // Pre-allocate arches
    arches = [];
    const tierCounts = [MAX_ARCHES_BOTTOM, MAX_ARCHES_MIDDLE, MAX_ARCHES_TOP];
    const tierTops = [tier0Y, tier1Y, tier2Y];

    for (let tier = 0; tier < 3; tier++) {
      const count = tierCounts[tier];
      const tTop = tierTops[tier];
      const tBottom = tTop + tierHeight;

      // Arches are slightly inset from facade edges
      const inset = facadeWidth * 0.04;
      const tierW = facadeWidth - inset * 2;
      // Wider tiers at bottom (slight perspective)
      const archSpacing = tierW / count;
      const archW = archSpacing * 0.6;
      const archH = tierHeight * 0.7;
      const archRadius = archW / 2;

      for (let i = 0; i < count; i++) {
        const cx = facadeLeft + inset + archSpacing * (i + 0.5);
        const cy = tTop + tierHeight * 0.12;  // top of arch opening
        const key = `${tier}-${i}`;
        const partial = crumbleMap[key] !== undefined ? crumbleMap[key] : 1.0;
        const intact = partial >= 0.8;

        arches.push({
          tier,
          index: i,
          cx,
          cy,
          w: archW,
          h: archH,
          radius: archRadius,
          intact,
          partial,
          glowPhase: Math.random() * Math.PI * 2,
          glowSpeed: 0.3 + Math.random() * 0.6,
        });
      }
    }

    // Pre-render glow texture for arch lighting
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

    // ── SKY ────────────────────────────────────────────────────
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
          { offset: 1, color: isDark ? 0x2a2a3e : 0xaabbcc },
        ],
      },
      alpha: 0.9,
      blendMode: 'normal',
    });

    // ── STARS (twinkle animation, only prominent in dark mode) ──
    for (let i = 0; i < MAX_STARS; i++) {
      const s = stars[i];
      const twinkle = 0.3 + 0.7 * ((Math.sin(tSec * s.speed + s.phase) + 1) * 0.5);
      const alpha = s.brightness * twinkle * (isDark ? 0.9 : 0.15);
      if (alpha < 0.05) continue;

      circleStyle.fill = COL_STAR;
      circleStyle.alpha = alpha;
      circleStyle.blendMode = 'add';
      api.brush.circle(s.x, s.y, s.size, circleStyle);
    }

    // ── GROUND ─────────────────────────────────────────────────
    rectStyle.fill = isDark ? COL_GROUND : COL_GROUND_LIGHT;
    rectStyle.alpha = 0.95;
    rectStyle.blendMode = 'normal';
    api.brush.rect(0, groundY, canvasW, canvasH - groundY, rectStyle);

    // Cobblestone area in front
    rectStyle.fill = isDark ? 0x6a5a42 : 0x9a8a6a;
    rectStyle.alpha = 0.7;
    api.brush.rect(facadeLeft, groundY, facadeWidth, canvasH * 0.06, rectStyle);

    // ── FACADE WALLS (3 tiers) ─────────────────────────────────
    // Each tier is a horizontal band of stone
    const tierTops = [tier2Y, tier1Y, tier0Y];  // top to bottom for drawing
    const tierColors = [COL_STONE_LIGHT, COL_STONE_MID, COL_STONE_DARK];
    const tierColorsLight = [0xdab584, 0xd4a474, 0xc49464];

    for (let tier = 0; tier < 3; tier++) {
      const tTop = tierTops[tier];
      const stoneColor = isDark ? tierColors[tier] : tierColorsLight[tier];

      // Determine crumble cutoff for this tier (rightmost intact x)
      // Tiers: tier index in tierTops: 0=top(tier2), 1=mid(tier1), 2=bottom(tier0)
      const actualTier = 2 - tier; // map to actual tier number
      let crumbleX = facadeRight; // default: full width

      // Find the rightmost crumble point for this tier
      for (let a = 0; a < arches.length; a++) {
        const arch = arches[a];
        if (arch.tier === actualTier && arch.partial < 0.8) {
          const archLeft = arch.cx - arch.w / 2;
          if (archLeft < crumbleX) {
            crumbleX = archLeft + arch.w * arch.partial;
          }
        }
      }

      // Main wall band
      api.brush.rect(facadeLeft, tTop, crumbleX - facadeLeft, tierHeight, {
        fill: {
          type: 'linear',
          x0: 0, y0: 0.5,
          x1: 1, y1: 0.5,
          stops: [
            { offset: 0, color: stoneColor },
            { offset: 0.8, color: isDark ? COL_STONE_SHADOW : COL_STONE_DARK },
          ],
        },
        alpha: 0.95,
        blendMode: 'normal',
      });

      // Horizontal cornice line at top of each tier
      rectStyle.fill = isDark ? COL_STONE_LIGHT : 0xdfc094;
      rectStyle.alpha = 0.8;
      rectStyle.blendMode = 'normal';
      api.brush.rect(facadeLeft, tTop, crumbleX - facadeLeft, 4, rectStyle);

      // Horizontal divider line at bottom of each tier
      rectStyle.fill = isDark ? COL_STONE_SHADOW : COL_STONE_DARK;
      rectStyle.alpha = 0.6;
      api.brush.rect(facadeLeft, tTop + tierHeight - 3, crumbleX - facadeLeft, 3, rectStyle);

      // Crumbled rubble fragments on the right side
      if (crumbleX < facadeRight) {
        // Jagged broken edge: a few stone-colored rectangles
        const rubbleColor = isDark ? COL_STONE_DARK : COL_STONE_MID;
        rectStyle.fill = rubbleColor;
        rectStyle.alpha = 0.7;
        // Irregular blocks near the break
        const breakW = facadeRight - crumbleX;
        for (let r = 0; r < 3; r++) {
          const rx = crumbleX + breakW * (r * 0.3);
          const ry = tTop + tierHeight * (0.3 + r * 0.2);
          const rw = 8 + r * 5;
          const rh = 6 + r * 3;
          api.brush.rect(rx, ry, rw, rh, rectStyle);
        }
      }
    }

    // ── TOP CORNICE (attic level) ──────────────────────────────
    // Find crumble cutoff for top tier
    let topCrumbleX = facadeRight;
    for (let a = 0; a < arches.length; a++) {
      const arch = arches[a];
      if (arch.tier === 2 && arch.partial < 0.8) {
        const archLeft = arch.cx - arch.w / 2;
        if (archLeft < topCrumbleX) {
          topCrumbleX = archLeft + arch.w * arch.partial;
        }
      }
    }

    rectStyle.fill = isDark ? COL_STONE_LIGHT : 0xdfc094;
    rectStyle.alpha = 0.9;
    rectStyle.blendMode = 'normal';
    api.brush.rect(facadeLeft - 2, topY, topCrumbleX - facadeLeft + 2, tier2Y - topY, rectStyle);

    // ── ARCHES ─────────────────────────────────────────────────
    const archInterior = isDark ? COL_ARCH_INTERIOR : COL_ARCH_INTERIOR_LIGHT;

    for (let a = 0; a < TOTAL_ARCHES; a++) {
      const arch = arches[a];
      if (arch.partial <= 0.0) continue;  // completely gone

      // For partially intact arches, clip by reducing width/height
      const drawW = arch.w * Math.min(arch.partial, 1.0);
      const drawH = arch.h * Math.min(arch.partial, 1.0);
      const drawRadius = drawW / 2;

      if (arch.intact) {
        // Full arch: dark interior rectangle + semicircle top
        rectStyle.fill = archInterior;
        rectStyle.alpha = 0.9;
        rectStyle.blendMode = 'normal';
        api.brush.rect(arch.cx - drawW / 2, arch.cy + drawRadius, drawW, drawH - drawRadius, rectStyle);

        // Semicircular arch top
        circleStyle.fill = archInterior;
        circleStyle.alpha = 0.9;
        circleStyle.blendMode = 'normal';
        api.brush.ellipse(arch.cx, arch.cy + drawRadius, drawRadius, drawRadius, circleStyle);

        // Stone arch surround
        arcStyle.color = isDark ? COL_STONE_LIGHT : 0xdfc094;
        arcStyle.width = 2.5;
        arcStyle.alpha = 0.8;
        arcStyle.blendMode = 'normal';
        api.brush.arc(arch.cx, arch.cy + drawRadius, drawRadius + 1, Math.PI, 0, arcStyle);

        // Pillar lines on sides
        rectStyle.fill = isDark ? COL_STONE_LIGHT : 0xdfc094;
        rectStyle.alpha = 0.7;
        rectStyle.blendMode = 'normal';
        api.brush.rect(arch.cx - drawW / 2 - 3, arch.cy + drawRadius, 3, drawH - drawRadius, rectStyle);
        api.brush.rect(arch.cx + drawW / 2, arch.cy + drawRadius, 3, drawH - drawRadius, rectStyle);

        // Warm glow from intact arches (subtle animation)
        const glowPulse = 0.3 + 0.2 * Math.sin(tSec * arch.glowSpeed + arch.glowPhase);
        const glowAlpha = glowPulse * (isDark ? 0.45 : 0.12);

        if (glowAlpha >= 0.05) {
          imageStyle.width = drawW * 2.5;
          imageStyle.height = drawH * 1.8;
          imageStyle.tint = isDark ? COL_GLOW_WARM : COL_GLOW_ORANGE;
          imageStyle.alpha = glowAlpha;
          imageStyle.blendMode = 'add';
          api.brush.image(glowDataUrl, arch.cx, arch.cy + drawH * 0.5, imageStyle);
        }
      } else {
        // Partial/broken arch: just draw a partial rectangle
        const partW = drawW * arch.partial;
        rectStyle.fill = archInterior;
        rectStyle.alpha = 0.7;
        rectStyle.blendMode = 'normal';
        api.brush.rect(arch.cx - arch.w / 2, arch.cy + drawRadius, partW, drawH * 0.6, rectStyle);

        // Broken arch curve (partial)
        if (arch.partial > 0.3) {
          arcStyle.color = isDark ? COL_STONE_LIGHT : 0xdfc094;
          arcStyle.width = 2;
          arcStyle.alpha = 0.6;
          arcStyle.blendMode = 'normal';
          api.brush.arc(
            arch.cx, arch.cy + drawRadius,
            drawRadius + 1,
            Math.PI, Math.PI + Math.PI * arch.partial,
            arcStyle
          );
        }
      }
    }

    // ── FALLEN RUBBLE at base on right side ────────────────────
    const rubbleBaseColor = isDark ? COL_STONE_DARK : COL_STONE_MID;
    api.brush.pushMatrix();
    api.brush.translate(facadeRight - facadeWidth * 0.12, baseY);

    // Scattered stone blocks
    rectStyle.fill = rubbleBaseColor;
    rectStyle.alpha = 0.7;
    rectStyle.blendMode = 'normal';
    api.brush.rect(-15, -8, 18, 8, rectStyle);
    api.brush.rect(8, -5, 12, 5, rectStyle);
    api.brush.rect(-5, -12, 10, 7, rectStyle);
    api.brush.rect(20, -6, 14, 6, rectStyle);
    api.brush.rect(-20, -4, 9, 4, rectStyle);

    // Rounded rubble pieces
    circleStyle.fill = isDark ? COL_STONE_MID : COL_STONE_LIGHT;
    circleStyle.alpha = 0.6;
    circleStyle.blendMode = 'normal';
    api.brush.circle(30, -4, 5, circleStyle);
    api.brush.circle(-25, -3, 4, circleStyle);
    api.brush.circle(5, -3, 3, circleStyle);

    api.brush.popMatrix();

    // ── WARM ATMOSPHERE GLOW ───────────────────────────────────
    // Subtle overall warm glow from the structure
    if (isDark) {
      imageStyle.width = facadeWidth * 0.8;
      imageStyle.height = canvasH * 0.3;
      imageStyle.tint = 0xff8844;
      imageStyle.alpha = 0.06;
      imageStyle.blendMode = 'add';
      api.brush.image(glowDataUrl, canvasW * 0.45, baseY - tierHeight * 1.5, imageStyle);
    }
  },

  async teardown(): Promise<void> {
    stars = [];
    arches = [];
    canvasW = 0;
    canvasH = 0;
    glowDataUrl = '';
  },
};

registerActor(actor);
export default actor;
