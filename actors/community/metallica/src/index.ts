import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'metallica',
  name: 'Metallica',
  description: 'Heavy metal instruments with flaming skulls — electric guitars, drums, and hellfire',
  author: { name: 'Jan W', github: 'janw-ll' },
  version: '1.0.0',
  tags: ['metal', 'skulls', 'fire', 'guitars', 'heavy'],
  createdAt: new Date(),
  preferredDuration: 45,
  requiredContexts: ['display', 'audio'],
};

// --- Pre-allocated state ---

const MAX_FLAMES = 80;
const MAX_SKULLS = 3;
const MAX_SPARKS = 30;

interface Flame {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  parentIdx: number; // which skull spawned it
}

interface Skull {
  x: number;
  y: number;
  scale: number;
  bobPhase: number;
  bobSpeed: number;
}

interface Spark {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

let flames: Flame[] = [];
let skulls: Skull[] = [];
let sparks: Spark[] = [];
let canvasW = 0;
let canvasH = 0;
let flameIdx = 0; // circular index for flame pool
let sparkIdx = 0;
let glowDataUrl = '';

function initFlame(f: Flame, sx: number, sy: number, parentIdx: number): void {
  f.active = true;
  f.x = sx + (Math.random() - 0.5) * 16;
  f.y = sy;
  f.vx = (Math.random() - 0.5) * 0.6;
  f.vy = -(1.2 + Math.random() * 1.5);
  f.life = 0;
  f.maxLife = 40 + Math.random() * 50;
  f.size = 6 + Math.random() * 10;
  f.parentIdx = parentIdx;
}

function initSpark(s: Spark, x: number, y: number): void {
  s.active = true;
  s.x = x;
  s.y = y;
  s.vx = (Math.random() - 0.5) * 3;
  s.vy = -(1 + Math.random() * 2.5);
  s.life = 0;
  s.maxLife = 20 + Math.random() * 25;
}

function drawSkull(api: ActorUpdateAPI, cx: number, cy: number, s: number, isDark: boolean): void {
  const headColor = isDark ? 0xddccbb : 0xccbbaa;
  const eyeColor = 0xff3300;
  const jawColor = isDark ? 0xbbaa99 : 0xaa9988;

  api.brush.pushMatrix();
  api.brush.translate(cx, cy);
  api.brush.scale(s, s);

  // Cranium
  api.brush.ellipse(0, -6, 30, 28, { fill: headColor, alpha: 0.9 });
  // Jaw
  api.brush.ellipse(0, 16, 22, 12, { fill: jawColor, alpha: 0.85 });
  // Cheekbones
  api.brush.ellipse(-14, 4, 8, 10, { fill: headColor, alpha: 0.7 });
  api.brush.ellipse(14, 4, 8, 10, { fill: headColor, alpha: 0.7 });

  // Eye sockets (dark)
  api.brush.ellipse(-10, -6, 8, 7, { fill: 0x110000, alpha: 0.95 });
  api.brush.ellipse(10, -6, 8, 7, { fill: 0x110000, alpha: 0.95 });
  // Glowing eyes
  api.brush.ellipse(-10, -6, 5, 4, { fill: eyeColor, alpha: 0.9, blendMode: 'add' });
  api.brush.ellipse(10, -6, 5, 4, { fill: eyeColor, alpha: 0.9, blendMode: 'add' });

  // Nose cavity
  api.brush.polygon(
    [{ x: -3, y: 4 }, { x: 3, y: 4 }, { x: 0, y: 10 }],
    { fill: 0x220000, alpha: 0.8 }
  );

  // Teeth
  for (let i = -3; i <= 3; i++) {
    const tx = i * 5;
    api.brush.rect(tx - 2, 13, 4, 6, { fill: headColor, alpha: 0.85 });
    api.brush.line(tx - 2, 13, tx - 2, 19, { color: 0x332211, width: 1, alpha: 0.5 });
  }

  // Cracks on skull
  api.brush.line(-8, -22, -14, -10, { color: 0x443322, width: 1.5, alpha: 0.5 });
  api.brush.line(-14, -10, -18, 0, { color: 0x443322, width: 1, alpha: 0.4 });
  api.brush.line(6, -24, 12, -14, { color: 0x443322, width: 1.5, alpha: 0.5 });

  api.brush.popMatrix();
}

function drawGuitar(api: ActorUpdateAPI, cx: number, cy: number, angle: number, s: number, isDark: boolean): void {
  const bodyColor = isDark ? 0xaa1111 : 0x881111;
  const neckColor = isDark ? 0x553311 : 0x442200;
  const stringColor = isDark ? 0xcccccc : 0x999999;

  api.brush.pushMatrix();
  api.brush.translate(cx, cy);
  api.brush.rotate(angle);
  api.brush.scale(s, s);

  // Guitar body (flying V shape using two triangles)
  api.brush.polygon(
    [{ x: 0, y: 0 }, { x: -28, y: 40 }, { x: -8, y: 30 }],
    { fill: bodyColor, alpha: 0.9 }
  );
  api.brush.polygon(
    [{ x: 0, y: 0 }, { x: 28, y: 40 }, { x: 8, y: 30 }],
    { fill: bodyColor, alpha: 0.9 }
  );

  // Neck
  api.brush.rect(-4, -60, 8, 62, { fill: neckColor, alpha: 0.9 });

  // Headstock
  api.brush.rect(-6, -72, 12, 14, { fill: 0x221100, alpha: 0.9 });

  // Frets
  for (let i = 0; i < 8; i++) {
    const fy = -55 + i * 7;
    api.brush.line(-4, fy, 4, fy, { color: 0x888888, width: 1, alpha: 0.6 });
  }

  // Strings
  for (let i = 0; i < 6; i++) {
    const sx = -3 + i * 1.2;
    api.brush.line(sx, -70, sx, 20, { color: stringColor, width: 0.7, alpha: 0.6 });
  }

  // Pickups
  api.brush.rect(-8, 10, 16, 6, { fill: 0x222222, alpha: 0.8 });
  api.brush.rect(-8, 20, 16, 6, { fill: 0x222222, alpha: 0.8 });

  // Tuning pegs
  for (let i = 0; i < 3; i++) {
    api.brush.circle(-10, -66 + i * 4, 2, { fill: 0xccaa00, alpha: 0.8 });
    api.brush.circle(10, -66 + i * 4, 2, { fill: 0xccaa00, alpha: 0.8 });
  }

  api.brush.popMatrix();
}

function drawDrumKit(api: ActorUpdateAPI, cx: number, cy: number, s: number, time: number, isDark: boolean): void {
  const drumColor = isDark ? 0x991111 : 0x771111;
  const cymbalColor = isDark ? 0xccaa33 : 0xaa8822;
  const hitPulse = Math.abs(Math.sin(time * 6));

  api.brush.pushMatrix();
  api.brush.translate(cx, cy);
  api.brush.scale(s, s);

  // Bass drum
  api.brush.ellipse(0, 20, 36, 28, { fill: drumColor, alpha: 0.85 });
  api.brush.ellipse(0, 20, 30, 22, { fill: 0x111111, alpha: 0.7 });
  // Pentagram-ish star on bass drum
  api.brush.star(0, 20, 16, 8, 5, { fill: 0xff4400, alpha: 0.6 + hitPulse * 0.3, blendMode: 'add' });

  // Snare (left)
  api.brush.ellipse(-30, 0, 16, 10, { fill: drumColor, alpha: 0.8 });
  api.brush.ellipse(-30, 0, 14, 8, { fill: 0x222222, alpha: 0.6 });

  // Tom (right)
  api.brush.ellipse(30, -4, 14, 9, { fill: drumColor, alpha: 0.8 });
  api.brush.ellipse(30, -4, 12, 7, { fill: 0x222222, alpha: 0.6 });

  // Floor tom
  api.brush.ellipse(40, 24, 18, 12, { fill: drumColor, alpha: 0.8 });

  // Hi-hat cymbal
  api.brush.ellipse(-40, -20, 14, 4, { fill: cymbalColor, alpha: 0.7 });
  api.brush.line(-40, -20, -40, 10, { color: 0x888888, width: 2, alpha: 0.6 });

  // Crash cymbal
  api.brush.ellipse(20, -28, 18, 5, { fill: cymbalColor, alpha: 0.7 });
  api.brush.line(20, -28, 20, 0, { color: 0x888888, width: 2, alpha: 0.6 });

  // Drumsticks
  const stickAngle = Math.sin(time * 8) * 0.3;
  api.brush.pushMatrix();
  api.brush.translate(-30, -14);
  api.brush.rotate(-0.4 + stickAngle);
  api.brush.line(0, 0, 0, -28, { color: 0xddbb77, width: 2.5, alpha: 0.8 });
  api.brush.popMatrix();

  api.brush.pushMatrix();
  api.brush.translate(30, -18);
  api.brush.rotate(0.4 - stickAngle);
  api.brush.line(0, 0, 0, -28, { color: 0xddbb77, width: 2.5, alpha: 0.8 });
  api.brush.popMatrix();

  api.brush.popMatrix();
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    // Pre-allocate flame pool
    flames = [];
    for (let i = 0; i < MAX_FLAMES; i++) {
      flames.push({
        active: false, x: 0, y: 0, vx: 0, vy: 0,
        life: 0, maxLife: 60, size: 8, parentIdx: 0,
      });
    }
    flameIdx = 0;

    // Pre-allocate spark pool
    sparks = [];
    for (let i = 0; i < MAX_SPARKS; i++) {
      sparks.push({
        active: false, x: 0, y: 0, vx: 0, vy: 0,
        life: 0, maxLife: 30,
      });
    }
    sparkIdx = 0;

    // Position skulls across the canvas
    skulls = [];
    for (let i = 0; i < MAX_SKULLS; i++) {
      skulls.push({
        x: canvasW * (0.2 + i * 0.3),
        y: canvasH * 0.55 + (i % 2 === 0 ? -20 : 20),
        scale: 0.9 + Math.random() * 0.4,
        bobPhase: Math.random() * Math.PI * 2,
        bobSpeed: 0.8 + Math.random() * 0.6,
      });
    }

    // Pre-render glow texture
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.4)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    glowDataUrl = c.toDataURL();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();
    const dt = frame.deltaTime / 16.67; // normalize to ~1 at 60fps

