/**
 * Pasta Shapes — Foreground Actor
 *
 * Falling pasta (farfalle, fusilli, penne) that tumble with physics
 * and pile up at the bottom of the canvas.
 */

import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'pasta-shapes',
  name: 'Pasta Shapes',
  description: 'Falling farfalle, fusilli, and penne tumbling and piling up',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'italy', 'food', 'pasta', 'physics'],
  createdAt: new Date('2026-03-20'),
  preferredDuration: 60,
  requiredContexts: ['display'],
};

const MAX_PASTA = 25;
const PASTA_YELLOW = 0xe8d44d;
const PASTA_DARK = 0xd4b83a;
const PASTA_SHADOW = 0xc4a830;

type PastaType = 'farfalle' | 'penne' | 'fusilli';

interface Pasta {
  active: boolean;
  type: PastaType;
  x: number;
  y: number;
  vy: number;
  vx: number;
  rotation: number;
  rotSpeed: number;
  size: number;
  landed: boolean;
}

let canvasW = 0;
let canvasH = 0;
let pastas: Pasta[] = [];
let nextSpawn = 0;
let groundY = 0;
let pileHeight = 0;

function drawFarfalle(api: ActorUpdateAPI, size: number, isDark: boolean): void {
  const color = isDark ? PASTA_YELLOW : PASTA_DARK;
  // Left wing
  api.brush.polygon([
    { x: -size, y: -size * 0.6 },
    { x: -size * 0.2, y: -size * 0.15 },
    { x: -size * 0.2, y: size * 0.15 },
    { x: -size, y: size * 0.6 },
  ], { fill: color, alpha: 0.9 });
  // Right wing
  api.brush.polygon([
    { x: size, y: -size * 0.6 },
    { x: size * 0.2, y: -size * 0.15 },
    { x: size * 0.2, y: size * 0.15 },
    { x: size, y: size * 0.6 },
  ], { fill: color, alpha: 0.9 });
  // Center pinch
  api.brush.ellipse(0, 0, size * 0.25, size * 0.2, {
    fill: PASTA_SHADOW,
    alpha: 0.8,
  });
}

function drawPenne(api: ActorUpdateAPI, size: number, isDark: boolean): void {
  const color = isDark ? PASTA_YELLOW : PASTA_DARK;
  // Tube body
  api.brush.rect(-size * 0.3, -size, size * 0.6, size * 2, {
    fill: color,
    alpha: 0.9,
  });
  // Cut angle at top
  api.brush.polygon([
    { x: -size * 0.3, y: -size },
    { x: size * 0.3, y: -size * 0.6 },
    { x: size * 0.3, y: -size },
  ], { fill: PASTA_SHADOW, alpha: 0.5 });
  // Ridge lines
  for (let r = 0; r < 4; r++) {
    const ry = -size * 0.6 + r * size * 0.4;
    api.brush.line(-size * 0.3, ry, size * 0.3, ry, {
      color: PASTA_SHADOW,
      width: 1,
      alpha: 0.3,
    });
  }
}

function drawFusilli(api: ActorUpdateAPI, size: number, tSec: number, idx: number, isDark: boolean): void {
  const color = isDark ? PASTA_YELLOW : PASTA_DARK;
  // Spiral shape — draw as connected curves
  for (let s = 0; s < 6; s++) {
    const t = s / 6;
    const y = -size + t * size * 2;
    const xOff = Math.sin(t * Math.PI * 3 + idx) * size * 0.4;
    const w = size * 0.3 * (0.6 + Math.cos(t * Math.PI * 3 + idx) * 0.4);
    api.brush.ellipse(xOff, y, w, size * 0.15, {
      fill: s % 2 === 0 ? color : PASTA_SHADOW,
      alpha: 0.85,
    });
  }
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    groundY = canvasH * 0.88;
    pileHeight = 0;
    nextSpawn = 500;

    pastas = [];
    for (let i = 0; i < MAX_PASTA; i++) {
      pastas.push({
        active: false, type: 'farfalle',
        x: 0, y: 0, vy: 0, vx: 0,
        rotation: 0, rotSpeed: 0, size: 0, landed: false,
      });
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time;
    const tSec = t / 1000;
    const dt = Math.min(frame.deltaTime, 32) / 16;
    const isDark = api.context.display.isDarkMode();
    const types: PastaType[] = ['farfalle', 'penne', 'fusilli'];

    // Spawn pasta
    if (t > nextSpawn) {
      for (let i = 0; i < MAX_PASTA; i++) {
        if (!pastas[i].active) {
          const p = pastas[i];
          p.active = true;
          p.type = types[Math.floor(Math.random() * types.length)];
          p.x = 20 + Math.random() * (canvasW - 40);
          p.y = -20;
          p.vy = 0.3 + Math.random() * 0.5;
          p.vx = (Math.random() - 0.5) * 0.5;
          p.rotation = Math.random() * Math.PI * 2;
          p.rotSpeed = (Math.random() - 0.5) * 0.06;
          p.size = 6 + Math.random() * 5;
          p.landed = false;
          break;
        }
      }
      nextSpawn = t + 600 + Math.random() * 1000;
    }

    // Update and draw
    const currentGround = groundY - pileHeight;

    for (let i = 0; i < MAX_PASTA; i++) {
      const p = pastas[i];
      if (!p.active) continue;

      if (!p.landed) {
        p.vy += 0.04 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rotation += p.rotSpeed * dt;

        // Sway
        p.vx += Math.sin(tSec * 2 + i) * 0.005 * dt;
        p.vx *= 0.998;

        // Land
        if (p.y >= currentGround) {
          p.y = currentGround;
          p.landed = true;
          p.vy = 0;
          p.vx = 0;
          p.rotSpeed = 0;
          pileHeight += 1.5;
        }
      }

      // Fade landed pasta over time
      const landedAlpha = p.landed ? Math.max(0.3, 1 - pileHeight / 80) : 1;
      if (landedAlpha < 0.05) continue;

      api.brush.pushMatrix();
      api.brush.translate(p.x, p.y);
      api.brush.rotate(p.rotation);

      if (p.type === 'farfalle') {
        drawFarfalle(api, p.size, isDark);
      } else if (p.type === 'penne') {
        drawPenne(api, p.size, isDark);
      } else {
        drawFusilli(api, p.size, tSec, i, isDark);
      }

      api.brush.popMatrix();
    }
  },

  async teardown(): Promise<void> {
    pastas = [];
    canvasW = 0;
    canvasH = 0;
    pileHeight = 0;
  },
};

registerActor(actor);
export default actor;
