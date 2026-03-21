/**
 * Venetian Mask
 *
 * An ornate Venetian carnival mask slowly revealing in the center of the
 * canvas. The mask fades in from transparent, then filigree details and
 * feathers appear one by one. Once fully revealed the mask gently
 * floats with a breathing animation.
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
  id: 'venetian-mask',
  name: 'Venetian Mask',
  description:
    'Ornate Venetian carnival mask that reveals itself piece by piece with gold filigree and jewel-toned feathers',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'italy', 'venice', 'carnival', 'mask'],
  createdAt: new Date('2026-03-21'),
  preferredDuration: 40,
  requiredContexts: ['time', 'display'],
};

// -- Palette --

const MASK_BASE = 0xf0e8d8;
const MASK_BASE_DARK = 0xd8d0c0;
const GOLD = 0xd4aa44;
const GOLD_HIGHLIGHT = 0xeedd88;
const EYE_DARK = 0x111111;
const EYE_DARK_DM = 0x0a0a0a;

const FEATHER_BLUE = 0x2244aa;
const FEATHER_PURPLE = 0x882288;
const FEATHER_GREEN = 0x22aa66;
const FEATHER_TEAL = 0x227788;
const FEATHER_CRIMSON = 0xaa2244;

const GEM_RED = 0xcc2244;
const GEM_BLUE = 0x2266cc;
const GEM_GREEN = 0x22aa55;
const GEM_AMBER = 0xddaa22;

const TWO_PI = Math.PI * 2;

// -- Pre-allocated feather configs --

interface FeatherConfig {
  angle: number;       // base angle from center-top
  length: number;      // fraction of maskH
  curve: number;       // curve direction multiplier
  color: number;
  revealOrder: number; // 0..4 timing offset
}

const FEATHER_CONFIGS: FeatherConfig[] = [
  { angle: -0.35, length: 0.70, curve: -1.0, color: FEATHER_BLUE,    revealOrder: 0 },
  { angle: -0.17, length: 0.85, curve: -0.6, color: FEATHER_PURPLE,  revealOrder: 1 },
  { angle: 0.0,   length: 0.95, curve: 0.0,  color: FEATHER_GREEN,   revealOrder: 2 },
  { angle: 0.17,  length: 0.85, curve: 0.6,  color: FEATHER_TEAL,    revealOrder: 3 },
  { angle: 0.35,  length: 0.70, curve: 1.0,  color: FEATHER_CRIMSON, revealOrder: 4 },
];

// -- Gem positions (fractions of maskW, maskH from mask center) --

interface GemConfig {
  xFrac: number;
  yFrac: number;
  radius: number; // fraction of maskW
  color: number;
  revealOrder: number;
}

const GEM_CONFIGS: GemConfig[] = [
  { xFrac: 0.0,   yFrac: -0.38, radius: 0.035, color: GEM_AMBER, revealOrder: 0 },
  { xFrac: -0.28, yFrac: -0.10, radius: 0.025, color: GEM_RED,   revealOrder: 1 },
  { xFrac: 0.28,  yFrac: -0.10, radius: 0.025, color: GEM_BLUE,  revealOrder: 2 },
  { xFrac: -0.15, yFrac: 0.15,  radius: 0.020, color: GEM_GREEN, revealOrder: 3 },
  { xFrac: 0.15,  yFrac: 0.15,  radius: 0.020, color: GEM_RED,   revealOrder: 4 },
  { xFrac: 0.0,   yFrac: -0.20, radius: 0.028, color: GEM_BLUE,  revealOrder: 5 },
];

// -- State (pre-allocated, no allocs in update) --

let cx = 0;
let cy = 0;
let maskW = 0;   // half-width of mask ellipse
let maskH = 0;   // half-height of mask ellipse

// Animation phases (seconds)
const PHASE_BASE_REVEAL = 2.0;   // mask base fades in
const PHASE_EYES_REVEAL = 3.5;   // eye shapes appear
const PHASE_FILIGREE_START = 4.0;
const PHASE_FILIGREE_END = 6.0;
const PHASE_FEATHER_START = 5.5;
const PHASE_FEATHER_END = 8.5;
const PHASE_GEMS_START = 7.0;
const PHASE_GEMS_END = 9.0;

let elapsedTime = 0;

// Ease-out helper
function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

// Clamp a reveal progress between 0 and 1
function revealProgress(tSec: number, start: number, end: number): number {
  if (tSec <= start) return 0;
  if (tSec >= end) return 1;
  return easeOut((tSec - start) / (end - start));
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();
    cx = width / 2;
    cy = height * 0.45; // slightly above center for portrait balance
    maskW = width * 0.28;
    maskH = maskW * 0.9; // slightly taller than wide for face shape
    elapsedTime = 0;
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const dt = frame.deltaTime / 1000;
    elapsedTime += dt;
    const t = elapsedTime;

    const isDark = api.context.display.isDarkMode();
    const brush = api.brush;

    // Breathing / floating offset once fully revealed
    const breathAmt = t > 9.0 ? Math.min((t - 9.0) * 0.25, 1.0) : 0;
    const floatY = Math.sin(t * 1.2) * 4 * breathAmt;
    const floatScale = 1.0 + Math.sin(t * 0.8) * 0.008 * breathAmt;

    // Base reveal alpha
    const baseAlpha = revealProgress(t, 0, PHASE_BASE_REVEAL);
    if (baseAlpha < 0.01) return;

    brush.pushMatrix();
    brush.translate(cx, cy + floatY);
    brush.scale(floatScale, floatScale);

    // ---- MASK BASE (cream/white ellipse) ----
    const baseColor = isDark ? MASK_BASE_DARK : MASK_BASE;
    brush.ellipse(0, 0, maskW, maskH, {
      fill: baseColor,
      alpha: Math.max(0.6, baseAlpha * 0.92),
      blendMode: 'normal',
    });

    // Subtle shadow/outline
    brush.ellipse(0, 0, maskW, maskH, {
      stroke: isDark ? 0x888070 : 0xc0b8a8,
      strokeWidth: 2,
      alpha: baseAlpha * 0.7,
      blendMode: 'normal',
    });

    // Slight nose ridge (vertical line hint)
    const noseAlpha = revealProgress(t, 1.0, PHASE_BASE_REVEAL);
    if (noseAlpha > 0.01) {
      const nosePath = brush.beginPath();
      nosePath.moveTo(0, -maskH * 0.05);
      nosePath.quadraticCurveTo(maskW * 0.04, maskH * 0.15, 0, maskH * 0.30);
      nosePath.stroke({
        color: isDark ? 0xc8c0b0 : 0xd8d0c0,
        width: 2,
        alpha: noseAlpha * 0.6,
        blendMode: 'normal',
      });
    }

    // ---- EYE HOLES ----
    const eyeAlpha = revealProgress(t, PHASE_BASE_REVEAL, PHASE_EYES_REVEAL);
    if (eyeAlpha > 0.01) {
      const eyeColor = isDark ? EYE_DARK_DM : EYE_DARK;
      const eyeW = maskW * 0.28;
      const eyeH = maskH * 0.18;
      const eyeY = -maskH * 0.08;
      const eyeSpacing = maskW * 0.32;

      // Left eye
      brush.ellipse(-eyeSpacing, eyeY, eyeW, eyeH, {
        fill: eyeColor,
        alpha: Math.max(0.6, eyeAlpha * 0.9),
        blendMode: 'normal',
      });

      // Right eye
      brush.ellipse(eyeSpacing, eyeY, eyeW, eyeH, {
        fill: eyeColor,
        alpha: Math.max(0.6, eyeAlpha * 0.9),
        blendMode: 'normal',
      });

      // Ornate pointed outlines around eyes
      const outlineAlpha = revealProgress(t, PHASE_EYES_REVEAL - 0.5, PHASE_FILIGREE_START);
      if (outlineAlpha > 0.01) {
        for (let side = -1; side <= 1; side += 2) {
          const ex = side * eyeSpacing;
          const ePath = brush.beginPath();
          // Pointed cat-eye shape
          ePath.moveTo(ex - eyeW * 1.3, eyeY);
          ePath.quadraticCurveTo(ex - eyeW * 0.5, eyeY - eyeH * 1.6, ex, eyeY - eyeH * 1.1);
          ePath.quadraticCurveTo(ex + eyeW * 0.5, eyeY - eyeH * 1.6, ex + eyeW * 1.3, eyeY);
          ePath.quadraticCurveTo(ex + eyeW * 0.5, eyeY + eyeH * 0.8, ex, eyeY + eyeH * 0.7);
          ePath.quadraticCurveTo(ex - eyeW * 0.5, eyeY + eyeH * 0.8, ex - eyeW * 1.3, eyeY);
          ePath.closePath();
          ePath.stroke({
            color: GOLD,
            width: 2,
            alpha: outlineAlpha * 0.8,
            blendMode: 'normal',
          });
        }
      }
    }

    // ---- GOLD FILIGREE ----
    const filigreeAlpha = revealProgress(t, PHASE_FILIGREE_START, PHASE_FILIGREE_END);
    if (filigreeAlpha > 0.01) {
      const fColor = isDark ? GOLD_HIGHLIGHT : GOLD;
      const fAlpha = Math.max(0.6, filigreeAlpha * 0.75);

      // Forehead swirls - symmetrical arcs across the top of the mask
      for (let side = -1; side <= 1; side += 2) {
        // Large forehead curl
        const curl1 = brush.beginPath();
        curl1.moveTo(side * maskW * 0.05, -maskH * 0.30);
        curl1.bezierCurveTo(
          side * maskW * 0.25, -maskH * 0.55,
          side * maskW * 0.55, -maskH * 0.50,
          side * maskW * 0.60, -maskH * 0.28,
        );
        curl1.stroke({ color: fColor, width: 2, alpha: fAlpha, blendMode: 'normal' });

        // Secondary curl branching upward
        const curl2 = brush.beginPath();
        curl2.moveTo(side * maskW * 0.30, -maskH * 0.45);
        curl2.bezierCurveTo(
          side * maskW * 0.40, -maskH * 0.60,
          side * maskW * 0.55, -maskH * 0.58,
          side * maskW * 0.50, -maskH * 0.38,
        );
        curl2.stroke({ color: fColor, width: 1.5, alpha: fAlpha * 0.8, blendMode: 'normal' });

        // Small spiral near the eye
        const spiralCx = side * maskW * 0.50;
        const spiralCy = -maskH * 0.12;
        const spiral = brush.beginPath();
        for (let si = 0; si < 12; si++) {
          const angle = si * 0.55;
          const sr = 2 + si * 1.2;
          const sx = spiralCx + Math.cos(angle) * sr;
          const sy = spiralCy + Math.sin(angle) * sr;
          if (si === 0) spiral.moveTo(sx, sy);
          else spiral.lineTo(sx, sy);
        }
        spiral.stroke({ color: fColor, width: 1.5, alpha: fAlpha * 0.7, blendMode: 'normal' });

        // Cheek swirl
        const cheek = brush.beginPath();
        cheek.moveTo(side * maskW * 0.15, maskH * 0.10);
        cheek.bezierCurveTo(
          side * maskW * 0.35, maskH * 0.05,
          side * maskW * 0.50, maskH * 0.20,
          side * maskW * 0.40, maskH * 0.35,
        );
        cheek.stroke({ color: fColor, width: 1.5, alpha: fAlpha * 0.65, blendMode: 'normal' });

        // Small decorative dots along the filigree
        brush.circle(side * maskW * 0.60, -maskH * 0.28, 3, {
          fill: fColor,
          alpha: fAlpha,
          blendMode: 'normal',
        });
        brush.circle(side * maskW * 0.45, -maskH * 0.50, 2.5, {
          fill: fColor,
          alpha: fAlpha * 0.8,
          blendMode: 'normal',
        });
      }

      // Central forehead line
      const centerLine = brush.beginPath();
      centerLine.moveTo(0, -maskH * 0.25);
      centerLine.quadraticCurveTo(0, -maskH * 0.45, 0, -maskH * 0.50);
      centerLine.stroke({ color: fColor, width: 2, alpha: fAlpha, blendMode: 'normal' });
    }

    // ---- FEATHERS ----
    const featherBaseAlpha = revealProgress(t, PHASE_FEATHER_START, PHASE_FEATHER_END);
    if (featherBaseAlpha > 0.01) {
      const featherOriginY = -maskH * 0.45;

      for (let fi = 0; fi < FEATHER_CONFIGS.length; fi++) {
        const fc = FEATHER_CONFIGS[fi];
        // Stagger each feather reveal
        const featherDelay = fc.revealOrder * 0.4;
        const fProgress = revealProgress(t, PHASE_FEATHER_START + featherDelay, PHASE_FEATHER_START + featherDelay + 1.5);
        if (fProgress < 0.01) continue;

        const fLen = maskH * fc.length * fProgress;
        const baseX = Math.sin(fc.angle) * maskW * 0.3;
        const baseY = featherOriginY;
        // Feather sway
        const sway = Math.sin(t * 0.8 + fc.revealOrder * 1.2) * 3 * breathAmt;

        const tipX = baseX + Math.sin(fc.angle) * fLen + fc.curve * maskW * 0.15 + sway;
        const tipY = baseY - fLen;
        const cpX = baseX + fc.curve * maskW * 0.20 + sway * 0.5;
        const cpY = baseY - fLen * 0.6;

        // Main feather spine
        const spine = brush.beginPath();
        spine.moveTo(baseX, baseY);
        spine.quadraticCurveTo(cpX, cpY, tipX, tipY);
        spine.stroke({
          color: fc.color,
          width: 2.5,
          alpha: Math.max(0.6, fProgress * 0.85),
          blendMode: 'normal',
        });

        // Feather barbs (short lines off the spine)
        const barbCount = 8;
        for (let bi = 1; bi <= barbCount; bi++) {
          const bFrac = bi / (barbCount + 1);
          // Approximate position along quadratic curve
          const bx = baseX * (1 - bFrac) * (1 - bFrac) + cpX * 2 * (1 - bFrac) * bFrac + tipX * bFrac * bFrac;
          const by = baseY * (1 - bFrac) * (1 - bFrac) + cpY * 2 * (1 - bFrac) * bFrac + tipY * bFrac * bFrac;
          const barbLen = fLen * 0.08 * (1 - bFrac * 0.5);
          const barbAngle = fc.angle + fc.curve * 0.3;

          // Left barb
          const barb = brush.beginPath();
          barb.moveTo(bx, by);
          barb.lineTo(bx - Math.cos(barbAngle) * barbLen, by - Math.sin(barbAngle) * barbLen * 0.5);
          barb.stroke({
            color: fc.color,
            width: 1.5,
            alpha: Math.max(0.6, fProgress * 0.6),
            blendMode: 'normal',
          });

          // Right barb
          const barb2 = brush.beginPath();
          barb2.moveTo(bx, by);
          barb2.lineTo(bx + Math.cos(barbAngle) * barbLen, by - Math.sin(barbAngle) * barbLen * 0.5);
          barb2.stroke({
            color: fc.color,
            width: 1.5,
            alpha: Math.max(0.6, fProgress * 0.6),
            blendMode: 'normal',
          });
        }
      }
    }

    // ---- GEMS / JEWELS ----
    const gemsBaseAlpha = revealProgress(t, PHASE_GEMS_START, PHASE_GEMS_END);
    if (gemsBaseAlpha > 0.01) {
      for (let gi = 0; gi < GEM_CONFIGS.length; gi++) {
        const gc = GEM_CONFIGS[gi];
        const gemDelay = gc.revealOrder * 0.25;
        const gProgress = revealProgress(t, PHASE_GEMS_START + gemDelay, PHASE_GEMS_START + gemDelay + 0.8);
        if (gProgress < 0.01) continue;

        const gx = gc.xFrac * maskW;
        const gy = gc.yFrac * maskH;
        const gr = gc.radius * maskW * gProgress;

        // Gem body
        brush.circle(gx, gy, gr, {
          fill: gc.color,
          alpha: Math.max(0.6, gProgress * 0.9),
          blendMode: 'normal',
        });

        // Gem highlight
        brush.circle(gx - gr * 0.25, gy - gr * 0.25, gr * 0.4, {
          fill: 0xffffff,
          alpha: gProgress * 0.5,
          blendMode: 'add',
        });

        // Gold setting ring
        brush.circle(gx, gy, gr * 1.2, {
          stroke: GOLD,
          strokeWidth: 1.5,
          alpha: Math.max(0.6, gProgress * 0.7),
          blendMode: 'normal',
        });
      }
    }

    brush.popMatrix();
  },

  async teardown(): Promise<void> {
    elapsedTime = 0;
  },
};

registerActor(actor);
export default actor;
