import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'swords',
  name: 'Swords',
  description: 'A rain of medieval swords and lightsabers tumbling from the sky',
  author: {
    name: 'Jan-Willem',
    github: 'janw-me',
  },
  version: '1.0.0',
  tags: ['swords', 'rain', 'lightsaber', 'medieval', 'epic'],
  createdAt: new Date(),
  preferredDuration: 30,
  requiredContexts: ['display'],
};

const MAX_SWORDS = 30;

// 0 = medieval, 1 = lightsaber
interface FallingSword {
  x: number;
  y: number;
  vy: number;
  vx: number;
  rotation: number;
  spin: number;
  scale: number;
  type: number;
  saberHue: number;
}

let swords: FallingSword[] = [];
let canvasW = 0;
let canvasH = 0;
let glowDataUrl = '';

function initSword(s: FallingSword, startAbove: boolean): void {
  s.x = Math.random() * canvasW;
  s.y = startAbove ? -80 - Math.random() * canvasH : -80 - Math.random() * 200;
  s.vy = 2.5 + Math.random() * 3.0;
  s.vx = (Math.random() - 0.5) * 0.3;
  s.rotation = (Math.random() - 0.5) * 1.0;
  s.spin = (Math.random() - 0.5) * 0.025;
  s.scale = 0.45 + Math.random() * 0.45;
  s.type = Math.random() < 0.5 ? 0 : 1;
  // Lightsaber colors: blue, green, red, purple
  const hues = [210, 130, 0, 280];
  s.saberHue = hues[Math.floor(Math.random() * hues.length)];
}

function hslToHex(h: number, s: number, l: number): number {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return (((r + m) * 255 | 0) << 16) | (((g + m) * 255 | 0) << 8) | ((b + m) * 255 | 0);
}

function drawMedieval(api: ActorUpdateAPI, sc: number, isDark: boolean): void {
  const bladeColor = isDark ? 0xc0c8d0 : 0x9098a0;
  // Blade
  api.brush.polygon(
    [
      { x: -5 * sc, y: 4 * sc },
      { x: 5 * sc, y: 4 * sc },
      { x: 3 * sc, y: -105 * sc },
      { x: 0, y: -115 * sc },
      { x: -3 * sc, y: -105 * sc },
    ],
    { fill: bladeColor, alpha: 0.9 },
  );
  // Edge highlight
  api.brush.line(0, 4 * sc, 0, -115 * sc, { color: 0xe8f0f8, width: Math.max(1 * sc, 1), alpha: 0.45 });
  // Crossguard
  api.brush.rect(-20 * sc, 2 * sc, 40 * sc, 7 * sc, { fill: 0x8b7333, alpha: 0.9 });
  api.brush.circle(-20 * sc, 5.5 * sc, 3.5 * sc, { fill: 0x8b7333, alpha: 0.9 });
  api.brush.circle(20 * sc, 5.5 * sc, 3.5 * sc, { fill: 0x8b7333, alpha: 0.9 });
  // Grip
  api.brush.rect(-3.5 * sc, 9 * sc, 7 * sc, 30 * sc, { fill: 0x5c3a1e, alpha: 0.9 });
  // Grip wraps
  for (let i = 0; i < 4; i++) {
    const gy = (12 + i * 6) * sc;
    api.brush.line(-3.5 * sc, gy, 3.5 * sc, gy, { color: 0x3a2410, width: Math.max(1 * sc, 1), alpha: 0.5 });
  }
  // Pommel
  api.brush.circle(0, 42 * sc, 5.5 * sc, { fill: 0x8b7333, alpha: 0.9 });
}

