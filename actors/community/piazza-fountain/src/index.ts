/**
 * Piazza Fountain — Foreground Actor
 *
 * Top-down view of a circular Italian piazza with a central fountain.
 * Cobblestone ground radiates outward in a pattern of small rectangles,
 * a stone basin holds animated water jets and expanding ripple rings,
 * and a handful of pigeons wander around the piazza.
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
  id: 'piazza-fountain',
  name: 'Piazza Fountain',
  description:
    'Top-down circular piazza with cobblestones, a central fountain with water jets and ripples, and wandering pigeons',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'italy', 'piazza', 'fountain', 'birds'],
  createdAt: new Date('2026-03-21'),
  role: 'foreground',
  preferredDuration: 60,
  requiredContexts: ['display'],
};

// -- Constants ---------------------------------------------------------------
const MAX_COBBLES = 120;
const MAX_JETS = 16;
const MAX_RIPPLES = 6;
const MAX_PIGEONS = 5;
const BASIN_RINGS = 3;

// Palette
const COL_STONE_LIGHT = 0xc8bc9c;
const COL_STONE_MID   = 0xb8a890;
const COL_STONE_DARK  = 0x988870;
const COL_BASIN_RIM   = 0xc8c0b0;
const COL_BASIN_INNER = 0x5a98a8;
const COL_WATER_JET   = 0x6aaabb;
const COL_WATER_DROP  = 0x8acade;
const COL_PIGEON_BODY = 0x888888;
const COL_PIGEON_WING = 0x777777;
const COL_PIGEON_HEAD = 0x666688;

// -- Types -------------------------------------------------------------------
interface Cobble {
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number; // rotation angle to align radially
  color: number;
}

interface WaterJet {
  angle: number;      // radial angle from center
  dist: number;       // current distance from center
  maxDist: number;    // how far it arcs
  phase: number;      // animation phase offset
  speed: number;      // arc speed
  size: number;
  active: boolean;
}

interface Ripple {
  radius: number;
  maxRadius: number;
  life: number;
  speed: number;
}

interface Pigeon {
  x: number;
  y: number;
  angle: number;       // facing direction
  targetAngle: number;
  speed: number;
  walkPhase: number;
  walkSpeed: number;
  pauseTimer: number;  // frames remaining in pause
  wingFlap: number;    // brief wing flap animation
}

// -- Pre-allocated state -----------------------------------------------------
let canvasW = 0;
let canvasH = 0;
let centerX = 0;
let centerY = 0;
let piazzaRadius = 0;
let basinRadius = 0;
let innerBasinRadius = 0;

let cobbles: Cobble[] = [];
let jets: WaterJet[] = [];
let ripples: Ripple[] = [];
let pigeons: Pigeon[] = [];

// Reusable style objects
const rectStyle   = { fill: 0, alpha: 1.0, blendMode: 'normal' as const };
const circleStyle = { fill: 0, alpha: 1.0, blendMode: 'normal' as const };
const arcStyle    = { color: 0, width: 1.5, alpha: 1.0, blendMode: 'normal' as const };
const ellipseStyle = { fill: 0, alpha: 1.0, blendMode: 'normal' as const };
const lineStyle   = { color: 0, width: 1.5, alpha: 1.0, blendMode: 'normal' as const, cap: 'round' as const };

// -- Helpers -----------------------------------------------------------------
function resetJet(j: WaterJet): void {
  j.angle = Math.random() * Math.PI * 2;
  j.dist = 0;
  j.maxDist = basinRadius * (0.3 + Math.random() * 0.5);
  j.phase = Math.random() * Math.PI * 2;
  j.speed = 0.6 + Math.random() * 0.8;
  j.size = 1.5 + Math.random() * 1.5;
  j.active = true;
}

function resetPigeonTarget(p: Pigeon): void {
  // Pick a random spot on the piazza, outside the basin
  const minR = basinRadius + 20;
  const maxR = piazzaRadius - 15;
  const r = minR + Math.random() * (maxR - minR);
  const a = Math.random() * Math.PI * 2;
  const tx = centerX + Math.cos(a) * r;
  const ty = centerY + Math.sin(a) * r;
  p.targetAngle = Math.atan2(ty - p.y, tx - p.x);
  p.pauseTimer = 0;
}

// -- Actor -------------------------------------------------------------------
const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    centerX = canvasW * 0.5;
    centerY = canvasH * 0.45; // slightly above center for portrait composition
    piazzaRadius = Math.min(canvasW, canvasH) * 0.42;
    basinRadius = piazzaRadius * 0.22;
    innerBasinRadius = basinRadius * 0.75;

    // Generate cobblestones in radial rings
    cobbles = [];
    const ringCount = 8;
    const stoneColors = [COL_STONE_LIGHT, COL_STONE_MID, COL_STONE_DARK];
    for (let ring = 0; ring < ringCount && cobbles.length < MAX_COBBLES; ring++) {
      const ringRadius = basinRadius + 18 + ring * ((piazzaRadius - basinRadius - 18) / ringCount);
      const circumference = 2 * Math.PI * ringRadius;
      const count = Math.min(Math.floor(circumference / 14), MAX_COBBLES - cobbles.length);
      for (let i = 0; i < count && cobbles.length < MAX_COBBLES; i++) {
        const angle = (i / count) * Math.PI * 2 + (ring % 2) * (Math.PI / count);
        cobbles.push({
          x: centerX + Math.cos(angle) * ringRadius,
          y: centerY + Math.sin(angle) * ringRadius,
          w: 8 + Math.random() * 5,
          h: 4 + Math.random() * 3,
          angle,
          color: stoneColors[Math.floor(Math.random() * 3)],
        });
      }
    }

    // Pre-allocate water jets
    jets = [];
    for (let i = 0; i < MAX_JETS; i++) {
      const j: WaterJet = {
        angle: 0, dist: 0, maxDist: 0, phase: 0, speed: 0, size: 0, active: false,
      };
      resetJet(j);
      j.dist = Math.random() * j.maxDist; // stagger initial positions
      jets.push(j);
    }

    // Pre-allocate ripples
    ripples = [];
    for (let i = 0; i < MAX_RIPPLES; i++) {
      ripples.push({
        radius: (i / MAX_RIPPLES) * innerBasinRadius,
        maxRadius: innerBasinRadius * (0.7 + Math.random() * 0.3),
        life: i / MAX_RIPPLES,
        speed: 0.3 + Math.random() * 0.3,
      });
    }

    // Pre-allocate pigeons
    pigeons = [];
    for (let i = 0; i < MAX_PIGEONS; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = basinRadius + 30 + Math.random() * (piazzaRadius - basinRadius - 50);
      const p: Pigeon = {
        x: centerX + Math.cos(a) * r,
        y: centerY + Math.sin(a) * r,
        angle: Math.random() * Math.PI * 2,
        targetAngle: 0,
        speed: 0.3 + Math.random() * 0.3,
        walkPhase: Math.random() * Math.PI * 2,
        walkSpeed: 4 + Math.random() * 3,
        pauseTimer: Math.floor(Math.random() * 120),
        wingFlap: 0,
      };
      resetPigeonTarget(p);
      pigeons.push(p);
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const tSec = frame.time / 1000;
    const dt = Math.min(frame.delta / 16.667, 3);
    const isDark = api.context.display.isDarkMode();

    // ================================================================
    // PIAZZA GROUND — filled circle
    // ================================================================
    const groundColor = isDark ? 0x6a6050 : 0xa09480;
    circleStyle.fill = groundColor;
    circleStyle.alpha = 0.9;
    circleStyle.blendMode = 'normal';
    api.brush.circle(centerX, centerY, piazzaRadius, circleStyle);

    // Subtle radial gradient overlay for depth
    api.brush.circle(centerX, centerY, piazzaRadius, {
      fill: {
        type: 'radial',
        cx: 0.5, cy: 0.5, radius: 0.5,
        stops: [
          { offset: 0, color: isDark ? 0x807060 : 0xb0a490 },
          { offset: 1, color: isDark ? 0x504838 : 0x8a7e68 },
        ],
      },
      alpha: 0.6,
      blendMode: 'normal',
    });

    // ================================================================
    // COBBLESTONES — radial rectangles
    // ================================================================
    for (let i = 0; i < cobbles.length; i++) {
      const c = cobbles[i];
      const col = isDark
        ? (c.color === COL_STONE_LIGHT ? COL_STONE_MID : c.color === COL_STONE_MID ? COL_STONE_DARK : 0x787058)
        : c.color;

      api.brush.pushMatrix();
      api.brush.translate(c.x, c.y);
      api.brush.rotate(c.angle);

      rectStyle.fill = col;
      rectStyle.alpha = 0.7;
      rectStyle.blendMode = 'normal';
      api.brush.rect(-c.w * 0.5, -c.h * 0.5, c.w, c.h, rectStyle);

      // Light edge highlight
      rectStyle.fill = isDark ? COL_STONE_MID : COL_STONE_LIGHT;
      rectStyle.alpha = 0.25;
      api.brush.rect(-c.w * 0.5, -c.h * 0.5, c.w, 1, rectStyle);

      api.brush.popMatrix();
    }

    // ================================================================
    // FOUNTAIN BASIN — concentric stone circles (top-down view)
    // ================================================================
    // Outer basin rim
    arcStyle.color = isDark ? 0xa8a090 : COL_BASIN_RIM;
    arcStyle.width = 5;
    arcStyle.alpha = 0.85;
    arcStyle.blendMode = 'normal';
    api.brush.arc(centerX, centerY, basinRadius, 0, Math.PI * 2, arcStyle);

    // Basin rings
    for (let r = 0; r < BASIN_RINGS; r++) {
      const ringR = basinRadius - (r + 1) * (basinRadius - innerBasinRadius) / (BASIN_RINGS + 1);
      arcStyle.color = isDark ? 0x909080 : 0xb8b0a0;
      arcStyle.width = 2;
      arcStyle.alpha = 0.6;
      arcStyle.blendMode = 'normal';
      api.brush.arc(centerX, centerY, ringR, 0, Math.PI * 2, arcStyle);
    }

    // Water fill inside basin
    circleStyle.fill = isDark ? 0x3a7888 : COL_BASIN_INNER;
    circleStyle.alpha = 0.75;
    circleStyle.blendMode = 'normal';
    api.brush.circle(centerX, centerY, innerBasinRadius, circleStyle);

    // Water surface shimmer
    circleStyle.fill = 0xaaddee;
    circleStyle.alpha = 0.12 + 0.04 * Math.sin(tSec * 1.5);
    circleStyle.blendMode = 'add';
    api.brush.circle(centerX, centerY, innerBasinRadius * 0.9, circleStyle);

    // Central pedestal
    circleStyle.fill = isDark ? 0x909080 : COL_BASIN_RIM;
    circleStyle.alpha = 0.9;
    circleStyle.blendMode = 'normal';
    api.brush.circle(centerX, centerY, 6, circleStyle);

    // ================================================================
    // WATER JETS — particles shooting from center outward
    // ================================================================
    for (let i = 0; i < MAX_JETS; i++) {
      const j = jets[i];

      // Animate: jet travels outward along its arc
      j.dist += j.speed * dt;

      if (j.dist >= j.maxDist) {
        resetJet(j);
        continue;
      }

      // Parabolic height factor (for brightness/size variation)
      const t = j.dist / j.maxDist;
      const heightFactor = 4 * t * (1 - t); // peak at midpoint
      const currentSize = j.size * (0.6 + heightFactor * 0.8);

      // Position along radial line
      const jx = centerX + Math.cos(j.angle) * j.dist;
      const jy = centerY + Math.sin(j.angle) * j.dist;

      // Main droplet
      circleStyle.fill = COL_WATER_JET;
      circleStyle.alpha = 0.7 * (1 - t * 0.4);
      circleStyle.blendMode = 'normal';
      api.brush.circle(jx, jy, currentSize, circleStyle);

      // Bright highlight at peak
      if (heightFactor > 0.7) {
        circleStyle.fill = COL_WATER_DROP;
        circleStyle.alpha = 0.4;
        circleStyle.blendMode = 'add';
        api.brush.circle(jx, jy, currentSize * 0.6, circleStyle);
      }
    }

    // Central upward jet — pulsing circle at center
    const centralPulse = 0.5 + 0.5 * Math.sin(tSec * 3);
    circleStyle.fill = COL_WATER_DROP;
    circleStyle.alpha = 0.6 + centralPulse * 0.2;
    circleStyle.blendMode = 'normal';
    api.brush.circle(centerX, centerY, 3 + centralPulse * 2, circleStyle);

    circleStyle.fill = 0xcceeff;
    circleStyle.alpha = 0.3;
    circleStyle.blendMode = 'add';
    api.brush.circle(centerX, centerY, 5 + centralPulse * 3, circleStyle);

    // ================================================================
    // RIPPLE RINGS — expanding circles in the basin
    // ================================================================
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const r = ripples[i];
      r.life += r.speed * dt * 0.015;

      if (r.life >= 1.0) {
        r.life = 0;
        r.maxRadius = innerBasinRadius * (0.5 + Math.random() * 0.45);
        r.speed = 0.3 + Math.random() * 0.3;
      }

      r.radius = r.life * r.maxRadius;
      const rippleAlpha = 0.3 * (1 - r.life);
      if (rippleAlpha < 0.05) continue;

      arcStyle.color = isDark ? 0x8abaca : 0x9ad0e0;
      arcStyle.width = 1;
      arcStyle.alpha = rippleAlpha;
      arcStyle.blendMode = 'add';
      api.brush.arc(centerX, centerY, r.radius, 0, Math.PI * 2, arcStyle);
    }

    // ================================================================
    // PIGEONS — small grey shapes walking around
    // ================================================================
    for (let i = 0; i < MAX_PIGEONS; i++) {
      const p = pigeons[i];

      if (p.pauseTimer > 0) {
        // Pigeon is pausing (pecking, looking around)
        p.pauseTimer -= dt;
        if (p.pauseTimer <= 0) {
          resetPigeonTarget(p);
        }
      } else {
        // Walk towards target
        const angleDiff = p.targetAngle - p.angle;
        // Smooth turn
        p.angle += Math.sin(angleDiff) * 0.08 * dt;

        p.x += Math.cos(p.angle) * p.speed * dt;
        p.y += Math.sin(p.angle) * p.speed * dt;
        p.walkPhase += p.walkSpeed * dt * 0.05;

        // Check if too close to basin or too far from piazza center
        const distFromCenter = Math.sqrt(
          (p.x - centerX) * (p.x - centerX) + (p.y - centerY) * (p.y - centerY),
        );

        if (distFromCenter < basinRadius + 12) {
          // Push away from basin
          const pushAngle = Math.atan2(p.y - centerY, p.x - centerX);
          p.x = centerX + Math.cos(pushAngle) * (basinRadius + 14);
          p.y = centerY + Math.sin(pushAngle) * (basinRadius + 14);
          resetPigeonTarget(p);
        } else if (distFromCenter > piazzaRadius - 10) {
          // Keep on piazza
          const pullAngle = Math.atan2(centerY - p.y, centerX - p.x);
          p.angle = pullAngle;
          resetPigeonTarget(p);
        }

        // Randomly pause
        if (Math.random() < 0.003) {
          p.pauseTimer = 60 + Math.random() * 120;
        }
      }

      // Reduce wing flap
      if (p.wingFlap > 0) p.wingFlap -= dt * 0.05;

      // Draw pigeon
      const bodyCol = isDark ? 0x999999 : COL_PIGEON_BODY;
      const wingCol = isDark ? 0x888888 : COL_PIGEON_WING;
      const headCol = isDark ? 0x7777aa : COL_PIGEON_HEAD;

      api.brush.pushMatrix();
      api.brush.translate(p.x, p.y);
      api.brush.rotate(p.angle);

      // Body (oval)
      ellipseStyle.fill = bodyCol;
      ellipseStyle.alpha = 0.85;
      ellipseStyle.blendMode = 'normal';
      api.brush.ellipse(0, 0, 5, 3, ellipseStyle);

      // Wings — slight bob when walking
      const wingOffset = p.pauseTimer > 0 ? 0 : Math.sin(p.walkPhase) * 0.8;

      lineStyle.color = wingCol;
      lineStyle.width = 2;
      lineStyle.alpha = 0.75;
      lineStyle.blendMode = 'normal';
      api.brush.line(-1, -2, -3, -3 - wingOffset, lineStyle);
      api.brush.line(-1, 2, -3, 3 + wingOffset, lineStyle);

      // Head (small circle in front)
      circleStyle.fill = headCol;
      circleStyle.alpha = 0.85;
      circleStyle.blendMode = 'normal';
      api.brush.circle(4, 0, 2, circleStyle);

      // Tiny beak
      lineStyle.color = 0xcc9944;
      lineStyle.width = 1;
      lineStyle.alpha = 0.8;
      lineStyle.blendMode = 'normal';
      api.brush.line(5.5, 0, 7, p.pauseTimer > 0 ? 1 : 0, lineStyle);

      api.brush.popMatrix();
    }
  },

  async teardown(): Promise<void> {
    cobbles = [];
    jets = [];
    ripples = [];
    pigeons = [];
    canvasW = 0;
    canvasH = 0;
  },
};

registerActor(actor);
export default actor;
