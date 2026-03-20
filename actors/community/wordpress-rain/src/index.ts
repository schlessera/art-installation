/**
 * WordPress Logo Rain — Foreground Actor
 *
 * Falling WordPress "W" logos that rotate, fade, and drift down
 * the canvas like digital rain.
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
  id: 'wordpress-rain',
  name: 'WordPress Rain',
  description: 'Falling WordPress W logos that rotate and fade like digital rain',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'wordpress', 'digital', 'rain'],
  createdAt: new Date('2026-03-20'),
  preferredDuration: 60,
  requiredContexts: ['display'],
};

const MAX_LOGOS = 20;
const WP_BLUE = 0x2271b1;
const WP_BLUE_LIGHT = 0x3582c4;

interface WPLogo {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  vx: number;
  size: number;
  rotation: number;
  rotSpeed: number;
  alpha: number;
  spawnTime: number;
}

let canvasW = 0;
let canvasH = 0;
let logos: WPLogo[] = [];
let nextSpawn = 0;
let wpLogoDataUrl = '';

function createWPLogoTexture(): string {
  const c = document.createElement('canvas');
  const s = 64;
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;

  // Draw WordPress "W" mark — simplified geometric version
  ctx.fillStyle = 'white';
  ctx.beginPath();

  // Circle background
  ctx.arc(s / 2, s / 2, s / 2 - 2, 0, Math.PI * 2);
  ctx.fill();

  // Cut out the "W" shape using dark color
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.globalCompositeOperation = 'destination-out';

  // Draw W as connected strokes
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'white';
  ctx.globalCompositeOperation = 'source-over';

  // Just draw a clean W inside circle
  ctx.clearRect(0, 0, s, s);

  // Circle outline
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2 - 2, 0, Math.PI * 2);
  ctx.fillStyle = 'white';
  ctx.fill();

  // W letter
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'white';

  const pad = 14;
  const top = 18;
  const bot = 48;
  const mid = 32;

  ctx.moveTo(pad, top);
  ctx.lineTo(pad + 7, bot);
  ctx.lineTo(s / 2, mid);
  ctx.lineTo(s - pad - 7, bot);
  ctx.lineTo(s - pad, top);
  ctx.stroke();

  return c.toDataURL();
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    nextSpawn = 0;

    logos = [];
    for (let i = 0; i < MAX_LOGOS; i++) {
      logos.push({
        active: false, x: 0, y: 0, vy: 0, vx: 0,
        size: 0, rotation: 0, rotSpeed: 0, alpha: 0, spawnTime: 0,
      });
    }

    wpLogoDataUrl = createWPLogoTexture();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time;
    const dt = Math.min(frame.deltaTime, 32) / 16;
    const isDark = api.context.display.isDarkMode();
    const tintColor = isDark ? WP_BLUE_LIGHT : WP_BLUE;

    // Spawn new logos
    if (t > nextSpawn) {
      for (let i = 0; i < MAX_LOGOS; i++) {
        if (!logos[i].active) {
          const l = logos[i];
          l.active = true;
          l.x = 10 + Math.random() * (canvasW - 20);
          l.y = -30;
          l.vy = 0.5 + Math.random() * 1.0;
          l.vx = (Math.random() - 0.5) * 0.3;
          l.size = 12 + Math.random() * 20;
          l.rotation = Math.random() * Math.PI * 2;
          l.rotSpeed = (Math.random() - 0.5) * 0.03;
          l.alpha = 0.5 + Math.random() * 0.4;
          l.spawnTime = t;
          break;
        }
      }
      nextSpawn = t + 300 + Math.random() * 700;
    }

    // Update and draw logos
    for (let i = 0; i < MAX_LOGOS; i++) {
      const l = logos[i];
      if (!l.active) continue;

      // Gentle sway
      l.vx += Math.sin(t / 1000 + i * 2) * 0.003 * dt;
      l.vx *= 0.99;

      l.x += l.vx * dt;
      l.y += l.vy * dt;
      l.rotation += l.rotSpeed * dt;

      // Fade out near bottom
      const fadeStart = canvasH * 0.7;
      if (l.y > fadeStart) {
        l.alpha = Math.max(0, l.alpha - 0.015 * dt);
      }

      // Deactivate when off screen or faded
      if (l.y > canvasH + 30 || l.alpha < 0.05) {
        l.active = false;
        continue;
      }

      // Fade in
      const age = t - l.spawnTime;
      const fadeIn = Math.min(1, age / 500);

      api.brush.image(wpLogoDataUrl, l.x, l.y, {
        width: l.size,
        height: l.size,
        rotation: l.rotation,
        tint: tintColor,
        alpha: l.alpha * fadeIn,
        blendMode: 'add',
      });
    }
  },

  async teardown(): Promise<void> {
    logos = [];
    canvasW = 0;
    canvasH = 0;
    wpLogoDataUrl = '';
  },
};

registerActor(actor);
export default actor;
