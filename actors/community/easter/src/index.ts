import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'easter',
  name: 'Easter Fireworks',
  description: 'Fireworks that explode into colorful Easter eggs raining down',
  author: { name: 'Jan', github: 'janw-ll' },
  version: '1.0.0',
  tags: ['fireworks', 'easter', 'eggs', 'celebration'],
  createdAt: new Date(),
  preferredDuration: 30,
  requiredContexts: ['display'],
};

// Pastel easter palette (numeric colors for performance)
const EGG_COLORS = [
  0xffb3ba, // pink
  0xbaffc9, // mint
  0xbae1ff, // baby blue
  0xffffba, // pale yellow
  0xe8baff, // lavender
  0xffcba4, // peach
  0xc9ffba, // lime
  0xffd1dc, // rose
];

// Stripe accent colors per egg
const STRIPE_COLORS = [
  0xff6b81, 0x2ed573, 0x1e90ff, 0xffa502,
  0xa855f7, 0xff6348, 0x7bed9f, 0xff4757,
];

const MAX_ROCKETS = 6;
const MAX_EGGS_PER_EXPLOSION = 18;
const MAX_EGGS = MAX_ROCKETS * MAX_EGGS_PER_EXPLOSION;
const MAX_SPARKS = MAX_ROCKETS * 4;
const GRAVITY = 0.06;

interface Rocket {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetY: number;
  colorIdx: number;
  trail: number; // trail age counter
}

interface Egg {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotSpeed: number;
  colorIdx: number;
  life: number;
  maxLife: number;
  size: number;
}

interface Spark {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: number;
}

let rockets: Rocket[];
let eggs: Egg[];
let sparks: Spark[];
let canvasW = 0;
let canvasH = 0;
let launchTimer = 0;
let glowDataUrl = '';

function initRocket(r: Rocket, w: number, h: number): void {
  r.active = true;
  r.x = w * 0.15 + Math.random() * w * 0.7;
  r.y = h;
  r.vx = (Math.random() - 0.5) * 0.8;
  r.vy = -(3.5 + Math.random() * 2.5);
  r.targetY = h * 0.15 + Math.random() * h * 0.35;
  r.colorIdx = Math.floor(Math.random() * EGG_COLORS.length);
  r.trail = 0;
}

function explodeRocket(r: Rocket): void {
  r.active = false;
  const count = 10 + Math.floor(Math.random() * (MAX_EGGS_PER_EXPLOSION - 10));
  for (let i = 0; i < count; i++) {
    const egg = findInactive(eggs);
    if (!egg) break;
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.3;
    const speed = 1.5 + Math.random() * 2.5;
    egg.active = true;
    egg.x = r.x;
    egg.y = r.y;
    egg.vx = Math.cos(angle) * speed;
    egg.vy = Math.sin(angle) * speed - 1;
    egg.rotation = Math.random() * Math.PI * 2;
    egg.rotSpeed = (Math.random() - 0.5) * 0.12;
    egg.colorIdx = (r.colorIdx + Math.floor(Math.random() * 3)) % EGG_COLORS.length;
    egg.life = 0;
    egg.maxLife = 90 + Math.floor(Math.random() * 60);
    egg.size = 5 + Math.random() * 5;
  }
  // Burst sparks
  for (let i = 0; i < 4; i++) {
    const sp = findInactive(sparks);
    if (!sp) break;
    const angle = Math.random() * Math.PI * 2;
    sp.active = true;
    sp.x = r.x;
    sp.y = r.y;
    sp.vx = Math.cos(angle) * (2 + Math.random() * 2);
    sp.vy = Math.sin(angle) * (2 + Math.random() * 2);
    sp.life = 20 + Math.floor(Math.random() * 15);
    sp.color = EGG_COLORS[r.colorIdx];
  }
}

