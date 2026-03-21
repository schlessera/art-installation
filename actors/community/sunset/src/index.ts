import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'sunset',
  name: 'Sunset',
  description: 'A warm sunset over a flat earth horizon with drifting clouds',
  author: { name: 'Jan', github: 'janw-ll' },
  version: '1.0.0',
  tags: ['background', 'sunset', 'landscape', 'warm'],
  createdAt: new Date(),
  role: 'background',
  preferredDuration: 60,
  requiredContexts: ['time', 'display'],
};

const MAX_CLOUDS = 8;
const MAX_RAYS = 6;
const MAX_STARS = 40;
const SUNSET_DURATION = 55; // seconds for full animation

interface Cloud {
  x: number;
  y: number;
  speed: number;
  width: number;
  height: number;
  alpha: number;
}

interface Ray {
  angle: number;
  length: number;
  width: number;
  alpha: number;
  speed: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
  twinkleSpeed: number;
}

let clouds: Cloud[] = [];
let rays: Ray[] = [];
let stars: Star[] = [];
let canvasW = 0;
let canvasH = 0;
let horizonY = 0;
let sunStartY = 0;
let sunEndY = 0;
let glowDataUrl = '';

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    horizonY = canvasH * 0.65;
    sunStartY = horizonY - canvasH * 0.18;
    sunEndY = horizonY + canvasH * 0.08;

    // Pre-render a soft glow texture for the sun
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,220,100,0.6)');
    grad.addColorStop(0.6, 'rgba(255,140,50,0.2)');
    grad.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    glowDataUrl = c.toDataURL();

    // Pre-allocate clouds
    clouds = [];
    for (let i = 0; i < MAX_CLOUDS; i++) {
      clouds.push({
        x: Math.random() * canvasW * 1.4 - canvasW * 0.2,
        y: horizonY * 0.15 + Math.random() * horizonY * 0.55,
        speed: 0.08 + Math.random() * 0.15,
        width: 40 + Math.random() * 80,
        height: 8 + Math.random() * 14,
        alpha: 0.25 + Math.random() * 0.35,
      });
    }

    // Pre-allocate sun rays
    rays = [];
    for (let i = 0; i < MAX_RAYS; i++) {
      rays.push({
        angle: -Math.PI * 0.4 + (Math.PI * 0.8 * i) / (MAX_RAYS - 1),
        length: canvasH * 0.4 + Math.random() * canvasH * 0.3,
        width: 8 + Math.random() * 16,
        alpha: 0.08 + Math.random() * 0.1,
        speed: 0.2 + Math.random() * 0.3,
      });
    }

    // Pre-allocate stars (appear as sun sets)
    stars = [];
    for (let i = 0; i < MAX_STARS; i++) {
      stars.push({
        x: Math.random() * canvasW,
        y: Math.random() * horizonY * 0.7,
        size: 1 + Math.random() * 2,
        phase: Math.random() * Math.PI * 2,
        twinkleSpeed: 1.5 + Math.random() * 2,
      });
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time / 1000;
    // Progress 0→1 over the sunset duration, eased for natural feel
    const rawProgress = Math.min(t / SUNSET_DURATION, 1);
    // Ease-in-out for smooth descent
    const p = rawProgress < 0.5
      ? 2 * rawProgress * rawProgress
      : 1 - Math.pow(-2 * rawProgress + 2, 2) / 2;

    const sunX = canvasW * 0.5;
    const currentSunY = sunStartY + (sunEndY - sunStartY) * p;
    // How much the sun has set (0=high, 1=below horizon)
    const sunsetAmount = Math.min(Math.max((currentSunY - (horizonY - 40)) / 80, 0), 1);

    // === Sky gradient — shifts from warm sunset to deep twilight ===
    const skyTop0 = lerpColor(0x1a0533, 0x050510, sunsetAmount);
    const skyTop25 = lerpColor(0x4a1942, 0x0a0a25, sunsetAmount);
    const skyMid = lerpColor(0xc44b2b, 0x1a0f30, sunsetAmount);
    const skyLow = lerpColor(0xe8873c, 0x3d1525, sunsetAmount);
    const skyHorizon1 = lerpColor(0xf5c35a, 0x6b2030, sunsetAmount);
    const skyHorizon2 = lerpColor(0xfde68a, 0x8b3030, sunsetAmount);

    api.brush.rect(0, 0, canvasW, horizonY + 2, {
      fill: {
        type: 'linear',
        x0: 0.5, y0: 0,
        x1: 0.5, y1: 1,
        stops: [
          { offset: 0, color: skyTop0 },
          { offset: 0.25, color: skyTop25 },
          { offset: 0.5, color: skyMid },
          { offset: 0.75, color: skyLow },
          { offset: 0.92, color: skyHorizon1 },
          { offset: 1, color: skyHorizon2 },
        ],
      },
      alpha: 1.0,
    });

    // === Stars fade in as sky darkens ===
    if (sunsetAmount > 0.2) {
      const starAlpha = Math.min((sunsetAmount - 0.2) / 0.5, 1);
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        const twinkle = 0.5 + Math.sin(t * star.twinkleSpeed + star.phase) * 0.5;
        const a = starAlpha * twinkle * 0.8;
        if (a < 0.05) continue;
        api.brush.circle(star.x, star.y, star.size, {
          fill: 0xffffff,
          alpha: a,
          blendMode: 'add',
        });
      }
    }

    // === Sun glow (shrinks and dims as it sets) ===
    const glowScale = 1 - sunsetAmount * 0.5;
    const glowAlpha = Math.max(0.5 - sunsetAmount * 0.4, 0.05);
    if (glowAlpha >= 0.05) {
      api.brush.image(glowDataUrl, sunX, currentSunY, {
        width: canvasW * 0.7 * glowScale,
        height: canvasW * 0.7 * glowScale,
        tint: lerpColor(0xffaa44, 0xff4422, sunsetAmount),
        alpha: glowAlpha,
        blendMode: 'add',
      });
    }

    // === Sun disc (flattens and reddens near horizon) ===
    const discAlpha = Math.max(0.9 - sunsetAmount * 0.6, 0.05);
    if (discAlpha >= 0.05) {
      const squash = 1 - sunsetAmount * 0.35; // flatten at horizon
      api.brush.image(glowDataUrl, sunX, currentSunY, {
        width: 90,
        height: 90 * squash,
        tint: lerpColor(0xffdd88, 0xff3311, sunsetAmount),
        alpha: discAlpha,
        blendMode: 'add',
      });
    }

    // === Sun rays (fade as sun sets) ===
    const rayFade = Math.max(1 - sunsetAmount * 1.5, 0);
    if (rayFade > 0.05) {
      for (let i = 0; i < rays.length; i++) {
        const ray = rays[i];
        const pulse = 0.7 + Math.sin(t * ray.speed + i * 1.5) * 0.3;
        const endX = sunX + Math.cos(ray.angle) * ray.length;
        const endY = currentSunY + Math.sin(ray.angle) * ray.length;
        const rayAlpha = ray.alpha * pulse * rayFade;
        if (rayAlpha < 0.05) continue;
        api.brush.line(sunX, currentSunY, endX, endY, {
          color: lerpColor(0xffcc66, 0xff5533, sunsetAmount),
          width: ray.width * pulse,
          alpha: rayAlpha,
          blendMode: 'add',
        });
      }
    }

    // === Clouds (shift from warm orange to deep purple/dark) ===
    for (let i = 0; i < clouds.length; i++) {
      const cloud = clouds[i];
      cloud.x += cloud.speed * frame.deltaTime * 0.02;
      if (cloud.x > canvasW + cloud.width) {
        cloud.x = -cloud.width;
      }

      const horizonProximity = 1 - Math.abs(cloud.y - horizonY * 0.8) / (horizonY * 0.8);
      const warmColor = horizonProximity > 0.5 ? 0xf5a050 : 0xd07850;
      const coolColor = horizonProximity > 0.5 ? 0x402040 : 0x251530;
      const cloudColor = lerpColor(warmColor, coolColor, sunsetAmount);
      const cloudAlpha = cloud.alpha * (0.7 + Math.sin(t * 0.5 + i) * 0.3);
      if (cloudAlpha < 0.05) continue;

      api.brush.ellipse(cloud.x, cloud.y, cloud.width, cloud.height, {
        fill: cloudColor,
        alpha: cloudAlpha,
        blendMode: 'screen',
      });
      api.brush.ellipse(cloud.x + cloud.width * 0.3, cloud.y - cloud.height * 0.3,
        cloud.width * 0.6, cloud.height * 0.7, {
          fill: cloudColor,
          alpha: cloudAlpha * 0.7,
          blendMode: 'screen',
        });
    }

    // === Horizon glow line (dims as sun sets) ===
    const horizonGlowAlpha = Math.max((0.3 + Math.sin(t * 0.5) * 0.1) * (1 - sunsetAmount * 0.7), 0.05);
    if (horizonGlowAlpha >= 0.05) {
      api.brush.rect(0, horizonY - 4, canvasW, 8, {
        fill: lerpColor(0xfde68a, 0x6b2030, sunsetAmount),
        alpha: horizonGlowAlpha,
        blendMode: 'add',
      });
    }

    // === Ground — darkens as sun sets ===
    const groundTop = lerpColor(0x2d1810, 0x0a0608, sunsetAmount);
    const groundMid = lerpColor(0x1a0f08, 0x060405, sunsetAmount);
    const groundBot = lerpColor(0x0a0604, 0x030203, sunsetAmount);
    api.brush.rect(0, horizonY, canvasW, canvasH - horizonY, {
      fill: {
        type: 'linear',
        x0: 0.5, y0: 0,
        x1: 0.5, y1: 1,
        stops: [
          { offset: 0, color: groundTop },
          { offset: 0.3, color: groundMid },
          { offset: 1, color: groundBot },
        ],
      },
      alpha: 1.0,
    });

    // === Ground reflection (fades with sun) ===
    const reflAlpha = Math.max(0.2 * (1 - sunsetAmount), 0.05);
    if (reflAlpha >= 0.05) {
      api.brush.image(glowDataUrl, sunX, horizonY + 10, {
        width: canvasW * 0.5 * (1 - sunsetAmount * 0.3),
        height: 60 * (1 - sunsetAmount * 0.5),
        tint: lerpColor(0xff8833, 0x551111, sunsetAmount),
        alpha: reflAlpha,
        blendMode: 'add',
      });
    }

    // === Ground texture lines ===
    for (let i = 0; i < 5; i++) {
      const ly = horizonY + 20 + i * ((canvasH - horizonY - 20) / 5);
      const lineAlpha = 0.1 * (1 - i / 5) * (1 - sunsetAmount * 0.5);
      if (lineAlpha < 0.05) continue;
      api.brush.line(0, ly, canvasW, ly, {
        color: lerpColor(0x3d2215, 0x150a08, sunsetAmount),
        width: 1.5,
        alpha: lineAlpha,
      });
    }
  },

  async teardown(): Promise<void> {
    clouds = [];
    rays = [];
    stars = [];
    canvasW = 0;
    canvasH = 0;
    horizonY = 0;
    sunStartY = 0;
    sunEndY = 0;
    glowDataUrl = '';
  },
};

registerActor(actor);
export default actor;
