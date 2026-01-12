/**
 * Synthwave Horizon Actor
 *
 * Creates retro synthwave aesthetics with:
 * - Gradient sky backgrounds
 * - Glowing sun/moon at the horizon
 * - Perspective grid floor scrolling toward viewer
 * - Multiple neon color palettes
 * - Optional mountain silhouettes and stars
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
  id: 'synthwave-horizon',
  name: 'Synthwave Horizon',
  description: 'Retro synthwave grid floor and gradient sky with neon aesthetics',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['synthwave', 'retro', '80s', 'grid', 'neon', 'background'],
  createdAt: new Date('2026-01-10'),
  preferredDuration: 60,
  requiredContexts: ['time'],
};

// Color type
interface RGB {
  r: number;
  g: number;
  b: number;
}

// Synthwave color palettes
interface SynthwavePalette {
  name: string;
  skyTop: RGB;
  skyBottom: RGB;
  sun: RGB;
  sunGlow: RGB;
  gridLines: RGB;
  gridGlow: RGB;
  horizon: RGB;
}

const PALETTES: SynthwavePalette[] = [
  // Classic Synthwave (pink/cyan)
  {
    name: 'Classic',
    skyTop: { r: 10, g: 0, b: 30 },
    skyBottom: { r: 60, g: 20, b: 80 },
    sun: { r: 255, g: 100, b: 150 },
    sunGlow: { r: 255, g: 50, b: 100 },
    gridLines: { r: 0, g: 255, b: 255 },
    gridGlow: { r: 255, g: 0, b: 255 },
    horizon: { r: 255, g: 0, b: 128 },
  },
  // Sunset Drive
  {
    name: 'Sunset',
    skyTop: { r: 20, g: 0, b: 40 },
    skyBottom: { r: 255, g: 100, b: 50 },
    sun: { r: 255, g: 200, b: 50 },
    sunGlow: { r: 255, g: 150, b: 0 },
    gridLines: { r: 255, g: 150, b: 50 },
    gridGlow: { r: 255, g: 50, b: 100 },
    horizon: { r: 255, g: 80, b: 0 },
  },
  // Midnight Blue
  {
    name: 'Midnight',
    skyTop: { r: 0, g: 0, b: 20 },
    skyBottom: { r: 0, g: 30, b: 80 },
    sun: { r: 150, g: 200, b: 255 },
    sunGlow: { r: 50, g: 100, b: 200 },
    gridLines: { r: 0, g: 150, b: 255 },
    gridGlow: { r: 100, g: 50, b: 255 },
    horizon: { r: 0, g: 100, b: 200 },
  },
  // Neon Green
  {
    name: 'Matrix',
    skyTop: { r: 0, g: 10, b: 0 },
    skyBottom: { r: 0, g: 40, b: 20 },
    sun: { r: 0, g: 255, b: 100 },
    sunGlow: { r: 0, g: 200, b: 50 },
    gridLines: { r: 0, g: 255, b: 100 },
    gridGlow: { r: 0, g: 255, b: 0 },
    horizon: { r: 0, g: 150, b: 50 },
  },
  // Vapor Purple
  {
    name: 'Vapor',
    skyTop: { r: 20, g: 0, b: 50 },
    skyBottom: { r: 100, g: 0, b: 150 },
    sun: { r: 255, g: 150, b: 255 },
    sunGlow: { r: 200, g: 50, b: 255 },
    gridLines: { r: 150, g: 100, b: 255 },
    gridGlow: { r: 255, g: 100, b: 200 },
    horizon: { r: 200, g: 0, b: 255 },
  },
  // Blood Moon
  {
    name: 'Blood Moon',
    skyTop: { r: 20, g: 0, b: 0 },
    skyBottom: { r: 80, g: 0, b: 20 },
    sun: { r: 255, g: 50, b: 50 },
    sunGlow: { r: 200, g: 0, b: 0 },
    gridLines: { r: 255, g: 50, b: 50 },
    gridGlow: { r: 255, g: 0, b: 100 },
    horizon: { r: 150, g: 0, b: 50 },
  },
  // Ice Cold
  {
    name: 'Ice',
    skyTop: { r: 0, g: 20, b: 40 },
    skyBottom: { r: 100, g: 150, b: 200 },
    sun: { r: 200, g: 240, b: 255 },
    sunGlow: { r: 100, g: 200, b: 255 },
    gridLines: { r: 150, g: 220, b: 255 },
    gridGlow: { r: 100, g: 180, b: 255 },
    horizon: { r: 150, g: 200, b: 255 },
  },
];

// Pattern variations
type PatternType = 'standard' | 'double-sun' | 'no-sun' | 'low-sun';

// Pre-allocated state (no allocations during update)
interface State {
  palette: SynthwavePalette;
  pattern: PatternType;
  gridSpeed: number;
  gridOffset: number;
  horizonY: number; // 0-1, where horizon sits
  sunSize: number;
  verticalLineCount: number;
  horizontalLineCount: number;
  showStars: boolean;
  starCount: number;
  // Pre-allocated star positions
  starX: Float32Array;
  starY: Float32Array;
  starBrightness: Float32Array;
  // Pre-allocated grid line Y positions
  gridLineY: Float32Array;
  // Animation
  pulsePhase: number;
  pulseSpeed: number;
}

// Seeded random for consistency within a cycle
function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

function rgbToNumeric(c: RGB): number {
  return (c.r << 16) | (c.g << 8) | c.b;
}

function lerpRGB(a: RGB, b: RGB, t: number): RGB {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

// Constants
const MAX_STARS = 100;
const MAX_HORIZONTAL_LINES = 30;

let state: State;

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const seed = Date.now();
    const rand = seededRandom(seed);

    // Select random palette and pattern
    const palette = PALETTES[Math.floor(rand() * PALETTES.length)];
    const patterns: PatternType[] = ['standard', 'double-sun', 'no-sun', 'low-sun'];
    const pattern = patterns[Math.floor(rand() * patterns.length)];

    // Randomize parameters
    const gridSpeed = 0.3 + rand() * 0.7; // 0.3 - 1.0
    const horizonY = 0.35 + rand() * 0.2; // 0.35 - 0.55 (how high the horizon is)
    const sunSize = 0.08 + rand() * 0.08; // 0.08 - 0.16 of canvas width
    const verticalLineCount = 10 + Math.floor(rand() * 15); // 10 - 25
    const horizontalLineCount = 12 + Math.floor(rand() * 10); // 12 - 22
    const showStars = rand() > 0.4;
    const starCount = showStars ? 30 + Math.floor(rand() * 50) : 0;
    const pulseSpeed = 1 + rand() * 2; // 1-3

    // Pre-allocate star positions
    const starX = new Float32Array(MAX_STARS);
    const starY = new Float32Array(MAX_STARS);
    const starBrightness = new Float32Array(MAX_STARS);
    for (let i = 0; i < starCount; i++) {
      starX[i] = rand();
      starY[i] = rand() * horizonY * 0.8; // Only in sky area
      starBrightness[i] = 0.3 + rand() * 0.7;
    }

    // Pre-allocate grid line Y positions
    const gridLineY = new Float32Array(MAX_HORIZONTAL_LINES);

    state = {
      palette,
      pattern,
      gridSpeed,
      gridOffset: 0,
      horizonY,
      sunSize,
      verticalLineCount,
      horizontalLineCount,
      showStars,
      starCount,
      starX,
      starY,
      starBrightness,
      gridLineY,
      pulsePhase: 0,
      pulseSpeed,
    };

    console.log(
      `[SynthwaveHorizon] Setup: palette=${palette.name}, pattern=${pattern}, ` +
        `speed=${gridSpeed.toFixed(2)}, horizon=${horizonY.toFixed(2)}`
    );
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const { brush, canvas } = api;
    const { width, height } = canvas.getSize();
    const { deltaTime } = frame;

    // Update animation state
    state.gridOffset += state.gridSpeed * deltaTime * 0.001;
    if (state.gridOffset > 1) state.gridOffset -= 1;
    state.pulsePhase += state.pulseSpeed * deltaTime * 0.001;

    const p = state.palette;
    const horizonPixelY = height * state.horizonY;

    // === SKY GRADIENT ===
    // Draw sky as horizontal bands for gradient effect
    // Extend beyond canvas edges to ensure full coverage
    const skyBands = 20;
    const bandHeight = horizonPixelY / skyBands;
    for (let i = 0; i < skyBands; i++) {
      const t = i / (skyBands - 1);
      const color = lerpRGB(p.skyTop, p.skyBottom, t);
      brush.rect(-10, i * bandHeight, width + 20, bandHeight + 2, {
        fill: rgbToNumeric(color),
        alpha: 0.9,
      });
    }

    // === STARS ===
    if (state.showStars) {
      const twinkle = Math.sin(state.pulsePhase * 3);
      for (let i = 0; i < state.starCount; i++) {
        const x = state.starX[i] * width;
        const y = state.starY[i] * height;
        const brightness = state.starBrightness[i] * (0.7 + 0.3 * twinkle);
        const size = 1 + brightness * 2;
        brush.circle(x, y, size, {
          fill: 0xffffff,
          alpha: brightness * 0.8,
        });
      }
    }

    // === SUN ===
    const sunRadius = width * state.sunSize;
    const sunX = width / 2;
    let sunY = horizonPixelY;

    if (state.pattern === 'low-sun') {
      sunY = horizonPixelY + sunRadius * 0.3;
    }

    if (state.pattern !== 'no-sun') {
      // Sun glow layers (outer to inner)
      const glowPulse = 1 + 0.1 * Math.sin(state.pulsePhase * 2);
      const glowLayers = 5;
      const sunGlowNumeric = rgbToNumeric(p.sunGlow);
      for (let i = glowLayers; i >= 0; i--) {
        const glowRadius = sunRadius * (1 + i * 0.4) * glowPulse;
        const glowAlpha = 0.1 / (i + 1);
        brush.circle(sunX, sunY, glowRadius, {
          fill: sunGlowNumeric,
          alpha: glowAlpha,
        });
      }

      // Main sun with horizontal stripe pattern (classic synthwave)
      const sunNumeric = rgbToNumeric(p.sun);
      const stripeCount = 6;
      const stripeHeight = (sunRadius * 2) / stripeCount;
      for (let i = 0; i < stripeCount; i++) {
        const stripeY = sunY - sunRadius + i * stripeHeight;
        // Only draw stripes above horizon
        if (stripeY + stripeHeight < horizonPixelY) {
          // Calculate intersection with sun circle
          const dy = Math.abs(stripeY + stripeHeight / 2 - sunY);
          if (dy < sunRadius) {
            const halfWidth = Math.sqrt(sunRadius * sunRadius - dy * dy);
            if (i % 2 === 0) {
              brush.rect(sunX - halfWidth, stripeY, halfWidth * 2, stripeHeight, {
                fill: sunNumeric,
                alpha: 0.95,
              });
            }
          }
        }
      }

      // Second sun for double-sun pattern
      if (state.pattern === 'double-sun') {
        const sun2X = width * 0.25;
        const sun2Radius = sunRadius * 0.5;
        const sun2Y = horizonPixelY - sun2Radius * 0.5;

        // Smaller glow
        for (let i = 3; i >= 0; i--) {
          const glowRadius = sun2Radius * (1 + i * 0.3);
          const glowAlpha = 0.08 / (i + 1);
          brush.circle(sun2X, sun2Y, glowRadius, {
            fill: sunGlowNumeric,
            alpha: glowAlpha,
          });
        }

        // Second sun body
        brush.circle(sun2X, sun2Y, sun2Radius, {
          fill: rgbToNumeric(lerpRGB(p.sun, p.sunGlow, 0.3)),
          alpha: 0.9,
        });
      }
    }

    // === HORIZON LINE ===
    // Extend beyond canvas edges to ensure full coverage
    const horizonGlow = 0.5 + 0.3 * Math.sin(state.pulsePhase);
    const horizonNumeric = rgbToNumeric(p.horizon);
    brush.line(-10, horizonPixelY, width + 10, horizonPixelY, {
      stroke: horizonNumeric,
      alpha: horizonGlow,
      strokeWidth: 3,
    });
    // Secondary glow line
    brush.line(-10, horizonPixelY + 1, width + 10, horizonPixelY + 1, {
      stroke: horizonNumeric,
      alpha: horizonGlow * 0.5,
      strokeWidth: 2,
    });

    // === GROUND (below horizon) ===
    // Extend beyond canvas edges to ensure full coverage
    brush.rect(-10, horizonPixelY, width + 20, height - horizonPixelY + 10, {
      fill: 'rgba(0, 0, 0, 0.95)',
    });

    // === PERSPECTIVE GRID ===
    const groundHeight = height - horizonPixelY;
    const vanishX = width / 2;
    const vanishY = horizonPixelY;

    // Vertical lines (converging to vanishing point)
    const vertCount = state.verticalLineCount;
    const gridLinesNumeric = rgbToNumeric(p.gridLines);
    for (let i = 0; i <= vertCount; i++) {
      const t = i / vertCount;
      const bottomX = t * width;

      // Calculate alpha based on distance from center
      const distFromCenter = Math.abs(t - 0.5) * 2;
      const lineAlpha = 0.4 + 0.4 * (1 - distFromCenter);

      brush.line(vanishX, vanishY, bottomX, height, {
        stroke: gridLinesNumeric,
        alpha: lineAlpha * 0.8,
        strokeWidth: 1.5,
      });
    }

    // Horizontal lines (perspective spacing)
    const horzCount = state.horizontalLineCount;
    for (let i = 0; i < horzCount; i++) {
      // Perspective: lines get closer together near horizon
      const t = (i + state.gridOffset) / horzCount;
      // Non-linear spacing for perspective
      const perspectiveT = t * t; // Quadratic for perspective effect
      const y = horizonPixelY + perspectiveT * groundHeight;

      // Skip if above horizon
      if (y < horizonPixelY) continue;

      // Alpha fades near horizon
      const fadeT = (y - horizonPixelY) / groundHeight;
      const horzAlpha = 0.3 + fadeT * 0.5;

      // Line width increases further from horizon
      const lineWidth = 1 + fadeT * 2;

      // Extend lines beyond canvas edges to ensure full coverage
      brush.line(-10, y, width + 10, y, {
        stroke: gridLinesNumeric,
        alpha: horzAlpha * 0.7,
        strokeWidth: lineWidth,
      });

      // Store for potential future use
      state.gridLineY[i] = y;
    }
  },

  async teardown(): Promise<void> {
    // State will be garbage collected
  },
};

// Register the actor
registerActor(actor);

export default actor;
