/**
 * Amalfi Coast — Background Actor
 *
 * Colorful cliffside houses stacked vertically along the left and right
 * edges of the canvas, with a blue sea below and stone cliff face.
 * Bougainvillea dots accent the walls, and a winding stairpath connects
 * the houses.
 */

import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
  Point,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'amalfi-coast',
  name: 'Amalfi Coast',
  description:
    'Colorful cliffside houses stacked on rocky slopes above a blue Mediterranean sea, with bougainvillea and winding stairs',
  author: {
    name: 'Joost de Valk',
    github: 'jdevalk',
  },
  version: '1.0.0',
  tags: ['background', 'italy', 'amalfi', 'coast', 'colorful'],
  createdAt: new Date('2026-03-21'),
  preferredDuration: 60,
  role: 'background',
  requiredContexts: ['display'],
};

// ============================================================
// CONSTANTS
// ============================================================

// House palette — warm Mediterranean colors
const HOUSE_COLORS_LIGHT = [
  0xf0d848, // lemon yellow
  0xcc6644, // terracotta
  0xe88866, // coral pink
  0xf0ece0, // white
  0x88ccaa, // mint green
  0x88aadd, // sky blue
];

const HOUSE_COLORS_DARK = [
  0x8a7a28, // muted yellow
  0x7a3a24, // dark terracotta
  0x8a4a38, // dark coral
  0x8a8878, // dim white
  0x4a7a5a, // dark mint
  0x4a5a7a, // dark blue
];

// Sea gradient strips
const SEA_COLORS_LIGHT = [0x3a7abb, 0x2e6aaa, 0x245a99, 0x1a4a8a];
const SEA_COLORS_DARK  = [0x1a3a5a, 0x153050, 0x102848, 0x0c2040];

// Cliff stone
const CLIFF_LIGHT = 0xb8a890;
const CLIFF_DARK  = 0x6a5e50;

// Bougainvillea
const BOUGAINVILLEA_LIGHT = 0xdd3388;
const BOUGAINVILLEA_DARK  = 0x882255;

// Window color
const WINDOW_LIGHT = 0x2a2a3a;
const WINDOW_DARK  = 0xccaa44;

// Stair color
const STAIR_LIGHT = 0xd0c8b8;
const STAIR_DARK  = 0x5a5248;

// Sky colors
const SKY_LIGHT = 0x88ccee;
const SKY_DARK  = 0x1a2a4a;

// Layout — how many houses per side, sea strips
const HOUSES_PER_SIDE = 8;
const SEA_STRIPS = 4;
const TOTAL_HOUSES = HOUSES_PER_SIDE * 2;

// Max draw calls budget:
// 1 background + 2 cliff polygons + 4 sea strips + 32 houses (rect) +
// ~48 windows + ~16 balconies + ~20 bougainvillea + ~12 stairs = ~135
// Well under 300.

// ============================================================
// PRE-ALLOCATED STATE
// ============================================================

interface House {
  x: number;
  y: number;
  w: number;
  h: number;
  colorIndex: number;
  windowCount: number;    // 1 or 2
  hasBalcony: boolean;
  hasBougainvillea: boolean;
}

let canvasW = 0;
let canvasH = 0;

// Houses on left and right sides
const housesLeft: House[] = [];
const housesRight: House[] = [];

// Cliff polygon points (pre-allocated)
const cliffLeftPoints: Point[] = [];
const cliffRightPoints: Point[] = [];

// Stair steps (pre-allocated x,y pairs)
const stairSteps: Array<{ x: number; y: number; w: number }> = [];

// Bougainvillea clusters
const bougainvilleaClusters: Array<{ x: number; y: number; dots: Array<{ dx: number; dy: number }> }> = [];

