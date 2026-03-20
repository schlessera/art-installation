/**
 * Olive Press — Foreground Actor
 *
 * Abstract visualization of olives being pressed — green circles
 * compress and release flowing golden olive oil streams.
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
  id: 'olive-press',
  name: 'Olive Press',
  description: 'Abstract olives compress into flowing golden olive oil streams',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'italy', 'olive', 'abstract', 'flow'],
  createdAt: new Date('2026-03-20'),
  preferredDuration: 60,
  requiredContexts: ['display'],
};

const MAX_OLIVES = 8;
const MAX_OIL_DROPS = 30;

const OLIVE_GREEN = 0x556b2f;
const OLIVE_DARK = 0x3d4f22;
const OIL_GOLD = 0xc9a84c;
const OIL_LIGHT = 0xe0c870;

interface Olive {
  x: number;
  y: number;
  baseSize: number;
  squeezePhase: number;
  squeezeSpeed: number;
  phaseOffset: number;
}

interface OilDrop {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  vx: number;
  size: number;
  alpha: number;
  trail: number; // index into trail ring buffer
}

let canvasW = 0;
let canvasH = 0;
let olives: Olive[] = [];
let oilDrops: OilDrop[] = [];
let nextOilTime = 0;
let glowDataUrl = '';

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    nextOilTime = 2000;

    olives = [];
    for (let i = 0; i < MAX_OLIVES; i++) {
      olives.push({
        x: canvasW * (0.15 + (i / (MAX_OLIVES - 1)) * 0.7) + (Math.random() - 0.5) * 20,
        y: canvasH * (0.15 + Math.random() * 0.25),
        baseSize: 10 + Math.random() * 8,
        squeezePhase: Math.random() * Math.PI * 2,
        squeezeSpeed: 0.3 + Math.random() * 0.4,
        phaseOffset: Math.random() * Math.PI * 2,
      });
    }

    oilDrops = [];
    for (let i = 0; i < MAX_OIL_DROPS; i++) {
      oilDrops.push({
        active: false, x: 0, y: 0, vy: 0, vx: 0,
        size: 0, alpha: 0, trail: 0,
      });
    }

    // Glow texture for oil sheen
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.3)');
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

    const oliveColor = isDark ? OLIVE_GREEN : OLIVE_DARK;
    const oilColor = isDark ? OIL_GOLD : OIL_LIGHT;

    // Draw and animate olives
    for (let i = 0; i < MAX_OLIVES; i++) {
      const o = olives[i];
      const squeeze = Math.sin(tSec * o.squeezeSpeed + o.squeezePhase);
      const squeezeAmount = 0.15 + squeeze * 0.15; // 0 to 0.3

      const sx = o.baseSize * (1 + squeezeAmount * 0.3); // wider when squeezed
      const sy = o.baseSize * (1 - squeezeAmount * 0.5); // shorter when squeezed
      const wobble = Math.sin(tSec * 2 + o.phaseOffset) * 2;

      // Olive body
      api.brush.ellipse(o.x + wobble, o.y, sx * 1.3, sy, {
        fill: oliveColor,
        alpha: 0.85,
      });

      // Highlight
      api.brush.ellipse(o.x + wobble - sx * 0.2, o.y - sy * 0.2, sx * 0.4, sy * 0.3, {
        fill: isDark ? 0x7a8b45 : 0x6a7b35,
        alpha: 0.4,
      });

      // Spawn oil drops when olive is being "squeezed" (sine going down)
      if (squeeze > 0.5 && t > nextOilTime) {
        for (let j = 0; j < MAX_OIL_DROPS; j++) {
          if (!oilDrops[j].active) {
            const d = oilDrops[j];
            d.active = true;
            d.x = o.x + wobble + (Math.random() - 0.5) * sx;
            d.y = o.y + sy * 0.5;
            d.vy = 0.3 + Math.random() * 0.5;
            d.vx = (Math.random() - 0.5) * 0.4;
            d.size = 2 + Math.random() * 3;
            d.alpha = 0.8;
            d.trail = 0;
            nextOilTime = t + 150 + Math.random() * 200;
            break;
          }
        }
      }
    }

    // Draw press bar (abstract horizontal pressure lines)
    const pressY = canvasH * 0.12;
    const pressPulse = Math.sin(tSec * 0.5) * 0.3 + 0.7;
    api.brush.rect(canvasW * 0.05, pressY, canvasW * 0.9, 4, {
      fill: isDark ? 0x888888 : 0x666666,
      alpha: 0.3 * pressPulse,
    });
    api.brush.rect(canvasW * 0.1, pressY + 8, canvasW * 0.8, 2, {
      fill: isDark ? 0x666666 : 0x444444,
      alpha: 0.2 * pressPulse,
    });

    // Update and draw oil drops
    for (let i = 0; i < MAX_OIL_DROPS; i++) {
      const d = oilDrops[i];
      if (!d.active) continue;

      // Gravity + slight sideways flow
      d.vy += 0.02 * dt;
      d.vx += Math.sin(tSec + i) * 0.005 * dt;
      d.vx *= 0.995;
      d.x += d.vx * dt;
      d.y += d.vy * dt;

      // Slow fade
      d.alpha -= 0.003 * dt;

      if (d.y > canvasH + 10 || d.alpha < 0.05) {
        d.active = false;
        continue;
      }

      // Oil glow
      api.brush.image(glowDataUrl, d.x, d.y, {
        width: d.size * 5,
        height: d.size * 5,
        tint: oilColor,
        alpha: d.alpha * 0.3,
        blendMode: 'add',
      });

      // Oil drop
      const stretch = 1 + d.vy * 0.3;
      api.brush.ellipse(d.x, d.y, d.size, d.size * stretch, {
        fill: oilColor,
        alpha: d.alpha * 0.8,
      });
    }

    // Collecting pool at bottom
    const poolAlpha = Math.min(0.4, tSec * 0.01);
    if (poolAlpha > 0.05) {
      api.brush.ellipse(canvasW / 2, canvasH * 0.88, canvasW * 0.35, 12, {
        fill: oilColor,
        alpha: poolAlpha,
      });
      // Oil sheen highlight
      api.brush.ellipse(canvasW / 2 - 15, canvasH * 0.88 - 3, canvasW * 0.15, 5, {
        fill: 0xffeebb,
        alpha: poolAlpha * 0.4,
      });
    }
  },

  async teardown(): Promise<void> {
    olives = [];
    oilDrops = [];
    canvasW = 0;
    canvasH = 0;
    glowDataUrl = '';
  },
};

registerActor(actor);
export default actor;
