/**
 * Sunflower Field — Foreground Actor
 *
 * Rows of sunflowers at different depths filling the lower 2/3 of the canvas.
 * Flowers gently sway in the breeze and face toward the sun based on time of day.
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
  id: 'sunflower-field',
  name: 'Sunflower Field',
  description: 'Rows of sunflowers at different depths swaying in the breeze, facing the sun',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'italy', 'sunflowers', 'nature', 'field'],
  createdAt: new Date('2026-03-21'),
  preferredDuration: 60,
  requiredContexts: ['time', 'display'],
};

// --- Constants ---
const FLOWER_COUNT = 15;
const SWAY_SPEED = 0.7;
const CENTER_COLOR = 0x5a3a1a;
const CENTER_COLOR_DARK = 0x3d2810;
const PETAL_COLORS = [0xf0c820, 0xe8b818];
const PETAL_COLORS_DARK = [0xc8a018, 0xb89010];
const STEM_COLOR = 0x4a7a2a;
const STEM_COLOR_DARK = 0x2e5a1e;
const LEAF_COLOR = 0x3d6e22;
const LEAF_COLOR_DARK = 0x264a16;

// --- Types ---
interface Sunflower {
  baseX: number;        // stem base x
  baseY: number;        // stem base y (ground level)
  headX: number;        // flower head x (computed in setup, updated by sway)
  headY: number;        // flower head y
  stemHeight: number;   // total stem height
  centerRadius: number; // brown center radius
  petalCount: number;   // 8-12
  petalLength: number;  // length of each petal ellipse
  petalWidth: number;   // width of each petal ellipse
  phase: number;        // sway phase offset
  swayAmount: number;   // sway magnitude
  depth: number;        // 0=far, 1=close
  leaf1Height: number;  // fraction of stem height for first leaf
  leaf1Side: number;    // -1 or 1
  leaf2Height: number;  // fraction for second leaf (0 = no leaf)
  leaf2Side: number;
  petalOffsets: number[]; // pre-computed angular offsets for petals
}

// --- Pre-allocated state ---
let canvasW = 0;
let canvasH = 0;
let flowers: Sunflower[] = [];

/**
 * Returns a sun direction factor based on hour of day.
 * -1 = morning (sun on left), 0 = midday (center), +1 = afternoon (sun on right).
 */
