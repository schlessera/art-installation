/**
 * Grape Vine — Foreground Actor
 *
 * A vine that crawls horizontally across the canvas, sprouting leaves
 * and growing grape clusters at branch points. Gentle swaying animation
 * with bezier-curved stems.
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
  id: 'grape-vine',
  name: 'Grape Vine',
  description: 'A vine that crawls across the canvas, sprouting leaves and growing grape clusters',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'italy', 'vine', 'grapes', 'nature'],
  createdAt: new Date('2026-03-20'),
  preferredDuration: 60,
  requiredContexts: ['display'],
};

// --- Constants ---
const MAX_SEGMENTS = 24;
const MAX_BRANCHES = 16;
const MAX_LEAVES = 48;
const MAX_GRAPES = 12;
const GRAPES_PER_CLUSTER = 8;
const VINE_GROW_SPEED = 0.00008; // progress per ms

const VINE_COLOR_DARK = 0x3d2b1f;
const VINE_COLOR_LIGHT = 0x5a4030;
const LEAF_GREEN_DARK = 0x2a6e2a;
const LEAF_GREEN_LIGHT = 0x3a8e3a;
const LEAF_ALT_DARK = 0x1e5a1e;
const LEAF_ALT_LIGHT = 0x2e7a2e;
const GRAPE_PURPLE_DARK = 0x6b2fa0;
const GRAPE_PURPLE_LIGHT = 0x5a2090;
const GRAPE_HIGHLIGHT_DARK = 0x8844cc;
const GRAPE_HIGHLIGHT_LIGHT = 0x7733bb;

// --- Types ---
interface VineSegment {
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
  growOrder: number; // 0..1 when in overall progress this segment starts appearing
}

interface VineBranch {
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
  growOrder: number;
  hasCluster: boolean;
}

interface VineLeaf {
  active: boolean;
  x: number;
  y: number;
  size: number;
  angle: number;
  phaseOffset: number;
  growOrder: number;
  variant: number; // 0 or 1 for color alternation
}

interface GrapeCluster {
  active: boolean;
  cx: number;
  cy: number;
  grapeOffsets: Array<{ dx: number; dy: number; r: number }>;
  growOrder: number;
  phaseOffset: number;
}

// --- Pre-allocated state ---
let canvasW = 0;
let canvasH = 0;
let segments: VineSegment[] = [];
let branches: VineBranch[] = [];
let leaves: VineLeaf[] = [];
let clusters: GrapeCluster[] = [];
let growProgress = 0;
let startFromLeft = true;

function buildVine(): void {
  let segIdx = 0;
  let branchIdx = 0;
  let leafIdx = 0;
  let clusterIdx = 0;

  const startX = startFromLeft ? -20 : canvasW + 20;
  const dir = startFromLeft ? 1 : -1;
  const baseY = canvasH * (0.15 + Math.random() * 0.2);
  const segmentWidth = (canvasW + 40) / MAX_SEGMENTS;

  let curX = startX;
  let curY = baseY;

  for (let i = 0; i < MAX_SEGMENTS && segIdx < MAX_SEGMENTS; i++) {
    const seg = segments[segIdx];
    seg.active = true;
    seg.startX = curX;
    seg.startY = curY;
    seg.growOrder = i / MAX_SEGMENTS;
    seg.thickness = 3 + (1 - i / MAX_SEGMENTS) * 2;

    const nextX = curX + dir * segmentWidth;
    const yDrift = (Math.random() - 0.4) * 30; // slight downward bias
    const nextY = Math.max(canvasH * 0.08, Math.min(canvasH * 0.55, curY + yDrift));

    seg.cp1x = curX + dir * segmentWidth * 0.33 + (Math.random() - 0.5) * 15;
    seg.cp1y = curY + (Math.random() - 0.5) * 25;
    seg.cp2x = curX + dir * segmentWidth * 0.66 + (Math.random() - 0.5) * 15;
    seg.cp2y = nextY + (Math.random() - 0.5) * 25;
    seg.endX = nextX;
    seg.endY = nextY;

    curX = nextX;
    curY = nextY;
    segIdx++;

    // Every few segments, spawn a branch
    if (i % 3 === 1 && branchIdx < MAX_BRANCHES) {
      const b = branches[branchIdx];
      b.active = true;
      b.startX = seg.endX;
      b.startY = seg.endY;
      b.growOrder = seg.growOrder + 0.02;
      b.thickness = 2;

      const branchAngle = (Math.random() < 0.5 ? 1 : -1) * (Math.PI * 0.3 + Math.random() * 0.4);
      const branchLen = 30 + Math.random() * 50;

      b.cp1x = b.startX + Math.cos(branchAngle) * branchLen * 0.4;
      b.cp1y = b.startY + Math.sin(branchAngle) * branchLen * 0.4;
      b.cp2x = b.startX + Math.cos(branchAngle) * branchLen * 0.7 + (Math.random() - 0.5) * 10;
      b.cp2y = b.startY + Math.sin(branchAngle) * branchLen * 0.7 + (Math.random() - 0.5) * 10;
      b.endX = b.startX + Math.cos(branchAngle) * branchLen;
      b.endY = b.startY + Math.sin(branchAngle) * branchLen;
      b.hasCluster = Math.random() < 0.55 && clusterIdx < MAX_GRAPES;

      // Leaves along the branch
      for (let k = 0; k < 2 && leafIdx < MAX_LEAVES; k++) {
        const lt = 0.4 + Math.random() * 0.5;
        const lf = leaves[leafIdx];
        lf.active = true;
        lf.x = b.startX + (b.endX - b.startX) * lt + (Math.random() - 0.5) * 6;
        lf.y = b.startY + (b.endY - b.startY) * lt + (Math.random() - 0.5) * 6;
        lf.size = 6 + Math.random() * 6;
        lf.angle = branchAngle + (Math.random() - 0.5) * 1.2;
        lf.phaseOffset = Math.random() * Math.PI * 2;
        lf.growOrder = b.growOrder + 0.03 + k * 0.01;
        lf.variant = k % 2;
        leafIdx++;
      }

      // Grape cluster at branch tip
      if (b.hasCluster && clusterIdx < MAX_GRAPES) {
        const cl = clusters[clusterIdx];
        cl.active = true;
        cl.cx = b.endX;
        cl.cy = b.endY + 5;
        cl.growOrder = b.growOrder + 0.06;
        cl.phaseOffset = Math.random() * Math.PI * 2;

        // Arrange grapes in a triangular cluster shape
        let gi = 0;
        const rows = [3, 3, 2];
        let oy = 0;
        for (let row = 0; row < rows.length; row++) {
          const count = rows[row];
          const rowWidth = count * 6;
          for (let g = 0; g < count && gi < GRAPES_PER_CLUSTER; g++) {
            cl.grapeOffsets[gi].dx = -rowWidth / 2 + g * 6 + 3 + (Math.random() - 0.5) * 2;
            cl.grapeOffsets[gi].dy = oy + (Math.random() - 0.5) * 1.5;
            cl.grapeOffsets[gi].r = 2.5 + Math.random() * 1.2;
            gi++;
          }
          oy += 5.5;
        }

        clusterIdx++;
      }

      branchIdx++;
    }

    // Leaves along the main vine
    if (i % 2 === 0 && leafIdx < MAX_LEAVES) {
      const lf = leaves[leafIdx];
      lf.active = true;
      lf.x = seg.endX + (Math.random() - 0.5) * 8;
      lf.y = seg.endY + (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 8);
      lf.size = 7 + Math.random() * 7;
      lf.angle = (Math.random() - 0.5) * 1.5;
      lf.phaseOffset = Math.random() * Math.PI * 2;
      lf.growOrder = seg.growOrder + 0.01;
      lf.variant = i % 2;
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
    growProgress = 0;
    startFromLeft = Math.random() < 0.5;

    // Pre-allocate pools
    segments = [];
    for (let i = 0; i < MAX_SEGMENTS; i++) {
      segments.push({
        active: false, startX: 0, startY: 0,
        cp1x: 0, cp1y: 0, cp2x: 0, cp2y: 0,
        endX: 0, endY: 0, thickness: 0, growOrder: 0,
      });
    }

    branches = [];
    for (let i = 0; i < MAX_BRANCHES; i++) {
      branches.push({
        active: false, startX: 0, startY: 0,
        cp1x: 0, cp1y: 0, cp2x: 0, cp2y: 0,
        endX: 0, endY: 0, thickness: 0, growOrder: 0,
        hasCluster: false,
      });
    }

    leaves = [];
    for (let i = 0; i < MAX_LEAVES; i++) {
      leaves.push({
        active: false, x: 0, y: 0, size: 0,
        angle: 0, phaseOffset: 0, growOrder: 0, variant: 0,
      });
    }

    clusters = [];
    for (let i = 0; i < MAX_GRAPES; i++) {
      const grapeOffsets: Array<{ dx: number; dy: number; r: number }> = [];
      for (let g = 0; g < GRAPES_PER_CLUSTER; g++) {
        grapeOffsets.push({ dx: 0, dy: 0, r: 0 });
      }
      clusters.push({
        active: false, cx: 0, cy: 0,
        grapeOffsets, growOrder: 0, phaseOffset: 0,
      });
    }

    buildVine();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const tSec = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();

    // Advance growth
    growProgress = Math.min(1, growProgress + frame.deltaTime * VINE_GROW_SPEED);

    const vineColor = isDark ? VINE_COLOR_DARK : VINE_COLOR_LIGHT;
    const leafGreen = isDark ? LEAF_GREEN_DARK : LEAF_GREEN_LIGHT;
    const leafAlt = isDark ? LEAF_ALT_DARK : LEAF_ALT_LIGHT;
    const grapeColor = isDark ? GRAPE_PURPLE_DARK : GRAPE_PURPLE_LIGHT;
    const grapeHighlight = isDark ? GRAPE_HIGHLIGHT_DARK : GRAPE_HIGHLIGHT_LIGHT;

    // Global sway offset
    const swayX = Math.sin(tSec * 0.4) * 3;
    const swayY = Math.sin(tSec * 0.6 + 1.0) * 2;

    // Draw vine segments
    for (let i = 0; i < MAX_SEGMENTS; i++) {
      const seg = segments[i];
      if (!seg.active) continue;

      const segProgress = Math.max(0, Math.min(1, (growProgress - seg.growOrder) / 0.06));
      if (segProgress <= 0) continue;

      const eased = 1 - Math.pow(1 - segProgress, 3);

      const ex = seg.startX + (seg.endX - seg.startX) * eased + swayX;
      const ey = seg.startY + (seg.endY - seg.startY) * eased + swayY;
      const c1x = seg.startX + (seg.cp1x - seg.startX) * eased + swayX * 0.5;
      const c1y = seg.startY + (seg.cp1y - seg.startY) * eased + swayY * 0.5;
      const c2x = seg.startX + (seg.cp2x - seg.startX) * eased + swayX * 0.8;
      const c2y = seg.startY + (seg.cp2y - seg.startY) * eased + swayY * 0.8;

      api.brush.bezier(
        { x: seg.startX + swayX * 0.3, y: seg.startY + swayY * 0.3 },
        { x: c1x, y: c1y },
        { x: c2x, y: c2y },
        { x: ex, y: ey },
        { color: vineColor, width: seg.thickness * (0.5 + segProgress * 0.5), alpha: 0.85 },
      );
    }

    // Draw branches
    for (let i = 0; i < MAX_BRANCHES; i++) {
      const b = branches[i];
      if (!b.active) continue;

      const brProgress = Math.max(0, Math.min(1, (growProgress - b.growOrder) / 0.05));
      if (brProgress <= 0) continue;

      const eased = 1 - Math.pow(1 - brProgress, 3);

      const ex = b.startX + (b.endX - b.startX) * eased + swayX * 1.2;
      const ey = b.startY + (b.endY - b.startY) * eased + swayY * 1.2;
      const c1x = b.startX + (b.cp1x - b.startX) * eased + swayX * 0.8;
      const c1y = b.startY + (b.cp1y - b.startY) * eased + swayY * 0.8;
      const c2x = b.startX + (b.cp2x - b.startX) * eased + swayX;
      const c2y = b.startY + (b.cp2y - b.startY) * eased + swayY;

      api.brush.bezier(
        { x: b.startX + swayX * 0.5, y: b.startY + swayY * 0.5 },
        { x: c1x, y: c1y },
        { x: c2x, y: c2y },
        { x: ex, y: ey },
        { color: vineColor, width: b.thickness * (0.4 + brProgress * 0.6), alpha: 0.8 },
      );
    }

    // Draw leaves
    for (let i = 0; i < MAX_LEAVES; i++) {
      const lf = leaves[i];
      if (!lf.active) continue;

      const lfProgress = Math.max(0, Math.min(1, (growProgress - lf.growOrder) / 0.04));
      if (lfProgress <= 0) continue;

      const sway = Math.sin(tSec * 1.3 + lf.phaseOffset) * 0.18;
      const leafAngle = lf.angle + sway;
      const sz = lf.size * lfProgress;
      const alpha = 0.75 * lfProgress;
      if (alpha < 0.05) continue;

      const lx = lf.x + swayX;
      const ly = lf.y + swayY;

      api.brush.pushMatrix();
      api.brush.translate(lx, ly);
      api.brush.rotate(leafAngle);

      // Draw a simple grape leaf shape: a wider ellipse with a slight notch feel
      api.brush.ellipse(0, 0, sz * 1.8, sz * 1.2, {
        fill: lf.variant === 0 ? leafGreen : leafAlt,
        alpha,
      });

      // Leaf vein (central line)
      api.brush.line(-sz * 0.3, 0, sz * 1.0, 0, {
        color: isDark ? 0x1a4a1a : 0x2a6a2a,
        width: 0.8,
        alpha: alpha * 0.6,
      });

      api.brush.popMatrix();
    }

    // Draw grape clusters
    for (let i = 0; i < MAX_GRAPES; i++) {
      const cl = clusters[i];
      if (!cl.active) continue;

      const clProgress = Math.max(0, Math.min(1, (growProgress - cl.growOrder) / 0.06));
      if (clProgress <= 0) continue;

      const clusterSway = Math.sin(tSec * 0.9 + cl.phaseOffset) * 4;
      const cx = cl.cx + swayX + clusterSway * 0.5;
      const cy = cl.cy + swayY + Math.abs(clusterSway) * 0.3;

      api.brush.pushMatrix();
      api.brush.translate(cx, cy);

      // Draw each grape in the cluster
      for (let g = 0; g < GRAPES_PER_CLUSTER; g++) {
        const grape = cl.grapeOffsets[g];
        if (grape.r <= 0) continue;

        const grapeScale = Math.min(1, clProgress * 1.5 - g * 0.05);
        if (grapeScale <= 0) continue;

        const r = grape.r * grapeScale;
        const gx = grape.dx * grapeScale;
        const gy = grape.dy * grapeScale;

        // Main grape body
        api.brush.circle(gx, gy, r, {
          fill: grapeColor,
          alpha: 0.85,
        });

        // Highlight on each grape
        api.brush.circle(gx - r * 0.25, gy - r * 0.3, r * 0.4, {
          fill: grapeHighlight,
          alpha: 0.6,
          blendMode: 'add',
        });
      }

      api.brush.popMatrix();
    }
  },

  async teardown(): Promise<void> {
    segments = [];
    branches = [];
    leaves = [];
    clusters = [];
    canvasW = 0;
    canvasH = 0;
    growProgress = 0;
  },
};

registerActor(actor);
export default actor;
