/**
 * Ink Bloom Actor
 *
 * Creates organic watercolor/ink drops that spread and bloom across the canvas.
 * Features soft edges, color blending, and meditative slow expansion.
 */

import type {
  Actor,
  ActorMetadata,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  BlendMode,
} from '@art/types';
import { registerActor } from '@art/actor-sdk';

const metadata: ActorMetadata = {
  id: 'ink-bloom',
  name: 'Ink Bloom',
  description: 'Organic watercolor ink drops that spread and blend across the canvas',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['watercolor', 'ink', 'organic', 'ambient', 'meditation'],
  createdAt: new Date('2026-01-10'),
  preferredDuration: 120,
  requiredContexts: ['audio'],
};

// Configuration
const MAX_BLOOMS = 12;
const MAX_PETALS_PER_BLOOM = 16;
const SPAWN_INTERVAL_MIN = 1.5;
const SPAWN_INTERVAL_MAX = 4.0;

// Color palettes - each has a theme for cohesive blooms
// Helper function to convert RGB to numeric
function rgbToNumeric(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}

const INK_PALETTES = [
  {
    name: 'Traditional',
    colors: [
      rgbToNumeric(20, 20, 40),      // Deep black
      rgbToNumeric(60, 40, 80),      // Purple-black
      rgbToNumeric(100, 60, 40),     // Sepia
      rgbToNumeric(40, 60, 80),      // Blue-gray
    ],
    blendMode: 'screen' as BlendMode,
  },
  {
    name: 'Neon',
    colors: [
      rgbToNumeric(255, 50, 150),    // Hot pink
      rgbToNumeric(50, 200, 255),    // Cyan
      rgbToNumeric(255, 200, 50),    // Yellow
      rgbToNumeric(150, 50, 255),    // Purple
    ],
    blendMode: 'add' as BlendMode,
  },
  {
    name: 'Earth',
    colors: [
      rgbToNumeric(139, 90, 43),     // Sienna
      rgbToNumeric(85, 107, 47),     // Olive
      rgbToNumeric(160, 120, 90),    // Tan
      rgbToNumeric(70, 90, 70),      // Forest
    ],
    blendMode: 'screen' as BlendMode,
  },
  {
    name: 'Ocean',
    colors: [
      rgbToNumeric(20, 80, 120),     // Deep blue
      rgbToNumeric(40, 120, 140),    // Teal
      rgbToNumeric(60, 150, 160),    // Aqua
      rgbToNumeric(100, 180, 180),   // Seafoam
    ],
    blendMode: 'screen' as BlendMode,
  },
  {
    name: 'Sunset',
    colors: [
      rgbToNumeric(200, 80, 50),     // Orange-red
      rgbToNumeric(220, 120, 60),    // Coral
      rgbToNumeric(180, 60, 100),    // Magenta
      rgbToNumeric(240, 160, 80),    // Gold
    ],
    blendMode: 'add' as BlendMode,
  },
];

interface Petal {
  angle: number;
  distance: number;
  size: number;
  wobble: number;
  wobbleSpeed: number;
}

interface Bloom {
  active: boolean;
  x: number;
  y: number;
  baseRadius: number;
  currentRadius: number;
  maxRadius: number;
  growthSpeed: number;
  color: number;  // Numeric color (0xRRGGBB)
  alpha: number;
  age: number;
  maxAge: number;
  petals: Petal[];
  petalCount: number;
  rotation: number;
  rotationSpeed: number;
}

interface InkState {
  blooms: Bloom[];
  width: number;
  height: number;
  palette: typeof INK_PALETTES[0];
  timeSinceSpawn: number;
  nextSpawnTime: number;
  time: number;
  glowTexture: string;  // Pre-rendered glow texture for performance
}

let state: InkState = {
  blooms: [],
  width: 0,
  height: 0,
  palette: INK_PALETTES[0],
  timeSinceSpawn: 0,
  nextSpawnTime: 0,
  time: 0,
  glowTexture: '',
};

