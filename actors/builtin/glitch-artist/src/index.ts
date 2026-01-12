/**
 * Glitch Artist Actor
 *
 * Creates digital glitch aesthetic effects:
 * - Pixelation blocks
 * - Chromatic aberration (RGB splitting)
 * - Scan lines
 * - Noise bursts
 * - Color inversion regions
 *
 * Uses filter APIs and canvas reading for reactive effects.
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
  id: 'glitch-artist',
  name: 'Glitch Artist',
  description: 'Digital glitch effects with pixelation and distortion',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['glitch', 'digital', 'distortion', 'retro', 'experimental'],
  createdAt: new Date('2026-01-10'),
  preferredDuration: 45,
  requiredContexts: [],
};

interface RGB {
  r: number;
  g: number;
  b: number;
}

// Glitch intensity presets
type GlitchIntensity = 'subtle' | 'medium' | 'heavy';

const INTENSITY_SETTINGS: Record<GlitchIntensity, {
  pixelSizes: number[];
  chromaticOffset: number;
  noiseAmount: number;
  glitchFrequency: number;
  scanLineOpacity: number;
}> = {
  subtle: {
    pixelSizes: [4, 8],
    chromaticOffset: 2,
    noiseAmount: 0.1,
    glitchFrequency: 0.02,
    scanLineOpacity: 0.05,
  },
  medium: {
    pixelSizes: [8, 16],
    chromaticOffset: 5,
    noiseAmount: 0.25,
    glitchFrequency: 0.05,
    scanLineOpacity: 0.1,
  },
  heavy: {
    pixelSizes: [16, 32],
    chromaticOffset: 10,
    noiseAmount: 0.4,
    glitchFrequency: 0.1,
    scanLineOpacity: 0.15,
  },
};

// Glitch event for pre-allocation
interface GlitchEvent {
  active: boolean;
  type: 'pixelate' | 'chromatic' | 'invert' | 'noise' | 'shift';
  x: number;
  y: number;
  width: number;
  height: number;
  intensity: number;
  duration: number;
  elapsed: number;
  seed: number;
}

// Scan line for pre-allocation
interface ScanLine {
  y: number;
  speed: number;
  thickness: number;
  opacity: number;
}

interface GlitchState {
  events: GlitchEvent[];
  scanLines: ScanLine[];
  intensity: GlitchIntensity;
  settings: typeof INTENSITY_SETTINGS.medium;
  canvasWidth: number;
  canvasHeight: number;
  globalChromaticPhase: number;
  noisePhase: number;
  dominantColors: RGB[];
  complexity: number;
  time: number;
  // Filter budget tracking for performance optimization
  filterBudgetUsed: number;
  // Async canvas analysis tracking
  analysisPending: boolean;
}

// ============================================================
// Filter Budget System
// ============================================================
//
// Filter cost reference (budget points):
// - pixelate: 1 (LOW cost)
// - noise: 1 (LOW cost)
// - invert: 1 (LOW cost - simple color operation)
// - hueRotate: 1 (LOW cost - color matrix)
// - chromaticAberration: 2 (MODERATE cost)
//
// Max 4 budget points per frame to stay within 3-5 filter limit
// and maintain 60fps performance.

const FILTER_COSTS: Record<string, number> = {
  pixelate: 1,
  chromatic: 2,
  invert: 1,
  noise: 1,
  hueRotate: 1,
};
const MAX_FILTER_BUDGET = 4;

const MAX_GLITCH_EVENTS = 10;
const MAX_SCAN_LINES = 5;

let state: GlitchState = {
  events: [],
  scanLines: [],
  intensity: 'medium',
  settings: INTENSITY_SETTINGS.medium,
  canvasWidth: 0,
  canvasHeight: 0,
  globalChromaticPhase: 0,
  noisePhase: 0,
  dominantColors: [],
  complexity: 0,
  time: 0,
  filterBudgetUsed: 0,
  analysisPending: false,
};

function rgbToNumeric(color: RGB): number {
  return (color.r << 16) | (color.g << 8) | color.b;
}

/**
 * Compute canvas complexity from snapshot data (edge detection).
 * Replaces synchronous getComplexity() to avoid GPU stalls.
 */
