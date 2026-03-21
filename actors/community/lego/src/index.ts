/**
 * Actor Template
 *
 * This is a template for creating new actors for the Art Installation.
 * Replace the implementation with your own creative vision!
 *
 * Getting Started:
 * 1. Update the metadata below with your info
 * 2. Implement the update() method to draw on the canvas
 * 3. Optionally implement setup() for initialization
 * 4. Run `pnpm dev` to preview your actor
 * 5. Run `pnpm validate` before submitting
 *
 * @see https://github.com/cloudfest/art-installation/docs/actor-development.md
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
  id: 'lego',
  name: 'Lego',
  description: 'A colorful LEGO wall builds up brick by brick, then explodes apart — on repeat',
  author: {
    name: 'Jan W',
    github: 'janw-ll',
  },
  version: '1.0.0',
  tags: ['lego', 'bricks', 'building', 'destruction', 'loop'],
  createdAt: new Date(),
  preferredDuration: 30,
  requiredContexts: ['display'],
};

const COLS = 9;
const ROWS = 12;
const MAX_BRICKS = COLS * ROWS;
const BRICK_W = 34;
const BRICK_H = 16;
const STUD_R = 4;

// Cycle phases in seconds
const BUILD_DUR = 3.5;
const HOLD_DUR = 1.0;
const EXPLODE_DUR = 3.0;
const PAUSE_DUR = 0.5;
const CYCLE_TOTAL = BUILD_DUR + HOLD_DUR + EXPLODE_DUR + PAUSE_DUR;

const LEGO_COLORS = [
  0xd01012, // red
  0x0057a8, // blue
  0xf5cd2f, // yellow
  0x00852b, // green
  0xff6d00, // orange
  0x69003f, // dark purple
  0x00bcd4, // teal
  0xf06292, // pink
];

interface Brick {
  // Grid position
  col: number;
  row: number;
  // Wall position (target)
  wx: number;
  wy: number;
  // Current render position
  x: number;
  y: number;
  // Explosion state
  vx: number;
  vy: number;
  rot: number;
  rotSpeed: number;
  color: number;
  buildDelay: number; // 0-1: when in build phase this brick appears
  alpha: number;
  scale: number;
}

let bricks: Brick[] = [];
let canvasW = 0;
let canvasH = 0;

function drawBrick(
  api: ActorUpdateAPI,
  x: number, y: number,
  w: number, h: number,
  color: number, alpha: number,
  isDark: boolean,
): void {
  // Body
  api.brush.rect(x - w / 2, y - h / 2, w, h, {
    fill: color, alpha, stroke: isDark ? 0x222222 : 0x111111,
    strokeWidth: 1.5,
  });
  // Two studs on top
  const studY = y - h / 2 - STUD_R * 0.4;
  const studX1 = x - w * 0.25;
  const studX2 = x + w * 0.25;
  api.brush.circle(studX1, studY, STUD_R, {
    fill: color, alpha, stroke: isDark ? 0x333333 : 0x222222, strokeWidth: 1,
  });
  api.brush.circle(studX2, studY, STUD_R, {
    fill: color, alpha, stroke: isDark ? 0x333333 : 0x222222, strokeWidth: 1,
  });
  // Stud highlight
  api.brush.circle(studX1 - 1, studY - 1, STUD_R * 0.4, {
    fill: 0xffffff, alpha: alpha * 0.25,
  });
  api.brush.circle(studX2 - 1, studY - 1, STUD_R * 0.4, {
    fill: 0xffffff, alpha: alpha * 0.25,
  });
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();
    canvasW = width;
    canvasH = height;

    const wallW = COLS * BRICK_W;
    const wallH = ROWS * (BRICK_H + 1);
    const startX = (canvasW - wallW) / 2 + BRICK_W / 2;
    const startY = canvasH * 0.85 - BRICK_H / 2;

    bricks = [];
    for (let row = 0; row < ROWS; row++) {
      const offset = (row % 2) * (BRICK_W * 0.5);
      for (let col = 0; col < COLS; col++) {
        const wx = startX + col * BRICK_W + offset;
        const wy = startY - row * (BRICK_H + 1);
        // Build delay: bottom rows first, with slight randomness
        const buildDelay = (row / ROWS) * 0.85 + Math.random() * 0.1;
        bricks.push({
          col, row,
          wx, wy,
          x: wx, y: wy,
          vx: 0, vy: 0,
          rot: 0, rotSpeed: 0,
          color: LEGO_COLORS[Math.floor(Math.random() * LEGO_COLORS.length)],
          buildDelay,
          alpha: 0,
          scale: 1,
        });
      }
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time / 1000;
    const dt = frame.deltaTime * 0.06;
    const isDark = api.context.display.isDarkMode();
    const cycleT = t % CYCLE_TOTAL;

    for (let i = 0; i < bricks.length; i++) {
      const b = bricks[i];

      if (cycleT < BUILD_DUR) {
        // --- BUILD PHASE ---
        const buildProg = cycleT / BUILD_DUR;
        if (buildProg >= b.buildDelay) {
          const localProg = Math.min(1, (buildProg - b.buildDelay) / 0.15);
          // Ease out cubic
          const ease = 1 - Math.pow(1 - localProg, 3);
          b.x = b.wx;
          b.y = b.wy - (1 - ease) * 40;
          b.alpha = ease;
          b.scale = 0.5 + ease * 0.5;
          b.rot = 0;
        } else {
          b.alpha = 0;
        }
        // Reset explosion state
        b.vx = 0;
        b.vy = 0;
        b.rotSpeed = 0;

      } else if (cycleT < BUILD_DUR + HOLD_DUR) {
        // --- HOLD PHASE ---
        b.x = b.wx;
        b.y = b.wy;
        b.alpha = 1;
        b.scale = 1;
        b.rot = 0;

      } else if (cycleT < BUILD_DUR + HOLD_DUR + EXPLODE_DUR) {
        // --- EXPLODE PHASE ---
        const explodeT = cycleT - BUILD_DUR - HOLD_DUR;

        // Init explosion on first frame
        if (explodeT < 0.1 && b.vx === 0 && b.vy === 0) {
          // Explode outward from center
          const dx = b.wx - canvasW / 2;
          const dy = b.wy - canvasH * 0.5;
          const dist = Math.sqrt(dx * dx + dy * dy) + 1;
          b.vx = (dx / dist) * (2 + Math.random() * 4);
          b.vy = (dy / dist) * (1.5 + Math.random() * 3) - 3;
          b.rotSpeed = (Math.random() - 0.5) * 0.15;
        }

        // Physics
        b.x += b.vx * dt;
        b.vy += 0.12 * dt; // gravity
        b.y += b.vy * dt;
        b.rot += b.rotSpeed * dt;

        // Fade out
        const fadeStart = EXPLODE_DUR * 0.4;
        if (explodeT > fadeStart) {
          b.alpha = Math.max(0, 1 - (explodeT - fadeStart) / (EXPLODE_DUR - fadeStart));
        }

      } else {
        // --- PAUSE PHASE ---
        b.alpha = 0;
      }

      // Skip invisible bricks
      if (b.alpha < 0.05) continue;

      api.brush.pushMatrix();
      api.brush.translate(b.x, b.y);
      if (b.rot !== 0) api.brush.rotate(b.rot);
      if (b.scale !== 1) api.brush.scale(b.scale);

      drawBrick(api, 0, 0, BRICK_W - 2, BRICK_H, b.color, b.alpha, isDark);

      api.brush.popMatrix();
    }
  },

  async teardown(): Promise<void> {
    bricks = [];
    canvasW = 0;
    canvasH = 0;
  },
};

registerActor(actor);
export default actor;
