/**
 * Bezier Garden Actor
 *
 * Organic plant growth using bezier curves.
 * Plants grow from the bottom, branch naturally, and bloom with flowers.
 * Season context affects color palette.
 */

import type {
  Actor,
  ActorMetadata,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  Point,
} from '@art/types';
import { registerActor } from '@art/actor-sdk';

const metadata: ActorMetadata = {
  id: 'bezier-garden',
  name: 'Bezier Garden',
  description: 'Organic plant growth with flowing bezier curves',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['nature', 'organic', 'curves', 'growth', 'seasonal'],
  createdAt: new Date('2026-01-10'),
  preferredDuration: 120,
  requiredContexts: ['time'],
};

interface RGB {
  r: number;
  g: number;
  b: number;
}

// Earthen stem color palettes with variations in saturation and value
const STEM_PALETTES: RGB[][] = [
  // Rich brown earth
  [
    { r: 101, g: 67, b: 33 },   // Dark brown
    { r: 139, g: 90, b: 43 },   // Sienna
    { r: 160, g: 120, b: 70 },  // Tan brown
    { r: 92, g: 64, b: 51 },    // Coffee
  ],
  // Olive green earth
  [
    { r: 85, g: 107, b: 47 },   // Dark olive
    { r: 107, g: 142, b: 35 },  // Olive drab
    { r: 128, g: 128, b: 0 },   // Olive
    { r: 72, g: 85, b: 40 },    // Army green
  ],
  // Terracotta warm
  [
    { r: 160, g: 82, b: 45 },   // Sienna
    { r: 178, g: 100, b: 60 },  // Light terracotta
    { r: 140, g: 70, b: 40 },   // Dark terracotta
    { r: 188, g: 120, b: 80 },  // Sandy terracotta
  ],
  // Forest moss
  [
    { r: 60, g: 80, b: 45 },    // Deep moss
    { r: 85, g: 110, b: 60 },   // Forest green
    { r: 70, g: 95, b: 50 },    // Moss
    { r: 95, g: 120, b: 70 },   // Light moss
  ],
  // Warm umber
  [
    { r: 115, g: 74, b: 18 },   // Raw umber
    { r: 138, g: 93, b: 40 },   // Burnt umber
    { r: 160, g: 110, b: 55 },  // Light umber
    { r: 100, g: 65, b: 25 },   // Dark umber
  ],
  // Sage green
  [
    { r: 106, g: 137, b: 104 }, // Sage
    { r: 85, g: 115, b: 83 },   // Dark sage
    { r: 130, g: 155, b: 125 }, // Light sage
    { r: 95, g: 125, b: 93 },   // Medium sage
  ],
  // Clay earth
  [
    { r: 145, g: 100, b: 75 },  // Clay
    { r: 170, g: 120, b: 90 },  // Light clay
    { r: 125, g: 85, b: 60 },   // Dark clay
    { r: 155, g: 110, b: 80 },  // Medium clay
  ],
  // Bark brown
  [
    { r: 75, g: 55, b: 40 },    // Dark bark
    { r: 105, g: 80, b: 60 },   // Medium bark
    { r: 135, g: 105, b: 80 },  // Light bark
    { r: 90, g: 68, b: 50 },    // Reddish bark
  ],
];