function sunDirection(hour: number): number {
  // Map 6am-18pm linearly: 6=-1, 12=0, 18=+1
  // Outside that range, clamp
  if (hour < 6) return -1;
  if (hour > 18) return 1;
  return (hour - 12) / 6;
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    flowers = [];

    // Define flower positions: spread across the lower 2/3
    // Rows at different depths for perspective
    const positions: Array<{ x: number; depth: number }> = [
      // Back row (far, small) — depth 0.1-0.3
      { x: 0.10, depth: 0.15 },
      { x: 0.30, depth: 0.20 },
      { x: 0.50, depth: 0.10 },
      { x: 0.70, depth: 0.25 },
      { x: 0.90, depth: 0.18 },
      // Middle row — depth 0.4-0.6
      { x: 0.05, depth: 0.45 },
      { x: 0.20, depth: 0.55 },
      { x: 0.42, depth: 0.50 },
      { x: 0.62, depth: 0.40 },
      { x: 0.82, depth: 0.60 },
      // Front row (close, big) — depth 0.7-1.0
      { x: 0.12, depth: 0.80 },
      { x: 0.35, depth: 0.90 },
      { x: 0.55, depth: 1.00 },
      { x: 0.75, depth: 0.85 },
      { x: 0.95, depth: 0.75 },
    ];

    for (let i = 0; i < FLOWER_COUNT; i++) {
      const pos = positions[i];
      const depthScale = 0.4 + pos.depth * 0.6; // 0.4 to 1.0

      const stemHeight = (canvasH * 0.2 + canvasH * 0.25 * pos.depth) * (0.85 + Math.random() * 0.3);
      const centerRadius = (4 + pos.depth * 10) * (0.85 + Math.random() * 0.3);
      const petalCount = 8 + Math.floor(Math.random() * 5); // 8-12
      const petalLength = centerRadius * (1.0 + Math.random() * 0.4);
      const petalWidth = centerRadius * (0.3 + Math.random() * 0.15);

      // Pre-compute petal angular offsets for natural irregularity
      const petalOffsets: number[] = [];
      for (let p = 0; p < petalCount; p++) {
        petalOffsets.push((Math.random() - 0.5) * 0.15);
      }

      const baseX = canvasW * pos.x + (Math.random() - 0.5) * canvasW * 0.05;
      const baseY = canvasH * (0.65 + pos.depth * 0.2) + (Math.random() - 0.5) * 10;

      const hasSecondLeaf = Math.random() > 0.4;

      flowers.push({
        baseX,
        baseY,
        headX: baseX,
        headY: baseY - stemHeight * depthScale,
        stemHeight: stemHeight * depthScale,
        centerRadius,
        petalCount,
        petalLength,
        petalWidth,
        phase: Math.random() * Math.PI * 2,
        swayAmount: (2 + pos.depth * 5) * (0.7 + Math.random() * 0.6),
        depth: pos.depth,
        leaf1Height: 0.3 + Math.random() * 0.3,
        leaf1Side: Math.random() > 0.5 ? 1 : -1,
        leaf2Height: hasSecondLeaf ? 0.55 + Math.random() * 0.25 : 0,
        leaf2Side: Math.random() > 0.5 ? 1 : -1,
        petalOffsets,
      });
    }

    // Sort by depth so farther flowers are drawn first
    flowers.sort((a, b) => a.depth - b.depth);
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const tSec = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();
    const hour = api.context.time.hour();
    const sunDir = sunDirection(hour);

    const stemColor = isDark ? STEM_COLOR_DARK : STEM_COLOR;
    const leafColor = isDark ? LEAF_COLOR_DARK : LEAF_COLOR;
    const centerColor = isDark ? CENTER_COLOR_DARK : CENTER_COLOR;
    const petals = isDark ? PETAL_COLORS_DARK : PETAL_COLORS;

    for (let i = 0; i < flowers.length; i++) {
      const f = flowers[i];
      const alpha = 0.6 + f.depth * 0.35; // 0.6 to 0.95

      // Compute sway: primary + secondary for natural feel
      const swayPrimary = Math.sin(tSec * SWAY_SPEED + f.phase);
      const swaySecondary = Math.sin(tSec * SWAY_SPEED * 0.5 + f.phase + 2.1) * 0.3;
      const totalSway = (swayPrimary + swaySecondary) * f.swayAmount;

      // Head position with sway (sway increases toward top)
      const headSwayX = totalSway;
      const headSwayY = -Math.abs(totalSway) * 0.1; // slight upward pull when swaying
      const headX = f.baseX + headSwayX;
      const headY = f.baseY - f.stemHeight + headSwayY;

      // --- Draw stem ---
      // Stem as a line from base to head, with slight curve
      const stemMidX = f.baseX + headSwayX * 0.4;
      const stemMidY = f.baseY - f.stemHeight * 0.5;
      const stemThickness = 1.5 + f.depth * 2;

      api.brush.bezier(
        { x: f.baseX, y: f.baseY },
        { x: stemMidX, y: stemMidY },
        { x: headX, y: headY + f.stemHeight * 0.15 },
        { x: headX, y: headY },
        { color: stemColor, width: stemThickness, alpha, blendMode: 'normal' }
      );

      // --- Draw leaves ---
      const leafSize = f.centerRadius * 1.2;

      // First leaf
      const leaf1Y = f.baseY - f.stemHeight * f.leaf1Height;
      const leaf1X = f.baseX + headSwayX * f.leaf1Height * 0.4;
      const leafAngle1 = f.leaf1Side * (0.4 + Math.sin(tSec * 0.8 + f.phase) * 0.1);

      api.brush.pushMatrix();
      api.brush.translate(leaf1X, leaf1Y);
      api.brush.rotate(leafAngle1);
      api.brush.ellipse(f.leaf1Side * leafSize * 0.7, 0, leafSize, leafSize * 0.35, {
        fill: leafColor,
        alpha: alpha * 0.9,
        blendMode: 'normal',
      });
      api.brush.popMatrix();

      // Second leaf (if present)
      if (f.leaf2Height > 0) {
        const leaf2Y = f.baseY - f.stemHeight * f.leaf2Height;
        const leaf2X = f.baseX + headSwayX * f.leaf2Height * 0.4;
        const leafAngle2 = f.leaf2Side * (0.35 + Math.sin(tSec * 0.9 + f.phase + 1.0) * 0.1);

        api.brush.pushMatrix();
        api.brush.translate(leaf2X, leaf2Y);
        api.brush.rotate(leafAngle2);
        api.brush.ellipse(f.leaf2Side * leafSize * 0.6, 0, leafSize * 0.8, leafSize * 0.3, {
          fill: leafColor,
          alpha: alpha * 0.85,
          blendMode: 'normal',
        });
        api.brush.popMatrix();
      }

      // --- Draw flower head ---
      // Face direction: combine sun direction with slight sway tilt
      const faceAngle = sunDir * 0.3 + totalSway * 0.02;

      api.brush.pushMatrix();
      api.brush.translate(headX, headY);

      // Petals: small ellipses radiating from center
      const angleStep = (Math.PI * 2) / f.petalCount;
      for (let p = 0; p < f.petalCount; p++) {
        const baseAngle = p * angleStep + f.petalOffsets[p] + faceAngle;
        const petalCenterDist = f.centerRadius * 0.7;
        const px = Math.cos(baseAngle) * petalCenterDist;
        const py = Math.sin(baseAngle) * petalCenterDist;
        const petalColor = petals[p % 2];

        api.brush.pushMatrix();
        api.brush.translate(px, py);
        api.brush.rotate(baseAngle);
        api.brush.ellipse(f.petalLength * 0.5, 0, f.petalLength, f.petalWidth, {
          fill: petalColor,
          alpha,
          blendMode: 'normal',
        });
        api.brush.popMatrix();
      }

      // Brown center circle
      api.brush.circle(0, 0, f.centerRadius, {
        fill: centerColor,
        alpha,
        blendMode: 'normal',
      });

      api.brush.popMatrix();
    }
  },

  async teardown(): Promise<void> {
    flowers = [];
    canvasW = 0;
    canvasH = 0;
  },
};

registerActor(actor);
export default actor;
