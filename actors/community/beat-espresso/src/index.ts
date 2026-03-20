/**
 * Beat Espresso — Foreground Actor
 *
 * Coffee drops fall in sync with music beats. Bass hits trigger
 * big splashy drops, treble creates fine mist, and the crema
 * surface ripples with the rhythm.
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
  id: 'beat-espresso',
  name: 'Beat Espresso',
  description: 'Coffee drops fall in sync with music beats — bass hits trigger splashes, treble creates mist',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'audio', 'coffee', 'italy', 'reactive'],
  createdAt: new Date('2026-03-20'),
  preferredDuration: 60,
  requiredContexts: ['audio', 'display'],
};

const MAX_DROPS = 20;
const MAX_RIPPLES = 15;
const MAX_MIST = 30;

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
  isBass: boolean;
}

interface Ripple {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  startTime: number;
}

interface MistParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
}

let canvasW = 0;
let canvasH = 0;
let drops: Drop[] = [];
let ripples: Ripple[] = [];
let mist: MistParticle[] = [];
let poolLevel = 0;
let lastBeatTime = 0;
let beatEnergy = 0;
let glowDataUrl = '';

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    poolLevel = canvasH * 0.72;
    lastBeatTime = 0;
    beatEnergy = 0;

    drops = [];
    for (let i = 0; i < MAX_DROPS; i++) {
      drops.push({ active: false, x: 0, y: 0, vy: 0, size: 0, isBass: false });
    }
    ripples = [];
    for (let i = 0; i < MAX_RIPPLES; i++) {
      ripples.push({ active: false, x: 0, y: 0, radius: 0, maxRadius: 0, startTime: 0 });
    }
    mist = [];
    for (let i = 0; i < MAX_MIST; i++) {
      mist.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, size: 0, alpha: 0 });
    }

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
    const t = frame.time;
    const tSec = t / 1000;
    const dt = Math.min(frame.deltaTime, 32) / 16;
    const isDark = api.context.display.isDarkMode();
    const audio = api.context.audio;

    // Read audio levels
    const hasAudio = audio.isAvailable();
    const bass = hasAudio ? audio.bass() : 0.3 + Math.sin(tSec * 2) * 0.2;
    const treble = hasAudio ? audio.treble() : 0.2 + Math.sin(tSec * 3.7) * 0.15;
    const isBeat = hasAudio ? audio.isBeat() : Math.sin(tSec * 3.14) > 0.95;
    const volume = hasAudio ? audio.volume() : 0.4;

    // Track beat energy (decays over time)
    if (isBeat && t - lastBeatTime > 150) {
      beatEnergy = Math.min(1, beatEnergy + 0.5);
      lastBeatTime = t;

      // Bass beat = big drops
      if (bass > 0.4) {
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < MAX_DROPS; j++) {
            if (!drops[j].active) {
              drops[j].active = true;
              drops[j].x = canvasW * (0.2 + Math.random() * 0.6);
              drops[j].y = -10 - Math.random() * 30;
              drops[j].vy = 1 + bass * 3;
              drops[j].size = 3 + bass * 6;
              drops[j].isBass = true;
              break;
            }
          }
        }
      }
    }
    beatEnergy *= 0.97;

    // Treble = fine mist particles rising from pool
    if (treble > 0.2) {
      const mistCount = Math.floor(treble * 3);
      for (let m = 0; m < mistCount; m++) {
        for (let i = 0; i < MAX_MIST; i++) {
          if (!mist[i].active) {
            mist[i].active = true;
            mist[i].x = canvasW * (0.15 + Math.random() * 0.7);
            mist[i].y = poolLevel - Math.random() * 5;
            mist[i].vx = (Math.random() - 0.5) * 0.5;
            mist[i].vy = -0.3 - treble * 1.5;
            mist[i].size = 1 + Math.random() * 2;
            mist[i].alpha = 0.4 + treble * 0.4;
            break;
          }
        }
      }
    }

    // Steady drip even without beats (volume-based)
    if (Math.random() < volume * 0.05) {
      for (let j = 0; j < MAX_DROPS; j++) {
        if (!drops[j].active) {
          drops[j].active = true;
          drops[j].x = canvasW * (0.25 + Math.random() * 0.5);
          drops[j].y = -5;
          drops[j].vy = 0.5 + volume;
          drops[j].size = 2 + volume * 3;
          drops[j].isBass = false;
          break;
        }
      }
    }

    // Pool surface — pulses with bass
    const poolPulse = 1 + beatEnergy * 0.08;
    const poolColor = isDark ? COFFEE_DARK : COFFEE_MID;
    const cremaColor = isDark ? CREMA : CREMA_LIGHT;

    api.brush.rect(0, poolLevel, canvasW, canvasH - poolLevel, {
      fill: poolColor,
      alpha: 0.65,
    });

    // Crema surface — wobbles with beat
    const cremaWobble = Math.sin(tSec * 4 * poolPulse) * beatEnergy * 3;
    api.brush.ellipse(canvasW / 2, poolLevel + 4 + cremaWobble, canvasW * 0.4, 8 + beatEnergy * 4, {
      fill: cremaColor,
      alpha: 0.35 + beatEnergy * 0.15,
    });

    // Update and draw drops
    for (let i = 0; i < MAX_DROPS; i++) {
      const d = drops[i];
      if (!d.active) continue;

      d.vy += 0.12 * dt;
      d.y += d.vy * dt;

      // Hit pool surface
      if (d.y >= poolLevel) {
        d.active = false;

        // Spawn ripple — bigger for bass drops
        for (let j = 0; j < MAX_RIPPLES; j++) {
          if (!ripples[j].active) {
            ripples[j].active = true;
            ripples[j].x = d.x;
            ripples[j].y = poolLevel;
            ripples[j].radius = 0;
            ripples[j].maxRadius = d.isBass ? 25 + d.size * 5 : 10 + d.size * 3;
            ripples[j].startTime = t;
            break;
          }
        }

        // Bass drops splash mist upward
        if (d.isBass) {
          for (let m = 0; m < 4; m++) {
            for (let k = 0; k < MAX_MIST; k++) {
              if (!mist[k].active) {
                mist[k].active = true;
                mist[k].x = d.x + (Math.random() - 0.5) * 15;
                mist[k].y = poolLevel;
                mist[k].vx = (Math.random() - 0.5) * 1.5;
                mist[k].vy = -1.5 - Math.random() * 2;
                mist[k].size = 1.5 + Math.random() * 2;
                mist[k].alpha = 0.6;
                break;
              }
            }
          }
        }
        continue;
      }

      // Draw falling drop
      const stretch = 1 + d.vy * 0.12;
      api.brush.ellipse(d.x, d.y, d.size * 0.8, d.size * stretch, {
        fill: isDark ? COFFEE_MID : COFFEE_DARK,
        alpha: 0.85,
      });

      // Glow on bass drops
      if (d.isBass) {
        api.brush.image(glowDataUrl, d.x, d.y, {
          width: d.size * 4,
          height: d.size * 4,
          tint: cremaColor,
          alpha: 0.25,
          blendMode: 'add',
        });
      }
    }

    // Update and draw ripples
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const r = ripples[i];
      if (!r.active) continue;

      const age = (t - r.startTime) / 1000;
      r.radius = r.maxRadius * Math.min(1, age * 2.5);
      const alpha = Math.max(0, 0.6 * (1 - age / 1.2));

      if (alpha < 0.05) {
        r.active = false;
        continue;
      }

      api.brush.ellipse(r.x, r.y, r.radius * 2, r.radius * 0.4, {
        stroke: cremaColor,
        strokeWidth: 1.5 + beatEnergy,
        alpha,
      });
    }

    // Update and draw mist
    for (let i = 0; i < MAX_MIST; i++) {
      const m = mist[i];
      if (!m.active) continue;

      m.vy += 0.02 * dt; // gravity pulls back down
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.alpha -= 0.008 * dt;

      if (m.alpha < 0.05 || m.y > poolLevel + 5) {
        m.active = false;
        continue;
      }

      api.brush.circle(m.x, m.y, m.size, {
        fill: cremaColor,
        alpha: m.alpha,
        blendMode: 'add',
      });
    }

    // Audio visualizer bar at the very top — subtle
    if (hasAudio) {
      const barWidth = canvasW * volume;
      api.brush.rect((canvasW - barWidth) / 2, 0, barWidth, 2, {
        fill: cremaColor,
        alpha: 0.3 + beatEnergy * 0.3,
      });
    }
  },

  async teardown(): Promise<void> {
    drops = [];
    ripples = [];
    mist = [];
    canvasW = 0;
    canvasH = 0;
    glowDataUrl = '';
    beatEnergy = 0;
  },
};

registerActor(actor);
export default actor;
