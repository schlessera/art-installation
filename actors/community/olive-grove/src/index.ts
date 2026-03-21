/**
 * Olive Grove — Foreground Actor
 *
 * A grove of 5-7 olive trees with distinctive silver-green foliage,
 * gnarled trunks, and small dark olives. Wind ripples through the
 * leaf clusters in a wave pattern. Trees at different depths.
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
  id: 'olive-grove',
  name: 'Olive Grove',
  description: 'Silver-green olive trees with gnarled trunks swaying in the wind',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'italy', 'olives', 'nature', 'grove'],
  createdAt: new Date('2026-03-21'),
  preferredDuration: 60,
  requiredContexts: ['display'],
};

// --- Constants ---
const TREE_COUNT = 6;
const MAX_TRUNK_SEGMENTS = 18;   // bezier segments for gnarled trunks (3 per tree max)
const MAX_LEAF_CLUSTERS = 80;    // clusters of small ellipses
const MAX_OLIVES = 30;           // small dark olives hanging in foliage
const TRUNK_COLOR = 0x6a5030;
const TRUNK_COLOR_DARK = 0x5a4025;
const FOLIAGE_COLORS = [0x8aaa7a, 0x7a9a6a, 0x9aba8a];
const FOLIAGE_COLORS_DARK = [0x6a8a5a, 0x5a7a4a, 0x7a9a6a];
const OLIVE_COLOR = 0x2a3a1a;
const OLIVE_COLOR_DARK = 0x1a2a0a;
const WIND_SPEED = 1.2;
const WIND_WAVELENGTH = 0.005; // spatial frequency of wind wave

// --- Types ---
interface TrunkSegment {
  active: boolean;
  treeIdx: number;
  startX: number;
  startY: number;
  cp1x: number;
  cp1y: number;
  cp2x: number;
  cp2y: number;
  endX: number;
  endY: number;
  thickness: number;
}

interface LeafCluster {
  active: boolean;
  treeIdx: number;
  x: number;
  y: number;
  rx: number;
  ry: number;
  angle: number;
  colorIdx: number;
  phase: number;
  depth: number;
}

interface Olive {
  active: boolean;
  x: number;
  y: number;
  size: number;
  phase: number;
  depth: number;
}

interface TreeInfo {
  baseX: number;
  baseY: number;
  depth: number;
  scale: number;
  topX: number;
  topY: number;
}

// --- Pre-allocated state ---
let canvasW = 0;
let canvasH = 0;
let trunks: TrunkSegment[] = [];
let clusters: LeafCluster[] = [];
let olives: Olive[] = [];
let treeInfos: TreeInfo[] = [];

function buildTrunk(
  tree: TreeInfo,
  treeIdx: number,
  trunkIdx: number,
): number {
  const scale = tree.scale;
  const baseX = tree.baseX;
  const baseY = tree.baseY;

  // Olive trees have short, thick, gnarled trunks
  const trunkH = canvasH * 0.12 * scale;
  const lean = (Math.random() - 0.5) * 30 * scale;

  const midY = baseY - trunkH * 0.5;
  const topY = baseY - trunkH;
  const midX = baseX + lean * 0.6 + (Math.random() - 0.5) * 15 * scale;
  const topX = baseX + lean + (Math.random() - 0.5) * 10 * scale;

  // Lower trunk segment
  if (trunkIdx < MAX_TRUNK_SEGMENTS) {
    const t = trunks[trunkIdx];
    t.active = true;
    t.treeIdx = treeIdx;
    t.startX = baseX;
    t.startY = baseY;
    t.cp1x = baseX + (Math.random() - 0.5) * 20 * scale;
    t.cp1y = baseY - trunkH * 0.25;
    t.cp2x = midX + (Math.random() - 0.5) * 15 * scale;
    t.cp2y = midY + (Math.random() - 0.5) * 10 * scale;
    t.endX = midX;
    t.endY = midY;
    t.thickness = (8 + Math.random() * 4) * scale;
    trunkIdx++;
  }

  // Upper trunk segment
  if (trunkIdx < MAX_TRUNK_SEGMENTS) {
    const t = trunks[trunkIdx];
    t.active = true;
    t.treeIdx = treeIdx;
    t.startX = midX;
    t.startY = midY;
    t.cp1x = midX + (Math.random() - 0.5) * 18 * scale;
    t.cp1y = midY - trunkH * 0.2;
    t.cp2x = topX + (Math.random() - 0.5) * 12 * scale;
    t.cp2y = topY + trunkH * 0.1;
    t.endX = topX;
    t.endY = topY;
    t.thickness = (5 + Math.random() * 3) * scale;
    trunkIdx++;
  }

  // Forking branch for gnarled character
  if (Math.random() < 0.7 && trunkIdx < MAX_TRUNK_SEGMENTS) {
    const forkAngle = (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.5);
    const forkLen = trunkH * (0.4 + Math.random() * 0.3);
    const forkX = topX + Math.cos(-Math.PI / 2 + forkAngle) * forkLen;
    const forkY = topY + Math.sin(-Math.PI / 2 + forkAngle) * forkLen;

    const t = trunks[trunkIdx];
    t.active = true;
    t.treeIdx = treeIdx;
    t.startX = midX + (topX - midX) * 0.5;
    t.startY = midY + (topY - midY) * 0.5;
    t.cp1x = midX + (topX - midX) * 0.5 + (Math.random() - 0.5) * 10 * scale;
    t.cp1y = topY + trunkH * 0.15;
    t.cp2x = forkX + (Math.random() - 0.5) * 8 * scale;
    t.cp2y = forkY + (Math.random() - 0.5) * 8 * scale;
    t.endX = forkX;
    t.endY = forkY;
    t.thickness = (3 + Math.random() * 2) * scale;
    trunkIdx++;
  }

  tree.topX = topX;
  tree.topY = topY;

  return trunkIdx;
}

function buildFoliage(
  tree: TreeInfo,
  treeIdx: number,
  clusterIdx: number,
  oliveIdx: number,
): { clusterIdx: number; oliveIdx: number } {
  const scale = tree.scale;
  const canopyRadius = canvasH * 0.1 * scale;
  const cx = tree.topX;
  const cy = tree.topY - canopyRadius * 0.3;

  // Leaf clusters in a roughly elliptical canopy
  const count = 10 + Math.floor(Math.random() * 4);
  for (let i = 0; i < count && clusterIdx < MAX_LEAF_CLUSTERS; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * canopyRadius;
    const px = cx + Math.cos(angle) * dist * 1.3;
    const py = cy + Math.sin(angle) * dist * 0.8;

    const c = clusters[clusterIdx];
    c.active = true;
    c.treeIdx = treeIdx;
    c.x = px;
    c.y = py;
    c.rx = (4 + Math.random() * 6) * scale;
    c.ry = (3 + Math.random() * 4) * scale;
    c.angle = Math.random() * Math.PI;
    c.colorIdx = Math.floor(Math.random() * 3);
    c.phase = px * WIND_WAVELENGTH + Math.random() * 0.5;
    c.depth = tree.depth;
    clusterIdx++;
  }

  // Olives scattered in the canopy
  const oliveCount = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < oliveCount && oliveIdx < MAX_OLIVES; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * canopyRadius * 0.8;
    const o = olives[oliveIdx];
    o.active = true;
    o.x = cx + Math.cos(angle) * dist * 1.2;
    o.y = cy + Math.sin(angle) * dist * 0.7;
    o.size = (2 + Math.random() * 2) * scale;
    o.phase = o.x * WIND_WAVELENGTH + Math.random() * 0.3;
    o.depth = tree.depth;
    oliveIdx++;
  }

  return { clusterIdx, oliveIdx };
}

function buildGrove(): void {
  const positions = [
    { x: 0.10, depth: 0.3 },
    { x: 0.25, depth: 0.8 },
    { x: 0.42, depth: 0.5 },
    { x: 0.58, depth: 1.0 },
    { x: 0.75, depth: 0.4 },
    { x: 0.90, depth: 0.7 },
  ];

  treeInfos = [];
  for (let i = 0; i < TREE_COUNT; i++) {
    const p = positions[i];
    const scale = 0.6 + p.depth * 0.4;
    treeInfos.push({
      baseX: canvasW * p.x + (Math.random() - 0.5) * canvasW * 0.04,
      baseY: canvasH * (0.75 + p.depth * 0.12),
      depth: p.depth,
      scale,
      topX: 0,
      topY: 0,
    });
  }

  // Sort by depth: farther trees render first
  treeInfos.sort((a, b) => a.depth - b.depth);

  let trunkIdx = 0;
  let clusterIdx = 0;
  let oliveIdx = 0;

  for (let i = 0; i < TREE_COUNT; i++) {
    trunkIdx = buildTrunk(treeInfos[i], i, trunkIdx);
    const result = buildFoliage(treeInfos[i], i, clusterIdx, oliveIdx);
    clusterIdx = result.clusterIdx;
    oliveIdx = result.oliveIdx;
  }
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    // Pre-allocate pools
    trunks = [];
    for (let i = 0; i < MAX_TRUNK_SEGMENTS; i++) {
      trunks.push({
        active: false, treeIdx: 0,
        startX: 0, startY: 0, cp1x: 0, cp1y: 0, cp2x: 0, cp2y: 0,
        endX: 0, endY: 0, thickness: 0,
      });
    }
    clusters = [];
    for (let i = 0; i < MAX_LEAF_CLUSTERS; i++) {
      clusters.push({
        active: false, treeIdx: 0,
        x: 0, y: 0, rx: 0, ry: 0, angle: 0, colorIdx: 0, phase: 0, depth: 0,
      });
    }
    olives = [];
    for (let i = 0; i < MAX_OLIVES; i++) {
      olives.push({
        active: false, x: 0, y: 0, size: 0, phase: 0, depth: 0,
      });
    }

    buildGrove();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const tSec = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();
    const trunkColor = isDark ? TRUNK_COLOR_DARK : TRUNK_COLOR;
    const foliageColors = isDark ? FOLIAGE_COLORS_DARK : FOLIAGE_COLORS;
    const oliveColor = isDark ? OLIVE_COLOR_DARK : OLIVE_COLOR;

    const windTime = tSec * WIND_SPEED;

    // Draw trunks
    for (let i = 0; i < MAX_TRUNK_SEGMENTS; i++) {
      const t = trunks[i];
      if (!t.active) continue;

      const tree = treeInfos[t.treeIdx];
      const alpha = 0.7 + tree.depth * 0.25;

      api.brush.bezier(
        { x: t.startX, y: t.startY },
        { x: t.cp1x, y: t.cp1y },
        { x: t.cp2x, y: t.cp2y },
        { x: t.endX, y: t.endY },
        { color: trunkColor, width: t.thickness, alpha, blendMode: 'normal' }
      );
    }

    // Draw leaf clusters with wind ripple
    for (let i = 0; i < MAX_LEAF_CLUSTERS; i++) {
      const c = clusters[i];
      if (!c.active) continue;

      // Wind displacement: wave pattern based on spatial position and time
      const windOffset = Math.sin(c.phase + windTime) * 3 * (0.5 + c.depth * 0.5);
      const windOffsetY = Math.cos(c.phase * 1.3 + windTime * 0.7) * 1.5;

      const px = c.x + windOffset;
      const py = c.y + windOffsetY;
      const alpha = 0.6 + c.depth * 0.3;

      api.brush.pushMatrix();
      api.brush.translate(px, py);
      api.brush.rotate(c.angle + windOffset * 0.03);
      api.brush.ellipse(0, 0, c.rx, c.ry, {
        fill: foliageColors[c.colorIdx],
        alpha,
        blendMode: 'normal',
      });
      api.brush.popMatrix();
    }

    // Draw olives
    for (let i = 0; i < MAX_OLIVES; i++) {
      const o = olives[i];
      if (!o.active) continue;

      const windOffset = Math.sin(o.phase + windTime) * 2 * (0.5 + o.depth * 0.5);
      const alpha = 0.7 + o.depth * 0.2;

      api.brush.ellipse(o.x + windOffset, o.y, o.size, o.size * 0.85, {
        fill: oliveColor,
        alpha,
        blendMode: 'normal',
      });
    }
  },

  async teardown(): Promise<void> {
    trunks = [];
    clusters = [];
    olives = [];
    treeInfos = [];
    canvasW = 0;
    canvasH = 0;
  },
};

registerActor(actor);
export default actor;