function drawLightsaber(api: ActorUpdateAPI, sc: number, hue: number, t: number): void {
  const bladeColor = hslToHex(hue, 1.0, 0.55);
  const glowColor = hslToHex(hue, 0.9, 0.35);
  const coreColor = hslToHex(hue, 0.3, 0.9);

  // Handle
  api.brush.rect(-4 * sc, 6 * sc, 8 * sc, 34 * sc, { fill: 0x444444, alpha: 0.9 });
  api.brush.rect(-5 * sc, 7 * sc, 10 * sc, 3 * sc, { fill: 0x666666, alpha: 0.7 });
  api.brush.rect(-5 * sc, 14 * sc, 10 * sc, 2 * sc, { fill: 0x555555, alpha: 0.6 });
  api.brush.rect(-5 * sc, 20 * sc, 10 * sc, 2 * sc, { fill: 0x555555, alpha: 0.6 });
  api.brush.rect(-5 * sc, 34 * sc, 10 * sc, 3 * sc, { fill: 0x666666, alpha: 0.7 });
  // Button
  api.brush.circle(0, 16 * sc, 2 * sc, { fill: 0xff2222, alpha: 0.85 });
  // Emitter
  api.brush.rect(-3.5 * sc, 1 * sc, 7 * sc, 6 * sc, { fill: 0x777777, alpha: 0.9 });
  api.brush.rect(-5 * sc, -1 * sc, 10 * sc, 3 * sc, { fill: 0x999999, alpha: 0.8 });

  // Blade glow
  api.brush.roundRect(-8 * sc, -112 * sc, 16 * sc, 114 * sc, 7 * sc, {
    fill: glowColor, alpha: 0.2, blendMode: 'add',
  });
  // Blade main
  api.brush.roundRect(-4 * sc, -108 * sc, 8 * sc, 110 * sc, 3.5 * sc, {
    fill: bladeColor, alpha: 0.7, blendMode: 'add',
  });
  // Blade core
  api.brush.roundRect(-1.5 * sc, -106 * sc, 3 * sc, 108 * sc, 1.5 * sc, {
    fill: coreColor, alpha: 0.85, blendMode: 'add',
  });
  // Tip glow
  api.brush.circle(0, -110 * sc, 5 * sc, {
    fill: coreColor, alpha: 0.35 + Math.sin(t * 10) * 0.1, blendMode: 'add',
  });
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();
    canvasW = width;
    canvasH = height;

    // Pre-allocate sword pool
    swords = [];
    for (let i = 0; i < MAX_SWORDS; i++) {
      const s: FallingSword = {
        x: 0, y: 0, vy: 0, vx: 0,
        rotation: 0, spin: 0, scale: 0.5,
        type: 0, saberHue: 210,
      };
      initSword(s, true); // spread across initial screen
      swords.push(s);
    }

    // Pre-render glow texture
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.5)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
    glowDataUrl = canvas.toDataURL();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time / 1000;
    const dt = frame.deltaTime * 0.06;
    const isDark = api.context.display.isDarkMode();

    for (let i = 0; i < MAX_SWORDS; i++) {
      const s = swords[i];

      // Fall
      s.y += s.vy * dt;
      s.x += s.vx * dt;
      s.rotation += s.spin * dt;

      // Respawn at top when below screen
      if (s.y > canvasH + 150) {
        initSword(s, false);
      }

      api.brush.pushMatrix();
      api.brush.translate(s.x, s.y);
      api.brush.rotate(s.rotation);

      if (s.type === 0) {
        drawMedieval(api, s.scale, isDark);
      } else {
        // Saber ambient glow behind
        api.brush.image(glowDataUrl, 0, -5 * s.scale, {
          width: 50 * s.scale,
          height: 110 * s.scale,
          tint: hslToHex(s.saberHue, 1.0, 0.5),
          alpha: 0.12,
          blendMode: 'add',
          anchorX: 0.5,
          anchorY: 0.5,
        });
        drawLightsaber(api, s.scale, s.saberHue, t);
      }

      api.brush.popMatrix();
    }
  },

  async teardown(): Promise<void> {
    swords = [];
    canvasW = 0;
    canvasH = 0;
    glowDataUrl = '';
  },
};

registerActor(actor);
export default actor;
