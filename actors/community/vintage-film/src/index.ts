/**
 * Vintage Film Projector Actor
 *
 * Creates a nostalgic 8mm/16mm film aesthetic with:
 * - Film grain and noise
 * - Vertical scratches and dust particles
 * - Sepia/Kodachrome/Vintage color grading
 * - Vignette darkening at edges
 * - Brightness flicker (old projector effect)
 * - Film sprocket holes on edges
 * - Random "film burn" overexposure patches
 *
 * Showcases unused filter APIs: sepia, colorMatrix, vignette, noise, brightness, roundRect
 */

import type {
  Actor,
  ActorMetadata,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ColorMatrix,
} from '@art/types';
import { COLOR_MATRICES } from '@art/types';
import { registerActor } from '@art/actor-sdk';

const metadata: ActorMetadata = {
  id: 'vintage-film',
  name: 'Vintage Film Projector',
  description: 'Nostalgic 8mm film aesthetic with grain, scratches, and vintage color grading',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['vintage', 'film', 'retro', 'nostalgic', 'filter'],
  createdAt: new Date('2026-01-10'),
  preferredDuration: 45,
  requiredContexts: ['time'],
};

// ============================================================
// Constants for pre-allocation
// ============================================================

const MAX_SCRATCHES = 8;
const MAX_DUST_PARTICLES = 15;
const MAX_BURN_PATCHES = 3;

// Film color grading presets
type ColorGrade = 'kodachrome' | 'vintage' | 'sepia' | 'polaroid';

const COLOR_GRADE_MATRICES: Record<ColorGrade, ColorMatrix> = {
  kodachrome: COLOR_MATRICES.kodachrome,
  vintage: COLOR_MATRICES.vintage,
  sepia: COLOR_MATRICES.sepia,
  polaroid: COLOR_MATRICES.polaroid,
};

const COLOR_GRADE_NAMES: ColorGrade[] = ['kodachrome', 'vintage', 'sepia', 'polaroid'];

// ============================================================
// State interfaces
// ============================================================

interface Scratch {
  active: boolean;
  x: number;
  startY: number;
  length: number;
  width: number;
  alpha: number;
  speed: number;
  lifetime: number;
  maxLifetime: number;
}

interface DustParticle {
  active: boolean;
  x: number;
  y: number;
  size: number;
  alpha: number;
  lifetime: number;
  maxLifetime: number;
}

interface BurnPatch {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  intensity: number;
  lifetime: number;
  maxLifetime: number;
}

interface VintageFilmState {
  // Color grading
  colorGrade: ColorGrade;
  colorGradeProgress: number; // For smooth transitions between grades

  // Vignette
  vignetteIntensity: number;
  vignettePhase: number;

  // Flicker
  flickerValue: number;
  nextFlickerTime: number;
  flickerDuration: number;

  // Noise
  noiseSeed: number;
  noiseIntensity: number;

  // Scratches pool
  scratches: Scratch[];

  // Dust particles pool
  dustParticles: DustParticle[];

  // Film burn patches pool
  burnPatches: BurnPatch[];

  // Sprocket animation
  sprocketOffset: number;
  sprocketSpeed: number;

  // Timing
  gradeChangeTimer: number;
  gradeChangeDuration: number;
}

// ============================================================
// State initialization
// ============================================================

let state: VintageFilmState = {
  colorGrade: 'kodachrome',
  colorGradeProgress: 0,
  vignetteIntensity: 0.4,
  vignettePhase: 0,
  flickerValue: 0,
  nextFlickerTime: 0,
  flickerDuration: 0,
  noiseSeed: 0,
  noiseIntensity: 0.08,
  scratches: [],
  dustParticles: [],
  burnPatches: [],
  sprocketOffset: 0,
  sprocketSpeed: 0.5,
  gradeChangeTimer: 0,
  gradeChangeDuration: 15000, // Change grade every 15 seconds
};

// ============================================================
// Helper functions
// ============================================================

