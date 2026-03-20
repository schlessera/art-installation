/**
 * Cypress Row — Foreground Actor
 *
 * A row of tall, narrow cypress tree silhouettes swaying gently
 * in the breeze, evoking the iconic Tuscan landscape.
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
  id: 'cypress-row',
  name: 'Cypress Row',
  description: 'Tall narrow cypress tree silhouettes swaying gently in the breeze',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'italy', 'tuscany', 'trees', 'landscape'],
  createdAt: new Date('2026-03-20'),
  preferredDuration: 60,
  requiredContexts: ['display'],
};

// --- Constants ---
const TREE_COUNT = 6;
const SEGMENTS = 8; // vertical segments per tree for the irregular silhouette
const SWAY_SPEED = 0.8; // base sway speed in radians/sec

// --- Types ---
interface CypressTree {
  baseX: number;       // x position of the trunk base
  baseY: number;       // y position of the trunk base (ground level)
  height: number;      // total tree height
  width: number;       // max width at widest point
  phase: number;       // sway phase offset
  swayAmount: number;  // how much it sways (px at top)
  // Pre-computed irregularity offsets per segment, left and right
  leftOffsets: number[];
  rightOffsets: number[];
  depth: number;       // 0=far, 1=close; affects size and alpha
}

// --- Pre-allocated state ---
let canvasW = 0;
let canvasH = 0;
let trees: CypressTree[] = [];

// Dark mode colors
const DARK_GREENS = [0x1a3a1a, 0x1e4420, 0x163016, 0x224b22];
const LIGHT_GREENS = [0x2a5a2a, 0x2e6430, 0x264026, 0x326b32];

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    trees = [];

    // Distribute trees across the lower portion of the canvas
    // Varying depths for a sense of perspective
    const positions = [
      { x: 0.08, depth: 0.5 },
      { x: 0.22, depth: 0.9 },
      { x: 0.38, depth: 0.3 },
      { x: 0.55, depth: 1.0 },
      { x: 0.72, depth: 0.6 },
      { x: 0.88, depth: 0.8 },
    ];

    for (let i = 0; i < TREE_COUNT; i++) {
      const pos = positions[i];
      const depthScale = 0.5 + pos.depth * 0.5; // 0.5 to 1.0

      const leftOffsets: number[] = [];
      const rightOffsets: number[] = [];
      for (let s = 0; s <= SEGMENTS; s++) {
        // Irregularity varies: more at middle, less at tip and base
        const segFrac = s / SEGMENTS;
        const irregularity = Math.sin(segFrac * Math.PI) * 0.3;
        leftOffsets.push((Math.random() - 0.5) * irregularity);
        rightOffsets.push((Math.random() - 0.5) * irregularity);
      }

      const baseY = canvasH * (0.78 + pos.depth * 0.1); // closer trees sit lower
      const treeHeight = canvasH * (0.3 + pos.depth * 0.2) * (0.85 + Math.random() * 0.3);

      trees.push({
        baseX: canvasW * pos.x + (Math.random() - 0.5) * canvasW * 0.04,
        baseY,
        height: treeHeight * depthScale,
        width: (12 + pos.depth * 16) * (0.8 + Math.random() * 0.4),
        phase: Math.random() * Math.PI * 2,
        swayAmount: (2 + pos.depth * 3) * (0.8 + Math.random() * 0.4),
        leftOffsets,
        rightOffsets,
        depth: pos.depth,
      });
    }

    // Sort by depth so farther trees are drawn first
    trees.sort((a, b) => a.depth - b.depth);
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const tSec = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();
    const greens = isDark ? DARK_GREENS : LIGHT_GREENS;

    for (let i = 0; i < trees.length; i++) {
      const tree = trees[i];
      const colorIdx = i % greens.length;
      const treeColor = greens[colorIdx];

      // Sway offset increases from base (0) to top (max)
      const swayBase = Math.sin(tSec * SWAY_SPEED + tree.phase);
      // Secondary slower sway for natural feel
      const swaySecondary = Math.sin(tSec * SWAY_SPEED * 0.6 + tree.phase + 1.3) * 0.3;
      const totalSway = (swayBase + swaySecondary) * tree.swayAmount;

      // Alpha based on depth: closer trees are more opaque
      const alpha = 0.6 + tree.depth * 0.3; // 0.6 to 0.9

      api.brush.pushMatrix();
      api.brush.translate(tree.baseX, tree.baseY);

      // Draw the cypress as a series of overlapping segments
      // building a tall flame/column shape
      for (let s = 0; s < SEGMENTS; s++) {
        const t0 = s / SEGMENTS;       // fraction from base
        const t1 = (s + 1) / SEGMENTS;

        // Cypress shape: narrow at base, widest around 20-30%, tapering to point
        // Using a custom profile for the iconic flame shape
        const widthAt0 = cypressProfile(t0) * tree.width;
        const widthAt1 = cypressProfile(t1) * tree.width;

        // Apply irregularity
        const lOff0 = tree.leftOffsets[s] * tree.width;
        const rOff0 = tree.rightOffsets[s] * tree.width;
        const lOff1 = tree.leftOffsets[s + 1] * tree.width;
        const rOff1 = tree.rightOffsets[s + 1] * tree.width;

        // Y positions (going up, so negative)
        const y0 = -t0 * tree.height;
        const y1 = -t1 * tree.height;

        // Sway increases with height
        const swayAt0 = totalSway * t0 * t0; // quadratic increase
        const swayAt1 = totalSway * t1 * t1;

        // Draw quad as two triangles using polygon
        const x0Left = -widthAt0 + lOff0 + swayAt0;
        const x0Right = widthAt0 + rOff0 + swayAt0;
        const x1Left = -widthAt1 + lOff1 + swayAt1;
        const x1Right = widthAt1 + rOff1 + swayAt1;

        // Draw as a polygon (trapezoid segment)
        api.brush.polygon(
          [
            { x: x0Left, y: y0 },
            { x: x0Right, y: y0 },
            { x: x1Right, y: y1 },
            { x: x1Left, y: y1 },
          ],
          { fill: treeColor, alpha, blendMode: 'normal' }
        );
      }

      // Draw a small trunk at the very base
      const trunkWidth = tree.width * 0.15;
      const trunkHeight = tree.height * 0.05;
      const trunkColor = isDark ? 0x2a1f0e : 0x3d2f1a;
      api.brush.rect(
        -trunkWidth, 0,
        trunkWidth * 2, trunkHeight,
        { fill: trunkColor, alpha: alpha * 0.9, blendMode: 'normal' }
      );

      api.brush.popMatrix();
    }
  },

  async teardown(): Promise<void> {
    trees = [];
    canvasW = 0;
    canvasH = 0;
  },
};

/**
 * Returns the width multiplier (0-1) for a cypress tree at a given
 * height fraction (0 = base, 1 = tip). Creates the iconic narrow
 * flame/column shape: narrow base, widest around 15-25%, long taper to tip.
 */
function cypressProfile(t: number): number {
  if (t < 0.05) {
    // Very base: narrow trunk area, widens quickly
    return 0.3 + t * 10 * 0.7; // 0.3 to ~0.65
  }
  if (t < 0.2) {
    // Widening zone
    const f = (t - 0.05) / 0.15;
    return 0.65 + f * 0.35; // 0.65 to 1.0
  }
  // Long taper from widest to tip
  const f = (t - 0.2) / 0.8;
  // Use a curve that stays fairly wide then narrows at the top
  return Math.max(0, 1.0 - f * f * 1.1);
}

registerActor(actor);
export default actor;
