/**
 * Aurora Dreamscape Actor
 *
 * Creates ethereal northern lights with flowing curtains of light.
 * Uses quadratic bezier curves for smooth flowing shapes and
 * gaussian blur for dreamy glow effects.
 *
 * Showcases unused APIs: quadratic(), beginPath(), gaussianBlur(), saturate()
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
  id: 'aurora-dreamscape',
  name: 'Aurora Dreamscape',
  description: 'Ethereal northern lights with flowing curtains of light',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['aurora', 'dreamscape', 'ambient', 'ethereal', 'curves'],
  createdAt: new Date('2026-01-10'),
  preferredDuration: 60,
  requiredContexts: ['time'],
};

// ============================================================
// Constants
// ============================================================

const MAX_CURTAINS = 5;
const MAX_CONTROL_POINTS = 12; // Points per curtain
const MAX_STARS = 60;

// Aurora color palettes (RGB values)
interface RGB {
  r: number;
  g: number;
  b: number;
}

const AURORA_COLORS: RGB[][] = [
  // Classic green aurora
  [
    { r: 0, g: 255, b: 136 },
    { r: 57, g: 255, b: 170 },
    { r: 0, g: 200, b: 100 },
  ],
  // Blue-purple aurora
  [
    { r: 100, g: 150, b: 255 },
    { r: 150, g: 100, b: 255 },
    { r: 80, g: 120, b: 200 },
  ],
  // Pink-magenta aurora
  [
    { r: 255, g: 100, b: 180 },
    { r: 255, g: 150, b: 200 },
    { r: 200, g: 80, b: 150 },
  ],
  // Mixed aurora (green-blue-purple)
  [
    { r: 0, g: 255, b: 136 },
    { r: 100, g: 200, b: 255 },
    { r: 180, g: 100, b: 255 },
  ],
];

// ============================================================
// State interfaces
// ============================================================

interface AuroraCurtain {
  active: boolean;
  baseY: number; // Base vertical position (upper part of screen)
  amplitude: number; // How much the curtain waves vertically
  frequency: number; // Wave frequency
  speed: number; // Animation speed
  phase: number; // Current phase
  colorIndex: number; // Which color palette to use
  alpha: number; // Base opacity
  width: number; // Curtain width factor
  // Pre-allocated control points for quadratic curves
  controlPoints: Point[];
}

interface Star {
  active: boolean;
  x: number;
  y: number;
  size: number;
  brightness: number;
  twinkleSpeed: number;
  twinklePhase: number;
}

interface AuroraState {
  curtains: AuroraCurtain[];
  stars: Star[];
  globalHueShift: number;
  flowPhase: number;
  intensity: number; // Overall aurora intensity
  blurAmount: number;
  colorPaletteIndex: number;
  paletteTransitionProgress: number;
  glowTexture: string; // Pre-rendered glow texture for stars
}

// ============================================================
// State
// ============================================================

let state: AuroraState = {
  curtains: [],
  stars: [],
  globalHueShift: 0,
  flowPhase: 0,
  intensity: 1,
  blurAmount: 2,
  colorPaletteIndex: 0,
  paletteTransitionProgress: 0,
  glowTexture: '',
};

/**
 * Create pre-rendered soft glow texture for stars.
 * Called once in setup(), reused for all star glows via tinting.
 * Reduces 2 circle calls per bright star to 1 image + 1 circle.
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
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.15, 'rgba(255, 255, 255, 0.7)');
  gradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.3)');
  gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.1)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const dataUrl = canvas.toDataURL();

  // Clean up canvas
  canvas.width = 0;
  canvas.height = 0;

  return dataUrl;
}

// ============================================================
// Helper functions
// ============================================================

function lerpColor(a: RGB, b: RGB, t: number): RGB {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

function rgbToNumeric(color: RGB): number {
  return (color.r << 16) | (color.g << 8) | color.b;
}

function initCurtain(curtain: AuroraCurtain, index: number, height: number): void {
  curtain.active = true;
  // Curtains positioned in upper portion of screen
  curtain.baseY = height * (0.1 + index * 0.12);
  curtain.amplitude = 30 + Math.random() * 50;
  curtain.frequency = 0.003 + Math.random() * 0.004;
  curtain.speed = 0.3 + Math.random() * 0.5;
  curtain.phase = Math.random() * Math.PI * 2;
  curtain.colorIndex = Math.floor(Math.random() * 3);
  curtain.alpha = 0.3 + Math.random() * 0.3;
  curtain.width = 0.8 + Math.random() * 0.4;

  // Initialize control points
  for (let i = 0; i < MAX_CONTROL_POINTS; i++) {
    curtain.controlPoints[i] = { x: 0, y: 0 };
  }
}

function initStar(star: Star, width: number, height: number): void {
  star.active = true;
  star.x = Math.random() * width;
  star.y = Math.random() * height * 0.7; // Stars in upper 70% of screen
  star.size = 0.5 + Math.random() * 2;
  star.brightness = 0.3 + Math.random() * 0.7;
  star.twinkleSpeed = 1 + Math.random() * 3;
  star.twinklePhase = Math.random() * Math.PI * 2;
}

// ============================================================
// Actor implementation
// ============================================================

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();

    // Pre-render glow texture once
    state.glowTexture = createGlowTexture();

    // Initialize curtains pool
    state.curtains = new Array(MAX_CURTAINS);
    for (let i = 0; i < MAX_CURTAINS; i++) {
      state.curtains[i] = {
        active: false,
        baseY: 0,
        amplitude: 0,
        frequency: 0,
        speed: 0,
        phase: 0,
        colorIndex: 0,
        alpha: 0,
        width: 0,
        controlPoints: new Array(MAX_CONTROL_POINTS),
      };

      // Pre-allocate control points
      for (let j = 0; j < MAX_CONTROL_POINTS; j++) {
        state.curtains[i].controlPoints[j] = { x: 0, y: 0 };
      }

      // Activate 3-4 curtains initially
      if (i < 3 + Math.floor(Math.random() * 2)) {
        initCurtain(state.curtains[i], i, height);
      }
    }

    // Initialize stars pool
    state.stars = new Array(MAX_STARS);
    for (let i = 0; i < MAX_STARS; i++) {
      state.stars[i] = {
        active: false,
        x: 0,
        y: 0,
        size: 0,
        brightness: 0,
        twinkleSpeed: 0,
        twinklePhase: 0,
      };

      // Activate random subset of stars
      if (Math.random() < 0.7) {
        initStar(state.stars[i], width, height);
      }
    }

    // Initialize global state
    state.globalHueShift = 0;
    state.flowPhase = 0;
    state.intensity = 0.8 + Math.random() * 0.2;
    state.blurAmount = 1.5 + Math.random() * 1.5;
    state.colorPaletteIndex = Math.floor(Math.random() * AURORA_COLORS.length);
    state.paletteTransitionProgress = 0;

    console.log(`[aurora-dreamscape] Setup complete with ${state.curtains.filter(c => c.active).length} curtains`);
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const { width, height } = api.canvas.getSize();
    const dt = frame.deltaTime;
    const time = frame.time * 0.001;

    // ============ Update global state ============

    state.flowPhase += dt * 0.0003;
    state.globalHueShift += dt * 0.01;

    // Slowly transition color palettes
    state.paletteTransitionProgress += dt * 0.00005;
    if (state.paletteTransitionProgress >= 1) {
      state.paletteTransitionProgress = 0;
      state.colorPaletteIndex = (state.colorPaletteIndex + 1) % AURORA_COLORS.length;
    }

    // Intensity pulsing
    state.intensity = 0.7 + Math.sin(time * 0.2) * 0.2 + Math.sin(time * 0.5) * 0.1;

    // ============ Draw dark sky background ============

    // Linear gradient for dark sky (top to bottom)
    api.brush.rect(0, 0, width, height, {
      fill: {
        type: 'linear',
        x0: 0,
        y0: 0,
        x1: 0,
        y1: 1,
        stops: [
          { offset: 0, color: '#0a0a30' },
          { offset: 0.5, color: '#050515' },
          { offset: 1, color: '#020208' },
        ],
      },
    });

    // ============ Draw stars using pre-rendered glow texture ============

    for (let i = 0; i < state.stars.length; i++) {
      const star = state.stars[i];
      if (!star.active) continue;

      // Update twinkle
      star.twinklePhase += dt * star.twinkleSpeed * 0.003;
      const twinkle = 0.5 + Math.sin(star.twinklePhase) * 0.5;
      const currentBrightness = star.brightness * twinkle;

      // Draw star with soft glow using pre-rendered texture
      // For brighter/larger stars, use the texture for soft glow effect
      if (star.size > 1.2) {
        const glowSize = star.size * 6;
        api.brush.image(state.glowTexture, star.x, star.y, {
          width: glowSize,
          height: glowSize,
          tint: 0xc8dcff, // Soft blue-white tint
          alpha: currentBrightness * 0.5,
          blendMode: 'add',
        });
      }

      // Draw star core (small bright circle)
      api.brush.circle(star.x, star.y, star.size * 0.6, {
        fill: 0xffffff,
        alpha: currentBrightness,
      });
    }

    // ============ Draw aurora curtains ============

    const palette = AURORA_COLORS[state.colorPaletteIndex];

    for (let i = 0; i < state.curtains.length; i++) {
      const curtain = state.curtains[i];
      if (!curtain.active) continue;

      // Update curtain phase
      curtain.phase += curtain.speed * dt * 0.001;

      // Calculate control points for this curtain
      const numPoints = MAX_CONTROL_POINTS;
      const segmentWidth = width / (numPoints - 1);

      for (let j = 0; j < numPoints; j++) {
        const x = j * segmentWidth;

        // Create flowing wave motion
        const wave1 = Math.sin(x * curtain.frequency + curtain.phase) * curtain.amplitude;
        const wave2 = Math.sin(x * curtain.frequency * 0.5 + curtain.phase * 1.3 + state.flowPhase) * curtain.amplitude * 0.6;
        const wave3 = Math.sin(x * curtain.frequency * 2 + curtain.phase * 0.7) * curtain.amplitude * 0.3;

        curtain.controlPoints[j].x = x;
        curtain.controlPoints[j].y = curtain.baseY + wave1 + wave2 + wave3;
      }

      // Get colors for this curtain
      const colorIndex = (curtain.colorIndex + i) % palette.length;
      const nextColorIndex = (colorIndex + 1) % palette.length;
      const color1 = palette[colorIndex];
      const color2 = palette[nextColorIndex];

      // Draw curtain using quadratic bezier curves
      // Draw multiple passes with different alpha for depth
      for (let pass = 0; pass < 3; pass++) {
        const passAlpha = curtain.alpha * state.intensity * (1 - pass * 0.25);
        const passOffset = pass * 15; // Vertical offset for each pass

        // Interpolate color based on pass
        const passColor = lerpColor(color1, color2, pass / 3);

        // Draw connected quadratic curves
        for (let j = 0; j < numPoints - 2; j++) {
          const p0 = curtain.controlPoints[j];
          const p1 = curtain.controlPoints[j + 1];
          const p2 = curtain.controlPoints[j + 2];

          // Control point is the middle point
          const controlX = p1.x;
          const controlY = p1.y + passOffset;

          // Start and end are midpoints between consecutive points
          const startX = j === 0 ? p0.x : (p0.x + p1.x) / 2;
          const startY = j === 0 ? p0.y + passOffset : (p0.y + p1.y) / 2 + passOffset;
          const endX = j === numPoints - 3 ? p2.x : (p1.x + p2.x) / 2;
          const endY = j === numPoints - 3 ? p2.y + passOffset : (p1.y + p2.y) / 2 + passOffset;

          // Draw the quadratic curve
          api.brush.quadratic(
            { x: startX, y: startY },
            { x: controlX, y: controlY },
            { x: endX, y: endY },
            {
              color: rgbToNumeric(passColor),
              alpha: passAlpha,
              width: 8 + pass * 4,
              cap: 'round',
              join: 'round',
            }
          );
        }

        // Draw glow layer with wider stroke
        if (pass === 0) {
          for (let j = 0; j < numPoints - 2; j++) {
            const p0 = curtain.controlPoints[j];
            const p1 = curtain.controlPoints[j + 1];
            const p2 = curtain.controlPoints[j + 2];

            const controlX = p1.x;
            const controlY = p1.y + passOffset;

            const startX = j === 0 ? p0.x : (p0.x + p1.x) / 2;
            const startY = j === 0 ? p0.y + passOffset : (p0.y + p1.y) / 2 + passOffset;
            const endX = j === numPoints - 3 ? p2.x : (p1.x + p2.x) / 2;
            const endY = j === numPoints - 3 ? p2.y + passOffset : (p1.y + p2.y) / 2 + passOffset;

            api.brush.quadratic(
              { x: startX, y: startY },
              { x: controlX, y: controlY },
              { x: endX, y: endY },
              {
                color: rgbToNumeric(passColor),
                alpha: passAlpha * 0.3,
                width: 30,
                cap: 'round',
                join: 'round',
              }
            );
          }
        }
      }

      // Draw vertical "curtain rays" descending from the aurora
      const rayCount = 8;
      for (let r = 0; r < rayCount; r++) {
        const rayX = (r / rayCount) * width + (Math.sin(time + r) * 20);
        // Clamp rayPointIndex to valid range [0, numPoints - 1] to avoid negative indices
        const rayPointIndex = Math.max(0, Math.min(Math.floor((rayX / width) * (numPoints - 1)), numPoints - 1));
        const rayY = curtain.controlPoints[rayPointIndex].y;

        // Ray fades as it descends
        const rayHeight = 80 + Math.sin(time * 0.5 + r) * 40;
        const rayAlpha = curtain.alpha * state.intensity * 0.4;

        // Draw ray as solid color with alpha fade
        api.brush.rect(rayX - 2, rayY, 4, rayHeight, {
          fill: rgbToNumeric(color1),
          alpha: rayAlpha * 0.5,
          blendMode: 'add',
        });
      }
    }

    // ============ Apply filters (with performance optimization) ============
    //
    // Filter cost reference:
    // - gaussianBlur: HIGH cost (multi-pass GPU filter)
    // - saturate: LOW cost (simple color matrix)
    // - vignette: LOW cost (simple shader)
    //
    // Optimization: Only apply gaussianBlur when intensity is high enough
    // to be visually noticeable. This saves GPU cycles during low-intensity
    // phases while preserving the dreamy effect during peak aurora activity.

    // Only apply gaussian blur when aurora intensity is above threshold
    // (blur is barely visible at low intensities anyway)
    const BLUR_INTENSITY_THRESHOLD = 0.6;
    if (state.intensity >= BLUR_INTENSITY_THRESHOLD && state.blurAmount >= 1.0) {
      // Scale blur amount with intensity for smoother transitions
      const effectiveBlur = state.blurAmount * ((state.intensity - BLUR_INTENSITY_THRESHOLD) / (1 - BLUR_INTENSITY_THRESHOLD));
      api.filter.gaussianBlur(effectiveBlur, 3);
    }

    // Boost saturation slightly (LOW cost - always safe to apply)
    api.filter.saturate(1.2);

    // Add subtle vignette (LOW cost - always safe to apply)
    api.filter.vignette(0.25, 0.5);
  },

  async teardown(): Promise<void> {
    // Reset state
    state.globalHueShift = 0;
    state.flowPhase = 0;
    state.intensity = 1;
    state.blurAmount = 2;
    state.colorPaletteIndex = 0;
    state.paletteTransitionProgress = 0;
    state.glowTexture = '';

    // Deactivate all pooled objects
    for (const curtain of state.curtains) {
      curtain.active = false;
    }
    for (const star of state.stars) {
      star.active = false;
    }

    console.log('[aurora-dreamscape] Teardown complete');
  },
};

// Self-register with the runtime
registerActor(actor);

export default actor;
