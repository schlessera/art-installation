/**
 * Murano Glass -- Foreground Actor
 *
 * Swirling colorful glass-blowing patterns, molten and translucent.
 * A central molten glass blob slowly rotates and distorts while ribbons
 * of ruby red, cobalt blue, emerald green, and amber spiral outward.
 * Gold flecks scatter within the glass. Additive blending produces
 * translucent overlaps where colors mix like real Murano glass.
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
  id: 'murano-glass',
  name: 'Murano Glass',
  description:
    'Swirling colorful glass-blowing patterns with molten translucent ribbons and gold flecks',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'italy', 'venice', 'glass', 'abstract'],
  createdAt: new Date('2026-03-21'),
  role: 'foreground',
  preferredDuration: 60,
  requiredContexts: ['display'],
};

// -- Constants ---------------------------------------------------------------
const RIBBON_COUNT = 4;
const SEGMENTS_PER_RIBBON = 18;
const GOLD_FLECK_COUNT = 40;
const BLOB_LOBE_COUNT = 8;
const TWO_PI = Math.PI * 2;

// Ribbon palette
const COL_RUBY    = 0xcc2244;
const COL_COBALT  = 0x2244aa;
const COL_EMERALD = 0x22aa44;
const COL_AMBER   = 0xddaa22;
const RIBBON_COLORS = [COL_RUBY, COL_COBALT, COL_EMERALD, COL_AMBER];

// Dark-mode muted variants (shift toward darker)
const COL_RUBY_DARK    = 0x991133;
const COL_COBALT_DARK  = 0x1a3388;
const COL_EMERALD_DARK = 0x188833;
const COL_AMBER_DARK   = 0xbb8811;
const RIBBON_COLORS_DARK = [COL_RUBY_DARK, COL_COBALT_DARK, COL_EMERALD_DARK, COL_AMBER_DARK];

const COL_GOLD_FLECK   = 0xffd700;
const COL_GOLD_BRIGHT  = 0xfffff0;
const COL_BLOB_LIGHT   = 0xeeddcc;
const COL_BLOB_DARK    = 0xaa8866;

// -- State types -------------------------------------------------------------
interface RibbonSegment {
  baseAngle: number;   // base angular position around center
  baseRadius: number;  // base distance from center
  radiusW: number;     // ellipse half-width
  radiusH: number;     // ellipse half-height
  phaseOffset: number; // per-segment animation offset
}

interface GoldFleck {
  baseAngle: number;
  baseRadius: number;
  size: number;
  phaseOffset: number;
  speed: number;
}

// -- Pre-allocated state -----------------------------------------------------
let canvasW = 0;
let canvasH = 0;
let centerX = 0;
let centerY = 0;
let maxRadius = 0;

// Ribbons: RIBBON_COUNT arrays of SEGMENTS_PER_RIBBON segments
const ribbons: RibbonSegment[][] = [];
const goldFlecks: GoldFleck[] = [];

// Blob lobes (pre-computed base angles)
const blobLobeAngles: number[] = [];
const blobLobeRadii: number[] = [];

// Reusable style objects -- mutated in-place, never allocated in update()
const ellipseStyle = { fill: 0, alpha: 0.6, blendMode: 'add' as const };
const circleStyle  = { fill: 0, alpha: 0.6, blendMode: 'add' as const };
const blobStyle    = { fill: 0, alpha: 0.7, blendMode: 'add' as const };

// -- Actor -------------------------------------------------------------------
const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    centerX = canvasW * 0.5;
    centerY = canvasH * 0.5;
    maxRadius = Math.min(canvasW, canvasH) * 0.42;

    // Pre-allocate ribbons
    ribbons.length = 0;
    for (let r = 0; r < RIBBON_COUNT; r++) {
      const segs: RibbonSegment[] = [];
      const baseAngleOffset = (r / RIBBON_COUNT) * TWO_PI;
      for (let s = 0; s < SEGMENTS_PER_RIBBON; s++) {
        const t = s / SEGMENTS_PER_RIBBON;
        segs.push({
          baseAngle: baseAngleOffset + t * TWO_PI * 1.5,
          baseRadius: maxRadius * (0.12 + t * 0.78),
          radiusW: 6 + t * 14,
          radiusH: 4 + t * 8,
          phaseOffset: r * 1.7 + s * 0.3,
        });
      }
      ribbons.push(segs);
    }

    // Pre-allocate gold flecks
    goldFlecks.length = 0;
    for (let i = 0; i < GOLD_FLECK_COUNT; i++) {
      goldFlecks.push({
        baseAngle: Math.random() * TWO_PI,
        baseRadius: maxRadius * (0.08 + Math.random() * 0.82),
        size: 0.8 + Math.random() * 1.8,
        phaseOffset: Math.random() * TWO_PI,
        speed: 0.5 + Math.random() * 1.5,
      });
    }

    // Pre-allocate blob lobes
    blobLobeAngles.length = 0;
    blobLobeRadii.length = 0;
    for (let i = 0; i < BLOB_LOBE_COUNT; i++) {
      blobLobeAngles.push((i / BLOB_LOBE_COUNT) * TWO_PI);
      blobLobeRadii.push(maxRadius * (0.06 + Math.random() * 0.06));
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const tSec = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();
    const palette = isDark ? RIBBON_COLORS_DARK : RIBBON_COLORS;

    // Global slow rotation angle
    const globalRotation = tSec * 0.15;

    // ================================================================
    // CENTRAL MOLTEN GLASS BLOB
    // ================================================================
    // Draw blob as overlapping lobes that distort over time
    const blobBaseR = maxRadius * 0.18;
    for (let i = 0; i < BLOB_LOBE_COUNT; i++) {
      const angle = blobLobeAngles[i] + globalRotation * 1.3;
      const distort = Math.sin(tSec * 0.6 + i * 0.9) * maxRadius * 0.04;
      const r = blobBaseR + blobLobeRadii[i] + distort;
      const lx = centerX + Math.cos(angle) * r * 0.35;
      const ly = centerY + Math.sin(angle) * r * 0.35;
      const lobeW = r * 0.7 + Math.sin(tSec * 0.8 + i) * 4;
      const lobeH = r * 0.5 + Math.cos(tSec * 0.7 + i * 1.3) * 3;

      blobStyle.fill = isDark ? COL_BLOB_DARK : COL_BLOB_LIGHT;
      blobStyle.alpha = 0.6 + Math.sin(tSec * 0.5 + i * 0.8) * 0.1;
      blobStyle.blendMode = 'add';
      api.brush.ellipse(lx, ly, lobeW, lobeH, blobStyle);
    }

    // Core glow
    circleStyle.fill = isDark ? 0xddccaa : 0xffeedd;
    circleStyle.alpha = 0.7;
    circleStyle.blendMode = 'add';
    api.brush.circle(centerX, centerY, blobBaseR * 0.5, circleStyle);

    // ================================================================
    // COLOR RIBBONS -- spiraling outward
    // ================================================================
    for (let r = 0; r < RIBBON_COUNT; r++) {
      const ribbon = ribbons[r];
      const color = palette[r];

      for (let s = 0; s < SEGMENTS_PER_RIBBON; s++) {
        const seg = ribbon[s];
        const t = s / SEGMENTS_PER_RIBBON;

        // Animate the angle: slow rotation + per-segment wave
        const angle = seg.baseAngle
          + globalRotation
          + Math.sin(tSec * 0.4 + seg.phaseOffset) * 0.3;

        // Animate radius: gentle breathing
        const radius = seg.baseRadius
          + Math.sin(tSec * 0.5 + seg.phaseOffset) * maxRadius * 0.03;

        const sx = centerX + Math.cos(angle) * radius;
        const sy = centerY + Math.sin(angle) * radius;

        // Size grows toward outer edge, with pulsation
        const pulse = 1.0 + Math.sin(tSec * 0.7 + seg.phaseOffset) * 0.2;
        const rw = seg.radiusW * pulse;
        const rh = seg.radiusH * pulse;

        // Alpha varies for translucency: higher near center, fading outward
        const baseAlpha = 0.75 - t * 0.15;
        const alphaWave = Math.sin(tSec * 0.6 + seg.phaseOffset) * 0.08;

        ellipseStyle.fill = color;
        ellipseStyle.alpha = baseAlpha + alphaWave;
        ellipseStyle.blendMode = 'add';
        api.brush.ellipse(sx, sy, rw, rh, ellipseStyle);
      }
    }

    // ================================================================
    // GOLD FLECKS -- tiny bright dots within the glass
    // ================================================================
    for (let i = 0; i < GOLD_FLECK_COUNT; i++) {
      const fleck = goldFlecks[i];

      // Rotate with the piece + individual drift
      const angle = fleck.baseAngle
        + globalRotation
        + Math.sin(tSec * fleck.speed + fleck.phaseOffset) * 0.4;

      const radius = fleck.baseRadius
        + Math.sin(tSec * 0.8 + fleck.phaseOffset) * maxRadius * 0.03;

      const fx = centerX + Math.cos(angle) * radius;
      const fy = centerY + Math.sin(angle) * radius;

      // Sparkle effect
      const sparkle = 0.5 + 0.5 * Math.sin(tSec * fleck.speed * 2 + fleck.phaseOffset);

      circleStyle.fill = sparkle > 0.7 ? COL_GOLD_BRIGHT : COL_GOLD_FLECK;
      circleStyle.alpha = 0.6 + sparkle * 0.35;
      circleStyle.blendMode = 'add';
      api.brush.circle(fx, fy, fleck.size * (0.8 + sparkle * 0.4), circleStyle);
    }
  },

  async teardown(): Promise<void> {
    ribbons.length = 0;
    goldFlecks.length = 0;
    blobLobeAngles.length = 0;
    blobLobeRadii.length = 0;
    canvasW = 0;
    canvasH = 0;
  },
};

registerActor(actor);
export default actor;
