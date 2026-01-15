/**
 * Watercolor Wash Filter Actor
 *
 * Transforms the canvas into a watercolor painting with:
 * - Wet-on-wet color bleeding at edges
 * - Pigment granulation (subtle particles)
 * - Paper texture showing through
 * - Colors pool at edges (darker rims)
 * - Transparency variations
 * - Subtle paper drift animation
 */

import type {
  Actor,
  ActorMetadata,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';
import { registerActor } from '@art/actor-sdk';

const metadata: ActorMetadata = {
  id: 'watercolor-wash',
  name: 'Watercolor Wash',
  description: 'Watercolor painting effect with color bleeding and paper texture',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['filter', 'watercolor', 'painting', 'traditional', 'organic'],
  createdAt: new Date('2026-01-13'),
  preferredDuration: 60,
  requiredContexts: [],
  role: 'filter',
};

// Watercolor wash shader - dark mode (warm cream paper)
const WATERCOLOR_SHADER_DARK = `
  // Hash function
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

  // Fractal Brownian Motion for organic patterns
  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;

    for (int i = 0; i < 4; i++) {
      value += amplitude * noise(p * frequency);
      amplitude *= 0.5;
      frequency *= 2.0;
    }

    return value;
  }

  // Luminance
  float getLuminance(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
  }

  // Sobel edge detection
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

  void main() {
    vec2 uv = vTextureCoord;
    vec2 pixelCoord = uv * uResolution;
    vec2 texel = 1.0 / uResolution;

    // --- Paper texture (drifting) ---
    vec2 paperOffset = vec2(uTime * 0.01, uTime * 0.007);
    float paperNoise = fbm((pixelCoord + paperOffset) * 0.02);
    float paperGrain = noise((pixelCoord + paperOffset) * 0.15);

    // Paper base color (warm cream for dark mode)
    vec3 paperColor = vec3(0.98, 0.96, 0.94);

    // --- Edge detection for bleeding direction ---
    vec2 gradient = getGradient(uv);
    float edgeStrength = length(gradient);
    vec2 edgeDir = normalize(gradient + 0.001);

    // --- Color bleeding simulation ---
    // Sample in direction of edge with slight organic wobble
    float wobble = noise(pixelCoord * 0.05 + uTime * 0.5) * 2.0 - 1.0;
    vec2 bleedDir = edgeDir + vec2(wobble * 0.3, wobble * 0.3);

    // Multi-sample for soft bleeding (5 samples, unrolled for GLSL compatibility)
    vec4 bleedColor = vec4(0.0);
    bleedColor += texture(uTexture, uv + bleedDir * 0.1 * 4.0 * texel);
    bleedColor += texture(uTexture, uv + bleedDir * 0.3 * 4.0 * texel);
    bleedColor += texture(uTexture, uv + bleedDir * 0.5 * 4.0 * texel);
    bleedColor += texture(uTexture, uv + bleedDir * 0.7 * 4.0 * texel);
    bleedColor += texture(uTexture, uv + bleedDir * 0.9 * 4.0 * texel);
    bleedColor /= 5.0;

    // Original color
    vec4 originalColor = texture(uTexture, uv);

    // Blend bleeding based on edge strength
    float bleedAmount = smoothstep(0.05, 0.25, edgeStrength);
    vec4 blendedColor = mix(originalColor, bleedColor, bleedAmount * 0.4);

    // --- Pigment pooling at edges (darker rim) ---
    float pooling = smoothstep(0.1, 0.3, edgeStrength);
    vec3 poolColor = blendedColor.rgb * (1.0 - pooling * 0.15);

    // --- Granulation (pigment particles) ---
    float granulation = noise(pixelCoord * 0.3 + uTime * 0.1);
    granulation = smoothstep(0.3, 0.7, granulation);

    // Granulation is more visible in mid-tones
    float midtoneMask = 1.0 - abs(getLuminance(poolColor) - 0.5) * 2.0;
    float granulationAmount = granulation * midtoneMask * 0.08;

    vec3 granulatedColor = poolColor;
    granulatedColor *= (1.0 - granulationAmount);

    // --- Transparency/wash effect ---
    // Light areas become more transparent (paper shows through)
    float lum = getLuminance(granulatedColor);
    float transparency = smoothstep(0.6, 0.95, lum);

    // --- Soft color lifting (watercolor wash characteristic) ---
    // Slightly desaturate and lighten
    vec3 washColor = granulatedColor;
    washColor = mix(washColor, vec3(getLuminance(washColor)), 0.1);
    washColor = washColor * 0.95 + 0.05;

    // --- Paper texture application ---
    float paperTexAmount = 0.15 + transparency * 0.2;
    vec3 texturedPaper = paperColor * (0.92 + paperNoise * 0.08 + paperGrain * 0.05);

    // --- Combine wash with paper ---
    vec3 result = mix(washColor, texturedPaper, transparency * 0.5);

    // Apply paper grain overlay
    result *= (0.95 + paperGrain * 0.1);

    // --- Wet edge glow (subtle halo at color boundaries) ---
    float wetEdge = smoothstep(0.15, 0.05, edgeStrength);
    result += vec3(wetEdge * 0.02);

    finalColor = vec4(result, 1.0);
  }
`;

// Watercolor wash shader - light mode (cool gray paper, inverted transparency)
const WATERCOLOR_SHADER_LIGHT = `
  // Hash function
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

  // Fractal Brownian Motion for organic patterns
  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;

    for (int i = 0; i < 4; i++) {
      value += amplitude * noise(p * frequency);
      amplitude *= 0.5;
      frequency *= 2.0;
    }

    return value;
  }

  // Luminance
  float getLuminance(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
  }

  // Sobel edge detection
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

  void main() {
    vec2 uv = vTextureCoord;
    vec2 pixelCoord = uv * uResolution;
    vec2 texel = 1.0 / uResolution;

    // --- Paper texture (drifting) ---
    vec2 paperOffset = vec2(uTime * 0.01, uTime * 0.007);
    float paperNoise = fbm((pixelCoord + paperOffset) * 0.02);
    float paperGrain = noise((pixelCoord + paperOffset) * 0.15);

    // Paper base color (cool off-white for light mode)
    vec3 paperColor = vec3(0.96, 0.97, 0.98);

    // --- Edge detection for bleeding direction ---
    vec2 gradient = getGradient(uv);
    float edgeStrength = length(gradient);
    vec2 edgeDir = normalize(gradient + 0.001);

    // --- Color bleeding simulation ---
    // Sample in direction of edge with slight organic wobble
    float wobble = noise(pixelCoord * 0.05 + uTime * 0.5) * 2.0 - 1.0;
    vec2 bleedDir = edgeDir + vec2(wobble * 0.3, wobble * 0.3);

    // Multi-sample for soft bleeding (5 samples, unrolled for GLSL compatibility)
    vec4 bleedColor = vec4(0.0);
    bleedColor += texture(uTexture, uv + bleedDir * 0.1 * 4.0 * texel);
    bleedColor += texture(uTexture, uv + bleedDir * 0.3 * 4.0 * texel);
    bleedColor += texture(uTexture, uv + bleedDir * 0.5 * 4.0 * texel);
    bleedColor += texture(uTexture, uv + bleedDir * 0.7 * 4.0 * texel);
    bleedColor += texture(uTexture, uv + bleedDir * 0.9 * 4.0 * texel);
    bleedColor /= 5.0;

    // Original color
    vec4 originalColor = texture(uTexture, uv);

    // Blend bleeding based on edge strength
    float bleedAmount = smoothstep(0.05, 0.25, edgeStrength);
    vec4 blendedColor = mix(originalColor, bleedColor, bleedAmount * 0.4);

    // --- Pigment pooling at edges (lighter rim for light mode) ---
    float pooling = smoothstep(0.1, 0.3, edgeStrength);
    vec3 poolColor = blendedColor.rgb * (1.0 + pooling * 0.1);

    // --- Granulation (pigment particles) ---
    float granulation = noise(pixelCoord * 0.3 + uTime * 0.1);
    granulation = smoothstep(0.3, 0.7, granulation);

    // Granulation is more visible in mid-tones
    float midtoneMask = 1.0 - abs(getLuminance(poolColor) - 0.5) * 2.0;
    float granulationAmount = granulation * midtoneMask * 0.06;

    vec3 granulatedColor = poolColor;
    granulatedColor *= (1.0 + granulationAmount);

    // --- Transparency/wash effect ---
    // Dark areas become more transparent (paper shows through) - inverted for light mode
    float lum = getLuminance(granulatedColor);
    float transparency = smoothstep(0.4, 0.05, lum);

    // --- Soft color lifting (watercolor wash characteristic) ---
    // Slightly desaturate and darken for light mode
    vec3 washColor = granulatedColor;
    washColor = mix(washColor, vec3(getLuminance(washColor)), 0.1);
    washColor = washColor * 0.97;

    // --- Paper texture application ---
    float paperTexAmount = 0.15 + transparency * 0.2;
    vec3 texturedPaper = paperColor * (0.95 + paperNoise * 0.05 + paperGrain * 0.03);

    // --- Combine wash with paper ---
    vec3 result = mix(washColor, texturedPaper, transparency * 0.4);

    // Apply paper grain overlay (subtler for light mode)
    result *= (0.97 + paperGrain * 0.06);

    // --- Wet edge shadow (subtle darkening at color boundaries for light mode) ---
    float wetEdge = smoothstep(0.15, 0.05, edgeStrength);
    result -= vec3(wetEdge * 0.015);

    finalColor = vec4(result, 1.0);
  }
`;

interface WatercolorState {
  bleedIntensity: number;
  granulationAmount: number;
  filterOpacity: number;
}

let state: WatercolorState = {
  bleedIntensity: 0.4,
  granulationAmount: 0.08,
  filterOpacity: 1.0,
};

const actor: Actor = {
  metadata,

  async setup(): Promise<void> {
    // Randomize for variety
    state.bleedIntensity = 0.3 + Math.random() * 0.2;
    state.granulationAmount = 0.05 + Math.random() * 0.08;
    state.filterOpacity = 0.5 + Math.pow(Math.random(), 0.5) * 0.5;

    console.log(`[watercolor-wash] Setup: bleed=${state.bleedIntensity.toFixed(2)}, gran=${state.granulationAmount.toFixed(2)}, opacity=${state.filterOpacity.toFixed(2)}`);
  },

  update(api: ActorUpdateAPI, _frame: FrameContext): void {
    const isDark = api.context.display.isDarkMode();

    // Apply the appropriate watercolor shader based on display mode
    api.filter.customShader(isDark ? WATERCOLOR_SHADER_DARK : WATERCOLOR_SHADER_LIGHT);

    // Slight saturation reduction for watercolor look
    // Light mode needs slightly less desaturation to maintain color vibrancy
    api.filter.saturate(isDark ? 0.85 : 0.88);

    // Paper tint: warm sepia for dark mode, cool blue-gray for light mode
    if (isDark) {
      api.filter.sepia(0.08);
    } else {
      // Slight cool tint for light mode (achieved via color matrix)
      api.filter.colorMatrix([
        0.98, 0, 0.02, 0, 0,
        0, 0.99, 0.01, 0, 0,
        0.02, 0.02, 1.0, 0, 0,
        0, 0, 0, 1, 0,
      ]);
    }

    // Subtle vignette - slightly stronger for dark mode
    api.filter.vignette(isDark ? 0.2 : 0.15, 0.5);

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
    console.log('[watercolor-wash] Teardown complete');
  },
};

registerActor(actor);

export default actor;
