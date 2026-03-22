import { registerActor } from '@art/actor-sdk';
import type { Actor, ActorSetupAPI, ActorUpdateAPI, FrameContext, ActorMetadata } from '@art/types';

const metadata: ActorMetadata = {
  id: 'github',
  name: 'GitHub Logo Rain',
  description: 'GitHub Octocat logos rain down and bounce off the floor',
  author: { name: 'Jan', github: 'janw-ll' },
  version: '1.0.0',
  tags: ['github', 'logo', 'rain', 'bounce'],
  createdAt: new Date(),
  preferredDuration: 30,
  requiredContexts: ['display'],
};

const MAX_LOGOS = 25;
const GRAVITY = 0.18;
const BOUNCE_DAMPING = 0.55;
const SPAWN_INTERVAL = 6;
const LOGO_W = 44;
const LOGO_H = 56;

interface Logo {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  size: number;
  stretchX: number;
  stretchY: number;
  bounces: number;
}

let logos: Logo[] = [];
let canvasW = 0;
let canvasH = 0;
let logoDataUrl = '';
let spawnCounter = 0;

function createLogoTexture(): string {
  const canvas = document.createElement('canvas');
  const s = 64;
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d')!;

  // Outer circle
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2 - 1, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.fillStyle = '#24292f';

  // Head
  ctx.beginPath();
  ctx.arc(s / 2, s / 2 - 4, 14, 0, Math.PI * 2);
  ctx.fill();

  // Left ear
  ctx.beginPath();
  ctx.moveTo(s / 2 - 13, s / 2 - 9);
  ctx.lineTo(s / 2 - 7, s / 2 - 22);
  ctx.lineTo(s / 2 - 2, s / 2 - 11);
  ctx.closePath();
  ctx.fill();

  // Right ear
  ctx.beginPath();
  ctx.moveTo(s / 2 + 13, s / 2 - 9);
  ctx.lineTo(s / 2 + 7, s / 2 - 22);
  ctx.lineTo(s / 2 + 2, s / 2 - 11);
  ctx.closePath();
  ctx.fill();

  // Body
  ctx.beginPath();
  ctx.ellipse(s / 2, s / 2 + 9, 11, 9, 0, 0, Math.PI);
  ctx.fill();

  // Tentacles
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#24292f';
  ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const lx = s / 2 - 8 + i * 4;
    ctx.beginPath();
    ctx.moveTo(lx, s / 2 + 15);
    ctx.lineTo(lx, s / 2 + 24);
    ctx.stroke();
  }

  // Tail
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(s / 2 - 11, s / 2 + 7);
  ctx.quadraticCurveTo(s / 2 - 22, s / 2 + 12, s / 2 - 17, s / 2 + 20);
  ctx.stroke();

  return canvas.toDataURL();
}

function initLogo(logo: Logo, w: number): void {
  logo.active = true;
  logo.x = Math.random() * w;
  logo.y = -LOGO_H;
  logo.vx = (Math.random() - 0.5) * 1.2;
  logo.vy = Math.random() * 1.5 + 0.5;
  logo.rotation = (Math.random() - 0.5) * 0.4;
  logo.rotationSpeed = (Math.random() - 0.5) * 0.04;
  logo.size = 0.7 + Math.random() * 0.6;
  logo.stretchX = 0.8 + Math.random() * 0.6;
  logo.stretchY = 0.8 + Math.random() * 0.6;
  logo.bounces = 0;
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    logoDataUrl = createLogoTexture();
    spawnCounter = 0;

    logos = [];
    for (let i = 0; i < MAX_LOGOS; i++) {
      logos.push({
        active: false, x: 0, y: 0, vx: 0, vy: 0,
        rotation: 0, rotationSpeed: 0, size: 1, stretchX: 1, stretchY: 1, bounces: 0,
      });
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const dt = frame.deltaTime / 16.67;
    const isDark = api.context.display.isDarkMode();
    const tint = isDark ? 0x88ccff : 0x2090e0;
    const floor = canvasH - 10;

    // Spawn new logos periodically
    spawnCounter++;
    if (spawnCounter >= SPAWN_INTERVAL) {
      spawnCounter = 0;
      for (let i = 0; i < MAX_LOGOS; i++) {
        if (!logos[i].active) {
          initLogo(logos[i], canvasW);
          break;
        }
      }
    }

    for (let i = 0; i < MAX_LOGOS; i++) {
      const l = logos[i];
      if (!l.active) continue;

      // Gravity
      l.vy += GRAVITY * dt;

      // Move
      l.x += l.vx * dt;
      l.y += l.vy * dt;
      l.rotation += l.rotationSpeed * dt;

      const w = LOGO_W * l.size * l.stretchX;
      const h = LOGO_H * l.size * l.stretchY;

      // Bounce off floor
      if (l.y + h / 2 > floor) {
        l.y = floor - h / 2;
        l.vy = -Math.abs(l.vy) * BOUNCE_DAMPING;
        l.rotationSpeed *= 0.7;
        l.bounces++;
        if (l.bounces > 6) {
          l.active = false;
          continue;
        }
      }

      // Bounce off walls
      if (l.x < w / 2) { l.x = w / 2; l.vx = Math.abs(l.vx) * 0.8; }
      if (l.x > canvasW - w / 2) { l.x = canvasW - w / 2; l.vx = -Math.abs(l.vx) * 0.8; }

      // Deactivate if fell way off screen
      if (l.y > canvasH + 100) { l.active = false; continue; }

      api.brush.image(logoDataUrl, l.x, l.y, {
        width: w,
        height: h,
        anchorX: 0.5,
        anchorY: 0.5,
        rotation: l.rotation,
        tint,
        alpha: 0.85,
        blendMode: 'normal',
      });
    }
  },

  async teardown(): Promise<void> {
    logos = [];
    logoDataUrl = '';
    canvasW = 0;
    canvasH = 0;
    spawnCounter = 0;
  },
};

registerActor(actor);
export default actor;
