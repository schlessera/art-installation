import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'batman',
  name: 'Batman',
  description: 'Dark Gotham cityscape background with scrolling skyline, bat signal, and moody atmosphere',
  author: { name: 'Jan-Willem', github: 'janw-me' },
  version: '1.0.0',
  tags: ['background', 'batman', 'gotham', 'cityscape', 'dark'],
  createdAt: new Date(),
  role: 'background',
  preferredDuration: 60,
  requiredContexts: ['display'],
};

// Pre-rendered textures
let skylineTexture = '';
let batSignalTexture = '';
let canvasW = 0;
let canvasH = 0;
let scrollOffset = 0;

// Skyline texture is 2x canvas width for seamless scrolling
const TEXTURE_SCALE = 2;

function createSkylineTexture(w: number, h: number): string {
  const texW = w * TEXTURE_SCALE;
  const canvas = document.createElement('canvas');
  canvas.width = texW;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Sky gradient: deep dark blue at top -> orange/amber at horizon -> dark at bottom
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
  skyGrad.addColorStop(0, '#0a0a1a');
  skyGrad.addColorStop(0.25, '#0f1025');
  skyGrad.addColorStop(0.45, '#1a1530');
  skyGrad.addColorStop(0.55, '#4a2010');
  skyGrad.addColorStop(0.65, '#c06020');
  skyGrad.addColorStop(0.72, '#e08030');
  skyGrad.addColorStop(0.78, '#a05018');
  skyGrad.addColorStop(0.85, '#301808');
  skyGrad.addColorStop(1, '#080808');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, texW, h);

  // Subtle cloud wisps in the orange zone
  ctx.globalAlpha = 0.15;
  for (let i = 0; i < 8; i++) {
    const cx = Math.random() * texW;
    const cy = h * 0.55 + Math.random() * h * 0.15;
    const rw = 40 + Math.random() * 80;
    const rh = 8 + Math.random() * 15;
    ctx.fillStyle = '#ff9040';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Distant buildings (small, far away, near horizon)
  const horizonY = h * 0.65;
  ctx.fillStyle = '#0c0c14';
  for (let x = 0; x < texW; x += 6 + Math.random() * 10) {
    const bh = 15 + Math.random() * 50;
    const bw = 4 + Math.random() * 8;
    ctx.fillRect(x, horizonY - bh, bw, bh + 10);
  }

  // Mid-ground buildings
  ctx.fillStyle = '#0a0a10';
  const midBuildingSeeds = [];
  for (let i = 0; i < 30; i++) {
    midBuildingSeeds.push({
      x: (i / 30) * texW + Math.random() * 20 - 10,
      w: 12 + Math.random() * 25,
      h: 40 + Math.random() * 100,
    });
  }
  for (const b of midBuildingSeeds) {
    const by = horizonY - b.h * 0.4;
    ctx.fillRect(b.x, by, b.w, h - by);
    // Some windows
    ctx.fillStyle = '#1a1508';
    for (let wy = by + 4; wy < h - 10; wy += 6) {
      for (let wx = b.x + 2; wx < b.x + b.w - 2; wx += 5) {
        if (Math.random() > 0.6) {
          ctx.fillRect(wx, wy, 2, 2);
        }
      }
    }
    ctx.fillStyle = '#0a0a10';
  }

  // Foreground tall buildings / pillars
  const fgBuildings = [];
  for (let i = 0; i < 16; i++) {
    fgBuildings.push({
      x: (i / 16) * texW + Math.random() * 15,
      w: 18 + Math.random() * 35,
      h: 100 + Math.random() * 200,
      hasSpire: Math.random() > 0.6,
    });
  }

  for (const b of fgBuildings) {
    const by = h - b.h;

    // Building body
    const bGrad = ctx.createLinearGradient(b.x, by, b.x + b.w, by);
    bGrad.addColorStop(0, '#08080e');
    bGrad.addColorStop(0.3, '#0e0e18');
    bGrad.addColorStop(0.7, '#0c0c14');
    bGrad.addColorStop(1, '#060610');
    ctx.fillStyle = bGrad;
    ctx.fillRect(b.x, by, b.w, b.h);

    // Spire
    if (b.hasSpire) {
      ctx.fillStyle = '#0a0a12';
      ctx.beginPath();
      ctx.moveTo(b.x + b.w * 0.35, by);
      ctx.lineTo(b.x + b.w * 0.5, by - 25 - Math.random() * 20);
      ctx.lineTo(b.x + b.w * 0.65, by);
      ctx.fill();
    }

    // Lit windows (sparse, warm yellow)
    for (let wy = by + 6; wy < h - 5; wy += 7 + Math.random() * 3) {
      for (let wx = b.x + 3; wx < b.x + b.w - 3; wx += 5 + Math.random() * 2) {
        if (Math.random() > 0.75) {
          const brightness = Math.random();
          if (brightness > 0.5) {
            ctx.fillStyle = `rgba(255, 200, 80, ${0.3 + brightness * 0.4})`;
          } else {
            ctx.fillStyle = `rgba(180, 160, 100, ${0.15 + brightness * 0.2})`;
          }
          ctx.fillRect(wx, wy, 2, 3);
        }
      }
    }
  }

  // Dark ground at bottom
  const groundGrad = ctx.createLinearGradient(0, h * 0.88, 0, h);
  groundGrad.addColorStop(0, 'rgba(5,5,8,0.5)');
  groundGrad.addColorStop(1, '#050508');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, h * 0.88, texW, h * 0.12);

  return canvas.toDataURL();
}