function computeComplexityFromSnapshot(
  data: Uint8Array,
  width: number,
  height: number
): number {
  const step = 10;
  let edgeCount = 0;
  let totalSamples = 0;
  const threshold = 30;

  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      const centerIdx = (y * width + x) * 4;
      const rightIdx = (y * width + (x + step)) * 4;
      const downIdx = ((y + step) * width + x) * 4;

      const centerLum = data[centerIdx] * 0.299 + data[centerIdx + 1] * 0.587 + data[centerIdx + 2] * 0.114;
      const rightLum = data[rightIdx] * 0.299 + data[rightIdx + 1] * 0.587 + data[rightIdx + 2] * 0.114;
      const downLum = data[downIdx] * 0.299 + data[downIdx + 1] * 0.587 + data[downIdx + 2] * 0.114;

      if (Math.abs(centerLum - rightLum) > threshold || Math.abs(centerLum - downLum) > threshold) {
        edgeCount++;
      }
      totalSamples++;
    }
  }

  return totalSamples > 0 ? edgeCount / totalSamples : 0;
}

/**
 * Compute dominant colors from snapshot data using color bucketing.
 * Replaces synchronous getDominantColors() to avoid GPU stalls.
 */
function computeDominantColorsFromSnapshot(
  data: Uint8Array,
  width: number,
  height: number,
  count: number
): RGB[] {
  const step = Math.max(1, Math.floor(Math.sqrt(width * height / 1000)));
  const buckets: Map<string, { r: number; g: number; b: number; count: number }> = new Map();

  // Sample pixels and quantize to buckets
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      // Quantize to reduce unique colors (divide by 32, multiply by 32)
      const r = Math.floor(data[idx] / 32) * 32;
      const g = Math.floor(data[idx + 1] / 32) * 32;
      const b = Math.floor(data[idx + 2] / 32) * 32;
      const key = `${r},${g},${b}`;

      const existing = buckets.get(key);
      if (existing) {
        existing.r += data[idx];
        existing.g += data[idx + 1];
        existing.b += data[idx + 2];
        existing.count++;
      } else {
        buckets.set(key, { r: data[idx], g: data[idx + 1], b: data[idx + 2], count: 1 });
      }
    }
  }

  // Sort by count and return top colors
  const sorted = Array.from(buckets.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, count);

  return sorted.map(b => ({
    r: Math.round(b.r / b.count),
    g: Math.round(b.g / b.count),
    b: Math.round(b.b / b.count),
  }));
}

function createGlitchEvent(): GlitchEvent {
  return {
    active: false,
    type: 'pixelate',
    x: 0,
    y: 0,
    width: 50,
    height: 50,
    intensity: 1,
    duration: 0.5,
    elapsed: 0,
    seed: 0,
  };
}

function createScanLine(): ScanLine {
  return {
    y: 0,
    speed: 100,
    thickness: 2,
    opacity: 0.1,
  };
}

