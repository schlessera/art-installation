import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'pink-elephant',
  name: 'Pink Elephant',
  description: 'A cheerful pink elephant dancing across the canvas with sparkles',
  author: { name: 'Jan', github: 'janw-ll' },
  version: '1.0.0',
  tags: ['elephant', 'pink', 'dance', 'fun', 'animal'],
  createdAt: new Date(),
  preferredDuration: 30,
  requiredContexts: ['display', 'audio'],
};

// Pre-allocated state
const MAX_SPARKLES = 20;

interface Sparkle {
  active: boolean;
  x: number;
  y: number;
  size: number;
  alpha: number;
  decay: number;
  rotation: number;
  rotSpeed: number;
}

let sparkles: Sparkle[] = [];
let canvasW = 0;
let canvasH = 0;
let glowDataUrl = '';

// Elephant position & dance state
let baseX = 0;
let baseY = 0;
let dancePhase = 0;
let sparkleTimer = 0;
let sparkleIndex = 0;

const PINK_BODY = 0xff69b4;
const PINK_LIGHT = 0xffb6c1;
const PINK_DARK = 0xdb3f7f;
const PINK_EAR = 0xff85c8;
const WHITE = 0xffffff;
const DARK_EYE = 0x222222;

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    baseX = canvasW * 0.5;
    baseY = canvasH * 0.55;
    dancePhase = 0;
    sparkleTimer = 0;
    sparkleIndex = 0;

    // Pre-allocate sparkle pool
    sparkles = [];
    for (let i = 0; i < MAX_SPARKLES; i++) {
      sparkles.push({
        active: false, x: 0, y: 0, size: 0,
        alpha: 0, decay: 0, rotation: 0, rotSpeed: 0,
      });
    }

    // Pre-render a soft glow texture for sparkles
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    glowDataUrl = c.toDataURL();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time / 1000;
    const dt = frame.deltaTime;
    dancePhase = t;

    const isDark = api.context.display.isDarkMode();

    // Dance motion
    const bounce = Math.sin(t * 4) * 12;
    const sway = Math.sin(t * 2) * 8;
    const tilt = Math.sin(t * 2) * 0.08;

    const ex = baseX + sway;
    const ey = baseY + bounce;

    // Audio reactivity: bigger bounce on beat
    let beatScale = 1.0;
    if (api.context.audio.isAvailable() && api.context.audio.isBeat()) {
      beatScale = 1.15;
    }

    const s = (canvasW / 360) * beatScale; // scale factor

    api.brush.pushMatrix();
    api.brush.translate(ex, ey);
    api.brush.rotate(tilt);

    // === SHADOW ===
    const shadowStretch = 1 + Math.sin(t * 4) * 0.15;
    api.brush.ellipse(0, 55 * s, 50 * s * shadowStretch, 10 * s, {
      fill: 0x000000, alpha: isDark ? 0.25 : 0.15,
    });

    // === TAIL ===
    const tailWag = Math.sin(t * 6) * 0.3;
    const tailStartX = -32 * s;
    const tailStartY = -5 * s;
    api.brush.bezier(
      { x: tailStartX, y: tailStartY },
      { x: tailStartX - 20 * s, y: tailStartY - 25 * s + Math.sin(t * 6) * 8 * s },
      { x: tailStartX - 30 * s + tailWag * 15 * s, y: tailStartY - 35 * s },
      { x: tailStartX - 22 * s + tailWag * 20 * s, y: tailStartY - 45 * s },
      { color: PINK_DARK, width: 3.5 * s, cap: 'round' },
    );

    // === BACK LEGS ===
    const legLiftL = Math.max(0, Math.sin(t * 4)) * 8 * s;
    const legLiftR = Math.max(0, Math.sin(t * 4 + Math.PI)) * 8 * s;

    // Back-left leg
    api.brush.roundRect(-20 * s, 25 * s - legLiftL, 14 * s, 32 * s, 5 * s, {
      fill: PINK_DARK, alpha: 0.85,
    });
    // Back-right leg
    api.brush.roundRect(10 * s, 25 * s - legLiftR, 14 * s, 32 * s, 5 * s, {
      fill: PINK_DARK, alpha: 0.85,
    });

    // === BODY ===
    api.brush.ellipse(0, 0, 45 * s, 35 * s, {
      fill: PINK_BODY, alpha: 0.95,
    });

    // Body highlight
    api.brush.ellipse(-5 * s, -8 * s, 25 * s, 18 * s, {
      fill: PINK_LIGHT, alpha: 0.3,
    });

    // === FRONT LEGS ===
    // Front-left leg
    api.brush.roundRect(-22 * s, 22 * s - legLiftR, 15 * s, 34 * s, 6 * s, {
      fill: PINK_BODY, alpha: 0.95,
    });
    // Front-left toenails
    api.brush.ellipse(-14.5 * s, 54 * s - legLiftR, 9 * s, 5 * s, {
      fill: PINK_LIGHT, alpha: 0.8,
    });

    // Front-right leg
    api.brush.roundRect(8 * s, 22 * s - legLiftL, 15 * s, 34 * s, 6 * s, {
      fill: PINK_BODY, alpha: 0.95,
    });
    // Front-right toenails
    api.brush.ellipse(15.5 * s, 54 * s - legLiftL, 9 * s, 5 * s, {
      fill: PINK_LIGHT, alpha: 0.8,
    });

    // === HEAD ===
    const headBob = Math.sin(t * 4 + 0.5) * 4 * s;
    const headX = 28 * s;
    const headY = -22 * s + headBob;

    // Ears (behind head)
    const earFlap = Math.sin(t * 3) * 0.15;

    // Left ear
    api.brush.pushMatrix();
    api.brush.translate(headX - 18 * s, headY - 8 * s);
    api.brush.rotate(-0.4 + earFlap);
    api.brush.ellipse(0, 0, 18 * s, 22 * s, { fill: PINK_EAR, alpha: 0.9 });
    api.brush.ellipse(0, 0, 12 * s, 15 * s, { fill: PINK_LIGHT, alpha: 0.5 });
    api.brush.popMatrix();

    // Right ear
    api.brush.pushMatrix();
    api.brush.translate(headX + 18 * s, headY - 8 * s);
    api.brush.rotate(0.4 - earFlap);
    api.brush.ellipse(0, 0, 18 * s, 22 * s, { fill: PINK_EAR, alpha: 0.9 });
    api.brush.ellipse(0, 0, 12 * s, 15 * s, { fill: PINK_LIGHT, alpha: 0.5 });
    api.brush.popMatrix();

    // Head shape
    api.brush.circle(headX, headY, 22 * s, { fill: PINK_BODY, alpha: 0.95 });

    // Cheek blush
    api.brush.circle(headX + 14 * s, headY + 6 * s, 6 * s, {
      fill: PINK_EAR, alpha: 0.4,
    });

    // === TRUNK ===
    const trunkSway = Math.sin(t * 3) * 10 * s;
    const trunkCurl = Math.sin(t * 2.5) * 5 * s;
    api.brush.bezier(
      { x: headX + 16 * s, y: headY + 4 * s },
      { x: headX + 35 * s + trunkSway * 0.3, y: headY + 10 * s },
      { x: headX + 30 * s + trunkSway, y: headY + 30 * s + trunkCurl },
      { x: headX + 20 * s + trunkSway * 1.2, y: headY + 38 * s + trunkCurl },
      { color: PINK_BODY, width: 8 * s, cap: 'round' },
    );
    // Trunk tip highlight
    api.brush.circle(
      headX + 20 * s + trunkSway * 1.2,
      headY + 38 * s + trunkCurl,
      4 * s,
      { fill: PINK_LIGHT, alpha: 0.7 },
    );

    // === EYES ===
    // Happy squinting eyes while dancing
    const blink = Math.sin(t * 0.8) > 0.95 ? 0.2 : 1.0;

    // Left eye
    api.brush.ellipse(headX - 7 * s, headY - 4 * s, 5 * s, 5 * s * blink, {
      fill: WHITE, alpha: 0.95,
    });
    api.brush.ellipse(headX - 6 * s, headY - 4 * s, 3 * s, 3 * s * blink, {
      fill: DARK_EYE, alpha: 0.95,
    });
    // Eye shine
    if (blink > 0.5) {
      api.brush.circle(headX - 5 * s, headY - 6 * s, 1.5 * s, {
        fill: WHITE, alpha: 0.8,
      });
    }

    // Right eye
    api.brush.ellipse(headX + 7 * s, headY - 4 * s, 5 * s, 5 * s * blink, {
      fill: WHITE, alpha: 0.95,
    });
    api.brush.ellipse(headX + 8 * s, headY - 4 * s, 3 * s, 3 * s * blink, {
      fill: DARK_EYE, alpha: 0.95,
    });
    if (blink > 0.5) {
      api.brush.circle(headX + 9 * s, headY - 6 * s, 1.5 * s, {
        fill: WHITE, alpha: 0.8,
      });
    }

    // === MOUTH (happy smile) ===
    api.brush.arc(headX, headY + 6 * s, 8 * s, 0.2, Math.PI - 0.2, {
      color: PINK_DARK, width: 2.5 * s, cap: 'round',
    });

    api.brush.popMatrix();

    // === SPARKLES ===
    sparkleTimer += dt;
    if (sparkleTimer > 120) {
      sparkleTimer = 0;
      const sp = sparkles[sparkleIndex];
      sp.active = true;
      sp.x = ex + (Math.random() - 0.5) * 100 * s;
      sp.y = ey + (Math.random() - 0.5) * 80 * s - 20 * s;
      sp.size = (8 + Math.random() * 12) * s;
      sp.alpha = 0.9;
      sp.decay = 0.015 + Math.random() * 0.01;
      sp.rotation = Math.random() * Math.PI * 2;
      sp.rotSpeed = (Math.random() - 0.5) * 0.05;
      sparkleIndex = (sparkleIndex + 1) % MAX_SPARKLES;
    }

    for (let i = 0; i < sparkles.length; i++) {
      const sp = sparkles[i];
      if (!sp.active) continue;

      sp.alpha -= sp.decay;
      sp.rotation += sp.rotSpeed;
      sp.y -= 0.3;

      if (sp.alpha < 0.05) {
        sp.active = false;
        continue;
      }

      // Draw sparkle as a glowing star shape
      api.brush.image(glowDataUrl, sp.x, sp.y, {
        width: sp.size, height: sp.size,
        tint: 0xffaadd,
        alpha: sp.alpha,
        rotation: sp.rotation,
        blendMode: 'add',
      });

      // Star cross
      api.brush.star(sp.x, sp.y, sp.size * 0.35, sp.size * 0.12, 4, {
        fill: WHITE, alpha: sp.alpha * 0.8, blendMode: 'add',
      });
    }
  },

  async teardown(): Promise<void> {
    sparkles = [];
    canvasW = 0;
    canvasH = 0;
    glowDataUrl = '';
    dancePhase = 0;
    sparkleTimer = 0;
    sparkleIndex = 0;
  },
};

registerActor(actor);
export default actor;
