/**
 * Mediterranean Sea — Foreground Actor
 *
 * Layered ocean waves filling the lower half of the canvas with parallax
 * scrolling. Four wave layers from deep blue to turquoise with white foam
 * circles on crests and occasional sparkles on the water surface.
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
  id: 'mediterranean-sea',
  name: 'Mediterranean Sea',
  description: 'Layered ocean waves with foam and sparkles filling the lower canvas',
  author: {
    name: 'Joost de Valk',
    github: 'jdevalk',
  },
  version: '1.0.0',
  tags: ['foreground', 'italy', 'sea', 'waves', 'water'],
  createdAt: new Date('2026-03-21'),
  preferredDuration: 60,
  role: 'foreground',
  requiredContexts: ['time', 'display'],
};

// Wave layer configuration (back to front)
interface WaveLayer {
  baseY: number;       // fraction of canvas height where wave sits
  speed: number;       // horizontal scroll speed (pixels per second)
  amplitude: number;   // wave height in pixels
  freq: number;        // primary sine frequency
  freq2: number;       // secondary sine frequency
  lightColor: number;  // color in light mode
  darkColor: number;   // color in dark mode
  alpha: number;       // opacity
}

const WAVE_LAYERS: WaveLayer[] = [
  // Layer 0: deep blue back wave
  {
    baseY: 0.48, speed: 8, amplitude: 12,
    freq: 0.012, freq2: 0.005,
    lightColor: 0x1a4a6a, darkColor: 0x0e2a3e,
    alpha: 0.85,
  },
  // Layer 1: mid-blue wave
  {
    baseY: 0.54, speed: 14, amplitude: 14,
    freq: 0.015, freq2: 0.007,
    lightColor: 0x2268a0, darkColor: 0x153a5c,
    alpha: 0.8,
  },
  // Layer 2: turquoise wave
  {
    baseY: 0.60, speed: 20, amplitude: 16,
    freq: 0.018, freq2: 0.008,
    lightColor: 0x2a8aaa, darkColor: 0x1a5a6e,
    alpha: 0.75,
  },
  // Layer 3: near turquoise-green wave
  {
    baseY: 0.67, speed: 28, amplitude: 18,
    freq: 0.02, freq2: 0.01,
    lightColor: 0x4abacc, darkColor: 0x2a7a8a,
    alpha: 0.7,
  },
  // Layer 4: closest foam-tipped wave
  {
    baseY: 0.74, speed: 36, amplitude: 14,
    freq: 0.022, freq2: 0.012,
    lightColor: 0x6acade, darkColor: 0x3a8a9e,
    alpha: 0.65,
  },
];

// Foam bubble configuration
const MAX_FOAM_PER_LAYER = 12;
const FOAM_COLOR_LIGHT = 0xddeeff;
const FOAM_COLOR_DARK = 0x8ab8cc;

// Sparkle configuration
const MAX_SPARKLES = 20;

interface Sparkle {
  x: number;
  y: number;
  phase: number;     // controls blink timing
  speed: number;     // blink speed
  radius: number;
}

// Pre-allocated state
let canvasW = 0;
let canvasH = 0;
const STEP = 4;
const MAX_POINTS = Math.ceil(360 / STEP) + 4;
const layerPoints: Point[][] = [];
const sparkles: Sparkle[] = [];

// Pre-allocated foam positions (reused each frame, no allocs)
const foamX: number[] = new Array(MAX_FOAM_PER_LAYER);
const foamY: number[] = new Array(MAX_FOAM_PER_LAYER);
const foamR: number[] = new Array(MAX_FOAM_PER_LAYER);

function waveY(x: number, offset: number, layer: WaveLayer, h: number): number {
  const xOff = x + offset;
  const wave =
    Math.sin(xOff * layer.freq) * 0.7 +
    Math.sin(xOff * layer.freq2 + 1.5) * 0.3;
  return h * layer.baseY + wave * layer.amplitude;
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    // Pre-allocate point arrays for each wave layer
    layerPoints.length = 0;
    for (let i = 0; i < WAVE_LAYERS.length; i++) {
      const points: Point[] = [];
      for (let j = 0; j < MAX_POINTS; j++) {
        points.push({ x: 0, y: 0 });
      }
      layerPoints.push(points);
    }

    // Pre-allocate sparkles
    sparkles.length = 0;
    for (let i = 0; i < MAX_SPARKLES; i++) {
      sparkles.push({
        x: Math.random() * canvasW,
        y: canvasH * (0.45 + Math.random() * 0.15),
        phase: Math.random() * Math.PI * 2,
        speed: 1.5 + Math.random() * 2.0,
        radius: 1 + Math.random() * 2,
      });
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const tSec = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();

    // Draw each wave layer back to front
    for (let li = 0; li < WAVE_LAYERS.length; li++) {
      const layer = WAVE_LAYERS[li];
      const points = layerPoints[li];
      const offset = tSec * layer.speed;

      // Build wave profile
      let pointIndex = 0;
      for (let x = -STEP; x <= canvasW + STEP; x += STEP) {
        const y = waveY(x, offset, layer, canvasH);
        points[pointIndex].x = x;
        points[pointIndex].y = y;
        pointIndex++;
      }

      // Close polygon along the bottom
      points[pointIndex].x = canvasW + STEP;
      points[pointIndex].y = canvasH + 1;
      pointIndex++;
      points[pointIndex].x = -STEP;
      points[pointIndex].y = canvasH + 1;
      pointIndex++;

      const color = isDark ? layer.darkColor : layer.lightColor;
      api.brush.polygon(points.slice(0, pointIndex), {
        fill: color,
        alpha: layer.alpha,
        blendMode: 'normal',
      });

      // Draw foam circles along crests of the upper 3 layers
      if (li >= 2) {
        const foamColor = isDark ? FOAM_COLOR_DARK : FOAM_COLOR_LIGHT;
        const foamCount = MAX_FOAM_PER_LAYER;
        const spacing = canvasW / foamCount;

        for (let fi = 0; fi < foamCount; fi++) {
          // Distribute foam evenly with slight variation
          const rawX = (fi * spacing + offset * 0.6 + li * 37) % (canvasW + 40) - 20;
          const fy = waveY(rawX, offset, layer, canvasH);

          // Only draw if the wave is cresting (near local high points)
          const xOff = rawX + offset;
          const slopeApprox = Math.cos(xOff * layer.freq) * layer.freq;
          if (Math.abs(slopeApprox) < layer.freq * 0.6) {
            foamX[fi] = rawX;
            foamY[fi] = fy - 1;
            foamR[fi] = 2 + Math.sin(tSec * 1.5 + fi) * 1.2;

            api.brush.circle(foamX[fi], foamY[fi], foamR[fi], {
              fill: foamColor,
              alpha: 0.6 + Math.sin(tSec * 2 + fi * 0.8) * 0.15,
              blendMode: 'normal',
            });
          }
        }
      }
    }

    // Draw sparkles on the water surface
    for (let i = 0; i < MAX_SPARKLES; i++) {
      const s = sparkles[i];
      const blink = Math.sin(tSec * s.speed + s.phase);

      // Only show sparkle when the sine is above a threshold (intermittent glint)
      if (blink > 0.5) {
        const alpha = (blink - 0.5) * 2.0; // remap 0.5-1.0 -> 0.0-1.0
        api.brush.circle(s.x, s.y, s.radius, {
          fill: 0xffffff,
          alpha: alpha * 0.8,
          blendMode: 'add',
        });
      }

      // Slowly drift sparkle positions
      s.x += 0.1;
      if (s.x > canvasW + 5) {
        s.x = -5;
        s.y = canvasH * (0.45 + Math.random() * 0.15);
      }
    }
  },

  async teardown(): Promise<void> {
    canvasW = 0;
    canvasH = 0;
    layerPoints.length = 0;
    sparkles.length = 0;
  },
};

registerActor(actor);
export default actor;