// Deterministic pseudo-random from seed
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function buildScene(): void {
  housesLeft.length = 0;
  housesRight.length = 0;
  cliffLeftPoints.length = 0;
  cliffRightPoints.length = 0;
  stairSteps.length = 0;
  bougainvilleaClusters.length = 0;

  const seaTop = canvasH * 0.72; // sea starts at 72% down
  const houseZoneTop = canvasH * 0.08;
  const houseZoneBottom = seaTop - 10;
  const houseZoneH = houseZoneBottom - houseZoneTop;
  const slotH = houseZoneH / HOUSES_PER_SIDE;

  // Left cliff profile
  const cliffLeftX = canvasW * 0.38;
  cliffLeftPoints.push({ x: 0, y: houseZoneTop });
  for (let i = 0; i <= HOUSES_PER_SIDE; i++) {
    const t = i / HOUSES_PER_SIDE;
    const y = houseZoneTop + t * houseZoneH;
    const jitter = seededRandom(i * 3 + 1) * 20 - 10;
    const x = cliffLeftX - 20 + Math.sin(t * 3.5) * 15 + jitter;
    cliffLeftPoints.push({ x, y });
  }
  cliffLeftPoints.push({ x: cliffLeftX + 10, y: seaTop });
  cliffLeftPoints.push({ x: 0, y: seaTop });

  // Right cliff profile
  const cliffRightX = canvasW * 0.62;
  cliffRightPoints.push({ x: canvasW, y: houseZoneTop });
  for (let i = 0; i <= HOUSES_PER_SIDE; i++) {
    const t = i / HOUSES_PER_SIDE;
    const y = houseZoneTop + t * houseZoneH;
    const jitter = seededRandom(i * 3 + 50) * 20 - 10;
    const x = cliffRightX + 20 - Math.sin(t * 3.5 + 1) * 15 + jitter;
    cliffRightPoints.push({ x, y });
  }
  cliffRightPoints.push({ x: cliffRightX - 10, y: seaTop });
  cliffRightPoints.push({ x: canvasW, y: seaTop });

  // Generate left-side houses
  for (let i = 0; i < HOUSES_PER_SIDE; i++) {
    const seed = i * 7 + 3;
    const w = 40 + seededRandom(seed) * 30;
    const h = slotH * (0.7 + seededRandom(seed + 1) * 0.25);
    const baseX = 5 + seededRandom(seed + 2) * (cliffLeftX - w - 20);
    const baseY = houseZoneTop + i * slotH + (slotH - h) * 0.5;
    housesLeft.push({
      x: baseX,
      y: baseY,
      w,
      h,
      colorIndex: Math.floor(seededRandom(seed + 3) * HOUSE_COLORS_LIGHT.length),
      windowCount: seededRandom(seed + 4) > 0.4 ? 2 : 1,
      hasBalcony: seededRandom(seed + 5) > 0.5,
      hasBougainvillea: seededRandom(seed + 6) > 0.55,
    });
  }

  // Generate right-side houses
  for (let i = 0; i < HOUSES_PER_SIDE; i++) {
    const seed = i * 7 + 100;
    const w = 40 + seededRandom(seed) * 30;
    const h = slotH * (0.7 + seededRandom(seed + 1) * 0.25);
    const baseX = cliffRightX + 10 + seededRandom(seed + 2) * (canvasW - cliffRightX - w - 15);
    const baseY = houseZoneTop + i * slotH + (slotH - h) * 0.5;
    housesRight.push({
      x: baseX,
      y: baseY,
      w,
      h,
      colorIndex: Math.floor(seededRandom(seed + 3) * HOUSE_COLORS_LIGHT.length),
      windowCount: seededRandom(seed + 4) > 0.4 ? 2 : 1,
      hasBalcony: seededRandom(seed + 5) > 0.5,
      hasBougainvillea: seededRandom(seed + 6) > 0.55,
    });
  }

  // Stair steps between the cliffs (winding path down the center)
  const stairCount = 10;
  for (let i = 0; i < stairCount; i++) {
    const t = i / stairCount;
    const y = houseZoneTop + 20 + t * (houseZoneH - 30);
    const centerX = canvasW * 0.5 + Math.sin(t * 5 + 0.5) * 25;
    const w = 30 + seededRandom(i * 11 + 200) * 20;
    stairSteps.push({ x: centerX - w * 0.5, y, w });
  }

  // Bougainvillea clusters on selected houses
  const allHouses = [...housesLeft, ...housesRight];
  for (let i = 0; i < allHouses.length; i++) {
    const house = allHouses[i];
    if (!house.hasBougainvillea) continue;
    const cx = house.x + house.w * (seededRandom(i * 13 + 300) > 0.5 ? 0.85 : 0.15);
    const cy = house.y + house.h * 0.2;
    const dots: Array<{ dx: number; dy: number }> = [];
    const dotCount = 3 + Math.floor(seededRandom(i * 13 + 301) * 4);
    for (let d = 0; d < dotCount; d++) {
      dots.push({
        dx: (seededRandom(i * 13 + 310 + d) - 0.5) * 14,
        dy: (seededRandom(i * 13 + 320 + d) - 0.5) * 12,
      });
    }
    bougainvilleaClusters.push({ x: cx, y: cy, dots });
  }
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
    buildScene();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const isDark = api.context.display.isDarkMode();
    const tSec = frame.time / 1000;
    const seaTop = canvasH * 0.72;

    // Sky background
    api.brush.background(isDark ? SKY_DARK : SKY_LIGHT);

    // Draw cliff faces
    const cliffColor = isDark ? CLIFF_DARK : CLIFF_LIGHT;
    api.brush.polygon(cliffLeftPoints, { fill: cliffColor, alpha: 0.9 });
    api.brush.polygon(cliffRightPoints, { fill: cliffColor, alpha: 0.9 });

    // Draw houses (left side)
    const houseColors = isDark ? HOUSE_COLORS_DARK : HOUSE_COLORS_LIGHT;
    const windowColor = isDark ? WINDOW_DARK : WINDOW_LIGHT;

    for (let i = 0; i < housesLeft.length; i++) {
      const h = housesLeft[i];
      // House body
      api.brush.rect(h.x, h.y, h.w, h.h, {
        fill: houseColors[h.colorIndex],
        alpha: 0.9,
      });
      // Windows
      const winW = 6;
      const winH = 8;
      const winY = h.y + h.h * 0.3;
      api.brush.rect(h.x + h.w * 0.25 - winW * 0.5, winY, winW, winH, {
        fill: windowColor,
        alpha: 0.85,
      });
      if (h.windowCount === 2) {
        api.brush.rect(h.x + h.w * 0.7 - winW * 0.5, winY, winW, winH, {
          fill: windowColor,
          alpha: 0.85,
        });
      }
      // Balcony line
      if (h.hasBalcony) {
        const balY = h.y + h.h * 0.55;
        api.brush.rect(h.x + 4, balY, h.w - 8, 2, {
          fill: isDark ? 0x4a4a4a : 0x888888,
          alpha: 0.7,
        });
      }
    }

    // Draw houses (right side)
    for (let i = 0; i < housesRight.length; i++) {
      const h = housesRight[i];
      api.brush.rect(h.x, h.y, h.w, h.h, {
        fill: houseColors[h.colorIndex],
        alpha: 0.9,
      });
      const winW = 6;
      const winH = 8;
      const winY = h.y + h.h * 0.3;
      api.brush.rect(h.x + h.w * 0.25 - winW * 0.5, winY, winW, winH, {
        fill: windowColor,
        alpha: 0.85,
      });
      if (h.windowCount === 2) {
        api.brush.rect(h.x + h.w * 0.7 - winW * 0.5, winY, winW, winH, {
          fill: windowColor,
          alpha: 0.85,
        });
      }
      if (h.hasBalcony) {
        const balY = h.y + h.h * 0.55;
        api.brush.rect(h.x + 4, balY, h.w - 8, 2, {
          fill: isDark ? 0x4a4a4a : 0x888888,
          alpha: 0.7,
        });
      }
    }

    // Winding stair path
    const stairColor = isDark ? STAIR_DARK : STAIR_LIGHT;
    for (let i = 0; i < stairSteps.length; i++) {
      const s = stairSteps[i];
      api.brush.rect(s.x, s.y, s.w, 3, {
        fill: stairColor,
        alpha: 0.75,
      });
    }

    // Bougainvillea dots
    const bougColor = isDark ? BOUGAINVILLEA_DARK : BOUGAINVILLEA_LIGHT;
    for (let i = 0; i < bougainvilleaClusters.length; i++) {
      const cluster = bougainvilleaClusters[i];
      for (let d = 0; d < cluster.dots.length; d++) {
        const dot = cluster.dots[d];
        api.brush.circle(cluster.x + dot.dx, cluster.y + dot.dy, 2.5, {
          fill: bougColor,
          alpha: 0.8,
        });
      }
    }

    // Sea — blue gradient strips at bottom
    const seaColors = isDark ? SEA_COLORS_DARK : SEA_COLORS_LIGHT;
    const seaH = canvasH - seaTop;
    const stripH = seaH / SEA_STRIPS;
    for (let i = 0; i < SEA_STRIPS; i++) {
      const y = seaTop + i * stripH;
      // Subtle wave offset for liveliness
      const waveOffset = Math.sin(tSec * 0.8 + i * 1.2) * 2;
      api.brush.rect(0, y + waveOffset, canvasW, stripH + 2, {
        fill: seaColors[i],
        alpha: 0.9,
      });
    }
  },

  async teardown(): Promise<void> {
    canvasW = 0;
    canvasH = 0;
    housesLeft.length = 0;
    housesRight.length = 0;
    cliffLeftPoints.length = 0;
    cliffRightPoints.length = 0;
    stairSteps.length = 0;
    bougainvilleaClusters.length = 0;
  },
};

registerActor(actor);
export default actor;