    // -- Spawn flames from each skull --
    for (let si = 0; si < skulls.length; si++) {
      const sk = skulls[si];
      const bobY = Math.sin(t * sk.bobSpeed + sk.bobPhase) * 8;
      const skullTopY = sk.y + bobY - 30 * sk.scale;

      // Spawn 1-2 flames per skull per frame
      if (frame.frameCount % 2 === 0) {
        const f = flames[flameIdx];
        initFlame(f, sk.x, skullTopY, si);
        flameIdx = (flameIdx + 1) % MAX_FLAMES;
      }
    }

    // -- Spawn occasional sparks from guitars --
    if (frame.frameCount % 8 === 0) {
      const s = sparks[sparkIdx];
      const gx = canvasW * 0.12;
      const gy = canvasH * 0.38;
      initSpark(s, gx + (Math.random() - 0.5) * 20, gy + (Math.random() - 0.5) * 20);
      sparkIdx = (sparkIdx + 1) % MAX_SPARKS;
    }

    // -- Update & draw flames --
    for (let i = 0; i < MAX_FLAMES; i++) {
      const f = flames[i];
      if (!f.active) continue;

      f.life += dt;
      if (f.life >= f.maxLife) {
        f.active = false;
        continue;
      }

      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vx += (Math.random() - 0.5) * 0.15 * dt;

      const progress = f.life / f.maxLife;
      const alpha = progress < 0.15
        ? progress / 0.15
        : 1 - ((progress - 0.15) / 0.85);

      if (alpha < 0.05) continue;

      const size = f.size * (1 - progress * 0.5);

      // Color shifts from yellow -> orange -> red as flame ages
      let tint: number;
      if (progress < 0.3) {
        tint = 0xffdd44; // yellow-white
      } else if (progress < 0.6) {
        tint = 0xff6611; // orange
      } else {
        tint = 0xcc2200; // deep red
      }

      api.brush.image(glowDataUrl, f.x, f.y, {
        width: size * 2, height: size * 2,
        anchorX: 0.5, anchorY: 0.5,
        tint: tint,
        alpha: alpha * 0.8,
        blendMode: 'add',
      });
    }