/**
 * Create pre-rendered soft glow texture for ink blobs.
 * Called once in setup(), reused for all petal/bloom rendering via tinting.
 * Reduces multiple layered circles to single image calls.
 */
function createGlowTexture(): string {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  // Soft ink/watercolor gradient
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.6)');
  gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.25)');
  gradient.addColorStop(0.85, 'rgba(255, 255, 255, 0.08)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const dataUrl = canvas.toDataURL();

  // Clean up canvas
  canvas.width = 0;
  canvas.height = 0;

  return dataUrl;
}

function randomSpawnTime(): number {
  return SPAWN_INTERVAL_MIN + Math.random() * (SPAWN_INTERVAL_MAX - SPAWN_INTERVAL_MIN);
}

function spawnBloom(bloom: Bloom, width: number, height: number, palette: typeof INK_PALETTES[0]): void {
  bloom.active = true;

  // Spawn away from edges
  const margin = 60;
  bloom.x = margin + Math.random() * (width - margin * 2);
  bloom.y = margin + Math.random() * (height - margin * 2);

  bloom.baseRadius = 20 + Math.random() * 30;
  bloom.currentRadius = bloom.baseRadius * 0.2;
  bloom.maxRadius = bloom.baseRadius * (2 + Math.random() * 2);
  bloom.growthSpeed = 0.3 + Math.random() * 0.4;

  // Pick a color from palette
  bloom.color = palette.colors[Math.floor(Math.random() * palette.colors.length)];

  bloom.alpha = 0.6 + Math.random() * 0.3;
  bloom.age = 0;
  bloom.maxAge = 8 + Math.random() * 8;

  // Generate petals for organic shape
  bloom.petalCount = 6 + Math.floor(Math.random() * (MAX_PETALS_PER_BLOOM - 6));
  for (let i = 0; i < bloom.petalCount; i++) {
    const petal = bloom.petals[i];
    petal.angle = (i / bloom.petalCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
    petal.distance = 0.7 + Math.random() * 0.5;
    petal.size = 0.5 + Math.random() * 0.5;
    petal.wobble = Math.random() * Math.PI * 2;
    petal.wobbleSpeed = 0.5 + Math.random() * 1;
  }

  bloom.rotation = Math.random() * Math.PI * 2;
  bloom.rotationSpeed = (Math.random() - 0.5) * 0.1;
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();
    state.width = width;
    state.height = height;

    // Pre-render glow texture once
    state.glowTexture = createGlowTexture();

    // Random palette
    state.palette = INK_PALETTES[Math.floor(Math.random() * INK_PALETTES.length)];

    // Pre-allocate blooms
    state.blooms = [];
    for (let i = 0; i < MAX_BLOOMS; i++) {
      const petals: Petal[] = [];
      for (let p = 0; p < MAX_PETALS_PER_BLOOM; p++) {
        petals.push({ angle: 0, distance: 0, size: 0, wobble: 0, wobbleSpeed: 0 });
      }

      const bloom: Bloom = {
        active: false,
        x: 0, y: 0,
        baseRadius: 0, currentRadius: 0, maxRadius: 0,
        growthSpeed: 0,
        color: 0,
        alpha: 0,
        age: 0, maxAge: 0,
        petals,
        petalCount: 0,
        rotation: 0, rotationSpeed: 0,
      };
      state.blooms.push(bloom);
    }

    state.timeSinceSpawn = 0;
    state.nextSpawnTime = randomSpawnTime() * 0.3; // Quick first spawn
    state.time = 0;

    // Spawn a couple initial blooms
    const initialCount = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < initialCount; i++) {
      const bloom = state.blooms[i];
      spawnBloom(bloom, width, height, state.palette);
      bloom.age = Math.random() * 2; // Start partially grown
      bloom.currentRadius = bloom.baseRadius * (0.5 + Math.random() * 0.5);
    }

    console.log(`[ink-bloom] Setup: palette: ${state.palette.name}, blend: ${state.palette.blendMode}`);
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const dt = frame.deltaTime / 1000;
    state.time += dt;
    state.timeSinceSpawn += dt;

    const { width, height, blooms, palette } = state;

    // Audio reactive spawning
    const isBeat = api.context.audio.isBeat();
    if (isBeat && state.timeSinceSpawn > 0.5) {
      const bloom = blooms.find(b => !b.active);
      if (bloom) {
        spawnBloom(bloom, width, height, palette);
        state.timeSinceSpawn = 0;
        state.nextSpawnTime = randomSpawnTime();
      }
    }

    // Regular spawning
    if (state.timeSinceSpawn >= state.nextSpawnTime) {
      const bloom = blooms.find(b => !b.active);
      if (bloom) {
        spawnBloom(bloom, width, height, palette);
        state.timeSinceSpawn = 0;
        state.nextSpawnTime = randomSpawnTime();
      }
    }

    // Update and draw blooms
    for (const bloom of blooms) {
      if (!bloom.active) continue;

      bloom.age += dt;
      bloom.rotation += bloom.rotationSpeed * dt;

      // Growth phase (first half of life)
      const lifeProgress = bloom.age / bloom.maxAge;
      if (lifeProgress < 0.5) {
        const growthProgress = lifeProgress * 2;
        const targetRadius = bloom.baseRadius + (bloom.maxRadius - bloom.baseRadius) * growthProgress;
        bloom.currentRadius += (targetRadius - bloom.currentRadius) * bloom.growthSpeed * dt * 2;
      }

      // Fade phase (last quarter of life)
      let fadeAlpha = bloom.alpha;
      if (lifeProgress > 0.75) {
        fadeAlpha = bloom.alpha * (1 - (lifeProgress - 0.75) * 4);
      }

      // Despawn
      if (bloom.age >= bloom.maxAge) {
        bloom.active = false;
        continue;
      }

      // Draw bloom using pre-rendered glow texture
      // Reduces 4 layers x (petals + center) circles to single pass of images
      // Draw each petal with pre-rendered soft texture
      for (let p = 0; p < bloom.petalCount; p++) {
        const petal = bloom.petals[p];

        // Animate wobble
        petal.wobble += petal.wobbleSpeed * dt;
        const wobbleOffset = Math.sin(petal.wobble) * 0.1;

        const angle = bloom.rotation + petal.angle + wobbleOffset;
        const dist = bloom.currentRadius * petal.distance;
        const px = bloom.x + Math.cos(angle) * dist;
        const py = bloom.y + Math.sin(angle) * dist;
        // Size scaled to approximate the layered look (covers ~1.5x the original outer layer)
        const size = bloom.currentRadius * petal.size * 1.8;

        api.brush.image(state.glowTexture, px, py, {
          width: size,
          height: size,
          tint: bloom.color,
          alpha: fadeAlpha * 0.45,
          blendMode: palette.blendMode,
        });
      }

      // Central blob using pre-rendered texture
      const centerSize = bloom.currentRadius * 1.4;
      api.brush.image(state.glowTexture, bloom.x, bloom.y, {
        width: centerSize,
        height: centerSize,
        tint: bloom.color,
        alpha: fadeAlpha * 0.55,
        blendMode: palette.blendMode,
      });

      // Inner highlight using small white glow
      api.brush.image(state.glowTexture, bloom.x, bloom.y, {
        width: bloom.currentRadius * 0.5,
        height: bloom.currentRadius * 0.5,
        alpha: fadeAlpha * 0.35,
        blendMode: 'add',
      });
    }
  },

  async teardown(): Promise<void> {
    state.blooms = [];
    state.glowTexture = '';
    state.time = 0;
    console.log('[ink-bloom] Teardown complete');
  },
};

registerActor(actor);

export default actor;