// Creative flower color palettes
const FLOWER_PALETTES: RGB[][] = [
  // Sunset blaze
  [
    { r: 255, g: 94, b: 77 },   // Coral
    { r: 255, g: 154, b: 0 },   // Orange
    { r: 255, g: 206, b: 84 },  // Golden yellow
    { r: 255, g: 64, b: 64 },   // Bright red
  ],
  // Ocean dreams
  [
    { r: 64, g: 224, b: 208 },  // Turquoise
    { r: 0, g: 191, b: 255 },   // Deep sky blue
    { r: 135, g: 206, b: 250 }, // Light sky blue
    { r: 100, g: 149, b: 237 }, // Cornflower
  ],
  // Midnight garden
  [
    { r: 148, g: 0, b: 211 },   // Dark violet
    { r: 186, g: 85, b: 211 },  // Medium orchid
    { r: 75, g: 0, b: 130 },    // Indigo
    { r: 238, g: 130, b: 238 }, // Violet
  ],
  // Cherry blossom
  [
    { r: 255, g: 183, b: 197 }, // Cherry pink
    { r: 255, g: 209, b: 220 }, // Light pink
    { r: 255, g: 105, b: 180 }, // Hot pink
    { r: 255, g: 228, b: 225 }, // Misty rose
  ],
  // Tropical paradise
  [
    { r: 255, g: 0, b: 127 },   // Rose
    { r: 0, g: 255, b: 127 },   // Spring green
    { r: 255, g: 215, b: 0 },   // Gold
    { r: 255, g: 69, b: 0 },    // Red orange
  ],
  // Nordic frost
  [
    { r: 200, g: 220, b: 255 }, // Ice blue
    { r: 230, g: 230, b: 250 }, // Lavender
    { r: 176, g: 224, b: 230 }, // Powder blue
    { r: 255, g: 250, b: 250 }, // Snow
  ],
  // Autumn harvest
  [
    { r: 255, g: 140, b: 0 },   // Dark orange
    { r: 178, g: 34, b: 34 },   // Firebrick
    { r: 218, g: 165, b: 32 },  // Goldenrod
    { r: 205, g: 92, b: 92 },   // Indian red
  ],
  // Electric neon
  [
    { r: 255, g: 0, b: 255 },   // Magenta
    { r: 0, g: 255, b: 255 },   // Cyan
    { r: 255, g: 255, b: 0 },   // Yellow
    { r: 50, g: 255, b: 50 },   // Neon green
  ],
  // Dusty rose
  [
    { r: 199, g: 144, b: 151 }, // Dusty rose
    { r: 219, g: 175, b: 181 }, // Light dusty rose
    { r: 179, g: 120, b: 130 }, // Dark dusty rose
    { r: 235, g: 200, b: 205 }, // Pale dusty rose
  ],
  // Royal jewels
  [
    { r: 128, g: 0, b: 128 },   // Purple
    { r: 0, g: 100, b: 0 },     // Dark green (emerald)
    { r: 139, g: 0, b: 0 },     // Dark red (ruby)
    { r: 0, g: 0, b: 139 },     // Dark blue (sapphire)
  ],
  // Candy pop
  [
    { r: 255, g: 145, b: 175 }, // Bubblegum pink
    { r: 150, g: 220, b: 255 }, // Baby blue
    { r: 255, g: 250, b: 150 }, // Lemon
    { r: 200, g: 255, b: 200 }, // Mint
  ],
  // Wildflower meadow
  [
    { r: 255, g: 182, b: 193 }, // Light pink
    { r: 230, g: 190, b: 255 }, // Mauve
    { r: 255, g: 218, b: 185 }, // Peach
    { r: 255, g: 255, b: 200 }, // Cream
  ],
];

// Season-based leaf palettes
const SEASON_LEAVES: Record<string, RGB[]> = {
  spring: [
    { r: 144, g: 238, b: 144 },
    { r: 152, g: 251, b: 152 },
  ],
  summer: [
    { r: 0, g: 128, b: 0 },
    { r: 34, g: 139, b: 34 },
  ],
  autumn: [
    { r: 255, g: 140, b: 0 },
    { r: 255, g: 69, b: 0 },
    { r: 178, g: 34, b: 34 },
  ],
  winter: [
    { r: 47, g: 79, b: 79 },
    { r: 112, g: 128, b: 144 },
  ],
};

// Plant segment for pre-allocation
interface PlantSegment {
  active: boolean;
  // Start point (for main stems) - branches recalculate from parent
  x0: number;
  y0: number;
  // Control point 1 (relative offset for branches)
  cx1: number;
  cy1: number;
  // Control point 2 (relative offset for branches)
  cx2: number;
  cy2: number;
  // End point (relative offset for branches)
  x1: number;
  y1: number;
  // Visual properties
  thickness: number;
  colorIndex: number;
  growthProgress: number; // 0 to 1
  hasFlower: boolean;
  flowerSize: number;
  flowerColorIndex: number;
  petalCount: number;
  // Branch info
  depth: number;
  growthSpeed: number;
  // Parent tracking for branches (to stay connected during wind)
  parentIndex: number; // -1 for main stems
  parentT: number; // Position along parent curve where branch connects
}

