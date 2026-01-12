/**
 * Crystal Growth Actor
 *
 * Creates fractal ice crystals that grow from seed points like frost on glass.
 * Features hexagonal branching patterns with shimmering effects and prismatic glints.
 */

import type {
  Actor,
  ActorMetadata,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';
import { registerActor } from '@art/actor-sdk';

const metadata: ActorMetadata = {
  id: 'crystal-growth',
  name: 'Crystal Growth',
  description: 'Fractal ice crystals that grow like frost on a window',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['frost', 'ice', 'crystal', 'fractal', 'winter'],
  createdAt: new Date('2026-01-10'),
  preferredDuration: 90,
  requiredContexts: ['time'],
};

// Configuration
const MAX_SEEDS = 6;
const MAX_BRANCHES_PER_SEED = 150;
const MAX_DEPTH = 5;

// Crystal symmetry types
const SYMMETRY_TYPES = [
  { name: 'Hexagonal', arms: 6, angle: Math.PI / 3 },
  { name: 'Tetragonal', arms: 4, angle: Math.PI / 2 },
  { name: 'Trigonal', arms: 3, angle: (Math.PI * 2) / 3 },
];

// Color palettes
const CRYSTAL_PALETTES = [
  {
    name: 'Ice',
    colors: [
      [200, 230, 255],   // Light ice blue
      [150, 200, 240],   // Sky blue
      [180, 220, 255],   // Pale cyan
      [255, 255, 255],   // White
    ],
  },
  {
    name: 'Aurora',
    colors: [
      [100, 255, 200],   // Aqua
      [150, 200, 255],   // Light blue
      [200, 150, 255],   // Lavender
      [255, 200, 255],   // Pink
    ],
  },
  {
    name: 'Frost',
    colors: [
      [220, 240, 255],   // Near white
      [200, 220, 240],   // Gray blue
      [240, 250, 255],   // Ice white
      [180, 200, 220],   // Steel
    ],
  },
];

interface Branch {
  active: boolean;
  x: number;
  y: number;
  angle: number;
  length: number;
  targetLength: number;
  currentLength: number;
  thickness: number;
  depth: number;
  hasSpawned: boolean;
  alpha: number;
  shimmerPhase: number;
  colorIndex: number;
}

interface Seed {
  active: boolean;
  x: number;
  y: number;
  symmetry: typeof SYMMETRY_TYPES[0];
  growthRate: number;
  age: number;
  branches: Branch[];
  branchCount: number;
  nextBranchIdx: number;
}

interface CrystalState {
  seeds: Seed[];
  width: number;
  height: number;
  palette: typeof CRYSTAL_PALETTES[0];
  time: number;
  spawnTimer: number;
  spawnInterval: number;
}

let state: CrystalState = {
  seeds: [],
  width: 0,
  height: 0,
  palette: CRYSTAL_PALETTES[0],
  time: 0,
  spawnTimer: 0,
  spawnInterval: 3,
};

function rgbArrayToNumeric(color: number[]): number {
  return (color[0] << 16) | (color[1] << 8) | color[2];
}

function spawnSeed(seed: Seed, width: number, height: number): void {
  seed.active = true;

  // Spawn near edges or corners for frosted window effect
  const edge = Math.floor(Math.random() * 4);
  const margin = 30;
  const offset = Math.random() * 0.3;

  switch (edge) {
    case 0: // Top
      seed.x = margin + Math.random() * (width - margin * 2);
      seed.y = margin + offset * height * 0.2;
      break;
    case 1: // Bottom
      seed.x = margin + Math.random() * (width - margin * 2);
      seed.y = height - margin - offset * height * 0.2;
      break;
    case 2: // Left
      seed.x = margin + offset * width * 0.2;
      seed.y = margin + Math.random() * (height - margin * 2);
      break;
    case 3: // Right
      seed.x = width - margin - offset * width * 0.2;
      seed.y = margin + Math.random() * (height - margin * 2);
      break;
  }

  // Random symmetry
  seed.symmetry = SYMMETRY_TYPES[Math.floor(Math.random() * SYMMETRY_TYPES.length)];
  seed.growthRate = 30 + Math.random() * 40;
  seed.age = 0;
  seed.branchCount = 0;
  seed.nextBranchIdx = 0;

  // Reset all branches
  for (const branch of seed.branches) {
    branch.active = false;
  }

  // Create initial arms
  const baseAngle = Math.random() * Math.PI * 2;
  for (let i = 0; i < seed.symmetry.arms; i++) {
    if (seed.branchCount >= MAX_BRANCHES_PER_SEED) break;

    const branch = seed.branches[seed.branchCount];
    branch.active = true;
    branch.x = seed.x;
    branch.y = seed.y;
    branch.angle = baseAngle + i * seed.symmetry.angle;
    branch.length = 40 + Math.random() * 60;
    branch.targetLength = branch.length;
    branch.currentLength = 0;
    branch.thickness = 2.5 + Math.random() * 1.5;
    branch.depth = 0;
    branch.hasSpawned = false;
    branch.alpha = 0.8;
    branch.shimmerPhase = Math.random() * Math.PI * 2;
    branch.colorIndex = Math.floor(Math.random() * 4);

    seed.branchCount++;
  }
}

function spawnChildBranches(seed: Seed, parent: Branch): void {
  if (parent.depth >= MAX_DEPTH) return;

  const endX = parent.x + Math.cos(parent.angle) * parent.currentLength;
  const endY = parent.y + Math.sin(parent.angle) * parent.currentLength;

  // Number of children based on depth (fewer as we go deeper)
  const maxChildren = Math.max(1, 3 - parent.depth);
  const numChildren = 1 + Math.floor(Math.random() * maxChildren);

  for (let i = 0; i < numChildren; i++) {
    if (seed.branchCount >= MAX_BRANCHES_PER_SEED) return;

    // Branch angle - use symmetry angle with some variation
    const angleVariation = (Math.random() - 0.5) * 0.4;
    const branchDirection = Math.random() > 0.5 ? 1 : -1;
    const branchAngle = parent.angle + branchDirection * (seed.symmetry.angle * 0.5 + angleVariation);

    const branch = seed.branches[seed.branchCount];
    branch.active = true;
    branch.x = endX;
    branch.y = endY;
    branch.angle = branchAngle;
    branch.length = parent.length * (0.5 + Math.random() * 0.3);
    branch.targetLength = branch.length;
    branch.currentLength = 0;
    branch.thickness = parent.thickness * 0.7;
    branch.depth = parent.depth + 1;
    branch.hasSpawned = false;
    branch.alpha = parent.alpha * 0.9;
    branch.shimmerPhase = Math.random() * Math.PI * 2;
    branch.colorIndex = parent.colorIndex;

    seed.branchCount++;
  }
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();
    state.width = width;
    state.height = height;

    // Random palette
    state.palette = CRYSTAL_PALETTES[Math.floor(Math.random() * CRYSTAL_PALETTES.length)];

    // Pre-allocate seeds and branches
    state.seeds = [];
    for (let s = 0; s < MAX_SEEDS; s++) {
      const branches: Branch[] = [];
      for (let b = 0; b < MAX_BRANCHES_PER_SEED; b++) {
        branches.push({
          active: false,
          x: 0, y: 0, angle: 0,
          length: 0, targetLength: 0, currentLength: 0,
          thickness: 0, depth: 0, hasSpawned: false,
          alpha: 0, shimmerPhase: 0, colorIndex: 0,
        });
      }

      state.seeds.push({
        active: false,
        x: 0, y: 0,
        symmetry: SYMMETRY_TYPES[0],
        growthRate: 0,
        age: 0,
        branches,
        branchCount: 0,
        nextBranchIdx: 0,
      });
    }

    // Spawn initial seed
    spawnSeed(state.seeds[0], width, height);

    state.time = 0;
    state.spawnTimer = 0;
    state.spawnInterval = 4 + Math.random() * 3;

    console.log(`[crystal-growth] Setup: palette: ${state.palette.name}`);
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const dt = frame.deltaTime / 1000;
    state.time += dt;
    state.spawnTimer += dt;

    const { width, height, seeds, palette } = state;

    // Maybe spawn new seed
    if (state.spawnTimer >= state.spawnInterval) {
      const inactiveSeed = seeds.find(s => !s.active);
      if (inactiveSeed) {
        spawnSeed(inactiveSeed, width, height);
        state.spawnTimer = 0;
        state.spawnInterval = 4 + Math.random() * 3;
      }
    }

    // Update and draw each seed
    for (const seed of seeds) {
      if (!seed.active) continue;

      seed.age += dt;

      // Fade out old crystals
      const maxAge = 25;
      let seedAlpha = 1;
      if (seed.age > maxAge - 5) {
        seedAlpha = (maxAge - seed.age) / 5;
        if (seed.age >= maxAge) {
          seed.active = false;
          continue;
        }
      }

      // Update branches
      for (let b = 0; b < seed.branchCount; b++) {
        const branch = seed.branches[b];
        if (!branch.active) continue;

        // Grow branch
        if (branch.currentLength < branch.targetLength) {
          branch.currentLength += seed.growthRate * dt;
          if (branch.currentLength > branch.targetLength) {
            branch.currentLength = branch.targetLength;
          }
        }

        // Spawn children when grown enough
        if (!branch.hasSpawned && branch.currentLength >= branch.targetLength * 0.7) {
          branch.hasSpawned = true;
          spawnChildBranches(seed, branch);
        }

        // Update shimmer
        branch.shimmerPhase += dt * (2 + branch.depth * 0.5);

        // Draw branch
        const shimmer = 0.85 + Math.sin(branch.shimmerPhase) * 0.15;
        const alpha = branch.alpha * seedAlpha * shimmer;

        const startX = branch.x;
        const startY = branch.y;
        const endX = branch.x + Math.cos(branch.angle) * branch.currentLength;
        const endY = branch.y + Math.sin(branch.angle) * branch.currentLength;

        const color = palette.colors[branch.colorIndex];
        const colorNumeric = rgbArrayToNumeric(color);

        // Main crystal line
        api.brush.line(startX, startY, endX, endY, {
          color: colorNumeric,
          alpha: alpha,
          width: branch.thickness,
          blendMode: 'add',
        });

        // Glow effect
        if (branch.depth < 2) {
          api.brush.line(startX, startY, endX, endY, {
            color: colorNumeric,
            alpha: alpha * 0.2,
            width: branch.thickness * 3,
            blendMode: 'add',
          });
        }

        // Occasional prismatic glint at tip
        if (branch.currentLength >= branch.targetLength && Math.sin(branch.shimmerPhase * 3) > 0.9) {
          const glintHue = (state.time * 100 + branch.shimmerPhase * 50) % 360;
          // Approximate rainbow color (pre-computed numeric values)
          const glintColors = [
            0xff6464, 0xffc864, 0xffff64,
            0x64ff64, 0x64c8ff, 0x9664ff,
          ];
          const glintColor = glintColors[Math.floor(glintHue / 60) % 6];

          api.brush.circle(endX, endY, 3, {
            fill: glintColor,
            alpha: alpha * 0.6,
            blendMode: 'add',
          });
        }
      }
    }
  },

  async teardown(): Promise<void> {
    state.seeds = [];
    state.time = 0;
    console.log('[crystal-growth] Teardown complete');
  },
};

registerActor(actor);

export default actor;
