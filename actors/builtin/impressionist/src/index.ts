/**
 * Impressionist Strokes Filter Actor
 *
 * Transforms the canvas into an impressionist painting with:
 * - Directional brush strokes following image structure
 * - Vibrant broken color
 * - Color vibration and hue shifting
 * - Light expressed through warm/cool color temperature
 * - Subtle animation: hue cycling, stroke direction variation
 */

import type {
  Actor,
  ActorMetadata,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';
import { registerActor } from '@art/actor-sdk';

const metadata: ActorMetadata = {
  id: 'impressionist',
  name: 'Impressionist Strokes',
  description: 'Impressionist painting with directional strokes and vibrant color',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['filter', 'impressionist', 'painting', 'monet', 'traditional'],
  createdAt: new Date('2026-01-13'),
  preferredDuration: 60,
  requiredContexts: [],
  role: 'filter',
};

// Impressionist strokes shader
const IMPRESSIONIST_SHADER = `
  // Hash for noise
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  // 2D noise
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // Get luminance
  float getLuminance(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
  }

  // Compute gradient direction using Sobel
  vec2 getGradient(vec2 uv) {
    vec2 texel = 1.0 / uResolution;
    float gx = 0.0;
    float gy = 0.0;

    for (int i = -1; i <= 1; i++) {
      for (int j = -1; j <= 1; j++) {
        vec4 s = texture(uTexture, uv + vec2(float(i), float(j)) * texel);
        float lum = getLuminance(s.rgb);
        gx += lum * float(i) * (j == 0 ? 2.0 : 1.0);
        gy += lum * float(j) * (i == 0 ? 2.0 : 1.0);
      }
    }

    return vec2(gx, gy);
  }

  // RGB to HSV
  vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));

    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
  }

  // HSV to RGB
  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  void main() {
    vec2 uv = vTextureCoord;
    vec2 pixelCoord = uv * uResolution;
    vec2 texel = 1.0 / uResolution;

    // --- Compute edge gradient for stroke direction ---
    vec2 gradient = getGradient(uv);
    float gradientMag = length(gradient);

    // Stroke direction is perpendicular to gradient (follows edges)
    vec2 strokeDir = vec2(-gradient.y, gradient.x);
    if (length(strokeDir) > 0.001) {
      strokeDir = normalize(strokeDir);
    } else {
      // No gradient: use noise-based direction
      float noiseAngle = noise(pixelCoord * 0.01) * 6.28;
      strokeDir = vec2(cos(noiseAngle), sin(noiseAngle));
    }

    // Add time-based variation to stroke direction
    float timeVar = sin(uTime * 0.2 + pixelCoord.x * 0.01) * 0.1;
    float angle = atan(strokeDir.y, strokeDir.x) + timeVar;
    strokeDir = vec2(cos(angle), sin(angle));

    // --- Directional blur along stroke ---
    vec3 colorSum = vec3(0.0);
    float strokeLength = 4.0;

    for (float i = -2.0; i <= 2.0; i++) {
      vec2 offset = strokeDir * i * strokeLength * texel;
      colorSum += texture(uTexture, uv + offset).rgb;
    }
    vec3 blurredColor = colorSum / 5.0;

    // --- Broken color effect (slight pixelation) ---
    float cellSize = 3.0;
    vec2 cell = floor(pixelCoord / cellSize);
    vec2 cellCenter = (cell + 0.5) * cellSize / uResolution;
    vec3 cellColor = texture(uTexture, cellCenter).rgb;

    // Mix blurred and cell color
    vec3 paintColor = mix(blurredColor, cellColor, 0.4);

    // --- Color vibration (hue shift per region) ---
    vec3 hsv = rgb2hsv(paintColor);

    // Animated hue shift
    float hueShift = sin(uTime * 0.5 + cell.x * 0.1 + cell.y * 0.15) * 0.03;
    hsv.x = fract(hsv.x + hueShift);

    // Saturation boost for vibrancy
    hsv.y = min(1.0, hsv.y * 1.3);

    vec3 vibrantColor = hsv2rgb(hsv);

    // --- Warm/cool color temperature based on luminance ---
    float lum = getLuminance(vibrantColor);

    // Warm highlights (yellow-orange)
    vec3 warmTint = vec3(1.05, 1.0, 0.9);
    // Cool shadows (blue-purple)
    vec3 coolTint = vec3(0.9, 0.95, 1.1);

    vec3 tempColor = vibrantColor * mix(coolTint, warmTint, lum);

    // --- Canvas texture ---
    float canvasTex = noise(pixelCoord * 0.12);
    canvasTex = canvasTex * 0.08 + 0.96;

    vec3 result = tempColor * canvasTex;

    // --- Brush stroke edges ---
    float strokeEdge = noise(pixelCoord * 0.05 + strokeDir * 10.0);
    result *= 0.95 + strokeEdge * 0.1;

    // Clamp to valid range
    result = clamp(result, 0.0, 1.0);

    finalColor = vec4(result, 1.0);
  }
`;

interface ImpressionistState {
  strokeLength: number;
  vibrancy: number;
  filterOpacity: number;
}

let state: ImpressionistState = {
  strokeLength: 4.0,
  vibrancy: 1.3,
  filterOpacity: 1.0,
};

const actor: Actor = {
  metadata,

  async setup(): Promise<void> {
    // Randomize for variety
    state.strokeLength = 3 + Math.random() * 3;
    state.vibrancy = 1.2 + Math.random() * 0.3;
    // Weighted opacity: ~60% will be close to 1.0, minimum 0.5
    state.filterOpacity = 0.5 + Math.pow(Math.random(), 0.5) * 0.5;

    console.log(`[impressionist] Setup: stroke=${state.strokeLength.toFixed(1)}, vibrancy=${state.vibrancy.toFixed(2)}, opacity=${state.filterOpacity.toFixed(2)}`);
  },

  update(api: ActorUpdateAPI, _frame: FrameContext): void {
    const isDark = api.context.display.isDarkMode();

    // Apply the impressionist shader
    api.filter.customShader(IMPRESSIONIST_SHADER);

    // Mode-aware saturation and tinting
    if (isDark) {
      // Dark mode: boost saturation for vibrancy, warm tint for classic impressionist look
      api.filter.saturate(1.15);
      api.filter.sepia(0.05);
      // Stronger vignette for gallery framing
      api.filter.vignette(0.2, 0.5);
    } else {
      // Light mode: subtler saturation to avoid oversaturation on bright backgrounds
      api.filter.saturate(1.05);
      // Cooler tint for light mode - slight blue shift instead of warm sepia
      api.filter.colorMatrix([
        0.98, 0, 0.02, 0, 0,
        0, 0.98, 0.02, 0, 0,
        0.02, 0.02, 1.0, 0, 0,
        0, 0, 0, 1, 0,
      ]);
      // Lighter vignette to avoid darkening already-bright composition
      api.filter.vignette(0.15, 0.3);
    }

    // Apply overall filter opacity (blends filter effect with original)
    if (state.filterOpacity < 1.0) {
      api.filter.colorMatrix([
        1, 0, 0, 0, 0,
        0, 1, 0, 0, 0,
        0, 0, 1, 0, 0,
        0, 0, 0, state.filterOpacity, 0,
      ]);
    }
  },

  async teardown(): Promise<void> {
    console.log('[impressionist] Teardown complete');
  },
};

registerActor(actor);

export default actor;
