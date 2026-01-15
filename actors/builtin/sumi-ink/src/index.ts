/**
 * Sumi-e Ink Wash Filter Actor
 *
 * Transforms the canvas into East Asian brush painting style with:
 * - Monochrome ink tones with subtle variation
 * - Ink bleeding effect in dark regions
 * - Dry brush texture in mid-tones
 * - White space preservation (ma)
 * - Rice paper texture
 * - Subtle animation: ink bleeding, brush noise
 */

import type {
  Actor,
  ActorMetadata,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';
import { registerActor } from '@art/actor-sdk';

const metadata: ActorMetadata = {
  id: 'sumi-ink',
  name: 'Sumi-e Ink Wash',
  description: 'East Asian brush painting style with ink wash and dry brush',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['filter', 'sumi-e', 'ink', 'japanese', 'traditional', 'brush'],
  createdAt: new Date('2026-01-13'),
  preferredDuration: 60,
  requiredContexts: [],
  role: 'filter',
};

// Sumi-e ink wash shader - light mode (traditional: dark ink on light paper)
const SUMI_INK_SHADER_LIGHT = `
  // Hash for noise
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  // Perlin-style noise
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

  // FBM for organic ink patterns
  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;

    for (int i = 0; i < 4; i++) {
      value += amplitude * noise(p);
      p *= 2.0;
      amplitude *= 0.5;
    }

    return value;
  }

  // Luminance
  float getLuminance(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
  }

  // S-curve for contrast
  float sCurve(float x) {
    return x * x * (3.0 - 2.0 * x);
  }

  void main() {
    vec2 uv = vTextureCoord;
    vec2 pixelCoord = uv * uResolution;
    vec2 texel = 1.0 / uResolution;

    // --- Sample original color and convert to grayscale ---
    vec4 originalColor = texture(uTexture, uv);
    float lum = getLuminance(originalColor.rgb);

    // --- Apply S-curve for dramatic contrast ---
    float ink = sCurve(1.0 - lum); // Invert: dark becomes ink

    // --- Ink bleeding effect (animated) ---
    float bleedPulse = 1.0 + sin(uTime * 0.3) * 0.1;
    float bleedAmount = 0.0;

    // Only bleed in darker regions
    if (ink > 0.4) {
      // Sample nearby for bleeding
      float bleedNoise = fbm(pixelCoord * 0.02 + uTime * 0.05);

      for (float i = 0.0; i < 4.0; i++) {
        float angle = i * 1.5708; // 90 degrees apart
        vec2 offset = vec2(cos(angle), sin(angle)) * (2.0 + bleedNoise * 3.0);
        float sampleLum = getLuminance(texture(uTexture, uv + offset * texel).rgb);
        bleedAmount += 1.0 - sampleLum;
      }
      bleedAmount /= 4.0;
      bleedAmount *= bleedPulse * (ink - 0.4) * 0.5;
    }

    ink = min(1.0, ink + bleedAmount);

    // --- Dry brush texture (in mid-tones) ---
    float dryBrushNoise = noise(pixelCoord * 0.15 + uTime * 0.02);

    // More visible in mid-tones
    float midtoneMask = 1.0 - abs(ink - 0.5) * 2.0;
    midtoneMask = max(0.0, midtoneMask);

    float dryBrush = dryBrushNoise * midtoneMask * 0.3;
    ink = ink + dryBrush - dryBrush * 0.5; // Adds texture variation

    // --- White space preservation (ma) ---
    // Bright areas become pure white
    float whiteMask = smoothstep(0.15, 0.0, ink);

    // --- Rice paper texture (warm cream for light mode) ---
    float paperNoise = noise(pixelCoord * 0.08);
    float paperFiber = noise(pixelCoord * vec2(0.3, 0.1)); // Directional fibers

    vec3 paperColor = vec3(0.98, 0.96, 0.92);
    paperColor *= 0.95 + paperNoise * 0.05 + paperFiber * 0.03;

    // --- Ink color (not pure black, slightly warm) ---
    vec3 inkColor = vec3(0.05, 0.05, 0.08);

    // Add slight warmth to lighter ink tones
    inkColor = mix(inkColor, vec3(0.15, 0.12, 0.10), (1.0 - ink) * 0.3);

    // --- Combine paper and ink ---
    vec3 result = mix(inkColor, paperColor, 1.0 - ink);

    // Apply white space
    result = mix(result, paperColor, whiteMask);

    // --- Edge enhancement for brush strokes ---
    float edge = 0.0;
    for (float i = 0.0; i < 4.0; i++) {
      float angle = i * 1.5708;
      vec2 offset = vec2(cos(angle), sin(angle)) * texel;
      float sampleInk = 1.0 - getLuminance(texture(uTexture, uv + offset).rgb);
      edge += abs(sampleInk - ink);
    }
    edge *= 0.25;

    // Subtle edge darkening
    result *= 1.0 - edge * 0.2;

    finalColor = vec4(result, 1.0);
  }
`;

// Sumi-e ink wash shader - dark mode (inverted: light ink on dark paper)
const SUMI_INK_SHADER_DARK = `
  // Hash for noise
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  // Perlin-style noise
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

  // FBM for organic ink patterns
  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;

    for (int i = 0; i < 4; i++) {
      value += amplitude * noise(p);
      p *= 2.0;
      amplitude *= 0.5;
    }

    return value;
  }

  // Luminance
  float getLuminance(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
  }

  // S-curve for contrast
  float sCurve(float x) {
    return x * x * (3.0 - 2.0 * x);
  }

  void main() {
    vec2 uv = vTextureCoord;
    vec2 pixelCoord = uv * uResolution;
    vec2 texel = 1.0 / uResolution;

    // --- Sample original color and convert to grayscale ---
    vec4 originalColor = texture(uTexture, uv);
    float lum = getLuminance(originalColor.rgb);

    // --- Apply S-curve for dramatic contrast ---
    // In dark mode, bright becomes "ink" (which renders light)
    float ink = sCurve(lum); // Light areas become ink strokes

    // --- Ink bleeding effect (animated) ---
    float bleedPulse = 1.0 + sin(uTime * 0.3) * 0.1;
    float bleedAmount = 0.0;

    // Only bleed in brighter regions (inverted from light mode)
    if (ink > 0.4) {
      // Sample nearby for bleeding
      float bleedNoise = fbm(pixelCoord * 0.02 + uTime * 0.05);

      for (float i = 0.0; i < 4.0; i++) {
        float angle = i * 1.5708; // 90 degrees apart
        vec2 offset = vec2(cos(angle), sin(angle)) * (2.0 + bleedNoise * 3.0);
        float sampleLum = getLuminance(texture(uTexture, uv + offset * texel).rgb);
        bleedAmount += sampleLum;
      }
      bleedAmount /= 4.0;
      bleedAmount *= bleedPulse * (ink - 0.4) * 0.5;
    }

    ink = min(1.0, ink + bleedAmount);

    // --- Dry brush texture (in mid-tones) ---
    float dryBrushNoise = noise(pixelCoord * 0.15 + uTime * 0.02);

    // More visible in mid-tones
    float midtoneMask = 1.0 - abs(ink - 0.5) * 2.0;
    midtoneMask = max(0.0, midtoneMask);

    float dryBrush = dryBrushNoise * midtoneMask * 0.3;
    ink = ink + dryBrush - dryBrush * 0.5; // Adds texture variation

    // --- Dark space preservation (ma - inverted) ---
    // Dark areas become pure black paper
    float darkMask = smoothstep(0.15, 0.0, ink);

    // --- Dark paper texture (deep charcoal with subtle texture) ---
    float paperNoise = noise(pixelCoord * 0.08);
    float paperFiber = noise(pixelCoord * vec2(0.3, 0.1)); // Directional fibers

    // Dark paper with cool undertones
    vec3 paperColor = vec3(0.04, 0.05, 0.07);
    paperColor *= 0.95 + paperNoise * 0.08 + paperFiber * 0.04;

    // --- Ink color (light, slightly warm like silver ink) ---
    vec3 inkColor = vec3(0.85, 0.88, 0.92);

    // Add slight warmth to lighter ink tones
    inkColor = mix(inkColor, vec3(0.78, 0.82, 0.88), (1.0 - ink) * 0.3);

    // --- Combine paper and ink ---
    vec3 result = mix(paperColor, inkColor, ink);

    // Apply dark space (ma)
    result = mix(result, paperColor, darkMask);

    // --- Edge enhancement for brush strokes ---
    float edge = 0.0;
    for (float i = 0.0; i < 4.0; i++) {
      float angle = i * 1.5708;
      vec2 offset = vec2(cos(angle), sin(angle)) * texel;
      float sampleInk = getLuminance(texture(uTexture, uv + offset).rgb);
      edge += abs(sampleInk - ink);
    }
    edge *= 0.25;

    // Subtle edge brightening (inverted from light mode)
    result *= 1.0 + edge * 0.15;

    finalColor = vec4(result, 1.0);
  }
`;

interface SumiState {
  inkIntensity: number;
  dryBrushAmount: number;
  isDarkMode: boolean;
  filterOpacity: number;
}

let state: SumiState = {
  inkIntensity: 1.0,
  dryBrushAmount: 0.3,
  isDarkMode: true,
  filterOpacity: 1.0,
};

const actor: Actor = {
  metadata,

  async setup(): Promise<void> {
    // Randomize for variety
    state.inkIntensity = 0.8 + Math.random() * 0.4;
    state.dryBrushAmount = 0.2 + Math.random() * 0.2;
    state.filterOpacity = 0.5 + Math.pow(Math.random(), 0.5) * 0.5;

    console.log(`[sumi-ink] Setup: ink=${state.inkIntensity.toFixed(2)}, dryBrush=${state.dryBrushAmount.toFixed(2)}, opacity=${state.filterOpacity.toFixed(2)}, mode will be determined at runtime`);
  },

  update(api: ActorUpdateAPI, _frame: FrameContext): void {
    // Check display mode
    const isDarkMode = api.context.display.isDarkMode();
    state.isDarkMode = isDarkMode;

    // Apply the appropriate sumi-e shader based on display mode
    if (isDarkMode) {
      // Dark mode: light ink on dark paper
      api.filter.customShader(SUMI_INK_SHADER_DARK);

      // Slight contrast enhancement
      api.filter.contrast(1.05);

      // Cool tint for dark mode (instead of warm sepia)
      api.filter.colorMatrix([
        1.0, 0.0, 0.02, 0.0, 0.0,
        0.0, 1.0, 0.02, 0.0, 0.0,
        0.0, 0.02, 1.05, 0.0, 0.0,
        0.0, 0.0, 0.0, 1.0, 0.0,
      ]);

      // Stronger vignette for dark mode to frame the artwork
      api.filter.vignette(0.2, 0.5);
    } else {
      // Light mode: dark ink on light paper (traditional)
      api.filter.customShader(SUMI_INK_SHADER_LIGHT);

      // Slight contrast enhancement
      api.filter.contrast(1.05);

      // Subtle warm tint for aged paper feel
      api.filter.sepia(0.05);

      // Light vignette
      api.filter.vignette(0.15, 0.6);
    }

    // Apply overall filter opacity
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
    console.log('[sumi-ink] Teardown complete');
  },
};

registerActor(actor);

export default actor;