function initScratch(scratch: Scratch, width: number, height: number): void {
  scratch.active = true;
  scratch.x = Math.random() * width;
  scratch.startY = -50;
  scratch.length = 100 + Math.random() * (height * 0.5);
  scratch.width = 0.5 + Math.random() * 1.5;
  scratch.alpha = 0.1 + Math.random() * 0.3;
  scratch.speed = 2 + Math.random() * 4;
  scratch.lifetime = 0;
  scratch.maxLifetime = 500 + Math.random() * 1500;
}

function initDustParticle(particle: DustParticle, width: number, height: number): void {
  particle.active = true;
  particle.x = Math.random() * width;
  particle.y = Math.random() * height;
  particle.size = 1 + Math.random() * 3;
  particle.alpha = 0.2 + Math.random() * 0.5;
  particle.lifetime = 0;
  particle.maxLifetime = 100 + Math.random() * 400;
}

function initBurnPatch(patch: BurnPatch, width: number, height: number): void {
  patch.active = true;
  // Burns tend to appear at edges
  const edge = Math.random();
  if (edge < 0.5) {
    patch.x = Math.random() < 0.5 ? width * 0.1 : width * 0.9;
    patch.y = Math.random() * height;
  } else {
    patch.x = Math.random() * width;
    patch.y = Math.random() < 0.5 ? height * 0.1 : height * 0.9;
  }
  patch.radius = 30 + Math.random() * 80;
  patch.intensity = 0;
  patch.lifetime = 0;
  patch.maxLifetime = 800 + Math.random() * 1200;
}