    // -- Update & draw sparks --
    for (let i = 0; i < MAX_SPARKS; i++) {
      const s = sparks[i];
      if (!s.active) continue;

      s.life += dt;
      if (s.life >= s.maxLife) {
        s.active = false;
        continue;
      }

      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 0.08 * dt; // gravity

      const progress = s.life / s.maxLife;
      const alpha = 1 - progress;
      if (alpha < 0.05) continue;

      api.brush.circle(s.x, s.y, 1.5, {
        fill: 0xffaa33,
        alpha: alpha * 0.9,
        blendMode: 'add',
      });
    }

    // -- Draw instruments --

    // Left guitar (flying V, tilted)
    drawGuitar(api, canvasW * 0.12, canvasH * 0.38, -0.25, 1.1, isDark);

    // Right guitar (mirrored tilt)
    drawGuitar(api, canvasW * 0.88, canvasH * 0.38, 0.25, 1.1, isDark);

    // Drum kit at bottom center
    drawDrumKit(api, canvasW * 0.5, canvasH * 0.82, 1.0, t, isDark);

    // -- Draw skulls with bob animation --
    for (let si = 0; si < skulls.length; si++) {
      const sk = skulls[si];
      const bobY = Math.sin(t * sk.bobSpeed + sk.bobPhase) * 8;

      // Fire glow behind skull
      api.brush.image(glowDataUrl, sk.x, sk.y + bobY - 10, {
        width: 80 * sk.scale, height: 80 * sk.scale,
        anchorX: 0.5, anchorY: 0.5,
        tint: 0xff4400,
        alpha: 0.4 + Math.sin(t * 3 + sk.bobPhase) * 0.15,
        blendMode: 'add',
      });

      drawSkull(api, sk.x, sk.y + bobY, sk.scale, isDark);
    }