function findInactive<T extends { active: boolean }>(pool: T[]): T | null {
  for (let i = 0; i < pool.length; i++) {
    if (!pool[i].active) return pool[i];
  }
  return null;
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    launchTimer = 0;

    // Pre-allocate pools
    rockets = [];
    for (let i = 0; i < MAX_ROCKETS; i++) {
      rockets.push({
        active: false, x: 0, y: 0, vx: 0, vy: 0,
        targetY: 0, colorIdx: 0, trail: 0,
      });
    }
    eggs = [];
    for (let i = 0; i < MAX_EGGS; i++) {
      eggs.push({
        active: false, x: 0, y: 0, vx: 0, vy: 0,
        rotation: 0, rotSpeed: 0, colorIdx: 0,
        life: 0, maxLife: 100, size: 6,
      });
    }
    sparks = [];
    for (let i = 0; i < MAX_SPARKS; i++) {
      sparks.push({
        active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, color: 0xffffff,
      });
    }

    // Pre-render glow texture
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.4)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    glowDataUrl = c.toDataURL();

    // Launch first rocket immediately
    const r = findInactive(rockets);
    if (r) initRocket(r, canvasW, canvasH);
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const dt = Math.min(frame.deltaTime / 16.667, 3); // normalize to ~60fps, cap
    const isDark = api.context.display.isDarkMode();

    // Launch timer
    launchTimer += frame.deltaTime;
    if (launchTimer > 800 + Math.random() * 1200) {
      launchTimer = 0;
      const r = findInactive(rockets);
      if (r) initRocket(r, canvasW, canvasH);
    }

    // Update & draw rockets
    for (let i = 0; i < rockets.length; i++) {
      const r = rockets[i];
      if (!r.active) continue;

      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.vy += GRAVITY * 0.3 * dt;
      r.trail++;

      // Explode when reaching target or slowing down
      if (r.y <= r.targetY || r.vy >= 0) {
        explodeRocket(r);
        continue;
      }

      // Draw rocket trail glow
      api.brush.image(glowDataUrl, r.x, r.y, {
        width: 20, height: 20,
        tint: EGG_COLORS[r.colorIdx],
        alpha: 0.9,
        blendMode: 'add',
        anchorX: 0.5,
        anchorY: 0.5,
      });
      // Rocket body
      api.brush.ellipse(r.x, r.y, 3, 6, {
        fill: 0xffffff,
        alpha: 0.95,
      });
    }

    // Update & draw eggs
    for (let i = 0; i < eggs.length; i++) {
      const egg = eggs[i];
      if (!egg.active) continue;

      egg.x += egg.vx * dt;
      egg.y += egg.vy * dt;
      egg.vy += GRAVITY * dt;
      egg.vx *= 0.995;
      egg.rotation += egg.rotSpeed * dt;
      egg.life++;

      if (egg.life >= egg.maxLife || egg.y > canvasH + 30) {
        egg.active = false;
        continue;
      }

      // Fade in/out
      const progress = egg.life / egg.maxLife;
      let alpha: number;
      if (progress < 0.1) {
        alpha = progress / 0.1;
      } else if (progress > 0.7) {
        alpha = (1 - progress) / 0.3;
      } else {
        alpha = 1;
      }
      if (alpha < 0.05) continue;

      const eggColor = EGG_COLORS[egg.colorIdx];
      const stripeColor = STRIPE_COLORS[egg.colorIdx];
      const sz = egg.size * (progress < 0.15 ? 0.5 + (progress / 0.15) * 0.5 : 1);

      // Draw egg shape (ellipse with rotation)
      api.brush.pushMatrix();
      api.brush.translate(egg.x, egg.y);
      api.brush.rotate(egg.rotation);

      // Egg body
      api.brush.ellipse(0, 0, sz, sz * 1.3, {
        fill: eggColor,
        alpha: alpha * 0.9,
        blendMode: isDark ? 'add' : 'normal',
      });

      // Stripe decoration across egg middle
      api.brush.ellipse(0, 0, sz * 0.85, sz * 0.35, {
        fill: stripeColor,
        alpha: alpha * 0.7,
        blendMode: isDark ? 'add' : 'normal',
      });

      // Small dot decoration
      api.brush.circle(0, -sz * 0.6, sz * 0.2, {
        fill: 0xffffff,
        alpha: alpha * 0.6,
      });

      api.brush.popMatrix();
    }

    // Update & draw sparks
    for (let i = 0; i < sparks.length; i++) {
      const sp = sparks[i];
      if (!sp.active) continue;

      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.vy += GRAVITY * 0.5 * dt;
      sp.life--;

      if (sp.life <= 0) {
        sp.active = false;
        continue;
      }

      const sparkAlpha = sp.life / 30;
      if (sparkAlpha < 0.05) continue;

      api.brush.image(glowDataUrl, sp.x, sp.y, {
        width: 12, height: 12,
        tint: sp.color,
        alpha: sparkAlpha,
        blendMode: 'add',
        anchorX: 0.5,
        anchorY: 0.5,
      });
    }
  },

  async teardown(): Promise<void> {
    rockets = [];
    eggs = [];
    sparks = [];
    canvasW = 0;
    canvasH = 0;
    launchTimer = 0;
    glowDataUrl = '';
  },
};

registerActor(actor);
export default actor;