function spawnGlitchEvent(): void {
  // Find inactive event
  let event: GlitchEvent | null = null;
  for (let i = 0; i < MAX_GLITCH_EVENTS; i++) {
    if (!state.events[i].active) {
      event = state.events[i];
      break;
    }
  }
  if (!event) return;

  // Random type
  const types: GlitchEvent['type'][] = ['pixelate', 'chromatic', 'invert', 'noise', 'shift'];
  event.type = types[Math.floor(Math.random() * types.length)];

  // Random region
  event.width = 30 + Math.random() * 150;
  event.height = 20 + Math.random() * 100;
  event.x = Math.random() * (state.canvasWidth - event.width);
  event.y = Math.random() * (state.canvasHeight - event.height);

  // Random properties
  event.intensity = 0.5 + Math.random() * 0.5;
  event.duration = 0.1 + Math.random() * 0.4;
  event.elapsed = 0;
  event.seed = Math.random() * 1000;
  event.active = true;
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();

    state.canvasWidth = width;
    state.canvasHeight = height;

    // Random intensity
    const intensities: GlitchIntensity[] = ['subtle', 'medium', 'heavy'];
    state.intensity = intensities[Math.floor(Math.random() * intensities.length)];
    state.settings = INTENSITY_SETTINGS[state.intensity];

    // Pre-allocate glitch events
    state.events = [];
    for (let i = 0; i < MAX_GLITCH_EVENTS; i++) {
      state.events.push(createGlitchEvent());
    }

    // Pre-allocate scan lines
    state.scanLines = [];
    for (let i = 0; i < MAX_SCAN_LINES; i++) {
      const line = createScanLine();
      line.y = Math.random() * height;
      line.speed = 50 + Math.random() * 150;
      line.thickness = 1 + Math.random() * 3;
      line.opacity = state.settings.scanLineOpacity * (0.5 + Math.random() * 0.5);
      state.scanLines.push(line);
    }

    state.globalChromaticPhase = 0;
    state.noisePhase = 0;
    state.dominantColors = [];
    state.complexity = 0;
    state.time = 0;
    state.analysisPending = false;

    console.log(`[glitch-artist] Setup: intensity=${state.intensity}`);
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const dt = frame.deltaTime / 1000;
    state.time += dt;

    // Reset filter budget at start of each frame
    state.filterBudgetUsed = 0;

    // Helper function to check if we can apply a filter within budget
    const canApplyFilter = (filterType: string): boolean => {
      const cost = FILTER_COSTS[filterType] || 1;
      return (state.filterBudgetUsed + cost) <= MAX_FILTER_BUDGET;
    };

    // Helper function to apply a filter and track budget
    const useFilterBudget = (filterType: string): boolean => {
      const cost = FILTER_COSTS[filterType] || 1;
      if ((state.filterBudgetUsed + cost) <= MAX_FILTER_BUDGET) {
        state.filterBudgetUsed += cost;
        return true;
      }
      return false;
    };

    // Update phases
    state.globalChromaticPhase += dt * 3;
    state.noisePhase += dt * 5;

    // Periodically analyze canvas (async to avoid GPU stalls)
    if (frame.frameCount % 60 === 0 && !state.analysisPending) {
      state.analysisPending = true;
      api.canvas.getCanvasSnapshotAsync(1.0).then(snapshot => {
        state.complexity = computeComplexityFromSnapshot(
          snapshot.data, snapshot.width, snapshot.height
        );
        state.dominantColors = computeDominantColorsFromSnapshot(
          snapshot.data, snapshot.width, snapshot.height, 3
        );
        state.analysisPending = false;
      }).catch(() => {
        state.complexity = 0.5;
        state.analysisPending = false;
      });
    }

    // Spawn new glitch events based on complexity and frequency
    const spawnChance = state.settings.glitchFrequency * (1 + state.complexity);
    if (Math.random() < spawnChance) {
      spawnGlitchEvent();
    }

    // Apply global subtle chromatic aberration (pulsing)
    // Only if within filter budget
    const globalChromatic = Math.sin(state.globalChromaticPhase) * state.settings.chromaticOffset * 0.3;
    if (Math.abs(globalChromatic) > 0.5 && canApplyFilter('chromatic')) {
      if (useFilterBudget('chromatic')) {
        api.filter.chromaticAberration(
          [globalChromatic, 0],
          [-globalChromatic, 0]
        );
      }
    }

    // Process active glitch events
    for (let i = 0; i < MAX_GLITCH_EVENTS; i++) {
      const event = state.events[i];
      if (!event.active) continue;

      event.elapsed += dt;

      // Check if expired
      if (event.elapsed >= event.duration) {
        event.active = false;
        continue;
      }

      // Calculate event progress (for fade in/out)
      const progress = event.elapsed / event.duration;
      const fadeMultiplier = progress < 0.2 ? progress / 0.2 : progress > 0.8 ? (1 - progress) / 0.2 : 1;
      const currentIntensity = event.intensity * fadeMultiplier;

      const region = {
        x: event.x,
        y: event.y,
        width: event.width,
        height: event.height,
      };

      // Apply filter effects only if within budget
      // This prevents exceeding the 3-5 filter limit per frame
      switch (event.type) {
        case 'pixelate': {
          if (useFilterBudget('pixelate')) {
            const pixelSize = state.settings.pixelSizes[Math.floor(Math.random() * state.settings.pixelSizes.length)];
            api.filter.pixelate(pixelSize * currentIntensity, region);
          }
          break;
        }

        case 'chromatic': {
          if (useFilterBudget('chromatic')) {
            const offset = state.settings.chromaticOffset * currentIntensity;
            api.filter.chromaticAberration(
              [offset, offset * 0.5],
              [-offset, -offset * 0.5]
            );
          }
          break;
        }

        case 'invert': {
          if (useFilterBudget('invert')) {
            api.filter.invert(currentIntensity, region);
          }
          break;
        }

        case 'noise': {
          if (useFilterBudget('noise')) {
            api.filter.noise(state.settings.noiseAmount * currentIntensity, event.seed, region);
          }
          break;
        }

        case 'shift': {
          // Draw colored shift rectangles (no filter, just drawing - always allowed)
          const shiftX = (Math.random() - 0.5) * 20 * currentIntensity;
          const shiftColor = state.dominantColors.length > 0
            ? state.dominantColors[Math.floor(Math.random() * state.dominantColors.length)]
            : { r: 255, g: 0, b: 255 };

          api.brush.rect(event.x + shiftX, event.y, event.width, event.height * 0.3, {
            fill: rgbToNumeric(shiftColor),
            alpha: 0.3 * currentIntensity,
            blendMode: 'difference',
          });
          break;
        }
      }
    }

    // Draw scan lines
    for (const line of state.scanLines) {
      line.y += line.speed * dt;
      if (line.y > state.canvasHeight) {
        line.y = -line.thickness;
      }

      // Glitchy scan line with random gaps
      const gapChance = 0.3;
      let x = 0;
      while (x < state.canvasWidth) {
        const segmentWidth = 20 + Math.random() * 100;
        if (Math.random() > gapChance) {
          api.brush.rect(x, line.y, segmentWidth, line.thickness, {
            fill: 0xffffff,
            alpha: line.opacity,
            blendMode: 'overlay',
          });
        }
        x += segmentWidth;
      }
    }

    // Occasional full-screen glitch burst (respects filter budget)
    // Only trigger if we have enough budget remaining for both filters
    if (Math.random() < 0.005 * (state.intensity === 'heavy' ? 3 : state.intensity === 'medium' ? 2 : 1)) {
      // Brief noise burst (if budget allows)
      if (useFilterBudget('noise')) {
        api.filter.noise(0.3, state.time * 1000);
      }

      // Random hue rotation (if budget allows)
      if (useFilterBudget('hueRotate')) {
        api.filter.hueRotate(Math.random() * 360);
      }
    }

    // Draw interference pattern (subtle vertical bars)
    if (frame.frameCount % 3 === 0) {
      const barCount = 5 + Math.floor(Math.random() * 10);
      for (let b = 0; b < barCount; b++) {
        const barX = Math.random() * state.canvasWidth;
        const barWidth = 1 + Math.random() * 3;
        const barHeight = state.canvasHeight * (0.1 + Math.random() * 0.3);
        const barY = Math.random() * (state.canvasHeight - barHeight);

        api.brush.rect(barX, barY, barWidth, barHeight, {
          fill: 0xc8c8c8,  // { r: 200, g: 200, b: 200 }
          alpha: 0.05,
          blendMode: 'overlay',
        });
      }
    }
  },

  async teardown(): Promise<void> {
    for (let i = 0; i < MAX_GLITCH_EVENTS; i++) {
      state.events[i].active = false;
    }
    state.scanLines = [];
    state.dominantColors = [];
    state.time = 0;
    console.log('[glitch-artist] Teardown complete');
  },
};

registerActor(actor);

export default actor;
