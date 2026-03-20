/**
 * Terrazzo Floor Background Actor
 *
 * Renders 120 irregular marble chips scattered on a warm cement base,
 * inspired by classic Italian terrazzo flooring. Each chip is a random
 * irregular polygon in one of 10 stone colors, with a subtle shimmer
 * animation driven by a sine wave on alpha.
 */

import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

// ============================================================
// METADATA
// ============================================================

const metadata: ActorMetadata = {
  id: 'terrazzo-floor',
  name: 'Terrazzo Floor',
  description:
    'Irregular marble chips scattered on a warm cement base — classic Italian terrazzo flooring with a subtle shimmer',
  author: {
    name: 'Joost de Valk',
    github: 'jdevalk',
  },
  version: '1.0.0',
  tags: ['background', 'terrazzo', 'italy', 'pattern', 'stone'],
  createdAt: new Date('2026-03-20'),
  preferredDuration: 60,
  requiredContexts: ['display'],
  role: 'background',
};

// ============================================================
// CONSTANTS
// ============================================================

const NUM_CHIPS = 120;
const MIN_SIDES = 3;
const MAX_SIDES = 7;
const MIN_SIZE = 5;
const MAX_SIZE = 23;

// Dark-mode stone colors (warmer, deeper)
const DARK_COLORS: number[] = [
  0xd4a574, // warm beige
  0xc4956a, // terracotta
  0x8b7355, // brown marble
  0xe8c9a0, // cream
  0xa08060, // walnut
  0x9a8a7a, // grey marble
  0xb85c3c, // red marble
  0x556b2f, // verde marble
  0xddd5c5, // off-white
  0x6a5a4a, // dark stone
];

// Light-mode stone colors (lighter variants)
const LIGHT_COLORS: number[] = [
  0xe0bb90, // warm beige lighter
  0xd4a880, // terracotta lighter
  0xa08868, // brown marble lighter
  0xf0d8b8, // cream lighter
  0xb89878, // walnut lighter
  0xb0a090, // grey marble lighter
  0xd07050, // red marble lighter
  0x708040, // verde marble lighter
  0xe8e0d0, // off-white lighter
  0x887868, // dark stone lighter
];

// Cement base color options (dark mode / light mode pairs)
const CEMENT_DARK: number[] = [0x8a7b6b, 0x7a6b5b, 0x6a6050];
const CEMENT_LIGHT: number[] = [0xc8b8a0, 0xbcac94, 0xb0a088];

// ============================================================
// PRE-ALLOCATED STATE
// ============================================================

interface Chip {
  x: number;
  y: number;
  rotation: number;
  size: number;
  colorIndex: number;
  numSides: number;
  // Pre-computed polygon vertices (relative to center)
  vertices: Array<{ x: number; y: number }>;
  // Shimmer phase offset
  shimmerPhase: number;
}

const chips: Chip[] = [];
let canvasW = 0;
let canvasH = 0;
let cementIndex = 0;

// Reusable array for transformed vertices (avoid allocations in update)
const transformedVerts: Array<{ x: number; y: number }> = [];
for (let i = 0; i < MAX_SIDES; i++) {
  transformedVerts.push({ x: 0, y: 0 });
}

// ============================================================
// HELPERS
// ============================================================

function generateChipVertices(
  numSides: number,
  size: number,
): Array<{ x: number; y: number }> {
  const verts: Array<{ x: number; y: number }> = [];
  const angleStep = (Math.PI * 2) / numSides;
  for (let i = 0; i < numSides; i++) {
    const angle = angleStep * i;
    // Irregular radius: 60-100% of size
    const r = size * (0.6 + Math.random() * 0.4);
    verts.push({
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
    });
  }
  return verts;
}

// ============================================================
// ACTOR
// ============================================================

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    // Pick a random cement base
    cementIndex = Math.floor(Math.random() * CEMENT_DARK.length);

    // Pre-allocate all chips
    chips.length = 0;
    for (let i = 0; i < NUM_CHIPS; i++) {
      const numSides =
        MIN_SIDES + Math.floor(Math.random() * (MAX_SIDES - MIN_SIDES + 1));
      const chipSize = MIN_SIZE + Math.random() * (MAX_SIZE - MIN_SIZE);
      const vertices = generateChipVertices(numSides, chipSize);

      chips.push({
        x: Math.random() * canvasW,
        y: Math.random() * canvasH,
        rotation: Math.random() * Math.PI * 2,
        size: chipSize,
        colorIndex: Math.floor(Math.random() * DARK_COLORS.length),
        numSides,
        vertices,
        shimmerPhase: Math.random() * Math.PI * 2,
      });
    }

    // Ensure transformedVerts has enough capacity
    while (transformedVerts.length < MAX_SIDES) {
      transformedVerts.push({ x: 0, y: 0 });
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const isDark = api.context.display.isDarkMode();
    const time = frame.time / 1000;

    // Draw cement base
    const baseColor = isDark
      ? CEMENT_DARK[cementIndex]
      : CEMENT_LIGHT[cementIndex];
    api.brush.background(baseColor);

    // Draw each chip
    const palette = isDark ? DARK_COLORS : LIGHT_COLORS;

    for (let i = 0; i < chips.length; i++) {
      const chip = chips[i];
      const color = palette[chip.colorIndex];

      // Subtle shimmer: sine wave on alpha, range 0.6 - 0.9
      const shimmer =
        0.75 + 0.15 * Math.sin(time * 1.5 + chip.shimmerPhase);

      // Transform vertices using pushMatrix/popMatrix
      api.brush.pushMatrix();
      api.brush.translate(chip.x, chip.y);
      api.brush.rotate(chip.rotation);

      api.brush.polygon(chip.vertices, {
        fill: color,
        alpha: shimmer,
      });

      api.brush.popMatrix();
    }
  },

  async teardown(): Promise<void> {
    chips.length = 0;
    canvasW = 0;
    canvasH = 0;
    cementIndex = 0;
  },
};

registerActor(actor);
export default actor;