// Pre-allocated state
interface GardenState {
  segments: PlantSegment[];
  segmentCount: number;
  currentSeason: string;
  stemPalette: RGB[];
  flowerPalette: RGB[];
  leafPalette: RGB[];
  canvasWidth: number;
  canvasHeight: number;
  groundY: number;
  growthMultiplier: number;
  branchProbability: number;
  windPhase: number;
  windStrength: number;
  fillPercentage: number; // 0.2 to 0.8 - determines how much of canvas to fill
  baseFlowerSize: number; // Scaled based on fill percentage
  baseStemHeight: number; // Scaled based on fill percentage
}

const MAX_SEGMENTS = 100;
const MAX_DEPTH = 4;

let state: GardenState = {
  segments: [],
  segmentCount: 0,
  currentSeason: 'summer',
  stemPalette: STEM_PALETTES[0],
  flowerPalette: FLOWER_PALETTES[0],
  leafPalette: SEASON_LEAVES.summer,
  canvasWidth: 0,
  canvasHeight: 0,
  groundY: 0,
  growthMultiplier: 1,
  branchProbability: 0.3,
  windPhase: 0,
  windStrength: 0,
  fillPercentage: 0.5,
  baseFlowerSize: 10,
  baseStemHeight: 100,
};

function rgbToNumeric(color: RGB): number {
  return (color.r << 16) | (color.g << 8) | color.b;
}

function createSegment(): PlantSegment {
  return {
    active: false,
    x0: 0,
    y0: 0,
    cx1: 0,
    cy1: 0,
    cx2: 0,
    cy2: 0,
    x1: 0,
    y1: 0,
    thickness: 2,
    colorIndex: 0,
    growthProgress: 0,
    hasFlower: false,
    flowerSize: 0,
    flowerColorIndex: 0,
    petalCount: 5,
    depth: 0,
    growthSpeed: 1,
    parentIndex: -1,
    parentT: 0,
  };
}

function initializeMainStem(segment: PlantSegment, x: number, groundY: number): void {
  // Scale height based on fill percentage (larger fill = taller stems)
  const heightVariation = 0.4 + Math.random() * 0.6; // 40-100% of base height
  const height = state.baseStemHeight * heightVariation;
  const curve = (Math.random() - 0.5) * 60 * state.fillPercentage;

  segment.active = true;
  segment.x0 = x;
  segment.y0 = groundY;
  segment.x1 = x + curve;
  segment.y1 = groundY - height;

  // Control points for natural curve
  segment.cx1 = x + curve * 0.3;
  segment.cy1 = groundY - height * 0.3;
  segment.cx2 = x + curve * 0.7;
  segment.cy2 = groundY - height * 0.7;

  // Scale thickness based on fill percentage
  const thicknessScale = 0.5 + state.fillPercentage;
  segment.thickness = (3 + Math.random() * 3) * thicknessScale;
  segment.colorIndex = Math.floor(Math.random() * state.stemPalette.length);
  segment.growthProgress = 0;
  segment.hasFlower = Math.random() > 0.3;
  // Scale flower size based on fill percentage
  const flowerVariation = 0.6 + Math.random() * 0.8; // 60-140% of base size
  segment.flowerSize = state.baseFlowerSize * flowerVariation;
  segment.flowerColorIndex = Math.floor(Math.random() * state.flowerPalette.length);
  segment.petalCount = 5 + Math.floor(Math.random() * 8);
  segment.depth = 0;
  segment.growthSpeed = 0.5 + Math.random() * 1.5;
  segment.parentIndex = -1; // Main stems have no parent
  segment.parentT = 0;
}

