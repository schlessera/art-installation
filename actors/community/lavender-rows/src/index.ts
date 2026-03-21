/**
 * Lavender Rows — Foreground Actor
 *
 * Perspective rows of lavender plants converging toward a vanishing point,
 * with gently swaying flower spikes, buzzing bees, and subtle fragrance lines.
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
  id: 'lavender-rows',
  name: 'Lavender Rows',
  description: 'Perspective rows of lavender plants with swaying flower spikes, buzzing bees, and rising fragrance',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'italy', 'lavender', 'nature', 'bees'],
  createdAt: new Date('2026-03-21'),
  preferredDuration: 45,
  requiredContexts: ['display'],
};

// --- Constants ---
const ROW_COUNT = 5;
const SPIKES_PER_ROW = 7;
const BEE_COUNT = 4;
const FRAGRANCE_COUNT = 8;

// Vanishing point
const VP_X = 0.50;
const VP_Y = 0.30;

// Lavender colors
const FLOWER_COLORS = [0x7a5aaa, 0x8a6aba, 0x6a4a9a];
const STEM_COLOR = 0x4a7a3a;
const STEM_COLOR_DARK = 0x3a5a2a;

// Bee colors
const BEE_BODY = 0xddbb22;
const BEE_WING = 0xccccee;

// --- Types ---
interface FlowerSpike {
  // Position along the row (0-1)
  rowT: number;
  // Height of spike
  height: number;
  // Sway phase offset
  swayPhase: number;
  // Color index
  colorIdx: number;
  // Number of flower clusters on this spike
  clusterCount: number;
}

interface LavenderRow {
  // Row index (0 = nearest, ROW_COUNT-1 = farthest)
  index: number;
  // Pre-allocated spikes
  spikes: FlowerSpike[];
}

interface Bee {
  // Figure-8 center position (row index, spike index)
  centerRow: number;
  centerT: number;
  // Figure-8 parameters
  loopSpeed: number;
  loopPhase: number;
  loopRadiusX: number;
  loopRadiusY: number;
  // Wing flap phase
  wingPhase: number;
}

interface FragranceLine {
  // Base position
  baseRow: number;
  baseT: number;
  // Animation
  phase: number;
  speed: number;
  amplitude: number;
  height: number;
}

// --- Pre-allocated state ---
let canvasW = 0;
let canvasH = 0;
let rows: LavenderRow[] = [];
let bees: Bee[] = [];
let fragranceLines: FragranceLine[] = [];

// Reusable computation results
let vpX = 0;
let vpY = 0;

/**
 * Compute screen position for a point on a lavender row.
 * rowFrac: 0 = nearest (bottom), 1 = farthest (vanishing point)
 * lateralT: 0..1 position along the row
 */
