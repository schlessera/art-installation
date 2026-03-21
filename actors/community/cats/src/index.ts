import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'cats',
  name: 'Cats',
  description: 'Playful cats running around the canvas',
  author: { name: 'Jan', github: 'janw-ll' },
  version: '1.0.0',
  tags: ['cats', 'animals', 'fun'],
  createdAt: new Date(),
  preferredDuration: 30,
  requiredContexts: ['display'],
};

const MAX_CATS = 6;
const CAT_COLORS = [0xff8844, 0x555555, 0xeeeeee, 0x222222, 0xddaa55, 0xbb7733];

interface Cat {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dir: number;       // 1=right, -1=left
  size: number;
  color: number;
  phase: number;     // animation offset
  legCycle: number;   // leg animation accumulator
  tailPhase: number;
}

let cats: Cat[] = [];
let canvasW = 0;
let canvasH = 0;

function drawCat(api: ActorUpdateAPI, cat: Cat, time: number) {
  const { x, y, size, color, dir, legCycle } = cat;
  const s = size;

  api.brush.pushMatrix();
  api.brush.translate(x, y);
  api.brush.scale(dir, 1);

  // Leg animation based on running cycle
  const legSwing = Math.sin(legCycle) * 0.4;
  const legSwing2 = Math.sin(legCycle + Math.PI) * 0.4;

  // Back legs
  const backLegX = -s * 0.3;
  const frontLegX = s * 0.35;
  const legLen = s * 0.45;
  const legTop = s * 0.15;

  // Back left leg
  api.brush.line(
    backLegX, legTop,
    backLegX + Math.sin(legSwing) * legLen * 0.5, legTop + legLen,
    { color: color, width: Math.max(3, s * 0.15), alpha: 0.9, cap: 'round' }
  );
  // Back right leg
  api.brush.line(
    backLegX + s * 0.1, legTop,
    backLegX + s * 0.1 + Math.sin(legSwing2) * legLen * 0.5, legTop + legLen,
    { color: color, width: Math.max(3, s * 0.15), alpha: 0.9, cap: 'round' }
  );
  // Front left leg
  api.brush.line(
    frontLegX, legTop,
    frontLegX + Math.sin(legSwing2) * legLen * 0.5, legTop + legLen,
    { color: color, width: Math.max(3, s * 0.15), alpha: 0.9, cap: 'round' }
  );
  // Front right leg
  api.brush.line(
    frontLegX + s * 0.1, legTop,
    frontLegX + s * 0.1 + Math.sin(legSwing) * legLen * 0.5, legTop + legLen,
    { color: color, width: Math.max(3, s * 0.15), alpha: 0.9, cap: 'round' }
  );

  // Body (ellipse)
  api.brush.ellipse(0, 0, s * 0.9, s * 0.45, { fill: color, alpha: 0.95 });

  // Head
  const headX = s * 0.55;
  const headY = -s * 0.15;
  const headR = s * 0.3;
  api.brush.circle(headX, headY, headR, { fill: color, alpha: 0.95 });

  // Ears (triangles)
  const earSize = s * 0.18;
  api.brush.polygon([
    { x: headX - headR * 0.5, y: headY - headR * 0.5 },
    { x: headX - headR * 0.8, y: headY - headR - earSize },
    { x: headX - headR * 0.1, y: headY - headR * 0.3 },
  ], { fill: color, alpha: 0.95 });
  api.brush.polygon([
    { x: headX + headR * 0.1, y: headY - headR * 0.3 },
    { x: headX + headR * 0.3, y: headY - headR - earSize },
    { x: headX + headR * 0.7, y: headY - headR * 0.4 },
  ], { fill: color, alpha: 0.95 });

  // Inner ears (pink)
  const innerEar = earSize * 0.55;
  api.brush.polygon([
    { x: headX - headR * 0.5, y: headY - headR * 0.5 },
    { x: headX - headR * 0.7, y: headY - headR - innerEar },
    { x: headX - headR * 0.2, y: headY - headR * 0.4 },
  ], { fill: 0xffaaaa, alpha: 0.8 });
  api.brush.polygon([
    { x: headX + headR * 0.15, y: headY - headR * 0.4 },
    { x: headX + headR * 0.35, y: headY - headR - innerEar },
    { x: headX + headR * 0.6, y: headY - headR * 0.45 },
  ], { fill: 0xffaaaa, alpha: 0.8 });

  // Eyes
  const eyeY = headY - headR * 0.05;
  const eyeSpacing = headR * 0.35;
  api.brush.circle(headX - eyeSpacing, eyeY, s * 0.07, { fill: 0x44dd44, alpha: 0.95 });
  api.brush.circle(headX + eyeSpacing, eyeY, s * 0.07, { fill: 0x44dd44, alpha: 0.95 });
  // Pupils
  api.brush.circle(headX - eyeSpacing + s * 0.01, eyeY, s * 0.035, { fill: 0x111111, alpha: 0.95 });
  api.brush.circle(headX + eyeSpacing + s * 0.01, eyeY, s * 0.035, { fill: 0x111111, alpha: 0.95 });

  // Nose
  api.brush.circle(headX + headR * 0.15, headY + headR * 0.2, s * 0.04, { fill: 0xffaaaa, alpha: 0.9 });

  // Whiskers
  const whiskerY = headY + headR * 0.3;
  const whiskerX = headX + headR * 0.3;
  api.brush.line(whiskerX, whiskerY, whiskerX + s * 0.4, whiskerY - s * 0.08, { color: 0xcccccc, width: 1.5, alpha: 0.7 });
  api.brush.line(whiskerX, whiskerY, whiskerX + s * 0.4, whiskerY + s * 0.05, { color: 0xcccccc, width: 1.5, alpha: 0.7 });
  api.brush.line(whiskerX, whiskerY - s * 0.05, whiskerX + s * 0.38, whiskerY - s * 0.15, { color: 0xcccccc, width: 1.5, alpha: 0.7 });

  // Tail (animated curve)
  const tailWag = Math.sin(time * 3 + cat.tailPhase) * 0.5;
  const tailBaseX = -s * 0.55;
  const tailBaseY = -s * 0.05;
  api.brush.bezier(
    { x: tailBaseX, y: tailBaseY },
    { x: tailBaseX - s * 0.3, y: tailBaseY - s * 0.4 + tailWag * s * 0.2 },
    { x: tailBaseX - s * 0.5, y: tailBaseY - s * 0.7 + tailWag * s * 0.3 },
    { x: tailBaseX - s * 0.3 + tailWag * s * 0.15, y: tailBaseY - s * 0.9 + tailWag * s * 0.1 },
    { color: color, width: Math.max(3, s * 0.12), alpha: 0.9, cap: 'round' }
  );

  api.brush.popMatrix();
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI) {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    cats = [];
    const count = 3 + Math.floor(Math.random() * (MAX_CATS - 3 + 1));
    for (let i = 0; i < count; i++) {
      const s = 18 + Math.random() * 16;
      const speed = 0.5 + Math.random() * 1.0;
      const dirSign = Math.random() < 0.5 ? -1 : 1;
      cats.push({
        active: true,
        x: Math.random() * canvasW,
        y: canvasH * 0.3 + Math.random() * canvasH * 0.55,
        vx: dirSign * speed,
        vy: (Math.random() - 0.5) * 0.3,
        dir: dirSign,
        size: s,
        color: CAT_COLORS[i % CAT_COLORS.length],
        phase: Math.random() * Math.PI * 2,
        legCycle: Math.random() * Math.PI * 2,
        tailPhase: Math.random() * Math.PI * 2,
      });
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext) {
    const t = frame.time / 1000;
    const dt = frame.deltaTime / 16.67; // normalize to ~60fps

    for (let i = 0; i < cats.length; i++) {
      const cat = cats[i];
      if (!cat.active) continue;

      // Move
      cat.x += cat.vx * dt;
      cat.y += cat.vy * dt;

      // Animate legs based on speed
      const speed = Math.abs(cat.vx);
      cat.legCycle += speed * dt * 0.35;

      // Bounce horizontally and flip direction
      const margin = cat.size * 0.8;
      if (cat.x < margin) {
        cat.x = margin;
        cat.vx = Math.abs(cat.vx);
        cat.dir = 1;
      } else if (cat.x > canvasW - margin) {
        cat.x = canvasW - margin;
        cat.vx = -Math.abs(cat.vx);
        cat.dir = -1;
      }

      // Soft vertical bounds
      const topBound = canvasH * 0.25;
      const botBound = canvasH * 0.85;
      if (cat.y < topBound) {
        cat.y = topBound;
        cat.vy = Math.abs(cat.vy);
      } else if (cat.y > botBound) {
        cat.y = botBound;
        cat.vy = -Math.abs(cat.vy);
      }

      // Occasional random direction changes
      if (Math.random() < 0.003) {
        cat.vx = -cat.vx;
        cat.dir = cat.vx > 0 ? 1 : -1;
      }
      if (Math.random() < 0.005) {
        cat.vy = (Math.random() - 0.5) * 0.4;
      }

      drawCat(api, cat, t);
    }
  },

  async teardown() {
    cats = [];
    canvasW = 0;
    canvasH = 0;
  },
};

registerActor(actor);
export default actor;
