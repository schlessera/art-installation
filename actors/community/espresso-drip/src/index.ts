/**
 * Espresso Drip — Foreground Actor
 *
 * Coffee drops fall from above and pool at the bottom, creating
 * swirling latte art patterns with crema-colored spirals.
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
  id: 'espresso-drip',
  name: 'Espresso Drip',
  description: 'Coffee drops falling and pooling into swirling latte art patterns',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'coffee', 'italy', 'latte', 'art'],
  createdAt: new Date('2026-03-20'),
  preferredDuration: 60,
  requiredContexts: ['display'],
};

const MAX_DROPS = 15;
const MAX_RIPPLES = 12;
const MAX_SWIRLS = 6;

const COFFEE_DARK = 0x3c1a00;
const COFFEE_MID = 0x6b3a1f;
const CREMA = 0xd4a574;
const CREMA_LIGHT = 0xe8c9a0;

interface Drop {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  size: number;
  spawnTime: number;
}

interface Ripple {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  startTime: number;
}

interface Swirl {
  active: boolean;
  cx: number;
  cy: number;
  angle: number;
  armCount: number;
  radius: number;
  growSpeed: number;
  rotSpeed: number;
  startTime: number;
  color: number;
}

let canvasW = 0;
let canvasH = 0;
let drops: Drop[] = [];
let ripples: Ripple[] = [];
let swirls: Swirl[] = [];
let poolLevel = 0;
let nextDropTime = 0;
let nextSwirlTime = 0;
let glowDataUrl = '';

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    poolLevel = canvasH * 0.75;
    nextDropTime = 500;
    nextSwirlTime = 5000;

    drops = [];
    for (let i = 0; i < MAX_DROPS; i++) {
      drops.push({ active: false, x: 0, y: 0, vy: 0, size: 0, spawnTime: 0 });
    }
    ripples = [];
    for (let i = 0; i < MAX_RIPPLES; i++) {
      ripples.push({ active: false, x: 0, y: 0, radius: 0, maxRadius: 0, alpha: 0, startTime: 0 });
    }
    swirls = [];
    for (let i = 0; i < MAX_SWIRLS; i++) {
      swirls.push({ active: false, cx: 0, cy: 0, angle: 0, armCount: 0, radius: 0, growSpeed: 0, rotSpeed: 0, startTime: 0, color: 0 });
    }

    // Pre-render soft circle for drops
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.4)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    glowDataUrl = c.toDataURL();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time;
    const tSec = t / 1000;
    const dt = Math.min(frame.deltaTime, 32) / 16;
    const isDark = api.context.display.isDarkMode();

    // Slowly raise pool level
    if (poolLevel > canvasH * 0.55) {
      poolLevel -= 0.02 * dt;
    }

    // Spawn new drops
    if (t > nextDropTime) {
      for (let i = 0; i < MAX_DROPS; i++) {
        if (!drops[i].active) {
          drops[i].active = true;
          drops[i].x = canvasW * (0.3 + Math.random() * 0.4);
          drops[i].y = -10;
          drops[i].vy = 1 + Math.random() * 1.5;
          drops[i].size = 3 + Math.random() * 3;
          drops[i].spawnTime = t;
          break;
        }
      }
      nextDropTime = t + 400 + Math.random() * 800;
    }

    // Draw pool (coffee surface)
    const poolColor = isDark ? COFFEE_DARK : COFFEE_MID;
    api.brush.rect(0, poolLevel, canvasW, canvasH - poolLevel, {
      fill: poolColor,
      alpha: 0.6,
    });

    // Draw crema ring at pool surface
    api.brush.ellipse(canvasW / 2, poolLevel + 5, canvasW * 0.4, 8, {
      fill: isDark ? CREMA : CREMA_LIGHT,
      alpha: 0.3,
    });

    // Spawn latte art swirls periodically
    if (t > nextSwirlTime) {
      for (let i = 0; i < MAX_SWIRLS; i++) {
        if (!swirls[i].active) {
          swirls[i].active = true;
          swirls[i].cx = canvasW * (0.25 + Math.random() * 0.5);
          swirls[i].cy = poolLevel + 20 + Math.random() * (canvasH - poolLevel - 40);
          swirls[i].angle = Math.random() * Math.PI * 2;
          swirls[i].armCount = 2 + Math.floor(Math.random() * 3);
          swirls[i].radius = 0;
          swirls[i].growSpeed = 0.3 + Math.random() * 0.3;
          swirls[i].rotSpeed = 0.5 + Math.random() * 0.8;
          swirls[i].startTime = t;
          swirls[i].color = Math.random() > 0.5 ? CREMA : CREMA_LIGHT;
          break;
        }
      }
      nextSwirlTime = t + 3000 + Math.random() * 4000;
    }

    // Draw swirls (latte art)
    for (let i = 0; i < MAX_SWIRLS; i++) {
      const s = swirls[i];
      if (!s.active) continue;

      const age = (t - s.startTime) / 1000;
      s.radius = Math.min(age * s.growSpeed * 15, 50);
      s.angle += s.rotSpeed * dt * 0.02;

      const fadeAlpha = age > 8 ? Math.max(0, 1 - (age - 8) / 4) : Math.min(1, age / 1.5);
      if (fadeAlpha < 0.05) {
        s.active = false;
        continue;
      }

      // Draw spiral arms
      for (let arm = 0; arm < s.armCount; arm++) {
        const armAngle = s.angle + (arm * Math.PI * 2) / s.armCount;
        const points: Array<{ x: number; y: number }> = [];

        for (let step = 0; step < 20; step++) {
          const t2 = step / 20;
          const spiralR = s.radius * t2;
          const spiralA = armAngle + t2 * Math.PI * 3;
          points.push({
            x: s.cx + Math.cos(spiralA) * spiralR,
            y: s.cy + Math.sin(spiralA) * spiralR * 0.6, // flatten vertically
          });
        }

        if (points.length >= 2) {
          api.brush.stroke(points, {
            color: s.color,
            width: 2.5 + Math.sin(age * 2) * 0.5,
            alpha: fadeAlpha * 0.5,
            cap: 'round',
          });
        }
      }

      // Center dot
      api.brush.circle(s.cx, s.cy, 3, {
        fill: s.color,
        alpha: fadeAlpha * 0.6,
      });
    }

    // Update and draw drops
    for (let i = 0; i < MAX_DROPS; i++) {
      const d = drops[i];
      if (!d.active) continue;

      // Gravity
      d.vy += 0.08 * dt;
      d.y += d.vy * dt;

      // Hit the pool surface
      if (d.y >= poolLevel) {
        d.active = false;

        // Spawn ripple
        for (let j = 0; j < MAX_RIPPLES; j++) {
          if (!ripples[j].active) {
            ripples[j].active = true;
            ripples[j].x = d.x;
            ripples[j].y = poolLevel;
            ripples[j].radius = 0;
            ripples[j].maxRadius = 15 + d.size * 5;
            ripples[j].alpha = 0.7;
            ripples[j].startTime = t;
            break;
          }
        }
        continue;
      }

      // Draw falling drop with stretch
      const stretch = 1 + d.vy * 0.15;
      api.brush.image(glowDataUrl, d.x, d.y, {
        width: d.size * 2,
        height: d.size * 2 * stretch,
        tint: isDark ? COFFEE_MID : COFFEE_DARK,
        alpha: 0.8,
      });

      // Actual drop shape
      api.brush.ellipse(d.x, d.y, d.size * 0.8, d.size * stretch, {
        fill: isDark ? COFFEE_MID : COFFEE_DARK,
        alpha: 0.9,
      });
    }

    // Update and draw ripples
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const r = ripples[i];
      if (!r.active) continue;

      const age = (t - r.startTime) / 1000;
      r.radius = r.maxRadius * Math.min(1, age * 2);
      r.alpha = Math.max(0, 0.6 * (1 - age / 1.5));

      if (r.alpha < 0.05) {
        r.active = false;
        continue;
      }

      // Elliptical ripple on surface
      api.brush.ellipse(r.x, r.y, r.radius * 2, r.radius * 0.5, {
        stroke: isDark ? CREMA : CREMA_LIGHT,
        strokeWidth: 1.5,
        alpha: r.alpha,
      });
    }
  },

  async teardown(): Promise<void> {
    drops = [];
    ripples = [];
    swirls = [];
    canvasW = 0;
    canvasH = 0;
    glowDataUrl = '';
  },
};

registerActor(actor);
export default actor;
