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
  description: 'A lightsaber and medieval sword clash with sparks and energy',
  author: {
    name: 'Jan W',
    github: 'janw-ll',
  },
  version: '1.0.0',
  tags: ['swords', 'clash', 'lightsaber', 'medieval', 'combat'],
  createdAt: new Date(),
  preferredDuration: 30,
  requiredContexts: ['display'],
};

const MAX_SPARKS = 40;

interface Spark {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
}

let sparks: Spark[] = [];
let canvasW = 0;
let canvasH = 0;
let clashIntensity = 0;
let lastClashTime = 0;
let glowDataUrl = '';

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();
    canvasW = width;
    canvasH = height;
    clashIntensity = 0;
    lastClashTime = 0;

    // Pre-allocate spark pool
    sparks = [];
    for (let i = 0; i < MAX_SPARKS; i++) {
      sparks.push({
        active: false,
        x: 0, y: 0,
        vx: 0, vy: 0,
        life: 0, maxLife: 0,
        size: 2,
        color: 0xffaa00,
      });
    }

    // Pre-render glow texture for clash flash
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
    const isDark = api.context.display.isDarkMode();

    const cx = canvasW / 2;
    const cy = canvasH * 0.42;

    // --- Clash animation cycle ---
    const clashPeriod = 2.5;
    const cycle = (t % clashPeriod) / clashPeriod;

    // Swing animation: swords swing in then recoil
    // 0.0-0.4: rest apart, 0.4-0.5: swing in, 0.5: CLASH, 0.5-0.7: recoil wobble, 0.7-1.0: settle
    let swingOffset = 0;
    if (cycle < 0.4) {
      swingOffset = 0.15; // apart
    } else if (cycle < 0.5) {
      const st = (cycle - 0.4) / 0.1;
      swingOffset = 0.15 * (1 - st * st); // ease in to clash
    } else if (cycle < 0.7) {
      const st = (cycle - 0.5) / 0.2;
      swingOffset = -0.05 * Math.sin(st * Math.PI * 3) * (1 - st); // wobble recoil
    } else {
      const st = (cycle - 0.7) / 0.3;
      swingOffset = 0.15 * st; // ease back apart
    }

    // Trigger sparks at clash moment
    if (cycle >= 0.49 && cycle <= 0.52 && t - lastClashTime > 1.0) {
      lastClashTime = t;
      clashIntensity = 1.0;

      // Activate sparks from pool
      const clashX = cx;
      const clashY = cy - 60;
      for (let i = 0; i < MAX_SPARKS; i++) {
        const s = sparks[i];
        s.active = true;
        s.x = clashX;
        s.y = clashY;
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 3.5;
        s.vx = Math.cos(angle) * speed;
        s.vy = Math.sin(angle) * speed - 1.0;
        s.life = 0;
        s.maxLife = 25 + Math.random() * 35;
        s.size = 1.5 + Math.random() * 2.5;
        const r = Math.random();
        s.color = r < 0.3 ? 0xffcc00 : r < 0.6 ? 0xff8800 : 0xffffaa;
      }
    }

    // Decay clash flash
    clashIntensity *= 0.93;
    if (clashIntensity < 0.01) clashIntensity = 0;

    // --- MEDIEVAL SWORD (left, angled right) ---
    const medievalBaseAngle = 0.55;
    const medievalAngle = medievalBaseAngle - swingOffset;

    api.brush.pushMatrix();
    api.brush.translate(cx - 35, cy + 20);
    api.brush.rotate(medievalAngle);

    // Blade
    const bladeColor = isDark ? 0xc0c8d0 : 0x9098a0;
    api.brush.polygon(
      [
        { x: -7, y: 5 },
        { x: 7, y: 5 },
        { x: 4, y: -145 },
        { x: 0, y: -160 },
        { x: -4, y: -145 },
      ],
      { fill: bladeColor, alpha: 0.9 },
    );
    // Blade edge highlight
    api.brush.line(0, 5, 0, -160, { color: 0xe8f0f8, width: 1.5, alpha: 0.5 });
    // Fuller (center groove)
    api.brush.line(0, 0, 0, -130, { color: 0x8890a0, width: 3, alpha: 0.3 });

    // Crossguard
    api.brush.rect(-28, 3, 56, 9, { fill: 0x8b7333, alpha: 0.9 });
    api.brush.rect(-26, 3, 52, 2, { fill: 0xc5a853, alpha: 0.5 });
    // Crossguard tips
    api.brush.circle(-28, 7, 5, { fill: 0x8b7333, alpha: 0.9 });
    api.brush.circle(28, 7, 5, { fill: 0x8b7333, alpha: 0.9 });

    // Grip
    api.brush.rect(-5, 12, 10, 42, { fill: 0x5c3a1e, alpha: 0.9 });
    for (let i = 0; i < 5; i++) {
      const gy = 16 + i * 8;
      api.brush.line(-5, gy, 5, gy, { color: 0x3a2410, width: 1.5, alpha: 0.6 });
    }

    // Pommel
    api.brush.circle(0, 58, 8, { fill: 0x8b7333, alpha: 0.9 });
    api.brush.circle(0, 58, 4, { fill: 0xc5a853, alpha: 0.6 });

    api.brush.popMatrix();

    // --- LIGHTSABER (right, angled left) ---
    const saberBaseAngle = -0.55;
    const saberAngle = saberBaseAngle + swingOffset;

    api.brush.pushMatrix();
    api.brush.translate(cx + 35, cy + 20);
    api.brush.rotate(saberAngle);

    // Handle body
    api.brush.rect(-6, 8, 12, 48, { fill: 0x444444, alpha: 0.9 });
    // Handle ridges
    api.brush.rect(-7, 10, 14, 4, { fill: 0x666666, alpha: 0.8 });
    api.brush.rect(-7, 18, 14, 3, { fill: 0x555555, alpha: 0.7 });
    api.brush.rect(-7, 25, 14, 3, { fill: 0x555555, alpha: 0.7 });
    api.brush.rect(-7, 32, 14, 3, { fill: 0x555555, alpha: 0.7 });
    api.brush.rect(-7, 48, 14, 4, { fill: 0x666666, alpha: 0.8 });
    // Activation button
    api.brush.circle(0, 22, 3, { fill: 0xff2222, alpha: 0.9 });
    // Emitter shroud
    api.brush.rect(-5, 2, 10, 8, { fill: 0x777777, alpha: 0.9 });
    api.brush.rect(-7, 0, 14, 3, { fill: 0x999999, alpha: 0.8 });
    // Pommel end
    api.brush.rect(-5, 54, 10, 4, { fill: 0x333333, alpha: 0.9 });

    // Saber blade - outer glow
    const saberGlow = isDark ? 0x0088ff : 0x0066dd;
    api.brush.roundRect(-12, -155, 24, 158, 10, {
      fill: saberGlow,
      alpha: 0.2,
      blendMode: 'add',
    });

    // Saber blade - main
    const saberColor = 0x22aaff;
    api.brush.roundRect(-6, -150, 12, 153, 5, {
      fill: saberColor,
      alpha: 0.7,
      blendMode: 'add',
    });

    // Saber blade - bright core
    api.brush.roundRect(-2.5, -148, 5, 150, 2, {
      fill: 0xcceeFF,
      alpha: 0.9,
      blendMode: 'add',
    });

    // Saber tip glow
    api.brush.circle(0, -152, 8, {
      fill: 0xcceeFF,
      alpha: 0.4 + Math.sin(t * 8) * 0.1,
      blendMode: 'add',
    });

    api.brush.popMatrix();

    // --- CLASH POINT FLASH ---
    const clashX = cx;
    const clashY = cy - 60;

    if (clashIntensity > 0.05) {
      const glowSize = 50 + clashIntensity * 100;

      // White flash
      api.brush.image(glowDataUrl, clashX, clashY, {
        width: glowSize,
        height: glowSize,
        tint: 0xffffff,
        alpha: clashIntensity * 0.8,
        blendMode: 'add',
        anchorX: 0.5,
        anchorY: 0.5,
      });
      // Warm inner glow
      api.brush.image(glowDataUrl, clashX, clashY, {
        width: glowSize * 0.5,
        height: glowSize * 0.5,
        tint: 0xffaa44,
        alpha: clashIntensity * 0.9,
        blendMode: 'add',
        anchorX: 0.5,
        anchorY: 0.5,
      });
      // Blue saber energy splash
      api.brush.image(glowDataUrl, clashX + 8, clashY - 5, {
        width: glowSize * 0.4,
        height: glowSize * 0.4,
        tint: 0x44aaff,
        alpha: clashIntensity * 0.6,
        blendMode: 'add',
        anchorX: 0.5,
        anchorY: 0.5,
      });
    }

    // Persistent subtle glow at intersection (saber always hums)
    api.brush.image(glowDataUrl, clashX, clashY, {
      width: 30,
      height: 30,
      tint: 0x4488ff,
      alpha: 0.15 + Math.sin(t * 6) * 0.05,
      blendMode: 'add',
      anchorX: 0.5,
      anchorY: 0.5,
    });

    // --- SPARKS ---
    for (let i = 0; i < MAX_SPARKS; i++) {
      const s = sparks[i];
      if (!s.active) continue;

      s.x += s.vx * frame.deltaTime * 0.06;
      s.y += s.vy * frame.deltaTime * 0.06;
      s.vy += 0.06; // gravity
      s.life += 1;

      const progress = s.life / s.maxLife;
      if (progress >= 1) {
        s.active = false;
        continue;
      }

      const alpha = (1 - progress) * 0.9;
      if (alpha < 0.05) {
        s.active = false;
        continue;
      }

      const size = s.size * (1 - progress * 0.5);
      api.brush.circle(s.x, s.y, size, {
        fill: s.color,
        alpha,
        blendMode: 'add',
      });

      // Small spark trail
      if (progress < 0.5) {
        api.brush.circle(s.x - s.vx * 0.5, s.y - s.vy * 0.5, size * 0.5, {
          fill: s.color,
          alpha: alpha * 0.4,
          blendMode: 'add',
        });
      }
    }
  },

  async teardown(): Promise<void> {
    sparks = [];
    canvasW = 0;
    canvasH = 0;
    clashIntensity = 0;
    lastClashTime = 0;
    glowDataUrl = '';
  },
};

registerActor(actor);
export default actor;
