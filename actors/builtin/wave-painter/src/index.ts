/**
 * Wave Painter Actor
 *
 * Creates flowing wave patterns with smooth color palette cycling.
 * A built-in actor demonstrating the actor API.
 */

import type {
  Actor,
  ActorMetadata,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';
import { registerActor } from '@art/actor-sdk';

// Actor metadata for gallery attribution
const metadata: ActorMetadata = {
  id: 'wave-painter',
  name: 'Wave Painter',
  description: 'Creates flowing wave patterns with smooth color palette cycling',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.1.0',
  tags: ['waves', 'ambient', 'audio-reactive', 'colorful'],
  createdAt: new Date('2026-01-09'),
  preferredDuration: 60,
  requiredContexts: ['time', 'audio'],
};

// Color type
interface RGB {
  r: number;
  g: number;
  b: number;
}

// Predefined color palettes for dark mode (bright colors)
const DARK_MODE_PALETTES: RGB[][] = [
  // Sunset
  [
    { r: 255, g: 94, b: 77 },
    { r: 255, g: 154, b: 86 },
    { r: 255, g: 206, b: 132 },
    { r: 182, g: 109, b: 164 },
  ],
  // Ocean
  [
    { r: 0, g: 63, b: 92 },
    { r: 47, g: 120, b: 152 },
    { r: 87, g: 199, b: 195 },
    { r: 188, g: 233, b: 233 },
  ],
  // Aurora
  [
    { r: 0, g: 255, b: 136 },
    { r: 0, g: 204, b: 204 },
    { r: 102, g: 51, b: 204 },
    { r: 255, g: 0, b: 128 },
  ],
  // Forest
  [
    { r: 27, g: 67, b: 50 },
    { r: 52, g: 101, b: 80 },
    { r: 82, g: 145, b: 110 },
    { r: 168, g: 198, b: 134 },
  ],
  // Neon
  [
    { r: 255, g: 0, b: 255 },
    { r: 0, g: 255, b: 255 },
    { r: 255, g: 255, b: 0 },
    { r: 255, g: 0, b: 128 },
  ],
  // Warm
  [
    { r: 255, g: 87, b: 51 },
    { r: 255, g: 153, b: 51 },
    { r: 255, g: 214, b: 51 },
    { r: 255, g: 128, b: 128 },
  ],
  // Cool
  [
    { r: 72, g: 61, b: 139 },
    { r: 65, g: 105, b: 225 },
    { r: 0, g: 191, b: 255 },
    { r: 127, g: 255, b: 212 },
  ],
  // Pastel
  [
    { r: 255, g: 179, b: 186 },
    { r: 255, g: 223, b: 186 },
    { r: 186, g: 255, b: 201 },
    { r: 186, g: 225, b: 255 },
  ],
];

// Predefined color palettes for light mode (darker, more saturated colors)
const LIGHT_MODE_PALETTES: RGB[][] = [
  // Sunset (deeper, richer tones)
  [
    { r: 180, g: 50, b: 30 },
    { r: 200, g: 100, b: 40 },
    { r: 180, g: 130, b: 60 },
    { r: 140, g: 60, b: 120 },
  ],
  // Ocean (deeper blues and teals)
  [
    { r: 0, g: 40, b: 70 },
    { r: 20, g: 80, b: 120 },
    { r: 40, g: 140, b: 140 },
    { r: 60, g: 120, b: 140 },
  ],
  // Aurora (rich jewel tones)
  [
    { r: 0, g: 160, b: 90 },
    { r: 0, g: 140, b: 140 },
    { r: 80, g: 40, b: 160 },
    { r: 180, g: 0, b: 100 },
  ],
  // Forest (deep greens)
  [
    { r: 15, g: 50, b: 35 },
    { r: 30, g: 75, b: 55 },
    { r: 50, g: 110, b: 75 },
    { r: 100, g: 140, b: 80 },
  ],
  // Neon (saturated but darker)
  [
    { r: 180, g: 0, b: 180 },
    { r: 0, g: 160, b: 160 },
    { r: 180, g: 160, b: 0 },
    { r: 200, g: 0, b: 100 },
  ],
  // Warm (deep warm tones)
  [
    { r: 180, g: 50, b: 20 },
    { r: 200, g: 100, b: 20 },
    { r: 180, g: 150, b: 20 },
    { r: 180, g: 80, b: 80 },
  ],
  // Cool (deep blues and purples)
  [
    { r: 50, g: 40, b: 110 },
    { r: 40, g: 70, b: 180 },
    { r: 0, g: 130, b: 200 },
    { r: 60, g: 160, b: 140 },
  ],
  // Pastel (muted, dusty tones for light backgrounds)
  [
    { r: 180, g: 100, b: 110 },
    { r: 180, g: 140, b: 100 },
    { r: 100, g: 160, b: 120 },
    { r: 100, g: 140, b: 180 },
  ],
];

// Constants for pre-allocation
const MAX_WAVE_SEGMENTS = 100;  // Based on ceil(1920 / 25) + some buffer

interface Wave {
  phase: number;
  frequency: number;
  amplitude: number;
  speed: number;
  y: number;
  colorOffset: number; // Each wave has a slight offset in the palette cycle
  // Pre-allocated points array for this wave
  points: { x: number; y: number }[];
}

// Internal state
interface WaveState {
  waves: Wave[];
  waveCount: number;
  palette: RGB[];
  paletteName: string;
  paletteIndex: number; // Store index to switch palettes on mode change
  colorProgress: number; // 0 to palette.length (cycles back)
  cycleSpeed: number; // How fast to cycle through colors
  audioEnergy: number;
  strokePoints: { x: number; y: number }[];  // Pre-allocated array for stroke calls
  isDarkMode: boolean; // Track current display mode
}

/**
 * Create a wave with pre-allocated points array.
 */
function createWave(y: number, colorOffset: number): Wave {
  const points: { x: number; y: number }[] = new Array(MAX_WAVE_SEGMENTS);
  for (let i = 0; i < MAX_WAVE_SEGMENTS; i++) {
    points[i] = { x: 0, y: 0 };
  }
  return {
    phase: Math.random() * Math.PI * 2,
    frequency: 0.005 + Math.random() * 0.01,
    amplitude: 30 + Math.random() * 50,
    speed: 0.5 + Math.random() * 1.5,
    y,
    colorOffset,
    points,
  };
}

let state: WaveState = {
  waves: [],
  waveCount: 0,
  palette: [],
  paletteName: '',
  paletteIndex: 0,
  colorProgress: 0,
  cycleSpeed: 0.05,
  audioEnergy: 0,
  strokePoints: [],
  isDarkMode: true,
};

/**
 * Linearly interpolate between two RGB colors.
 */
function lerpColor(a: RGB, b: RGB, t: number): RGB {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

/**
 * Get interpolated color from palette at a given progress (0 to palette.length).
 * Cycles smoothly: A -> B -> C -> A for a 3-color palette.
 */
function getPaletteColor(palette: RGB[], progress: number): RGB {
  const len = palette.length;
  // Normalize progress to 0..len range
  const normalizedProgress = ((progress % len) + len) % len;

  // Find the two colors to interpolate between
  const index = Math.floor(normalizedProgress);
  const nextIndex = (index + 1) % len;
  const t = normalizedProgress - index;

  return lerpColor(palette[index], palette[nextIndex], t);
}

/**
 * Convert RGB to numeric color (0xRRGGBB format).
 * Use with separate alpha parameter for better performance.
 */
function rgbToNumeric(color: RGB): number {
  return (color.r << 16) | (color.g << 8) | color.b;
}

// Palette names for logging
const PALETTE_NAMES = ['Sunset', 'Ocean', 'Aurora', 'Forest', 'Neon', 'Warm', 'Cool', 'Pastel'];

/**
 * The Wave Painter actor.
 */
const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { height } = api.canvas.getSize();

    // Detect display mode
    state.isDarkMode = api.context.display.isDarkMode();

    // Pick a random color palette (index is shared between dark/light palettes)
    state.paletteIndex = Math.floor(Math.random() * DARK_MODE_PALETTES.length);
    state.palette = state.isDarkMode
      ? DARK_MODE_PALETTES[state.paletteIndex]
      : LIGHT_MODE_PALETTES[state.paletteIndex];
    state.paletteName = PALETTE_NAMES[state.paletteIndex];

    // Pre-allocate stroke points array (avoid slice() allocations in update)
    state.strokePoints = new Array(MAX_WAVE_SEGMENTS);
    for (let i = 0; i < MAX_WAVE_SEGMENTS; i++) {
      state.strokePoints[i] = { x: 0, y: 0 };
    }

    // Create multiple wave layers with pre-allocated points arrays
    state.waveCount = 5;
    state.waves = [];

    for (let i = 0; i < state.waveCount; i++) {
      const y = (height / (state.waveCount + 1)) * (i + 1);
      const colorOffset = (i / state.waveCount) * state.palette.length * 0.5;
      state.waves.push(createWave(y, colorOffset));
    }

    state.colorProgress = 0;
    state.cycleSpeed = 0.02; // Slow, smooth cycling
    state.audioEnergy = 0;

    console.log(`[wave-painter] Setup complete with ${state.waveCount} waves, palette: ${state.paletteName}, mode: ${state.isDarkMode ? 'dark' : 'light'}`);
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const { width } = api.canvas.getSize();

    // Check for display mode changes and update palette accordingly
    const currentDarkMode = api.context.display.isDarkMode();
    if (currentDarkMode !== state.isDarkMode) {
      state.isDarkMode = currentDarkMode;
      state.palette = state.isDarkMode
        ? DARK_MODE_PALETTES[state.paletteIndex]
        : LIGHT_MODE_PALETTES[state.paletteIndex];
      console.log(`[wave-painter] Display mode changed to ${state.isDarkMode ? 'dark' : 'light'}`);
    }

    // Get audio reactivity
    const bassLevel = api.context.audio.isAvailable() ? api.context.audio.bass() : 0;
    const isBeat = api.context.audio.isAvailable() && api.context.audio.isBeat();

    // Smooth audio energy
    state.audioEnergy = state.audioEnergy * 0.9 + bassLevel * 0.1;

    // Update color progress - slowly cycle through the palette
    // Speed up slightly on beats for dynamic effect
    const speedMultiplier = isBeat ? 2 : 1;
    state.colorProgress += state.cycleSpeed * speedMultiplier * (frame.deltaTime / 16.67);

    // Draw each wave using pre-allocated points arrays
    for (let i = 0; i < state.waves.length; i++) {
      const wave = state.waves[i];

      // Update wave phase
      wave.phase += wave.speed * frame.deltaTime * 0.001;

      // Get interpolated color for this wave (numeric for performance)
      const waveColorProgress = state.colorProgress + wave.colorOffset;
      const color = getPaletteColor(state.palette, waveColorProgress);
      const numericColor = rgbToNumeric(color);

      // Audio-reactive amplitude boost
      const audioBoost = isBeat ? 1.5 : 1 + state.audioEnergy * 0.5;
      const currentAmplitude = wave.amplitude * audioBoost;

      // Generate wave points using pre-allocated array (no allocation)
      const segments = Math.min(Math.ceil(width / 25), MAX_WAVE_SEGMENTS - 1);
      const pointCount = segments + 1;

      for (let j = 0; j < pointCount; j++) {
        const x = (j / segments) * width;

        // Two sine waves for organic look
        const y1 = Math.sin(x * wave.frequency + wave.phase) * currentAmplitude;
        const y2 = Math.sin(x * wave.frequency * 0.5 + wave.phase * 1.3) * currentAmplitude * 0.5;

        // Copy directly to pre-allocated strokePoints (avoids slice allocation)
        state.strokePoints[j].x = x;
        state.strokePoints[j].y = wave.y + y1 + y2;
      }

      // Draw the wave using pre-allocated strokePoints (still need slice for API but reuses same array)
      // Note: This slice is unavoidable without API changes, but it's on a shared array
      const points = state.strokePoints.slice(0, pointCount);
      // Adjust alpha for visibility: higher in light mode where colors are darker
      const waveAlpha = state.isDarkMode ? 0.7 : 0.85;
      api.brush.stroke(points, {
        color: numericColor,
        alpha: waveAlpha,
        width: 3 + i * 2,
        smooth: true,
        cap: 'round',
        join: 'round',
      });

      // Draw glow effect on beat
      // Use 'screen' blend mode in light mode for better visibility
      if (isBeat && i === 0) {
        api.brush.stroke(points, {
          color: numericColor,
          alpha: state.isDarkMode ? 0.3 : 0.4,
          width: 15,
          smooth: true,
          blendMode: state.isDarkMode ? 'add' : 'multiply',
        });
      }
    }

    // Add subtle particles at wave intersections (reduced frequency for perf)
    if (frame.frameCount % 30 === 0) {
      for (let i = 0; i < state.waves.length - 1; i++) {
        const wave1 = state.waves[i];
        const wave2 = state.waves[i + 1];

        // Find approximate intersection points
        const checkPoints = 5;
        for (let j = 0; j < checkPoints; j++) {
          const x = (width / checkPoints) * (j + Math.random());

          const y1 = wave1.y + Math.sin(x * wave1.frequency + wave1.phase) * wave1.amplitude;
          const y2 = wave2.y + Math.sin(x * wave2.frequency + wave2.phase) * wave2.amplitude;

          // If waves are close, draw a particle
          if (Math.abs(y1 - y2) < 30) {
            const y = (y1 + y2) / 2;
            // Use interpolated color for particles too (numeric for performance)
            const particleColor = getPaletteColor(state.palette, state.colorProgress + 0.5);
            // Use 'add' blend mode for dark mode (brightens), 'multiply' for light mode (darkens)
            api.brush.circle(x, y, 5 + state.audioEnergy * 10, {
              fill: rgbToNumeric(particleColor),
              alpha: state.isDarkMode ? 0.5 : 0.6,
              blendMode: state.isDarkMode ? 'add' : 'multiply',
            });
          }
        }
      }
    }
  },

  async teardown(): Promise<void> {
    // Keep pre-allocated waves but reset state
    state.waveCount = 0;
    state.palette = [];
    state.paletteName = '';
    state.paletteIndex = 0;
    state.colorProgress = 0;
    state.cycleSpeed = 0.05;
    state.audioEnergy = 0;
    state.isDarkMode = true;
    console.log('[wave-painter] Teardown complete');
  },
};

// Self-register with the runtime
registerActor(actor);

export default actor;