// ============================================================
// Actor implementation
// ============================================================

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();

    // Pick random initial color grade
    state.colorGrade = COLOR_GRADE_NAMES[Math.floor(Math.random() * COLOR_GRADE_NAMES.length)];
    state.colorGradeProgress = 0;

    // Initialize vignette
    state.vignetteIntensity = 0.35 + Math.random() * 0.15;
    state.vignettePhase = 0;

    // Initialize flicker
    state.flickerValue = 0;
    state.nextFlickerTime = 0;
    state.flickerDuration = 0;

    // Initialize noise
    state.noiseSeed = Math.floor(Math.random() * 10000);
    state.noiseIntensity = 0.06 + Math.random() * 0.04;

    // Pre-allocate scratches pool
    state.scratches = new Array(MAX_SCRATCHES);
    for (let i = 0; i < MAX_SCRATCHES; i++) {
      state.scratches[i] = {
        active: false,
        x: 0,
        startY: 0,
        length: 0,
        width: 0,
        alpha: 0,
        speed: 0,
        lifetime: 0,
        maxLifetime: 0,
      };
    }

    // Pre-allocate dust particles pool
    state.dustParticles = new Array(MAX_DUST_PARTICLES);
    for (let i = 0; i < MAX_DUST_PARTICLES; i++) {
      state.dustParticles[i] = {
        active: false,
        x: 0,
        y: 0,
        size: 0,
        alpha: 0,
        lifetime: 0,
        maxLifetime: 0,
      };
    }

    // Pre-allocate burn patches pool
    state.burnPatches = new Array(MAX_BURN_PATCHES);
    for (let i = 0; i < MAX_BURN_PATCHES; i++) {
      state.burnPatches[i] = {
        active: false,
        x: 0,
        y: 0,
        radius: 0,
        intensity: 0,
        lifetime: 0,
        maxLifetime: 0,
      };
    }

    // Initialize sprocket animation
    state.sprocketOffset = 0;
    state.sprocketSpeed = 0.3 + Math.random() * 0.4;

    // Initialize grade change timer
    state.gradeChangeTimer = 0;
    state.gradeChangeDuration = 12000 + Math.random() * 8000;

    // Spawn initial scratches
    for (let i = 0; i < 2; i++) {
      const scratch = state.scratches[i];
      initScratch(scratch, width, height);
    }

    // Spawn initial dust
    for (let i = 0; i < 5; i++) {
      const particle = state.dustParticles[i];
      initDustParticle(particle, width, height);
    }

    console.log(`[vintage-film] Setup complete with grade: ${state.colorGrade}`);
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const { width, height } = api.canvas.getSize();
    const dt = frame.deltaTime;

    // ============ Update timers ============

    state.gradeChangeTimer += dt;

    // Change color grade periodically
    if (state.gradeChangeTimer >= state.gradeChangeDuration) {
      state.gradeChangeTimer = 0;
      const currentIndex = COLOR_GRADE_NAMES.indexOf(state.colorGrade);
      const nextIndex = (currentIndex + 1) % COLOR_GRADE_NAMES.length;
      state.colorGrade = COLOR_GRADE_NAMES[nextIndex];
      state.gradeChangeDuration = 12000 + Math.random() * 8000;
    }

    // ============ Update flicker ============

    if (frame.time >= state.nextFlickerTime) {
      // Random flicker intensity
      state.flickerValue = (Math.random() - 0.5) * 0.15;
      state.flickerDuration = 30 + Math.random() * 70;
      state.nextFlickerTime = frame.time + state.flickerDuration + Math.random() * 500;
    }

    // Decay flicker
    state.flickerValue *= 0.95;

    // ============ Update vignette pulse ============

    state.vignettePhase += dt * 0.001;
    const vignettePulse = Math.sin(state.vignettePhase) * 0.05;

    // ============ Update noise seed ============

    state.noiseSeed = (state.noiseSeed + 1) % 10000;

    // ============ Update sprocket offset ============

    state.sprocketOffset += state.sprocketSpeed * dt * 0.1;
    if (state.sprocketOffset > 40) {
      state.sprocketOffset -= 40;
    }

    // ============ Update and spawn scratches ============

    const scratchSpawnChance = 0.01;
    for (let i = 0; i < state.scratches.length; i++) {
      const scratch = state.scratches[i];

      if (scratch.active) {
        scratch.lifetime += dt;
        scratch.startY += scratch.speed;

        // Fade out near end of lifetime
        const lifeProgress = scratch.lifetime / scratch.maxLifetime;
        if (lifeProgress > 0.7) {
          scratch.alpha *= 0.95;
        }

        // Deactivate when done
        if (scratch.lifetime >= scratch.maxLifetime || scratch.startY > height) {
          scratch.active = false;
        }
      } else if (Math.random() < scratchSpawnChance) {
        initScratch(scratch, width, height);
      }
    }

    // ============ Update and spawn dust particles ============

    const dustSpawnChance = 0.03;
    for (let i = 0; i < state.dustParticles.length; i++) {
      const particle = state.dustParticles[i];

      if (particle.active) {
        particle.lifetime += dt;

        // Flicker dust alpha
        particle.alpha = (0.2 + Math.random() * 0.4) * (1 - particle.lifetime / particle.maxLifetime);

        // Deactivate when done
        if (particle.lifetime >= particle.maxLifetime) {
          particle.active = false;
        }
      } else if (Math.random() < dustSpawnChance) {
        initDustParticle(particle, width, height);
      }
    }

    // ============ Update and spawn burn patches ============

    const burnSpawnChance = 0.002;
    for (let i = 0; i < state.burnPatches.length; i++) {
      const patch = state.burnPatches[i];

      if (patch.active) {
        patch.lifetime += dt;

        // Intensity ramps up then down
        const lifeProgress = patch.lifetime / patch.maxLifetime;
        if (lifeProgress < 0.3) {
          patch.intensity = lifeProgress / 0.3;
        } else if (lifeProgress > 0.7) {
          patch.intensity = (1 - lifeProgress) / 0.3;
        } else {
          patch.intensity = 1;
        }

        // Deactivate when done
        if (patch.lifetime >= patch.maxLifetime) {
          patch.active = false;
        }
      } else if (Math.random() < burnSpawnChance) {
        initBurnPatch(patch, width, height);
      }
    }

    // ============ DRAWING ============

    // Apply color grading filter (colorMatrix)
    const gradeMatrix = COLOR_GRADE_MATRICES[state.colorGrade];
    api.filter.colorMatrix(gradeMatrix);

    // Apply brightness flicker
    if (Math.abs(state.flickerValue) > 0.01) {
      api.filter.brightness(state.flickerValue);
    }

    // Apply vignette with subtle pulse
    const currentVignette = state.vignetteIntensity + vignettePulse;
    api.filter.vignette(currentVignette, 0.4);

    // Apply film grain noise
    api.filter.noise(state.noiseIntensity, state.noiseSeed);

    // ============ Draw scratches ============

    for (let i = 0; i < state.scratches.length; i++) {
      const scratch = state.scratches[i];
      if (!scratch.active) continue;

      // Draw vertical scratch line
      api.brush.line(
        scratch.x,
        scratch.startY,
        scratch.x + (Math.random() - 0.5) * 2, // Slight wobble
        scratch.startY + scratch.length,
        {
          color: 0xffffff,
          alpha: scratch.alpha,
          width: scratch.width,
        }
      );
    }

    // ============ Draw dust particles ============

    for (let i = 0; i < state.dustParticles.length; i++) {
      const particle = state.dustParticles[i];
      if (!particle.active) continue;

      api.brush.circle(particle.x, particle.y, particle.size, {
        fill: 0x28231e,
        alpha: particle.alpha,
      });
    }

    // ============ Draw burn patches ============

    for (let i = 0; i < state.burnPatches.length; i++) {
      const patch = state.burnPatches[i];
      if (!patch.active || patch.intensity < 0.1) continue;

      // Draw multiple layers for burn effect
      const alpha = patch.intensity * 0.6;

      // Outer glow (yellowish)
      api.brush.circle(patch.x, patch.y, patch.radius * 1.2, {
        fill: 0xffc864,
        alpha: alpha * 0.3,
        blendMode: 'add',
      });

      // Core (bright white)
      api.brush.circle(patch.x, patch.y, patch.radius * 0.6, {
        fill: 0xfffff0,
        alpha: alpha * 0.5,
        blendMode: 'add',
      });
    }

    // ============ Draw sprocket holes on edges ============

    const sprocketWidth = 12;
    const sprocketHeight = 8;
    const sprocketSpacing = 40;
    const sprocketMargin = 6;

    // Left edge sprockets
    for (let y = -state.sprocketOffset; y < height + sprocketSpacing; y += sprocketSpacing) {
      api.brush.roundRect(
        sprocketMargin,
        y,
        sprocketWidth,
        sprocketHeight,
        2,
        {
          fill: 0x000000,
          alpha: 0.8,
        }
      );
    }

    // Right edge sprockets
    for (let y = -state.sprocketOffset + sprocketSpacing / 2; y < height + sprocketSpacing; y += sprocketSpacing) {
      api.brush.roundRect(
        width - sprocketMargin - sprocketWidth,
        y,
        sprocketWidth,
        sprocketHeight,
        2,
        {
          fill: 0x000000,
          alpha: 0.8,
        }
      );
    }

    // ============ Draw film edge darkening ============

    // Top edge gradient effect
    for (let i = 0; i < 3; i++) {
      const edgeAlpha = 0.15 - i * 0.04;
      const y = i * 8;
      api.brush.rect(0, y, width, 15, {
        fill: 0x000000,
        alpha: edgeAlpha,
      });
    }

    // Bottom edge gradient effect
    for (let i = 0; i < 3; i++) {
      const edgeAlpha = 0.15 - i * 0.04;
      const y = height - 15 - i * 8;
      api.brush.rect(0, y, width, 15, {
        fill: 0x000000,
        alpha: edgeAlpha,
      });
    }
  },

  async teardown(): Promise<void> {
    // Reset state but keep pre-allocated arrays
    state.colorGrade = 'kodachrome';
    state.colorGradeProgress = 0;
    state.vignetteIntensity = 0.4;
    state.vignettePhase = 0;
    state.flickerValue = 0;
    state.nextFlickerTime = 0;
    state.flickerDuration = 0;
    state.noiseSeed = 0;
    state.noiseIntensity = 0.08;
    state.sprocketOffset = 0;
    state.sprocketSpeed = 0.5;
    state.gradeChangeTimer = 0;
    state.gradeChangeDuration = 15000;

    // Deactivate all pooled objects
    for (const scratch of state.scratches) {
      scratch.active = false;
    }
    for (const particle of state.dustParticles) {
      particle.active = false;
    }
    for (const patch of state.burnPatches) {
      patch.active = false;
    }

    console.log('[vintage-film] Teardown complete');
  },
};

// Self-register with the runtime
registerActor(actor);

export default actor;
