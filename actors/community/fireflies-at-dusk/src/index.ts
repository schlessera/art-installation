/**
 * Fireflies at Dusk — Foreground Actor
 *
 * Warm yellow-green fireflies drifting lazily and blinking with a soft glow.
 * Brighter during evening hours (18–22), dimmer at midday.
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
  id: 'fireflies-at-dusk',
  name: 'Fireflies at Dusk',
  description: 'Warm yellow-green fireflies drifting lazily and blinking with a soft glow',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'nature', 'italy', 'evening', 'ambient'],
  createdAt: new Date('2026-03-20'),
  preferredDuration: 45,
  requiredContexts: ['time', 'display'],
};

const NUM_FIREFLIES = 18;

// Firefly color palette
const COLOR_YELLOW_GREEN = 0xccdd44;
const COLOR_GREEN = 0x88dd22;
const COLOR_AMBER = 0xddaa22;
const COLORS = [COLOR_YELLOW_GREEN, COLOR_GREEN, COLOR_AMBER];

interface Firefly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  // Wander target
  targetX: number;
  targetY: number;
  // Blinking
  blinkPhase: number;
  blinkSpeed: number;
  blinkOffset: number;
  // Appearance
  color: number;
  glowSize: number;
  coreSize: number;
}

let fireflies: Firefly[] = [];
let canvasW = 0;
let canvasH = 0;
let glowDataUrl = '';

// Reusable temporaries
let timeBrightness = 1.0;

function pickNewTarget(f: Firefly): void {
  f.targetX = 30 + Math.random() * (canvasW - 60);
  f.targetY = 30 + Math.random() * (canvasH - 60);
}

function makeFirefly(randomPosition: boolean): Firefly {
  const f: Firefly = {
    x: Math.random() * canvasW,
    y: randomPosition ? Math.random() * canvasH : canvasH * (0.3 + Math.random() * 0.6),
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
    targetX: 0,
    targetY: 0,
    blinkPhase: Math.random() * Math.PI * 2,
    blinkSpeed: 0.8 + Math.random() * 1.2,
    blinkOffset: Math.random() * Math.PI * 2,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    glowSize: 18 + Math.random() * 14,
    coreSize: 2 + Math.random() * 1.5,
  };
  pickNewTarget(f);
  return f;
}

function computeTimeBrightness(hour: number): number {
  // Peak brightness during evening hours 18–22
  // Dimmer at midday (hour 12), moderate at other times
  if (hour >= 18 && hour <= 22) {
    // Peak evening: ease in/out within 18-22
    const mid = 20;
    const dist = Math.abs(hour - mid) / 2;
    return 0.85 + (1 - dist) * 0.15;
  }
  if (hour >= 22 || hour < 6) {
    // Night: still fairly bright
    return 0.7;
  }
  if (hour >= 6 && hour < 10) {
    // Morning: moderate
    return 0.35 + (hour - 6) * -0.02;
  }
  // Midday (10-18): dimmest
  return 0.25;
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    // Pre-render glow texture
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.15, 'rgba(255,255,255,0.7)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.25)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    glowDataUrl = c.toDataURL();

    // Pre-allocate fireflies
    fireflies = [];
    for (let i = 0; i < NUM_FIREFLIES; i++) {
      fireflies.push(makeFirefly(true));
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time / 1000;
    const dt = Math.min(frame.deltaTime, 32) / 16.67; // normalize to ~60fps
    const isDark = api.context.display.isDarkMode();
    const hour = api.context.time.hour();

    timeBrightness = computeTimeBrightness(hour);

    // Dark mode boost
    const modeMultiplier = isDark ? 1.0 : 0.75;
    const brightnessFactor = timeBrightness * modeMultiplier;

    for (let i = 0; i < NUM_FIREFLIES; i++) {
      const f = fireflies[i];

      // --- Wandering movement ---
      // Steer towards target
      const dx = f.targetX - f.x;
      const dy = f.targetY - f.y;
      const distSq = dx * dx + dy * dy;

      // Pick a new target when close enough
      if (distSq < 2500) { // within 50px
        pickNewTarget(f);
      }

      // Gentle steering force
      const dist = Math.sqrt(distSq);
      if (dist > 0) {
        f.vx += (dx / dist) * 0.015 * dt;
        f.vy += (dy / dist) * 0.015 * dt;
      }

      // Gentle upward drift
      f.vy -= 0.005 * dt;

      // Slight random perturbation (deterministic from time + index)
      f.vx += Math.sin(t * 1.3 + i * 7.1) * 0.008 * dt;
      f.vy += Math.cos(t * 1.7 + i * 5.3) * 0.006 * dt;

      // Damping for lazy feel
      f.vx *= 0.97;
      f.vy *= 0.97;

      // Clamp speed
      const speed = Math.sqrt(f.vx * f.vx + f.vy * f.vy);
      if (speed > 1.2) {
        f.vx = (f.vx / speed) * 1.2;
        f.vy = (f.vy / speed) * 1.2;
      }

      // Update position
      f.x += f.vx * dt;
      f.y += f.vy * dt;

      // Soft boundary steering
      const margin = 20;
      if (f.x < margin) f.vx += 0.1 * dt;
      else if (f.x > canvasW - margin) f.vx -= 0.1 * dt;
      if (f.y < margin) f.vy += 0.1 * dt;
      else if (f.y > canvasH - margin) f.vy -= 0.1 * dt;

      // Wrap if way off screen
      if (f.x < -30) f.x = canvasW + 20;
      if (f.x > canvasW + 30) f.x = -20;
      if (f.y < -30) f.y = canvasH + 20;
      if (f.y > canvasH + 30) f.y = -20;

      // --- Blinking pattern (layered sine waves) ---
      const blink1 = Math.sin(t * f.blinkSpeed + f.blinkPhase);
      const blink2 = Math.sin(t * f.blinkSpeed * 0.37 + f.blinkOffset);
      const blink3 = Math.sin(t * f.blinkSpeed * 2.1 + f.blinkPhase * 1.5);
      // Combine: mostly driven by blink1, modulated by blink2 and blink3
      const rawBlink = blink1 * 0.5 + blink2 * 0.3 + blink3 * 0.2;
      // Map from [-1,1] to [0,1] with a bias towards brighter
      const blinkValue = Math.max(0, (rawBlink + 0.3) / 1.3);

      const alpha = blinkValue * brightnessFactor;
      if (alpha < 0.05) continue;

      // Ensure alpha for main shapes is at least 0.6 when visible
      const glowAlpha = Math.min(alpha, 0.9);
      const coreAlpha = Math.max(alpha, 0.6);

      // --- Draw glow with api.brush.image() ---
      const glowDrawSize = f.glowSize * (0.8 + blinkValue * 0.4);
      api.brush.image(glowDataUrl, f.x, f.y, {
        width: glowDrawSize,
        height: glowDrawSize,
        anchorX: 0.5,
        anchorY: 0.5,
        tint: f.color,
        alpha: glowAlpha,
        blendMode: 'add',
      });

      // --- White core circle ---
      api.brush.circle(f.x, f.y, f.coreSize * (0.7 + blinkValue * 0.3), {
        fill: 0xffffff,
        alpha: coreAlpha,
        blendMode: 'add',
      });
    }
  },

  async teardown(): Promise<void> {
    fireflies = [];
    canvasW = 0;
    canvasH = 0;
    glowDataUrl = '';
  },
};

registerActor(actor);
export default actor;
