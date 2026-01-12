/**
 * Spirograph Dreams Actor
 *
 * Creates mathematical spirograph patterns (hypotrochoid/epitrochoid curves)
 * drawn in real-time. Features multiple layered patterns with evolving ratios,
 * color gradients along the path, and audio-reactive rotation.
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
  id: 'spirograph-dreams',
  name: 'Spirograph Dreams',
  description: 'Mathematical spirograph patterns with mesmerizing rotating curves',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['spirograph', 'mathematical', 'curves', 'hypnotic', 'geometry'],
  createdAt: new Date('2026-01-10'),
  preferredDuration: 90,
  requiredContexts: ['audio'],
};

// Configuration
const MAX_LAYERS = 4;
const POINTS_PER_LAYER = 600; // Circular buffer for trail
const TRAIL_SEGMENTS = 6; // Number of stroke batches per layer for draw call reduction
const MAX_POINTS_PER_SEGMENT = Math.ceil(POINTS_PER_LAYER / TRAIL_SEGMENTS) + 1;

// Interesting ratio presets that create beautiful patterns
const RATIO_PRESETS = [
  { R: 5, r: 3, d: 5 },    // Classic 5-pointed pattern
  { R: 7, r: 2, d: 4 },    // 7-pointed star
  { R: 8, r: 5, d: 6 },    // Complex weave
  { R: 3, r: 2, d: 3 },    // Simple trefoil
  { R: 9, r: 4, d: 7 },    // 9-pointed elaborate
  { R: 11, r: 7, d: 8 },   // Dense spiral
  { R: 6, r: 5, d: 4 },    // Gentle curves
  { R: 13, r: 5, d: 9 },   // 13-pointed star
];

// Color schemes
const COLOR_SCHEMES = [
  { name: 'Rainbow', hueStart: 0, hueRange: 360, saturation: 80, lightness: 60 },
  { name: 'Sunset', hueStart: 0, hueRange: 60, saturation: 90, lightness: 55 },
  { name: 'Ocean', hueStart: 180, hueRange: 60, saturation: 70, lightness: 50 },
  { name: 'Forest', hueStart: 90, hueRange: 50, saturation: 60, lightness: 45 },
  { name: 'Neon', hueStart: 280, hueRange: 100, saturation: 100, lightness: 55 },
  { name: 'Monochrome', hueStart: 200, hueRange: 0, saturation: 30, lightness: 70 },
];

interface TrailPoint {
  x: number;
  y: number;
  hue: number;
}

interface SpiroLayer {
  // Pattern parameters
  R: number;        // Fixed circle radius ratio
  r: number;        // Rolling circle radius ratio
  d: number;        // Pen distance from center ratio

  // Animation state
  theta: number;    // Current angle
  speed: number;    // Rotation speed
  direction: number; // 1 or -1

  // Scaling
  scale: number;

  // Trail circular buffer
  trail: TrailPoint[];
  trailHead: number;
  trailLength: number;

  // Color
  hueOffset: number;
  alpha: number;
}

interface SpiroState {
  layers: SpiroLayer[];
  layerCount: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  colorScheme: typeof COLOR_SCHEMES[0];
  time: number;
  baseSpeed: number;
  morphPhase: number;
  morphSpeed: number;
  // Pre-allocated array for stroke batching (avoids allocations in update)
  strokePoints: { x: number; y: number }[];
}

let state: SpiroState = {
  layers: [],
  layerCount: 0,
  width: 0,
  height: 0,
  centerX: 0,
  centerY: 0,
  colorScheme: COLOR_SCHEMES[0],
  time: 0,
  baseSpeed: 1,
  morphPhase: 0,
  morphSpeed: 0.1,
  strokePoints: [],
};

function hslToRgba(h: number, s: number, l: number, a: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let r = 0, g = 0, b = 0;
  const hMod = ((h % 360) + 360) % 360;

  if (hMod < 60) { r = c; g = x; b = 0; }
  else if (hMod < 120) { r = x; g = c; b = 0; }
  else if (hMod < 180) { r = 0; g = c; b = x; }
  else if (hMod < 240) { r = 0; g = x; b = c; }
  else if (hMod < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  return `rgba(${Math.round((r + m) * 255)}, ${Math.round((g + m) * 255)}, ${Math.round((b + m) * 255)}, ${a})`;
}

// Calculate point on hypotrochoid
function hypotrochoidPoint(R: number, r: number, d: number, theta: number, scale: number): { x: number; y: number } {
  const diff = R - r;
  const ratio = diff / r;

  const x = scale * (diff * Math.cos(theta) + d * Math.cos(ratio * theta));
  const y = scale * (diff * Math.sin(theta) - d * Math.sin(ratio * theta));

  return { x, y };
}

function initLayer(layer: SpiroLayer, layerIndex: number, maxRadius: number): void {
  // Pick a random preset
  const preset = RATIO_PRESETS[Math.floor(Math.random() * RATIO_PRESETS.length)];
  layer.R = preset.R;
  layer.r = preset.r;
  layer.d = preset.d;

  layer.theta = Math.random() * Math.PI * 2;
  layer.speed = 0.5 + Math.random() * 0.8;
  layer.direction = Math.random() > 0.5 ? 1 : -1;

  // Outer layers are larger, inner are smaller
  const sizeVariation = 0.6 + layerIndex * 0.15;
  layer.scale = maxRadius * sizeVariation / (layer.R - layer.r + layer.d);

  layer.trailHead = 0;
  layer.trailLength = 0;

  // Initialize trail buffer
  for (let i = 0; i < POINTS_PER_LAYER; i++) {
    layer.trail[i].x = 0;
    layer.trail[i].y = 0;
    layer.trail[i].hue = 0;
  }

  layer.hueOffset = layerIndex * 90;
  layer.alpha = 0.7 - layerIndex * 0.1;
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();
    state.width = width;
    state.height = height;
    state.centerX = width / 2;
    state.centerY = height / 2;

    // Random color scheme
    state.colorScheme = COLOR_SCHEMES[Math.floor(Math.random() * COLOR_SCHEMES.length)];

    // Random morphing speed
    state.morphSpeed = 0.05 + Math.random() * 0.1;

    // Random base speed
    state.baseSpeed = 0.8 + Math.random() * 0.6;

    // Random layer count (2-4)
    state.layerCount = 2 + Math.floor(Math.random() * (MAX_LAYERS - 1));

    const maxRadius = Math.min(width, height) * 0.4;

    // Pre-allocate layers
    state.layers = [];
    for (let i = 0; i < state.layerCount; i++) {
      const trail: TrailPoint[] = [];
      for (let p = 0; p < POINTS_PER_LAYER; p++) {
        trail.push({ x: 0, y: 0, hue: 0 });
      }

      const layer: SpiroLayer = {
        R: 0, r: 0, d: 0,
        theta: 0, speed: 0, direction: 1,
        scale: 0,
        trail,
        trailHead: 0,
        trailLength: 0,
        hueOffset: 0,
        alpha: 0,
      };

      initLayer(layer, i, maxRadius);
      state.layers.push(layer);
    }

    state.time = 0;
    state.morphPhase = 0;

    // Pre-allocate stroke points array for batched drawing
    state.strokePoints = new Array(MAX_POINTS_PER_SEGMENT);
    for (let i = 0; i < MAX_POINTS_PER_SEGMENT; i++) {
      state.strokePoints[i] = { x: 0, y: 0 };
    }

    console.log(`[spirograph-dreams] Setup: ${state.layerCount} layers, scheme: ${state.colorScheme.name}`);
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const dt = frame.deltaTime / 1000;
    state.time += dt;
    state.morphPhase += state.morphSpeed * dt;

    const { centerX, centerY, layers, colorScheme } = state;

    // Audio reactivity - speed boost on beat
    const isBeat = api.context.audio.isBeat();
    const bass = api.context.audio.bass();
    const speedMultiplier = 1 + (isBeat ? 0.5 : 0) + bass * 0.3;

    // Update and draw each layer
    for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
      const layer = layers[layerIdx];

      // Update theta
      const layerSpeed = layer.speed * state.baseSpeed * speedMultiplier;
      layer.theta += layerSpeed * layer.direction * dt;

      // Slight morphing of d parameter for evolving patterns
      const morphedD = layer.d + Math.sin(state.morphPhase + layerIdx) * 0.5;

      // Calculate new point
      const point = hypotrochoidPoint(layer.R, layer.r, morphedD, layer.theta, layer.scale);
      const px = centerX + point.x;
      const py = centerY + point.y;

      // Calculate hue based on angle
      const angleProgress = (layer.theta % (Math.PI * 2)) / (Math.PI * 2);
      const hue = colorScheme.hueStart + angleProgress * colorScheme.hueRange + layer.hueOffset;

      // Add to trail
      layer.trailHead = (layer.trailHead + 1) % POINTS_PER_LAYER;
      layer.trail[layer.trailHead].x = px;
      layer.trail[layer.trailHead].y = py;
      layer.trail[layer.trailHead].hue = hue;

      if (layer.trailLength < POINTS_PER_LAYER) {
        layer.trailLength++;
      }

      // Draw trail as batched strokes for performance
      // Instead of 600 individual lines, we draw ~6 strokes per layer = ~24 total
      if (layer.trailLength > TRAIL_SEGMENTS * 2) {
        const pointsPerSegment = Math.floor(layer.trailLength / TRAIL_SEGMENTS);

        for (let seg = 0; seg < TRAIL_SEGMENTS; seg++) {
          const segStart = seg * pointsPerSegment;
          const segEnd = (seg === TRAIL_SEGMENTS - 1) ? layer.trailLength - 1 : (seg + 1) * pointsPerSegment;

          // Copy points into pre-allocated array (reusing strokePoints)
          let pointCount = 0;
          for (let i = segStart; i <= segEnd && pointCount < MAX_POINTS_PER_SEGMENT; i++) {
            const idx = (layer.trailHead - layer.trailLength + i + 1 + POINTS_PER_LAYER) % POINTS_PER_LAYER;
            state.strokePoints[pointCount].x = layer.trail[idx].x;
            state.strokePoints[pointCount].y = layer.trail[idx].y;
            pointCount++;
          }

          if (pointCount < 2) continue;

          // Calculate averaged properties for this segment
          const avgAge = ((segStart + segEnd) / 2) / layer.trailLength;
          const alpha = layer.alpha * avgAge * avgAge; // Quadratic fade

          // Use middle point's hue for color gradient effect
          const midIdx = (layer.trailHead - layer.trailLength + Math.floor((segStart + segEnd) / 2) + 1 + POINTS_PER_LAYER) % POINTS_PER_LAYER;
          const hue = layer.trail[midIdx].hue;
          const color = hslToRgba(hue, colorScheme.saturation, colorScheme.lightness, alpha);

          // Line thickness varies by segment age
          const thickness = 2 + avgAge * 1.5;

          // Draw stroke using only the valid portion of strokePoints
          // Note: slice() creates a new array but this is unavoidable for the API
          api.brush.stroke(state.strokePoints.slice(0, pointCount), {
            color,
            width: thickness,
            blendMode: 'add',
          });
        }
      }

      // Draw "pen" position
      const penGlow = 0.4 + bass * 0.4;
      api.brush.circle(px, py, 4 + bass * 3, {
        fill: hslToRgba(hue, colorScheme.saturation, 80, penGlow),
        blendMode: 'add',
      });
    }

    // Draw center point
    const centerPulse = 0.3 + Math.sin(state.time * 2) * 0.1;
    api.brush.circle(centerX, centerY, 5, {
      fill: `rgba(255, 255, 255, ${centerPulse})`,
      blendMode: 'add',
    });
  },

  async teardown(): Promise<void> {
    state.layers = [];
    state.time = 0;
    console.log('[spirograph-dreams] Teardown complete');
  },
};

registerActor(actor);

export default actor;
