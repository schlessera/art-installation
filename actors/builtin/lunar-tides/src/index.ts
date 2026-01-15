/**
 * Lunar Tides Actor
 *
 * Moon-driven visualization with phase-accurate lunar orb,
 * tidal waves, and starfield for nighttime.
 * Uses moonPhase, isDaytime, arc, and filter APIs.
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
  id: 'lunar-tides',
  name: 'Lunar Tides',
  description: 'Moon phase visualization with tidal waves',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['moon', 'tides', 'night', 'celestial', 'ambient'],
  createdAt: new Date('2026-01-10'),
  preferredDuration: 90,
  requiredContexts: ['time'],
};

interface RGB {
  r: number;
  g: number;
  b: number;
}

// Color palettes - dark mode versions (light colors for dark backgrounds)
const COLOR_PALETTES_DARK: { name: string; water: RGB[]; sky: RGB; moon: RGB }[] = [
  {
    name: 'Ocean',
    water: [
      { r: 0, g: 105, b: 148 },
      { r: 0, g: 139, b: 139 },
      { r: 72, g: 209, b: 204 },
    ],
    sky: { r: 10, g: 25, b: 47 },
    moon: { r: 255, g: 255, b: 240 },
  },
  {
    name: 'Silver',
    water: [
      { r: 70, g: 80, b: 100 },
      { r: 100, g: 110, b: 130 },
      { r: 150, g: 160, b: 180 },
    ],
    sky: { r: 20, g: 20, b: 30 },
    moon: { r: 220, g: 220, b: 235 },
  },
  {
    name: 'Purple',
    water: [
      { r: 75, g: 0, b: 130 },
      { r: 138, g: 43, b: 226 },
      { r: 186, g: 85, b: 211 },
    ],
    sky: { r: 25, g: 10, b: 40 },
    moon: { r: 230, g: 220, b: 255 },
  },
  {
    name: 'Teal',
    water: [
      { r: 0, g: 128, b: 128 },
      { r: 32, g: 178, b: 170 },
      { r: 64, g: 224, b: 208 },
    ],
    sky: { r: 5, g: 20, b: 25 },
    moon: { r: 255, g: 250, b: 230 },
  },
];

// Color palettes - light mode versions (darker colors for light backgrounds)
const COLOR_PALETTES_LIGHT: { name: string; water: RGB[]; sky: RGB; moon: RGB }[] = [
  {
    name: 'Ocean',
    water: [
      { r: 0, g: 70, b: 110 },
      { r: 0, g: 90, b: 100 },
      { r: 30, g: 140, b: 140 },
    ],
    sky: { r: 220, g: 235, b: 250 },
    moon: { r: 60, g: 60, b: 50 },
  },
  {
    name: 'Silver',
    water: [
      { r: 50, g: 60, b: 80 },
      { r: 70, g: 80, b: 100 },
      { r: 100, g: 110, b: 130 },
    ],
    sky: { r: 235, g: 235, b: 240 },
    moon: { r: 80, g: 80, b: 90 },
  },
  {
    name: 'Purple',
    water: [
      { r: 55, g: 0, b: 100 },
      { r: 100, g: 30, b: 170 },
      { r: 130, g: 60, b: 160 },
    ],
    sky: { r: 245, g: 240, b: 250 },
    moon: { r: 70, g: 60, b: 90 },
  },
  {
    name: 'Teal',
    water: [
      { r: 0, g: 90, b: 90 },
      { r: 20, g: 120, b: 115 },
      { r: 40, g: 150, b: 140 },
    ],
    sky: { r: 240, g: 250, b: 250 },
    moon: { r: 50, g: 55, b: 45 },
  },
];

// Wave layer for pre-allocation
interface WaveLayer {
  baseY: number;
  amplitude: number;
  frequency: number;
  speed: number;
  phase: number;
  colorIndex: number;
  alpha: number;
}

// Star for pre-allocation
interface Star {
  x: number;
  y: number;
  size: number;
  brightness: number;
  twinkleSpeed: number;
  twinklePhase: number;
}

// Pre-allocated points array for wave drawing
interface TidesState {
  waves: WaveLayer[];
  waveCount: number;
  stars: Star[];
  starCount: number;
  palette: { name: string; water: RGB[]; sky: RGB; moon: RGB };
  paletteIndex: number;
  canvasWidth: number;
  canvasHeight: number;
  moonX: number;
  moonY: number;
  moonRadius: number;
  moonGlowIntensity: number;
  tideSpeed: number;
  time: number;
  wavePoints: { x: number; y: number }[];
  fillPoints: { x: number; y: number }[];
}

const MAX_WAVES = 8;
const MAX_STARS = 100;
const WAVE_SEGMENTS = 25;

let state: TidesState = {
  waves: [],
  waveCount: 0,
  stars: [],
  starCount: 0,
  palette: COLOR_PALETTES_DARK[0],
  paletteIndex: 0,
  canvasWidth: 0,
  canvasHeight: 0,
  moonX: 0,
  moonY: 0,
  moonRadius: 30,
  moonGlowIntensity: 0.5,
  tideSpeed: 1,
  time: 0,
  wavePoints: [],
  fillPoints: [],
};

function rgbToNumeric(color: RGB): number {
  return (color.r << 16) | (color.g << 8) | color.b;
}

function createWave(): WaveLayer {
  return {
    baseY: 0,
    amplitude: 10,
    frequency: 0.01,
    speed: 1,
    phase: 0,
    colorIndex: 0,
    alpha: 0.5,
  };
}

function createStar(): Star {
  return {
    x: 0,
    y: 0,
    size: 1,
    brightness: 1,
    twinkleSpeed: 1,
    twinklePhase: 0,
  };
}

function drawMoon(api: ActorUpdateAPI, phase: number, nightFactor: number, isDarkMode: boolean): void {
  const { moonX, moonY, moonRadius, moonGlowIntensity } = state;

  // Mode-aware blend mode for glow effects
  const glowBlendMode = isDarkMode ? 'add' : 'multiply';

  // Moon glow (multiple layers)
  const glowColor = state.palette.moon;
  const glowColorNumeric = rgbToNumeric(glowColor);
  for (let g = 4; g >= 0; g--) {
    const glowRadius = moonRadius * (1.5 + g * 0.5);
    // Light mode needs slightly lower alpha for glow
    const baseGlowAlpha = (moonGlowIntensity * nightFactor * 0.1) / (g + 1);
    const glowAlpha = isDarkMode ? baseGlowAlpha : baseGlowAlpha * 0.7;

    api.brush.circle(moonX, moonY, glowRadius, {
      fill: glowColorNumeric,
      alpha: glowAlpha,
      blendMode: glowBlendMode,
    });
  }

  // Full moon circle
  api.brush.circle(moonX, moonY, moonRadius, {
    fill: glowColorNumeric,
    alpha: 0.9 * nightFactor,
  });

  // Draw moon phase shadow using overlapping circle
  // phase: 0 = new moon (all shadow), 0.25 = first quarter, 0.5 = full, 0.75 = last quarter
  if (phase < 0.49 || phase > 0.51) {
    // Calculate shadow circle offset based on phase
    let shadowOffsetX: number;

    if (phase < 0.5) {
      // Waxing: shadow on left, moving right
      shadowOffsetX = -moonRadius * 2 * (0.5 - phase);
    } else {
      // Waning: shadow on right, moving left
      shadowOffsetX = moonRadius * 2 * (phase - 0.5);
    }

    // Shadow color: dark on dark mode, light on light mode (matches sky)
    const shadowColor = isDarkMode ? 0x0a0f1e : 0xf0f5fa;

    // Draw shadow as overlapping circle
    api.brush.circle(moonX + shadowOffsetX, moonY, moonRadius * 0.98, {
      fill: shadowColor,
      alpha: 0.9 * nightFactor,
    });
  }
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();

    state.canvasWidth = width;
    state.canvasHeight = height;

    // Random palette index (will select from appropriate palette array based on display mode)
    state.paletteIndex = Math.floor(Math.random() * COLOR_PALETTES_DARK.length);
    state.palette = COLOR_PALETTES_DARK[state.paletteIndex];

    // Moon position (upper portion of canvas)
    state.moonX = width * (0.3 + Math.random() * 0.4);
    state.moonY = height * (0.1 + Math.random() * 0.2);
    state.moonRadius = Math.min(width, height) * (0.08 + Math.random() * 0.05);
    state.moonGlowIntensity = 0.3 + Math.random() * 0.5;

    // Random tide speed
    state.tideSpeed = 0.5 + Math.random() * 1;

    // Pre-allocate waves (3-6 layers)
    state.waveCount = 3 + Math.floor(Math.random() * 4);
    state.waves = [];

    for (let i = 0; i < MAX_WAVES; i++) {
      state.waves.push(createWave());
    }

    // Initialize active waves
    for (let i = 0; i < state.waveCount; i++) {
      const wave = state.waves[i];
      const layerProgress = i / Math.max(state.waveCount - 1, 1);

      wave.baseY = height * (0.5 + layerProgress * 0.4);
      wave.amplitude = 10 + layerProgress * 20;
      wave.frequency = 0.008 + Math.random() * 0.008;
      wave.speed = 0.5 + Math.random() * 0.5;
      wave.phase = Math.random() * Math.PI * 2;
      wave.colorIndex = Math.min(i, state.palette.water.length - 1);
      wave.alpha = 0.3 + layerProgress * 0.4;
    }

    // Pre-allocate stars (20-80)
    state.starCount = 20 + Math.floor(Math.random() * 60);
    state.stars = [];

    for (let i = 0; i < MAX_STARS; i++) {
      state.stars.push(createStar());
    }

    // Initialize stars (only in upper portion)
    for (let i = 0; i < state.starCount; i++) {
      const star = state.stars[i];
      star.x = Math.random() * width;
      star.y = Math.random() * height * 0.5;
      star.size = 0.5 + Math.random() * 2;
      star.brightness = 0.3 + Math.random() * 0.7;
      star.twinkleSpeed = 1 + Math.random() * 3;
      star.twinklePhase = Math.random() * Math.PI * 2;
    }

    // Pre-allocate wave points array
    state.wavePoints = [];
    for (let i = 0; i <= WAVE_SEGMENTS; i++) {
      state.wavePoints.push({ x: 0, y: 0 });
    }

    // Pre-allocate fill points array (wave points + 2 bottom corners)
    state.fillPoints = [];
    for (let i = 0; i < WAVE_SEGMENTS + 3; i++) {
      state.fillPoints.push({ x: 0, y: 0 });
    }

    state.time = 0;

    console.log(
      `[lunar-tides] Setup: ${state.waveCount} waves, ${state.starCount} stars, palette: ${state.palette.name}`
    );
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const dt = frame.deltaTime / 1000;
    state.time += dt;

    // Get display mode
    const isDarkMode = api.context.display.isDarkMode();

    // Update palette based on display mode
    state.palette = isDarkMode
      ? COLOR_PALETTES_DARK[state.paletteIndex]
      : COLOR_PALETTES_LIGHT[state.paletteIndex];

    // Get moon phase and daytime status
    const moonPhase = api.context.time.moonPhase(); // 0 = new, 0.5 = full, 1 = new again
    const isDaytime = api.context.time.isDaytime();

    // Moon phase affects tide amplitude
    // Full moon (0.5) = highest tides, new moon (0, 1) = lower tides
    const tideMultiplier = 0.7 + Math.sin(moonPhase * Math.PI) * 0.6;

    // Visibility: moon and stars more visible at night
    const nightFactor = isDaytime ? 0.3 : 1.0;

    // Mode-aware blend mode for additive effects
    const glowBlendMode = isDarkMode ? 'add' : 'multiply';

    // Draw stars (only visible at night or twilight)
    if (!isDaytime) {
      // Star color: white for dark mode, dark gray for light mode
      const starColor = isDarkMode ? 0xffffff : 0x303030;

      for (let i = 0; i < state.starCount; i++) {
        const star = state.stars[i];

        // Twinkle effect
        const twinkle = Math.sin(state.time * star.twinkleSpeed + star.twinklePhase);
        const baseBrightness = star.brightness * (0.5 + twinkle * 0.5) * nightFactor;
        // Light mode needs slightly lower alpha
        const currentBrightness = isDarkMode ? baseBrightness : baseBrightness * 0.7;

        if (currentBrightness > 0.1) {
          api.brush.star(star.x, star.y, star.size * 1.5, star.size * 0.5, 4, {
            fill: starColor,
            alpha: currentBrightness,
            blendMode: glowBlendMode,
          });
        }
      }
    }

    // Draw moon with phase
    drawMoon(api, moonPhase, nightFactor, isDarkMode);

    // Draw tidal waves (back to front)
    for (let i = 0; i < state.waveCount; i++) {
      const wave = state.waves[i];

      // Update wave phase
      wave.phase += dt * wave.speed * state.tideSpeed;

      // Calculate wave amplitude based on moon phase
      const currentAmplitude = wave.amplitude * tideMultiplier;

      // Build wave points using pre-allocated array
      for (let s = 0; s <= WAVE_SEGMENTS; s++) {
        const x = (s / WAVE_SEGMENTS) * state.canvasWidth;
        const waveY =
          wave.baseY +
          Math.sin(x * wave.frequency + wave.phase) * currentAmplitude +
          Math.sin(x * wave.frequency * 2 + wave.phase * 1.5) * currentAmplitude * 0.3;

        state.wavePoints[s].x = x;
        state.wavePoints[s].y = waveY;
      }

      const waterColor = state.palette.water[wave.colorIndex];
      const waterColorNumeric = rgbToNumeric(waterColor);

      // Draw wave fill as polygon (wave line + bottom corners)
      // Copy wave points into pre-allocated fillPoints array
      for (let s = 0; s <= WAVE_SEGMENTS; s++) {
        state.fillPoints[s].x = state.wavePoints[s].x;
        state.fillPoints[s].y = state.wavePoints[s].y;
      }
      // Add bottom-right corner
      state.fillPoints[WAVE_SEGMENTS + 1].x = state.canvasWidth;
      state.fillPoints[WAVE_SEGMENTS + 1].y = state.canvasHeight;
      // Add bottom-left corner
      state.fillPoints[WAVE_SEGMENTS + 2].x = 0;
      state.fillPoints[WAVE_SEGMENTS + 2].y = state.canvasHeight;

      api.brush.polygon(state.fillPoints, {
        fill: waterColorNumeric,
        alpha: wave.alpha,
      });

      // Draw wave crest highlight
      api.brush.stroke(state.wavePoints.slice(0, WAVE_SEGMENTS + 1), {
        color: waterColorNumeric,
        alpha: Math.min(wave.alpha + 0.3, 1),
        width: 2,
        smooth: true,
      });

      // Add foam particles near wave crests
      if (frame.frameCount % 10 === i) {
        // Foam color: white for dark mode, dark blue-gray for light mode
        const foamColor = isDarkMode ? 0xffffff : 0x304050;

        for (let f = 0; f < 3; f++) {
          const foamX = Math.random() * state.canvasWidth;
          const foamIdx = Math.floor((foamX / state.canvasWidth) * WAVE_SEGMENTS);
          const foamY = state.wavePoints[Math.min(foamIdx, WAVE_SEGMENTS)].y - 2 - Math.random() * 5;

          const baseAlpha = 0.3 + Math.random() * 0.3;
          api.brush.circle(foamX, foamY, 1 + Math.random() * 2, {
            fill: foamColor,
            alpha: isDarkMode ? baseAlpha : baseAlpha * 0.7,
            blendMode: glowBlendMode,
          });
        }
      }
    }

    // Apply vignette for atmospheric effect
    api.filter.vignette(0.2 + nightFactor * 0.3, 0.6);
  },

  async teardown(): Promise<void> {
    state.waves = [];
    state.waveCount = 0;
    state.stars = [];
    state.starCount = 0;
    state.wavePoints = [];
    state.fillPoints = [];
    state.time = 0;
    console.log('[lunar-tides] Teardown complete');
  },
};

registerActor(actor);

export default actor;