    // -- Lightning bolt flash (occasional) --
    const flashCycle = Math.sin(t * 0.7) * Math.sin(t * 1.3);
    if (flashCycle > 0.85) {
      const lx = canvasW * (0.3 + Math.sin(t * 2.1) * 0.2);
      const boltAlpha = (flashCycle - 0.85) / 0.15;
      api.brush.line(lx, 0, lx + 15, canvasH * 0.2, {
        color: 0xffffff, width: 3, alpha: boltAlpha * 0.7, blendMode: 'add',
      });
      api.brush.line(lx + 15, canvasH * 0.2, lx - 10, canvasH * 0.35, {
        color: 0xffffff, width: 3, alpha: boltAlpha * 0.7, blendMode: 'add',
      });
      api.brush.line(lx - 10, canvasH * 0.35, lx + 8, canvasH * 0.5, {
        color: 0xeeddff, width: 2.5, alpha: boltAlpha * 0.5, blendMode: 'add',
      });
    }

    // -- "METAL" text at top --
    const textPulse = 0.8 + Math.sin(t * 4) * 0.2;
    api.brush.text('METAL', canvasW * 0.5, canvasH * 0.08, {
      fontSize: 28,
      fill: 0xff3300,
      align: 'center',
      alpha: textPulse,
    });
    // Glow behind text
    api.brush.image(glowDataUrl, canvasW * 0.5, canvasH * 0.08, {
      width: 120, height: 40,
      anchorX: 0.5, anchorY: 0.5,
      tint: 0xff2200,
      alpha: textPulse * 0.3,
      blendMode: 'add',
    });
  },

  async teardown(): Promise<void> {
    flames = [];
    skulls = [];
    sparks = [];
    canvasW = 0;
    canvasH = 0;
    flameIdx = 0;
    sparkIdx = 0;
    glowDataUrl = '';
  },
};

registerActor(actor);
export default actor;