function spawnBranch(parent: PlantSegment, parentIndex: number, t: number): PlantSegment | null {
  // Find inactive segment
  let branch: PlantSegment | null = null;
  for (let i = 0; i < MAX_SEGMENTS; i++) {
    if (!state.segments[i].active) {
      branch = state.segments[i];
      break;
    }
  }
  if (!branch) return null;

  // Branch direction (angle away from parent)
  const branchAngle = ((Math.random() - 0.5) * Math.PI) / 2;
  // Scale branch length based on fill percentage
  const branchLength = (30 + Math.random() * 50) * state.fillPercentage;

  // Store relative offsets from start point (will be applied dynamically)
  const endOffsetX = Math.sin(branchAngle) * branchLength;
  const endOffsetY = -Math.abs(Math.cos(branchAngle)) * branchLength;

  branch.active = true;
  // For branches, x0/y0 store relative offsets, actual position calculated from parent
  branch.x0 = 0; // Start at parent connection point
  branch.y0 = 0;
  branch.x1 = endOffsetX;
  branch.y1 = endOffsetY;

  // Control points as relative offsets for organic curve
  const midOffsetX = endOffsetX / 2 + (Math.random() - 0.5) * 20 * state.fillPercentage;
  branch.cx1 = midOffsetX;
  branch.cy1 = endOffsetY * 0.3;
  branch.cx2 = midOffsetX;
  branch.cy2 = endOffsetY * 0.7;

  branch.thickness = parent.thickness * 0.7;
  branch.colorIndex = parent.colorIndex;
  branch.growthProgress = 0;
  branch.hasFlower = Math.random() > 0.4;
  // Scale branch flower size based on fill percentage
  const flowerVariation = 0.5 + Math.random() * 0.6; // 50-110% of base size for branches
  branch.flowerSize = state.baseFlowerSize * 0.6 * flowerVariation;
  branch.flowerColorIndex = Math.floor(Math.random() * state.flowerPalette.length);
  branch.petalCount = 5 + Math.floor(Math.random() * 6);
  branch.depth = parent.depth + 1;
  branch.growthSpeed = parent.growthSpeed * 0.8;
  branch.parentIndex = parentIndex;
  branch.parentT = t;

  return branch;
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();

    state.canvasWidth = width;
    state.canvasHeight = height;
    state.groundY = height * 0.95;

    // Random fill percentage determines overall garden density and size (20-80%)
    state.fillPercentage = 0.2 + Math.random() * 0.6;

    // Calculate base sizes based on fill percentage and canvas size
    // At 80% fill, stems can be up to 70% of canvas height
    // At 20% fill, stems are around 25% of canvas height
    state.baseStemHeight = height * (0.25 + state.fillPercentage * 0.45);

    // Flower size scales with canvas and fill percentage
    const canvasScale = Math.min(width, height) / 400; // Normalize to ~400px reference
    state.baseFlowerSize = (8 + state.fillPercentage * 12) * canvasScale;

    // Get current season for leaves
    state.currentSeason = api.context.time.season();
    state.leafPalette = SEASON_LEAVES[state.currentSeason] || SEASON_LEAVES.summer;

    // Randomly select stem and flower palettes
    state.stemPalette = STEM_PALETTES[Math.floor(Math.random() * STEM_PALETTES.length)];
    state.flowerPalette = FLOWER_PALETTES[Math.floor(Math.random() * FLOWER_PALETTES.length)];

    // Random growth parameters
    state.growthMultiplier = 0.5 + Math.random() * 1.5;
    state.branchProbability = 0.1 + Math.random() * 0.3;
    state.windStrength = 0.5 + Math.random() * 1.5;

    // Pre-allocate segments
    state.segments = [];
    for (let i = 0; i < MAX_SEGMENTS; i++) {
      state.segments.push(createSegment());
    }

    // Stem count scales with fill percentage (more fill = more stems)
    const minStems = 2 + Math.floor(state.fillPercentage * 3);
    const maxExtraStems = Math.floor(state.fillPercentage * 6);
    const stemCount = minStems + Math.floor(Math.random() * maxExtraStems);
    state.segmentCount = 0;

    for (let i = 0; i < stemCount && state.segmentCount < MAX_SEGMENTS; i++) {
      const x = width * 0.1 + Math.random() * width * 0.8;
      initializeMainStem(state.segments[state.segmentCount], x, state.groundY);
      state.segmentCount++;
    }

    state.windPhase = 0;

    console.log(
      `[bezier-garden] Setup: ${stemCount} stems, fill: ${(state.fillPercentage * 100).toFixed(0)}%, season: ${state.currentSeason}`
    );
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const dt = frame.deltaTime / 1000;

    // Update wind
    state.windPhase += dt * 2;
    const wind = Math.sin(state.windPhase) * state.windStrength;

    // Update season if changed (only affects leaves, stem/flower palettes stay constant)
    const season = api.context.time.season();
    if (season !== state.currentSeason) {
      state.currentSeason = season;
      state.leafPalette = SEASON_LEAVES[season] || SEASON_LEAVES.summer;
    }

    // Process each segment
    for (let i = 0; i < MAX_SEGMENTS; i++) {
      const seg = state.segments[i];
      if (!seg.active) continue;

      // Grow segment
      if (seg.growthProgress < 1) {
        seg.growthProgress += dt * seg.growthSpeed * state.growthMultiplier;
        if (seg.growthProgress > 1) seg.growthProgress = 1;

        // Spawn branches as we grow (only for lower depth)
        if (
          seg.depth < MAX_DEPTH - 1 &&
          seg.growthProgress > 0.3 &&
          seg.growthProgress < 0.9 &&
          Math.random() < state.branchProbability * dt
        ) {
          spawnBranch(seg, i, seg.growthProgress);
        }
      }

      // Apply wind sway to control points (subtle)
      const windOffset = wind * (1 - seg.depth * 0.2) * 5;

      // Draw the bezier curve up to current growth
      const t = seg.growthProgress;
      if (t > 0) {
        // Calculate actual positions - different for main stems vs branches
        let startX: number, startY: number;
        let absX0: number, absY0: number;
        let absCx1: number, absCy1: number;
        let absCx2: number, absCy2: number;
        let absX1: number, absY1: number;

        if (seg.parentIndex >= 0) {
          // Branch: calculate start position from parent's current curve
          const parent = state.segments[seg.parentIndex];
          if (!parent.active) {
            // Parent no longer active, deactivate branch
            seg.active = false;
            continue;
          }

          const parentWindOffset = wind * (1 - parent.depth * 0.2) * 5;
          const pt = seg.parentT;

          // Calculate connection point on parent's wind-affected curve
          startX =
            Math.pow(1 - pt, 3) * parent.x0 +
            3 * Math.pow(1 - pt, 2) * pt * (parent.cx1 + parentWindOffset * 0.5) +
            3 * (1 - pt) * Math.pow(pt, 2) * (parent.cx2 + parentWindOffset) +
            Math.pow(pt, 3) * (parent.x1 + parentWindOffset * 1.5);
          startY =
            Math.pow(1 - pt, 3) * parent.y0 +
            3 * Math.pow(1 - pt, 2) * pt * parent.cy1 +
            3 * (1 - pt) * Math.pow(pt, 2) * parent.cy2 +
            Math.pow(pt, 3) * parent.y1;

          // Apply offsets to get absolute positions
          absX0 = startX;
          absY0 = startY;
          absCx1 = startX + seg.cx1 + windOffset * 0.5;
          absCy1 = startY + seg.cy1;
          absCx2 = startX + seg.cx2 + windOffset;
          absCy2 = startY + seg.cy2;
          absX1 = startX + seg.x1 + windOffset * 1.5;
          absY1 = startY + seg.y1;
        } else {
          // Main stem: use absolute coordinates
          absX0 = seg.x0;
          absY0 = seg.y0;
          absCx1 = seg.cx1 + windOffset * 0.5;
          absCy1 = seg.cy1;
          absCx2 = seg.cx2 + windOffset;
          absCy2 = seg.cy2;
          absX1 = seg.x1 + windOffset * 1.5;
          absY1 = seg.y1;
        }

        // Calculate current endpoint based on growth
        const currentX =
          Math.pow(1 - t, 3) * absX0 +
          3 * Math.pow(1 - t, 2) * t * absCx1 +
          3 * (1 - t) * Math.pow(t, 2) * absCx2 +
          Math.pow(t, 3) * absX1;
        const currentY =
          Math.pow(1 - t, 3) * absY0 +
          3 * Math.pow(1 - t, 2) * t * absCy1 +
          3 * (1 - t) * Math.pow(t, 2) * absCy2 +
          Math.pow(t, 3) * absY1;

        // Stem color
        const stemColor = state.stemPalette[seg.colorIndex % state.stemPalette.length];
        const stemColorNumeric = rgbToNumeric(stemColor);
        const alpha = 0.7 + seg.depth * 0.1;

        // Draw bezier stem
        const startPoint: Point = { x: absX0, y: absY0 };
        const cp1: Point = { x: absCx1, y: absCy1 };
        const cp2: Point = { x: absCx2, y: absCy2 };
        const endPoint: Point = { x: currentX, y: currentY };

        api.brush.bezier(startPoint, cp1, cp2, endPoint, {
          color: stemColorNumeric,
          alpha: alpha,
          width: seg.thickness * (1 - t * 0.3), // Taper towards end
          cap: 'round',
        });

        // Draw flower if fully grown
        if (seg.hasFlower && seg.growthProgress >= 0.95) {
          const flowerColor = state.flowerPalette[seg.flowerColorIndex % state.flowerPalette.length];
          const flowerColorNumeric = rgbToNumeric(flowerColor);
          const centerColor = 0xffdc64; // Yellow center { r: 255, g: 220, b: 100 }

          // Flower petals using small circles or polygons
          api.brush.pushMatrix();
          api.brush.translate(currentX, currentY);

          // Draw petals
          for (let p = 0; p < seg.petalCount; p++) {
            const petalAngle = (p / seg.petalCount) * Math.PI * 2 + state.windPhase * 0.1;
            const petalX = Math.cos(petalAngle) * seg.flowerSize * 0.6;
            const petalY = Math.sin(petalAngle) * seg.flowerSize * 0.6;

            api.brush.circle(petalX, petalY, seg.flowerSize * 0.4, {
              fill: flowerColorNumeric,
              alpha: 0.8,
            });
          }

          // Center
          api.brush.circle(0, 0, seg.flowerSize * 0.25, {
            fill: centerColor,
            alpha: 0.9,
          });

          api.brush.popMatrix();
        }

        // Add some leaves for depth > 0 segments
        if (seg.depth > 0 && seg.growthProgress > 0.5 && seg.thickness > 1.5) {
          const leafT = 0.4 + Math.random() * 0.3;
          const leafX =
            Math.pow(1 - leafT, 3) * absX0 +
            3 * Math.pow(1 - leafT, 2) * leafT * absCx1 +
            3 * (1 - leafT) * Math.pow(leafT, 2) * absCx2 +
            Math.pow(leafT, 3) * absX1;
          const leafY =
            Math.pow(1 - leafT, 3) * absY0 +
            3 * Math.pow(1 - leafT, 2) * leafT * absCy1 +
            3 * (1 - leafT) * Math.pow(leafT, 2) * absCy2 +
            Math.pow(leafT, 3) * absY1;

          const leafColor = state.leafPalette[Math.floor(Math.random() * state.leafPalette.length)];
          const leafColorNumeric = rgbToNumeric(leafColor);

          // Simple leaf as small ellipse, scaled with fill percentage
          if (frame.frameCount % 60 === i % 60) {
            // Only draw some leaves per frame to reduce overdraw
            const leafWidth = 4 * (0.5 + state.fillPercentage);
            const leafHeight = 8 * (0.5 + state.fillPercentage);
            api.brush.ellipse(leafX + wind * 2, leafY, leafWidth, leafHeight, {
              fill: leafColorNumeric,
              alpha: 0.6,
            });
          }
        }
      }
    }

    // Occasionally spawn new stems
    if (frame.frameCount % 300 === 0) {
      // Find inactive segment for new stem
      for (let i = 0; i < MAX_SEGMENTS; i++) {
        if (!state.segments[i].active) {
          const x = state.canvasWidth * 0.1 + Math.random() * state.canvasWidth * 0.8;
          initializeMainStem(state.segments[i], x, state.groundY);
          break;
        }
      }
    }
  },

  async teardown(): Promise<void> {
    for (let i = 0; i < MAX_SEGMENTS; i++) {
      state.segments[i].active = false;
    }
    state.segmentCount = 0;
    console.log('[bezier-garden] Teardown complete');
  },
};

registerActor(actor);

export default actor;
