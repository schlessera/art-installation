/**
 * Bocce Balls — Foreground Actor
 *
 * Colorful bocce balls roll in from the sides of the canvas toward
 * a small white pallino. Realistic 2D physics with momentum, friction,
 * and ball-to-ball collisions. Classic Italian bocce colors with
 * 3D-style highlights and shadows.
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
  id: 'bocce-balls',
  name: 'Bocce Balls',
  description: 'Colorful bocce balls rolling with realistic physics, collisions, and friction',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'italy', 'bocce', 'physics', 'game'],
  createdAt: new Date('2026-03-20'),
  preferredDuration: 60,
  requiredContexts: ['display'],
};

// Pool sizes
const MAX_BALLS = 10;
const PALLINO_INDEX = 0; // First ball in pool is the pallino

// Bocce ball colors (classic set)
const BALL_COLORS_LIGHT = [
  0xffffff,   // pallino (white)
  0xcc2222,   // red
  0xcc2222,   // red
  0x228833,   // green
  0x228833,   // green
  0x2255bb,   // blue
  0x2255bb,   // blue
  0xccaa22,   // yellow
  0xccaa22,   // yellow
  0xcc2222,   // red (extra)
];

const BALL_COLORS_DARK = [
  0xeeeedd,   // pallino (off-white)
  0xff4444,   // red
  0xff4444,   // red
  0x44cc66,   // green
  0x44cc66,   // green
  0x4488ff,   // blue
  0x4488ff,   // blue
  0xffdd44,   // yellow
  0xffdd44,   // yellow
  0xff4444,   // red (extra)
];

// Physics constants
const FRICTION = 0.985;
const BALL_RADIUS = 18;
const PALLINO_RADIUS = 8;
const MIN_SPEED = 0.02;
const RESTITUTION = 0.75;

interface Ball {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  colorIndex: number;
  launched: boolean;
  settled: boolean;
}

let canvasW = 0;
let canvasH = 0;
let balls: Ball[] = [];
let nextLaunchTime = 0;
let launchCount = 0;
let glowDataUrl = '';
let shadowDataUrl = '';

// Reusable collision vars
let collDx = 0;
let collDy = 0;
let collDist = 0;
let collNx = 0;
let collNy = 0;
let collDvx = 0;
let collDvy = 0;
let collDvDotN = 0;
let collOverlap = 0;

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    launchCount = 0;
    nextLaunchTime = 800; // pallino launches first

    // Pre-allocate ball pool
    balls = [];
    for (let i = 0; i < MAX_BALLS; i++) {
      balls.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: i === PALLINO_INDEX ? PALLINO_RADIUS : BALL_RADIUS,
        colorIndex: i,
        launched: false,
        settled: false,
      });
    }

    // Pre-render glow/highlight texture
    const gc = document.createElement('canvas');
    gc.width = gc.height = 64;
    const gctx = gc.getContext('2d')!;
    const gGrad = gctx.createRadialGradient(24, 20, 2, 32, 32, 30);
    gGrad.addColorStop(0, 'rgba(255,255,255,0.9)');
    gGrad.addColorStop(0.3, 'rgba(255,255,255,0.3)');
    gGrad.addColorStop(0.7, 'rgba(255,255,255,0)');
    gGrad.addColorStop(1, 'rgba(255,255,255,0)');
    gctx.fillStyle = gGrad;
    gctx.fillRect(0, 0, 64, 64);
    glowDataUrl = gc.toDataURL();

    // Pre-render shadow texture
    const sc = document.createElement('canvas');
    sc.width = sc.height = 64;
    const sctx = sc.getContext('2d')!;
    const sGrad = sctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    sGrad.addColorStop(0, 'rgba(0,0,0,0.4)');
    sGrad.addColorStop(0.6, 'rgba(0,0,0,0.15)');
    sGrad.addColorStop(1, 'rgba(0,0,0,0)');
    sctx.fillStyle = sGrad;
    sctx.fillRect(0, 0, 64, 64);
    shadowDataUrl = sc.toDataURL();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time;
    const dt = Math.min(frame.deltaTime, 32) / 16;
    const isDark = api.context.display.isDarkMode();
    const colors = isDark ? BALL_COLORS_DARK : BALL_COLORS_LIGHT;

    // --- Launch logic ---
    if (launchCount < MAX_BALLS && t > nextLaunchTime) {
      const idx = launchCount;
      const b = balls[idx];
      b.active = true;
      b.launched = true;
      b.settled = false;

      if (idx === PALLINO_INDEX) {
        // Pallino: toss toward center from a random side
        const fromLeft = Math.random() > 0.5;
        b.x = fromLeft ? -PALLINO_RADIUS : canvasW + PALLINO_RADIUS;
        b.y = canvasH * (0.35 + Math.random() * 0.3);
        const targetX = canvasW * (0.35 + Math.random() * 0.3);
        const targetY = canvasH * (0.35 + Math.random() * 0.3);
        const angle = Math.atan2(targetY - b.y, targetX - b.x);
        const speed = 3.5 + Math.random() * 1.5;
        b.vx = Math.cos(angle) * speed;
        b.vy = Math.sin(angle) * speed;
        nextLaunchTime = t + 2000 + Math.random() * 500;
      } else {
        // Bocce ball: roll in from alternating sides, aim near pallino
        const fromLeft = idx % 2 === 0;
        b.x = fromLeft ? -BALL_RADIUS : canvasW + BALL_RADIUS;
        b.y = canvasH * (0.2 + Math.random() * 0.6);
        // Aim toward pallino with some randomness
        const pall = balls[PALLINO_INDEX];
        const targetX = pall.x + (Math.random() - 0.5) * 80;
        const targetY = pall.y + (Math.random() - 0.5) * 80;
        const angle = Math.atan2(targetY - b.y, targetX - b.x);
        const speed = 3.0 + Math.random() * 2.5;
        b.vx = Math.cos(angle) * speed;
        b.vy = Math.sin(angle) * speed;
        nextLaunchTime = t + 1800 + Math.random() * 1200;
      }

      launchCount++;
    }

    // --- Physics update ---
    for (let i = 0; i < MAX_BALLS; i++) {
      const b = balls[i];
      if (!b.active) continue;

      // Apply friction
      b.vx *= FRICTION;
      b.vy *= FRICTION;

      // Stop if very slow
      const speedSq = b.vx * b.vx + b.vy * b.vy;
      if (speedSq < MIN_SPEED * MIN_SPEED) {
        b.vx = 0;
        b.vy = 0;
        b.settled = true;
      }

      // Move
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // Wall bounces with damping
      if (b.x - b.radius < 0) {
        b.x = b.radius;
        b.vx = Math.abs(b.vx) * 0.6;
      } else if (b.x + b.radius > canvasW) {
        b.x = canvasW - b.radius;
        b.vx = -Math.abs(b.vx) * 0.6;
      }
      if (b.y - b.radius < 0) {
        b.y = b.radius;
        b.vy = Math.abs(b.vy) * 0.6;
      } else if (b.y + b.radius > canvasH) {
        b.y = canvasH - b.radius;
        b.vy = -Math.abs(b.vy) * 0.6;
      }
    }

    // --- Ball-to-ball collisions ---
    for (let i = 0; i < MAX_BALLS; i++) {
      const a = balls[i];
      if (!a.active) continue;

      for (let j = i + 1; j < MAX_BALLS; j++) {
        const b = balls[j];
        if (!b.active) continue;

        collDx = b.x - a.x;
        collDy = b.y - a.y;
        const minDist = a.radius + b.radius;
        const distSq = collDx * collDx + collDy * collDy;

        if (distSq < minDist * minDist && distSq > 0) {
          collDist = Math.sqrt(distSq);
          collNx = collDx / collDist;
          collNy = collDy / collDist;

          // Relative velocity along collision normal
          collDvx = a.vx - b.vx;
          collDvy = a.vy - b.vy;
          collDvDotN = collDvx * collNx + collDvy * collNy;

          // Only resolve if balls are moving toward each other
          if (collDvDotN > 0) {
            // Mass proportional to radius squared
            const massA = a.radius * a.radius;
            const massB = b.radius * b.radius;
            const totalMass = massA + massB;

            const impulse = (2 * collDvDotN * RESTITUTION) / totalMass;

            a.vx -= impulse * massB * collNx;
            a.vy -= impulse * massB * collNy;
            b.vx += impulse * massA * collNx;
            b.vy += impulse * massA * collNy;

            // Un-settle on collision
            a.settled = false;
            b.settled = false;
          }

          // Separate overlapping balls
          collOverlap = minDist - collDist;
          if (collOverlap > 0) {
            const sep = collOverlap * 0.5 + 0.5;
            a.x -= collNx * sep;
            a.y -= collNy * sep;
            b.x += collNx * sep;
            b.y += collNy * sep;
          }
        }
      }
    }

    // --- Rendering ---

    // Draw shadows first (behind all balls)
    for (let i = 0; i < MAX_BALLS; i++) {
      const b = balls[i];
      if (!b.active) continue;

      const shadowSize = b.radius * 2.5;
      api.brush.image(shadowDataUrl, b.x + 4, b.y + 5, {
        width: shadowSize,
        height: shadowSize * 0.6,
        alpha: isDark ? 0.3 : 0.2,
        blendMode: 'normal',
      });
    }

    // Draw each ball
    for (let i = 0; i < MAX_BALLS; i++) {
      const b = balls[i];
      if (!b.active) continue;

      const color = colors[b.colorIndex];

      // Main ball body
      api.brush.circle(b.x, b.y, b.radius, {
        fill: color,
        alpha: 0.9,
        blendMode: 'normal',
      });

      // Darker edge ring for 3D depth
      const edgeColor = isDark ? 0x111111 : 0x222222;
      api.brush.circle(b.x, b.y, b.radius, {
        stroke: edgeColor,
        strokeWidth: 1.5,
        alpha: 0.25,
        blendMode: 'normal',
      });

      // Bottom shadow crescent (darker half)
      api.brush.pushMatrix();
      api.brush.translate(b.x, b.y + b.radius * 0.15);
      api.brush.ellipse(0, 0, b.radius * 0.85, b.radius * 0.75, {
        fill: 0x000000,
        alpha: 0.15,
        blendMode: 'normal',
      });
      api.brush.popMatrix();

      // Highlight glow (upper-left specular)
      const glowSize = b.radius * 2.2;
      api.brush.image(glowDataUrl, b.x - b.radius * 0.25, b.y - b.radius * 0.3, {
        width: glowSize,
        height: glowSize,
        alpha: i === PALLINO_INDEX ? 0.6 : 0.7,
        blendMode: 'add',
      });

      // Small specular dot
      api.brush.circle(b.x - b.radius * 0.3, b.y - b.radius * 0.3, b.radius * 0.15, {
        fill: 0xffffff,
        alpha: 0.6,
        blendMode: 'add',
      });
    }

    // Draw pallino marker (subtle ring around it if settled)
    const pall = balls[PALLINO_INDEX];
    if (pall.active && pall.settled) {
      const pulseAlpha = 0.15 + Math.sin(t / 800) * 0.08;
      if (pulseAlpha >= 0.05) {
        api.brush.circle(pall.x, pall.y, pall.radius + 6, {
          stroke: isDark ? 0xffffff : 0x888888,
          strokeWidth: 1,
          alpha: pulseAlpha,
          blendMode: 'normal',
        });
      }
    }
  },

  async teardown(): Promise<void> {
    balls = [];
    canvasW = 0;
    canvasH = 0;
    launchCount = 0;
    glowDataUrl = '';
    shadowDataUrl = '';
  },
};

registerActor(actor);
export default actor;
