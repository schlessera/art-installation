import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'snow',
  name: 'Snow',
  description: 'Gentle snowflakes drifting down with wind sway and depth layers',
  author: { name: 'Alain Schlesser', github: 'schlessera' },
  version: '1.0.0',
  tags: ['snow', 'weather', 'particles', 'ambient'],
  createdAt: new Date(),
  preferredDuration: 45,
  requiredContexts: ['display'],
};

const MAX_FLAKES = 120;

interface Flake {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  speed: number;
  wobbleAmp: number;
  wobbleFreq: number;
  phase: number;
  alpha: number;
  layer: number; // 0=far, 1=mid, 2=near
}

let flakes: Flake[] = [];
let canvasW = 0;
let canvasH = 0;
let glowDataUrl = '';

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI) {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    // Pre-render a soft glow texture for snowflakes
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    glowDataUrl = c.toDataURL();

    // Pre-allocate flake pool
    flakes = [];
    for (let i = 0; i < MAX_FLAKES; i++) {
      flakes.push(makeFlake(true));
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext) {
    const t = frame.time / 1000;
    const dt = frame.deltaTime / 16.67; // normalize to ~60fps
    const isDark = api.context.display.isDarkMode();

    // Global wind sway
    const wind = Math.sin(t * 0.3) * 0.4;

    for (let i = 0; i < MAX_FLAKES; i++) {
      const f = flakes[i];
      if (!f.active) continue;

      // Lateral wobble + wind
      const wobble = Math.sin(t * f.wobbleFreq + f.phase) * f.wobbleAmp;
      f.x += (wobble + wind) * dt;
      f.y += f.speed * dt;

      // Wrap around edges
      if (f.y > canvasH + 10) {
        resetFlake(f, false);
      }
      if (f.x < -20) f.x = canvasW + 20;
      if (f.x > canvasW + 20) f.x = -20;

      // Layer-based depth: far=smaller/dimmer, near=larger/brighter
      const layerAlpha = f.layer === 0 ? 0.35 : f.layer === 1 ? 0.55 : 0.8;
      const alpha = f.alpha * layerAlpha;
      if (alpha < 0.05) continue;

      const drawSize = f.radius * 2;
      const tint = isDark ? 0xddeeff : 0xaabbdd;

      api.brush.image(glowDataUrl, f.x, f.y, {
        width: drawSize,
        height: drawSize,
        anchorX: 0.5,
        anchorY: 0.5,
        tint,
        alpha,
        blendMode: 'add',
      });
    }
  },

  async teardown() {
    flakes = [];
    canvasW = 0;
    canvasH = 0;
    glowDataUrl = '';
  },
};

function makeFlake(randomY: boolean): Flake {
  const layer = Math.random() < 0.3 ? 0 : Math.random() < 0.6 ? 1 : 2;
  const sizeScale = layer === 0 ? 0.5 : layer === 1 ? 1.0 : 1.5;
  const speedScale = layer === 0 ? 0.5 : layer === 1 ? 1.0 : 1.4;

  return {
    active: true,
    x: Math.random() * canvasW,
    y: randomY ? Math.random() * canvasH : -(Math.random() * 40),
    radius: (2 + Math.random() * 4) * sizeScale,
    speed: (0.4 + Math.random() * 0.6) * speedScale,
    wobbleAmp: 0.3 + Math.random() * 0.5,
    wobbleFreq: 0.8 + Math.random() * 1.2,
    phase: Math.random() * Math.PI * 2,
    alpha: 0.7 + Math.random() * 0.3,
    layer,
  };
}

function resetFlake(f: Flake, randomY: boolean): void {
  const layer = Math.random() < 0.3 ? 0 : Math.random() < 0.6 ? 1 : 2;
  const sizeScale = layer === 0 ? 0.5 : layer === 1 ? 1.0 : 1.5;
  const speedScale = layer === 0 ? 0.5 : layer === 1 ? 1.0 : 1.4;

  f.x = Math.random() * canvasW;
  f.y = randomY ? Math.random() * canvasH : -(Math.random() * 40);
  f.radius = (2 + Math.random() * 4) * sizeScale;
  f.speed = (0.4 + Math.random() * 0.6) * speedScale;
  f.wobbleAmp = 0.3 + Math.random() * 0.5;
  f.wobbleFreq = 0.8 + Math.random() * 1.2;
  f.phase = Math.random() * Math.PI * 2;
  f.alpha = 0.7 + Math.random() * 0.3;
  f.layer = layer;
}

registerActor(actor);
export default actor;
