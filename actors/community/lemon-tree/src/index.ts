/**
 * Lemon Tree — Foreground Actor
 *
 * An animated lemon tree that grows branches with bezier curves,
 * sprouts leaves, and drops lemons that bounce.
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
  id: 'lemon-tree',
  name: 'Lemon Tree',
  description: 'Animated lemon tree that grows branches, sprouts leaves, and drops bouncing lemons',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'nature', 'italy', 'tuscany', 'tree'],
  createdAt: new Date('2026-03-20'),
  preferredDuration: 60,
  requiredContexts: ['display'],
};

// --- Constants ---
const MAX_BRANCHES = 20;
const MAX_LEAVES = 40;
const MAX_LEMONS = 8;
const GROW_DURATION = 15000;
const TRUNK_COLOR = 0x5c3a1e;
const TRUNK_COLOR_LIGHT = 0x7a5230;

// --- Types ---
interface Branch {
  active: boolean;
  startX: number;
  startY: number;
  cp1x: number;
  cp1y: number;
  cp2x: number;
  cp2y: number;
  endX: number;
  endY: number;
  thickness: number;
  growStart: number;
  depth: number;
}

interface Leaf {
  active: boolean;
  x: number;
  y: number;
  size: number;
  angle: number;
  phaseOffset: number;
  growStart: number;
}

interface Lemon {
  active: boolean;
  x: number;
  y: number;
  size: number;
  growStart: number;
  attached: boolean;
  vy: number;
  vx: number;
  bounces: number;
  rotation: number;
  rotSpeed: number;
  dropTime: number;
}

// --- Pre-allocated state ---
let canvasW = 0;
let canvasH = 0;
let branches: Branch[] = [];
let leaves: Leaf[] = [];
let lemons: Lemon[] = [];
let trunkBaseX = 0;
let trunkBaseY = 0;
let glowDataUrl = '';

function initBranch(b: Branch, startX: number, startY: number, angle: number, length: number, thickness: number, growStart: number, depth: number): void {
  b.active = true;
  b.startX = startX;
  b.startY = startY;
  b.thickness = thickness;
  b.growStart = growStart;
  b.depth = depth;

  const spread = (Math.random() - 0.5) * 0.6;
  const midAngle = angle + spread;
  const cpLen = length * 0.4;

  b.cp1x = startX + Math.cos(midAngle) * cpLen;
  b.cp1y = startY + Math.sin(midAngle) * cpLen;
  b.cp2x = startX + Math.cos(angle) * length * 0.7 + (Math.random() - 0.5) * length * 0.3;
  b.cp2y = startY + Math.sin(angle) * length * 0.7 + (Math.random() - 0.5) * length * 0.15;
  b.endX = startX + Math.cos(angle) * length;
  b.endY = startY + Math.sin(angle) * length;
}

function buildTree(): void {
  let branchIdx = 0;
  let leafIdx = 0;
  let lemonIdx = 0;

  // Trunk
  const trunkLen = canvasH * 0.25;
  if (branchIdx < MAX_BRANCHES) {
    initBranch(branches[branchIdx], trunkBaseX, trunkBaseY, -Math.PI / 2, trunkLen, 8, 0, 0);
    branchIdx++;
  }

  const trunkTopX = trunkBaseX + (Math.random() - 0.5) * 10;
  const trunkTopY = trunkBaseY - trunkLen;

  // Main branches
  const mainCount = 3 + Math.floor(Math.random() * 2);
  for (let i = 0; i < mainCount && branchIdx < MAX_BRANCHES; i++) {
    const angle = -Math.PI / 2 + (i - (mainCount - 1) / 2) * 0.7 + (Math.random() - 0.5) * 0.2;
    const len = canvasH * (0.12 + Math.random() * 0.08);
    initBranch(branches[branchIdx], trunkTopX, trunkTopY, angle, len, 4, 2000 + i * 800, 1);
    const endX = branches[branchIdx].endX;
    const endY = branches[branchIdx].endY;
    branchIdx++;

    // Sub-branches
    const subCount = 2 + Math.floor(Math.random() * 2);
    for (let j = 0; j < subCount && branchIdx < MAX_BRANCHES; j++) {
      const subAngle = angle + (Math.random() - 0.5) * 1.2;
      const subLen = canvasH * (0.05 + Math.random() * 0.06);
      const bt = 0.4 + Math.random() * 0.5;
      const sx = trunkTopX + (endX - trunkTopX) * bt + (Math.random() - 0.5) * 10;
      const sy = trunkTopY + (endY - trunkTopY) * bt + (Math.random() - 0.5) * 10;
      initBranch(branches[branchIdx], sx, sy, subAngle, subLen, 2, 5000 + i * 800 + j * 600, 2);

      const bEndX = branches[branchIdx].endX;
      const bEndY = branches[branchIdx].endY;
      branchIdx++;

      // Leaves along sub-branches
      for (let k = 0; k < 3 && leafIdx < MAX_LEAVES; k++) {
        const lt = 0.5 + Math.random() * 0.5;
        leaves[leafIdx].active = true;
        leaves[leafIdx].x = sx + (bEndX - sx) * lt + (Math.random() - 0.5) * 8;
        leaves[leafIdx].y = sy + (bEndY - sy) * lt + (Math.random() - 0.5) * 8;
        leaves[leafIdx].size = 4 + Math.random() * 5;
        leaves[leafIdx].angle = subAngle + (Math.random() - 0.5) * 1.5;
        leaves[leafIdx].phaseOffset = Math.random() * Math.PI * 2;
        leaves[leafIdx].growStart = 8000 + i * 600 + j * 400 + k * 200;
        leafIdx++;
      }

      // Maybe a lemon at the tip
      if (Math.random() < 0.5 && lemonIdx < MAX_LEMONS) {
        lemons[lemonIdx].active = true;
        lemons[lemonIdx].x = bEndX + (Math.random() - 0.5) * 10;
        lemons[lemonIdx].y = bEndY + Math.random() * 5;
        lemons[lemonIdx].size = 5 + Math.random() * 4;
        lemons[lemonIdx].growStart = 10000 + lemonIdx * 1500;
        lemons[lemonIdx].attached = true;
        lemons[lemonIdx].vy = 0;
        lemons[lemonIdx].vx = 0;
        lemons[lemonIdx].bounces = 0;
        lemons[lemonIdx].rotation = 0;
        lemons[lemonIdx].rotSpeed = (Math.random() - 0.5) * 0.1;
        lemons[lemonIdx].dropTime = 25000 + lemonIdx * 4000 + Math.random() * 3000;
        lemonIdx++;
      }
    }

    // Leaves at main branch tips
    for (let k = 0; k < 2 && leafIdx < MAX_LEAVES; k++) {
      leaves[leafIdx].active = true;
      leaves[leafIdx].x = endX + (Math.random() - 0.5) * 12;
      leaves[leafIdx].y = endY + (Math.random() - 0.5) * 12;
      leaves[leafIdx].size = 5 + Math.random() * 5;
      leaves[leafIdx].angle = angle + (Math.random() - 0.5) * 1.0;
      leaves[leafIdx].phaseOffset = Math.random() * Math.PI * 2;
      leaves[leafIdx].growStart = 7000 + i * 500 + k * 300;
      leafIdx++;
    }
  }
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    trunkBaseX = canvasW * (0.35 + Math.random() * 0.3);
    trunkBaseY = canvasH * 0.85;

    // Pre-allocate pools
    branches = [];
    for (let i = 0; i < MAX_BRANCHES; i++) {
      branches.push({ active: false, startX: 0, startY: 0, cp1x: 0, cp1y: 0, cp2x: 0, cp2y: 0, endX: 0, endY: 0, thickness: 0, growStart: 0, depth: 0 });
    }
    leaves = [];
    for (let i = 0; i < MAX_LEAVES; i++) {
      leaves.push({ active: false, x: 0, y: 0, size: 0, angle: 0, phaseOffset: 0, growStart: 0 });
    }
    lemons = [];
    for (let i = 0; i < MAX_LEMONS; i++) {
      lemons.push({ active: false, x: 0, y: 0, size: 0, growStart: 0, attached: true, vy: 0, vx: 0, bounces: 0, rotation: 0, rotSpeed: 0, dropTime: 0 });
    }

    // Pre-render glow texture
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.3)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    glowDataUrl = c.toDataURL();

    buildTree();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time;
    const tSec = t / 1000;
    const isDark = api.context.display.isDarkMode();
    const trunkColor = isDark ? TRUNK_COLOR : TRUNK_COLOR_LIGHT;

    // Draw branches
    for (let i = 0; i < MAX_BRANCHES; i++) {
      const b = branches[i];
      if (!b.active) continue;

      const branchProgress = Math.max(0, Math.min(1, (t - b.growStart) / 2000));
      if (branchProgress <= 0) continue;

      const eased = 1 - Math.pow(1 - branchProgress, 3);

      const ex = b.startX + (b.endX - b.startX) * eased;
      const ey = b.startY + (b.endY - b.startY) * eased;
      const c1x = b.startX + (b.cp1x - b.startX) * eased;
      const c1y = b.startY + (b.cp1y - b.startY) * eased;
      const c2x = b.startX + (b.cp2x - b.startX) * eased;
      const c2y = b.startY + (b.cp2y - b.startY) * eased;

      api.brush.bezier(
        { x: b.startX, y: b.startY },
        { x: c1x, y: c1y },
        { x: c2x, y: c2y },
        { x: ex, y: ey },
        { color: trunkColor, width: b.thickness * (0.5 + branchProgress * 0.5), alpha: 0.9 }
      );
    }

    // Draw leaves
    const leafGreen = isDark ? 0x2d7a2d : 0x3a9a3a;
    const leafDarkGreen = isDark ? 0x1e5a1e : 0x2a7a2a;

    for (let i = 0; i < MAX_LEAVES; i++) {
      const l = leaves[i];
      if (!l.active) continue;

      const leafProgress = Math.max(0, Math.min(1, (t - l.growStart) / 1500));
      if (leafProgress <= 0) continue;

      const sway = Math.sin(tSec * 1.5 + l.phaseOffset) * 0.15;
      const leafAngle = l.angle + sway;
      const sz = l.size * leafProgress;

      api.brush.pushMatrix();
      api.brush.translate(l.x, l.y);
      api.brush.rotate(leafAngle);
      api.brush.ellipse(0, 0, sz * 2, sz, {
        fill: i % 2 === 0 ? leafGreen : leafDarkGreen,
        alpha: 0.8 * leafProgress,
      });
      api.brush.popMatrix();
    }

    // Draw and update lemons
    const lemonYellow = 0xffd700;
    const lemonDark = 0xe6c200;
    const groundY = canvasH * 0.85;

    for (let i = 0; i < MAX_LEMONS; i++) {
      const lm = lemons[i];
      if (!lm.active) continue;

      const lemonProgress = Math.max(0, Math.min(1, (t - lm.growStart) / 2000));
      if (lemonProgress <= 0) continue;

      if (lm.attached) {
        const sz = lm.size * lemonProgress;
        const sway = Math.sin(tSec * 1.2 + i * 1.7) * 2;

        // Glow behind lemon
        api.brush.image(glowDataUrl, lm.x + sway, lm.y, {
          width: sz * 4,
          height: sz * 4,
          tint: lemonYellow,
          alpha: 0.15,
          blendMode: 'add',
        });

        api.brush.ellipse(lm.x + sway, lm.y, sz * 1.3, sz, {
          fill: isDark ? lemonYellow : lemonDark,
          alpha: 0.9,
        });

        // Drop after scheduled time
        if (t > lm.dropTime) {
          lm.attached = false;
          lm.vy = 0.5;
          lm.vx = (Math.random() - 0.5) * 0.5;
          lm.rotSpeed = (Math.random() - 0.5) * 0.15;
        }
      } else {
        // Falling physics
        lm.vy += 0.15 * frame.deltaTime * 0.06;
        lm.x += lm.vx * frame.deltaTime * 0.06;
        lm.y += lm.vy * frame.deltaTime * 0.06;
        lm.rotation += lm.rotSpeed * frame.deltaTime * 0.06;

        // Bounce off ground
        if (lm.y > groundY && lm.vy > 0) {
          lm.y = groundY;
          lm.vy *= -0.4;
          lm.vx *= 0.7;
          lm.rotSpeed *= 0.6;
          lm.bounces++;
        }

        if (lm.bounces >= 3) {
          lm.vy = 0;
          lm.vx = 0;
          lm.rotSpeed = 0;
          lm.y = groundY;
        }

        const sz = lm.size;
        const alpha = lm.bounces >= 3 ? Math.max(0.3, 1 - (t - lm.dropTime - 10000) / 5000) : 0.9;
        if (alpha < 0.05) continue;

        api.brush.pushMatrix();
        api.brush.translate(lm.x, lm.y);
        api.brush.rotate(lm.rotation);
        api.brush.ellipse(0, 0, sz * 1.3, sz, {
          fill: isDark ? lemonYellow : lemonDark,
          alpha,
        });
        api.brush.popMatrix();
      }
    }
  },

  async teardown(): Promise<void> {
    branches = [];
    leaves = [];
    lemons = [];
    canvasW = 0;
    canvasH = 0;
    glowDataUrl = '';
  },
};

registerActor(actor);
export default actor;