function getRowPoint(rowFrac: number, lateralT: number): { x: number; y: number; scale: number } {
  // Perspective interpolation toward vanishing point
  const perspective = rowFrac * rowFrac * 0.7 + rowFrac * 0.3;

  // Row width narrows with distance
  const rowWidth = canvasW * 0.9 * (1 - perspective * 0.85);
  const y = canvasH * 0.95 - (canvasH * 0.95 - vpY) * perspective;

  // Lateral position
  const rowLeft = vpX - rowWidth * 0.5;
  const x = rowLeft + lateralT * rowWidth;

  // Scale diminishes with distance
  const scale = 1.0 - perspective * 0.8;

  return { x, y, scale };
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    vpX = canvasW * VP_X;
    vpY = canvasH * VP_Y;

    // Create rows
    rows = [];
    for (let r = 0; r < ROW_COUNT; r++) {
      const spikes: FlowerSpike[] = [];
      for (let s = 0; s < SPIKES_PER_ROW; s++) {
        spikes.push({
          rowT: (s + 0.2 + Math.random() * 0.6) / SPIKES_PER_ROW,
          height: 20 + Math.random() * 15,
          swayPhase: Math.random() * Math.PI * 2,
          colorIdx: Math.floor(Math.random() * FLOWER_COLORS.length),
          clusterCount: 3 + Math.floor(Math.random() * 2),
        });
      }
      rows.push({ index: r, spikes });
    }

    // Create bees
    bees = [];
    for (let b = 0; b < BEE_COUNT; b++) {
      bees.push({
        centerRow: 1 + Math.random() * (ROW_COUNT - 2),
        centerT: 0.2 + Math.random() * 0.6,
        loopSpeed: 0.4 + Math.random() * 0.3,
        loopPhase: Math.random() * Math.PI * 2,
        loopRadiusX: 30 + Math.random() * 20,
        loopRadiusY: 15 + Math.random() * 10,
        wingPhase: Math.random() * Math.PI * 2,
      });
    }

    // Create fragrance lines
    fragranceLines = [];
    for (let f = 0; f < FRAGRANCE_COUNT; f++) {
      fragranceLines.push({
        baseRow: Math.floor(Math.random() * ROW_COUNT),
        baseT: 0.1 + Math.random() * 0.8,
        phase: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 0.4,
        amplitude: 3 + Math.random() * 4,
        height: 15 + Math.random() * 20,
      });
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();

    const stemCol = isDark ? STEM_COLOR_DARK : STEM_COLOR;

    // Draw rows from farthest to nearest for correct overlap
    for (let r = ROW_COUNT - 1; r >= 0; r--) {
      const row = rows[r];
      const rowFrac = 1 - r / (ROW_COUNT - 1); // 0=farthest, 1=nearest

      // Row depth alpha
      const rowAlpha = 0.6 + rowFrac * 0.3;

      // Draw a subtle ground strip for each row
      const leftPt = getRowPoint(1 - rowFrac, 0);
      const rightPt = getRowPoint(1 - rowFrac, 1);
      const stripHeight = 4 * (0.2 + rowFrac * 0.8);

      api.brush.rect(
        leftPt.x, leftPt.y - stripHeight * 0.5,
        rightPt.x - leftPt.x, stripHeight,
        {
          fill: isDark ? 0x2a3a1a : 0x6a8a4a,
          alpha: 0.3 + rowFrac * 0.15,
          blendMode: 'normal',
        }
      );

      // Draw flower spikes
      for (let s = 0; s < SPIKES_PER_ROW; s++) {
        const spike = row.spikes[s];
        const pt = getRowPoint(1 - rowFrac, spike.rowT);
        const spikeScale = pt.scale;

        // Sway: gentle sinusoidal offset at the top of each spike
        const swayAngle = Math.sin(t * 1.2 + spike.swayPhase) * 0.06
          + Math.sin(t * 0.7 + spike.swayPhase * 1.7) * 0.03;
        const spikeHeight = spike.height * spikeScale;

        // Stem base
        const baseX = pt.x;
        const baseY = pt.y;

        // Stem top (swayed)
        const topX = baseX + Math.sin(swayAngle) * spikeHeight;
        const topY = baseY - Math.cos(swayAngle) * spikeHeight;

        // Draw stem
        api.brush.line(
          baseX, baseY,
          topX, topY,
          {
            color: stemCol,
            width: Math.max(1, 1.5 * spikeScale),
            alpha: rowAlpha,
            blendMode: 'normal',
          }
        );

        // Draw flower clusters along the upper portion of the stem
        const flowerColor = FLOWER_COLORS[spike.colorIdx];
        for (let c = 0; c < spike.clusterCount; c++) {
          const cf = 0.35 + (c / spike.clusterCount) * 0.65;
          const cx = baseX + (topX - baseX) * cf;
          const cy = baseY + (topY - baseY) * cf;
          const clusterSize = (2.5 + Math.sin(t * 0.8 + spike.swayPhase + c) * 0.5) * spikeScale;

          api.brush.circle(cx, cy, Math.max(1, clusterSize), {
            fill: flowerColor,
            alpha: rowAlpha,
            blendMode: 'normal',
          });
        }

        // Tiny cluster at the very tip
        api.brush.circle(topX, topY, Math.max(1, 2 * spikeScale), {
          fill: FLOWER_COLORS[(spike.colorIdx + 1) % FLOWER_COLORS.length],
          alpha: rowAlpha,
          blendMode: 'normal',
        });
      }
    }

    // --- Draw fragrance lines ---
    for (let f = 0; f < FRAGRANCE_COUNT; f++) {
      const frag = fragranceLines[f];
      const rowFrac = 1 - frag.baseRow / (ROW_COUNT - 1);
      const pt = getRowPoint(1 - rowFrac, frag.baseT);
      const scale = pt.scale;

      // Rising wavy line
      const riseProgress = ((t * frag.speed + frag.phase) % 1);
      const fragHeight = frag.height * scale;
      const fragAlpha = (1 - riseProgress) * 0.15;

      if (fragAlpha < 0.02) continue;

      // Draw 3 segments of a wavy rising line
      const segments = 3;
      for (let seg = 0; seg < segments; seg++) {
        const t0 = seg / segments;
        const t1 = (seg + 1) / segments;
        const rise0 = riseProgress * fragHeight + t0 * fragHeight * 0.5;
        const rise1 = riseProgress * fragHeight + t1 * fragHeight * 0.5;
        const wave0 = Math.sin(t * 2 + frag.phase + t0 * 4) * frag.amplitude * scale;
        const wave1 = Math.sin(t * 2 + frag.phase + t1 * 4) * frag.amplitude * scale;

        api.brush.line(
          pt.x + wave0, pt.y - rise0,
          pt.x + wave1, pt.y - rise1,
          {
            color: isDark ? 0x9a7aca : 0xb09ada,
            width: 1,
            alpha: fragAlpha,
            blendMode: 'add',
          }
        );
      }
    }

    // --- Draw bees ---
    for (let b = 0; b < BEE_COUNT; b++) {
      const bee = bees[b];

      // Figure-8 flight path: Lissajous curve (1:2 frequency ratio)
      const angle = t * bee.loopSpeed + bee.loopPhase;
      const fig8X = Math.sin(angle) * bee.loopRadiusX;
      const fig8Y = Math.sin(angle * 2) * bee.loopRadiusY;

      // Get center position
      const rowFrac = 1 - bee.centerRow / (ROW_COUNT - 1);
      const centerPt = getRowPoint(1 - rowFrac, bee.centerT);
      const scale = centerPt.scale;

      const beeX = centerPt.x + fig8X * scale;
      const beeY = centerPt.y - 15 * scale + fig8Y * scale;

      const bodyW = 4 * scale;
      const bodyH = 2.5 * scale;

      // Bee body (ellipse approximated as a wider-than-tall circle)
      api.brush.circle(beeX, beeY, Math.max(1.5, bodyW), {
        fill: BEE_BODY,
        alpha: 0.85,
        blendMode: 'normal',
      });

      // Bee stripes - a smaller dark band
      api.brush.circle(beeX + bodyW * 0.2, beeY, Math.max(1, bodyH * 0.7), {
        fill: 0x332200,
        alpha: 0.7,
        blendMode: 'normal',
      });

      // Wings - flutter rapidly
      const wingFlap = Math.sin(t * 25 + bee.wingPhase) * 0.5 + 0.5;
      const wingLen = 3.5 * scale;
      const wingSpread = wingFlap * 2.5 * scale;

      // Left wing
      api.brush.line(
        beeX, beeY,
        beeX - wingLen, beeY - wingSpread,
        {
          color: BEE_WING,
          width: Math.max(1, 1.2 * scale),
          alpha: 0.6,
          blendMode: 'add',
        }
      );

      // Right wing
      api.brush.line(
        beeX, beeY,
        beeX + wingLen, beeY - wingSpread,
        {
          color: BEE_WING,
          width: Math.max(1, 1.2 * scale),
          alpha: 0.6,
          blendMode: 'add',
        }
      );
    }
  },

  async teardown(): Promise<void> {
    rows = [];
    bees = [];
    fragranceLines = [];
    canvasW = 0;
    canvasH = 0;
  },
};

registerActor(actor);
export default actor;