function createBatSignalTexture(): string {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Outer glow
  const glowGrad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  glowGrad.addColorStop(0, 'rgba(255, 220, 120, 0.6)');
  glowGrad.addColorStop(0.3, 'rgba(255, 200, 80, 0.3)');
  glowGrad.addColorStop(0.6, 'rgba(255, 180, 50, 0.1)');
  glowGrad.addColorStop(1, 'rgba(255, 180, 50, 0)');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, size, size);

  // Yellow circle (signal spotlight)
  ctx.fillStyle = 'rgba(255, 220, 100, 0.7)';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.28, 0, Math.PI * 2);
  ctx.fill();

  // Bat silhouette in center
  const cx = size / 2;
  const cy = size / 2;
  const s = size * 0.18; // bat scale

  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  // Body
  ctx.ellipse(cx, cy + s * 0.1, s * 0.25, s * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.45, s * 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Ears
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.15, cy - s * 0.55);
  ctx.lineTo(cx - s * 0.12, cy - s * 0.85);
  ctx.lineTo(cx - s * 0.02, cy - s * 0.55);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.15, cy - s * 0.55);
  ctx.lineTo(cx + s * 0.12, cy - s * 0.85);
  ctx.lineTo(cx + s * 0.02, cy - s * 0.55);
  ctx.fill();

  // Wings
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.1);
  ctx.quadraticCurveTo(cx - s * 0.8, cy - s * 0.7, cx - s * 1.5, cy - s * 0.2);
  ctx.quadraticCurveTo(cx - s * 1.2, cy + s * 0.1, cx - s * 0.9, cy + s * 0.3);
  ctx.quadraticCurveTo(cx - s * 0.5, cy - s * 0.05, cx, cy + s * 0.2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.1);
  ctx.quadraticCurveTo(cx + s * 0.8, cy - s * 0.7, cx + s * 1.5, cy - s * 0.2);
  ctx.quadraticCurveTo(cx + s * 1.2, cy + s * 0.1, cx + s * 0.9, cy + s * 0.3);
  ctx.quadraticCurveTo(cx + s * 0.5, cy - s * 0.05, cx, cy + s * 0.2);
  ctx.fill();

  return canvas.toDataURL();
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    scrollOffset = 0;

    skylineTexture = createSkylineTexture(canvasW, canvasH);
    batSignalTexture = createBatSignalTexture();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time / 1000;
    const texW = canvasW * TEXTURE_SCALE;

    // Slow scroll speed (pixels per second)
    scrollOffset = (t * 12) % texW;

    // Draw scrolling skyline - two copies for seamless wrap
    const x1 = -scrollOffset;
    const x2 = x1 + texW;

    api.brush.image(skylineTexture, x1 + texW / 2, canvasH / 2, {
      width: texW,
      height: canvasH,
    });
    api.brush.image(skylineTexture, x2 + texW / 2, canvasH / 2, {
      width: texW,
      height: canvasH,
    });

    // Bat signal in the sky - subtle pulse
    const signalAlpha = 0.35 + Math.sin(t * 0.8) * 0.15;
    const signalSize = 90 + Math.sin(t * 1.2) * 5;
    api.brush.image(batSignalTexture, canvasW * 0.5, canvasH * 0.22, {
      width: signalSize,
      height: signalSize,
      alpha: signalAlpha,
      blendMode: 'add',
    });

    // Subtle atmospheric fog near bottom
    api.brush.rect(0, canvasH * 0.85, canvasW, canvasH * 0.15, {
      fill: {
        type: 'linear',
        x0: 0.5, y0: 0,
        x1: 0.5, y1: 1,
        stops: [
          { offset: 0, color: 'rgba(10,10,20,0)' },
          { offset: 1, color: 'rgba(10,10,20,0.6)' },
        ],
      },
    });
  },

  async teardown(): Promise<void> {
    skylineTexture = '';
    batSignalTexture = '';
    scrollOffset = 0;
    canvasW = 0;
    canvasH = 0;
  },
};

registerActor(actor);
export default actor;
