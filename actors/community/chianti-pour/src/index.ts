/**
 * Chianti Pour -- Foreground Actor
 *
 * Red wine pouring from a tilted bottle silhouette at the upper-right into a
 * stemmed wine glass below. The wine stream follows an animated bezier curve
 * with varying thickness. The glass slowly fills with wine and small splash
 * droplets appear where the stream meets the wine surface.
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
  id: 'chianti-pour',
  name: 'Chianti Pour',
  description:
    'Red wine pouring from a tilted bottle into a stemmed glass with animated stream and splash droplets',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'italy', 'wine', 'chianti', 'pour'],
  createdAt: new Date('2026-03-21'),
  role: 'foreground',
  preferredDuration: 60,
  requiredContexts: ['display'],
};

// -- Constants ---------------------------------------------------------------
const MAX_STREAM_SEGMENTS = 24;
const MAX_SPLASH_PARTICLES = 20;
const MAX_DROPLETS = 12;

// Wine palette
const COL_WINE_DEEP = 0x722f37;
const COL_WINE_DARK = 0x4a1a20;
const COL_WINE_HIGHLIGHT = 0x993344;

// Bottle palette
const COL_BOTTLE = 0x2a4a2a;
const COL_BOTTLE_DARK = 0x1a3a1a;
const COL_BOTTLE_HIGHLIGHT = 0x3a5a3a;

// Glass palette
const COL_GLASS = 0xc8d8e8;
const COL_GLASS_RIM = 0xe0e8f0;

// -- State types -------------------------------------------------------------
interface StreamSegment {
  x: number;
  y: number;
  width: number;
  phase: number;
}

interface SplashParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  active: boolean;
}

interface Droplet {
  x: number;
  y: number;
  vy: number;
  size: number;
  alpha: number;
  active: boolean;
}

// -- Pre-allocated state -----------------------------------------------------
let canvasW = 0;
let canvasH = 0;

// Bottle geometry
let bottleX = 0;
let bottleY = 0;
let bottleW = 0;
let bottleH = 0;
let bottleNeckW = 0;
let bottleNeckH = 0;
let pourTipX = 0;
let pourTipY = 0;

// Glass geometry
let glassX = 0;
let glassTopY = 0;
let glassBowlW = 0;
let glassBowlH = 0;
let glassStemH = 0;
let glassStemW = 0;
let glassBaseW = 0;
let glassBaseH = 0;
let glassBottomY = 0;

// Wine fill state
let fillLevel = 0; // 0..1
let fillRate = 0;

// Pre-allocated arrays
let streamSegments: StreamSegment[] = [];
let splashParticles: SplashParticle[] = [];
let droplets: Droplet[] = [];

// Reusable style objects
const rectStyle = { fill: 0, alpha: 1.0, blendMode: 'normal' as const };
const circleStyle = { fill: 0, alpha: 1.0, blendMode: 'normal' as const };
const ellipseStyle = { fill: 0, alpha: 1.0, blendMode: 'normal' as const };
const arcStyle = { color: 0, width: 2, alpha: 1.0, blendMode: 'normal' as const };

// -- Helpers -----------------------------------------------------------------
function resetSplash(s: SplashParticle, x: number, y: number): void {
  s.x = x;
  s.y = y;
  s.vx = (Math.random() - 0.5) * 2.5;
  s.vy = -(1.0 + Math.random() * 2.0);
  s.life = 0;
  s.maxLife = 15 + Math.random() * 20;
  s.size = 1.0 + Math.random() * 1.5;
  s.active = true;
}

function resetDroplet(d: Droplet, x: number, y: number): void {
  d.x = x + (Math.random() - 0.5) * 6;
  d.y = y;
  d.vy = 0.5 + Math.random() * 1.5;
  d.size = 1.0 + Math.random() * 1.2;
  d.alpha = 0.7 + Math.random() * 0.3;
  d.active = true;
}

// Bezier interpolation helper
function bezierPoint(
  t: number,
  p0x: number, p0y: number,
  p1x: number, p1y: number,
  p2x: number, p2y: number,
  p3x: number, p3y: number,
): { x: number; y: number } {
  const u = 1 - t;
  const uu = u * u;
  const uuu = uu * u;
  const tt = t * t;
  const ttt = tt * t;
  return {
    x: uuu * p0x + 3 * uu * t * p1x + 3 * u * tt * p2x + ttt * p3x,
    y: uuu * p0y + 3 * uu * t * p1y + 3 * u * tt * p2y + ttt * p3y,
  };
}

// -- Actor -------------------------------------------------------------------
const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    // Bottle: upper-right, tilted (we draw it as a series of rects)
    bottleW = canvasW * 0.10;
    bottleH = canvasH * 0.28;
    bottleNeckW = bottleW * 0.30;
    bottleNeckH = bottleH * 0.35;
    bottleX = canvasW * 0.68;
    bottleY = canvasH * 0.06;

    // Pour tip: where wine exits the bottle neck
    pourTipX = bottleX - bottleW * 0.15;
    pourTipY = bottleY + bottleH * 0.15;

    // Glass: center-lower area
    glassX = canvasW * 0.42;
    glassBowlW = canvasW * 0.18;
    glassBowlH = canvasH * 0.14;
    glassTopY = canvasH * 0.52;
    glassStemH = canvasH * 0.10;
    glassStemW = canvasW * 0.015;
    glassBaseW = canvasW * 0.12;
    glassBaseH = canvasH * 0.012;
    glassBottomY = glassTopY + glassBowlH + glassStemH + glassBaseH;

    // Wine fill
    fillLevel = 0.05;
    fillRate = 0.0008;

    // Pre-allocate stream segments
    streamSegments = [];
    for (let i = 0; i < MAX_STREAM_SEGMENTS; i++) {
      streamSegments.push({
        x: 0,
        y: 0,
        width: 2,
        phase: (i / MAX_STREAM_SEGMENTS) * Math.PI * 2,
      });
    }

    // Pre-allocate splash particles
    splashParticles = [];
    for (let i = 0; i < MAX_SPLASH_PARTICLES; i++) {
      splashParticles.push({
        x: 0, y: 0, vx: 0, vy: 0,
        life: 0, maxLife: 25, size: 1, active: false,
      });
    }

    // Pre-allocate droplets
    droplets = [];
    for (let i = 0; i < MAX_DROPLETS; i++) {
      droplets.push({
        x: 0, y: 0, vy: 0, size: 1, alpha: 0.7, active: false,
      });
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const tSec = frame.time / 1000;
    const dt = Math.min(frame.delta / 16.667, 3);
    const isDark = api.context.display.isDarkMode();

    // Update fill level (cycles slowly)
    fillLevel += fillRate * dt;
    if (fillLevel > 0.85) {
      fillLevel = 0.85;
      fillRate = -0.0003;
    } else if (fillLevel < 0.05) {
      fillLevel = 0.05;
      fillRate = 0.0008;
    }

    // Wine surface Y in the glass
    const wineSurfaceY = glassTopY + glassBowlH * (1 - fillLevel);

    // Stream target: where pour hits the wine surface
    const streamTargetX = glassX + (Math.random() - 0.5) * 2;
    const streamTargetY = wineSurfaceY;

    // ================================================================
    // BOTTLE SILHOUETTE (tilted, upper-right)
    // ================================================================
    // Bottle body (main rectangle, slightly tilted via offset)
    const tiltOffset = bottleW * 0.35;

    // Body
    rectStyle.fill = COL_BOTTLE;
    rectStyle.alpha = 0.92;
    rectStyle.blendMode = 'normal';
    api.brush.rect(
      bottleX - tiltOffset * 0.2,
      bottleY + bottleNeckH,
      bottleW,
      bottleH - bottleNeckH,
      rectStyle,
    );

    // Body gradient overlay for depth
    rectStyle.fill = COL_BOTTLE_DARK;
    rectStyle.alpha = 0.4;
    api.brush.rect(
      bottleX - tiltOffset * 0.2 + bottleW * 0.6,
      bottleY + bottleNeckH,
      bottleW * 0.4,
      bottleH - bottleNeckH,
      rectStyle,
    );

    // Body highlight strip
    rectStyle.fill = COL_BOTTLE_HIGHLIGHT;
    rectStyle.alpha = 0.3;
    api.brush.rect(
      bottleX - tiltOffset * 0.2 + bottleW * 0.15,
      bottleY + bottleNeckH,
      bottleW * 0.15,
      bottleH - bottleNeckH,
      rectStyle,
    );

    // Neck
    const neckX = bottleX - tiltOffset * 0.1 + (bottleW - bottleNeckW) * 0.3;
    rectStyle.fill = COL_BOTTLE;
    rectStyle.alpha = 0.92;
    api.brush.rect(neckX, bottleY, bottleNeckW, bottleNeckH + 4, rectStyle);

    // Neck highlight
    rectStyle.fill = COL_BOTTLE_HIGHLIGHT;
    rectStyle.alpha = 0.25;
    api.brush.rect(neckX + bottleNeckW * 0.2, bottleY, bottleNeckW * 0.2, bottleNeckH + 4, rectStyle);

    // Shoulder (transition from neck to body)
    ellipseStyle.fill = COL_BOTTLE;
    ellipseStyle.alpha = 0.9;
    ellipseStyle.blendMode = 'normal';
    api.brush.ellipse(
      bottleX - tiltOffset * 0.15 + bottleW * 0.5,
      bottleY + bottleNeckH,
      bottleW * 0.52,
      bottleW * 0.18,
      ellipseStyle,
    );

    // Label area (lighter strip)
    rectStyle.fill = isDark ? 0x3a3025 : 0xf0e8d0;
    rectStyle.alpha = 0.6;
    api.brush.rect(
      bottleX - tiltOffset * 0.2 + bottleW * 0.1,
      bottleY + bottleNeckH + (bottleH - bottleNeckH) * 0.3,
      bottleW * 0.8,
      (bottleH - bottleNeckH) * 0.25,
      rectStyle,
    );

    // Wine drip from pour tip
    circleStyle.fill = COL_WINE_DEEP;
    circleStyle.alpha = 0.85;
    circleStyle.blendMode = 'normal';
    const dripPulse = 0.5 + 0.5 * Math.sin(tSec * 4);
    api.brush.circle(pourTipX, pourTipY, 2.5 + dripPulse, circleStyle);

    // ================================================================
    // WINE STREAM (bezier curve from bottle to glass)
    // ================================================================
    // Control points for bezier
    const cp1x = pourTipX - canvasW * 0.05;
    const cp1y = pourTipY + canvasH * 0.15;
    const cp2x = streamTargetX + canvasW * 0.03;
    const cp2y = streamTargetY - canvasH * 0.12;

    // Draw stream as series of circles along bezier
    for (let i = 0; i < MAX_STREAM_SEGMENTS; i++) {
      const seg = streamSegments[i];
      const t = i / (MAX_STREAM_SEGMENTS - 1);
      const pt = bezierPoint(
        t,
        pourTipX, pourTipY,
        cp1x, cp1y,
        cp2x, cp2y,
        streamTargetX, streamTargetY,
      );

      seg.x = pt.x + Math.sin(tSec * 5 + seg.phase) * (1.5 + t * 1.5);
      seg.y = pt.y;

      // Width tapers: thickest in middle, thinner at ends
      const taper = Math.sin(t * Math.PI);
      const wobble = 1.0 + 0.2 * Math.sin(tSec * 6 + i * 0.5);
      seg.width = (2.0 + taper * 4.0) * wobble;

      // Wine color varies along stream
      const colorChoice = t < 0.3 ? COL_WINE_DARK : (t < 0.7 ? COL_WINE_DEEP : COL_WINE_HIGHLIGHT);
      circleStyle.fill = colorChoice;
      circleStyle.alpha = 0.75 + taper * 0.15;
      circleStyle.blendMode = 'normal';
      api.brush.circle(seg.x, seg.y, seg.width, circleStyle);

      // Highlight on stream
      if (i % 3 === 0) {
        circleStyle.fill = COL_WINE_HIGHLIGHT;
        circleStyle.alpha = 0.2;
        circleStyle.blendMode = 'add';
        api.brush.circle(seg.x - seg.width * 0.3, seg.y, seg.width * 0.4, circleStyle);
      }
    }

    // ================================================================
    // WINE GLASS
    // ================================================================

    // Glass bowl (triangle approximated with trapezoid rects)
    const bowlSegments = 8;
    for (let i = 0; i < bowlSegments; i++) {
      const t = i / bowlSegments;
      const segY = glassTopY + t * glassBowlH;
      const segH = glassBowlH / bowlSegments + 1;
      // Bowl narrows toward bottom
      const widthFactor = 1.0 - t * 0.7;
      const segW = glassBowlW * widthFactor;

      // Glass outline (transparent with rim)
      rectStyle.fill = COL_GLASS;
      rectStyle.alpha = isDark ? 0.15 : 0.12;
      rectStyle.blendMode = 'normal';
      api.brush.rect(glassX - segW / 2, segY, segW, segH, rectStyle);

      // Glass edge highlights
      rectStyle.fill = COL_GLASS_RIM;
      rectStyle.alpha = isDark ? 0.25 : 0.2;
      api.brush.rect(glassX - segW / 2, segY, 1.5, segH, rectStyle);
      api.brush.rect(glassX + segW / 2 - 1.5, segY, 1.5, segH, rectStyle);
    }

    // Glass rim (top edge)
    ellipseStyle.fill = COL_GLASS_RIM;
    ellipseStyle.alpha = 0.35;
    ellipseStyle.blendMode = 'normal';
    api.brush.ellipse(glassX, glassTopY, glassBowlW / 2, 3, ellipseStyle);

    // Glass stem
    rectStyle.fill = COL_GLASS;
    rectStyle.alpha = isDark ? 0.2 : 0.18;
    rectStyle.blendMode = 'normal';
    api.brush.rect(
      glassX - glassStemW / 2,
      glassTopY + glassBowlH,
      glassStemW,
      glassStemH,
      rectStyle,
    );

    // Stem highlight
    rectStyle.fill = COL_GLASS_RIM;
    rectStyle.alpha = 0.15;
    api.brush.rect(
      glassX - glassStemW * 0.15,
      glassTopY + glassBowlH,
      glassStemW * 0.3,
      glassStemH,
      rectStyle,
    );

    // Glass base
    ellipseStyle.fill = COL_GLASS;
    ellipseStyle.alpha = isDark ? 0.22 : 0.18;
    ellipseStyle.blendMode = 'normal';
    api.brush.ellipse(
      glassX,
      glassTopY + glassBowlH + glassStemH,
      glassBaseW / 2,
      glassBaseH,
      ellipseStyle,
    );

    // Base rim highlight
    arcStyle.color = COL_GLASS_RIM;
    arcStyle.width = 1.2;
    arcStyle.alpha = 0.3;
    arcStyle.blendMode = 'normal';
    api.brush.arc(
      glassX,
      glassTopY + glassBowlH + glassStemH,
      glassBaseW / 2,
      0, Math.PI,
      arcStyle,
    );

    // ================================================================
    // WINE FILL inside glass
    // ================================================================
    const fillSegments = 6;
    for (let i = 0; i < fillSegments; i++) {
      const t = i / fillSegments;
      const segStartT = 1.0 - fillLevel + t * fillLevel;
      const segY = glassTopY + segStartT * glassBowlH;
      const segH = (glassBowlH * fillLevel) / fillSegments + 1;

      // Bowl narrows toward bottom
      const widthFactor = 1.0 - segStartT * 0.7;
      const segW = (glassBowlW - 4) * widthFactor;

      // Wine fill
      const wineColor = t < 0.3 ? COL_WINE_HIGHLIGHT : (t < 0.7 ? COL_WINE_DEEP : COL_WINE_DARK);
      rectStyle.fill = wineColor;
      rectStyle.alpha = 0.82;
      rectStyle.blendMode = 'normal';
      api.brush.rect(glassX - segW / 2, segY, segW, segH, rectStyle);
    }

    // Wine surface highlight
    const surfaceWidthFactor = 1.0 - (1.0 - fillLevel) * 0.7;
    const surfaceW = (glassBowlW - 6) * surfaceWidthFactor;
    ellipseStyle.fill = COL_WINE_HIGHLIGHT;
    ellipseStyle.alpha = 0.35 + 0.1 * Math.sin(tSec * 2);
    ellipseStyle.blendMode = 'add';
    api.brush.ellipse(glassX, wineSurfaceY + 1, surfaceW / 2, 2.5, ellipseStyle);

    // Wine meniscus (dark edge at surface)
    arcStyle.color = COL_WINE_DARK;
    arcStyle.width = 1.5;
    arcStyle.alpha = 0.6;
    arcStyle.blendMode = 'normal';
    api.brush.arc(glassX, wineSurfaceY + 1, surfaceW / 2 - 2, 0, Math.PI, arcStyle);

    // ================================================================
    // SPLASH PARTICLES where stream hits wine surface
    // ================================================================
    // Spawn new splashes
    let nextSplashIdx = -1;
    for (let i = 0; i < MAX_SPLASH_PARTICLES; i++) {
      if (!splashParticles[i].active) {
        nextSplashIdx = i;
        break;
      }
    }
    if (nextSplashIdx >= 0 && Math.random() < 0.3 * dt) {
      resetSplash(splashParticles[nextSplashIdx], streamTargetX, wineSurfaceY);
    }

    // Update and draw splashes
    for (let i = 0; i < MAX_SPLASH_PARTICLES; i++) {
      const s = splashParticles[i];
      if (!s.active) continue;

      s.life += dt;
      if (s.life >= s.maxLife) {
        s.active = false;
        continue;
      }

      s.vy += 0.1 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;

      const lifeRatio = s.life / s.maxLife;
      const alpha = 0.7 * (1 - lifeRatio);
      if (alpha < 0.05) continue;

      circleStyle.fill = COL_WINE_HIGHLIGHT;
      circleStyle.alpha = Math.max(alpha, 0.6);
      circleStyle.blendMode = 'normal';
      api.brush.circle(s.x, s.y, s.size * (1 - lifeRatio * 0.5), circleStyle);
    }

    // ================================================================
    // STRAY DROPLETS along the stream
    // ================================================================
    // Spawn droplets
    let nextDropIdx = -1;
    for (let i = 0; i < MAX_DROPLETS; i++) {
      if (!droplets[i].active) {
        nextDropIdx = i;
        break;
      }
    }
    if (nextDropIdx >= 0 && Math.random() < 0.15 * dt) {
      const spawnT = 0.2 + Math.random() * 0.6;
      const spawnPt = bezierPoint(
        spawnT,
        pourTipX, pourTipY,
        cp1x, cp1y,
        cp2x, cp2y,
        streamTargetX, streamTargetY,
      );
      resetDroplet(droplets[nextDropIdx], spawnPt.x, spawnPt.y);
    }

    // Update and draw droplets
    for (let i = 0; i < MAX_DROPLETS; i++) {
      const d = droplets[i];
      if (!d.active) continue;

      d.vy += 0.15 * dt;
      d.y += d.vy * dt;
      d.alpha -= 0.015 * dt;

      if (d.alpha < 0.1 || d.y > glassBottomY) {
        d.active = false;
        continue;
      }

      circleStyle.fill = COL_WINE_DEEP;
      circleStyle.alpha = Math.max(d.alpha, 0.6);
      circleStyle.blendMode = 'normal';
      api.brush.circle(d.x, d.y, d.size, circleStyle);
    }

    // ================================================================
    // SUBTLE GLOW / AMBIENCE on wine in glass
    // ================================================================
    if (isDark) {
      const glowPulse = 0.06 + 0.02 * Math.sin(tSec * 0.8);
      ellipseStyle.fill = COL_WINE_HIGHLIGHT;
      ellipseStyle.alpha = glowPulse;
      ellipseStyle.blendMode = 'add';
      api.brush.ellipse(
        glassX,
        glassTopY + glassBowlH * (1 - fillLevel * 0.5),
        glassBowlW * 0.35,
        glassBowlH * fillLevel * 0.4,
        ellipseStyle,
      );
    }
  },

  async teardown(): Promise<void> {
    streamSegments = [];
    splashParticles = [];
    droplets = [];
    fillLevel = 0;
    canvasW = 0;
    canvasH = 0;
  },
};

registerActor(actor);
export default actor;
