/**
 * Oil Paint Impasto Filter Actor
 *
 * Transforms the canvas into an oil painting with:
 * - Kuwahara-style filtering for painterly abstraction
 * - Emboss effect for paint ridge highlights
 * - Directional brush texture
 * - Thick impasto look with visible strokes
 * - Subtle animation: emboss angle rotation
 *
 * Supports light/dark mode:
 * - Dark mode: stronger contrast and vignette for rich gallery look
 * - Light mode: softer contrast and vignette for airy feel
 */

import type {
  Actor,
  ActorMetadata,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';
import { registerActor } from '@art/actor-sdk';

const metadata: ActorMetadata = {
  id: 'oil-impasto',
  name: 'Oil Paint Impasto',
  description: 'Oil painting effect with thick brush strokes and paint ridges',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['filter', 'oil', 'painting', 'impasto', 'traditional'],
  createdAt: new Date('2026-01-13'),
  preferredDuration: 60,
  requiredContexts: [],
  role: 'filter',
};

// Oil paint impasto shader - subtle painterly effect
const OIL_IMPASTO_SHADER = `
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

  // Bilateral-style blur that preserves edges (simpler than Kuwahara)
  vec3 painteryBlur(vec2 uv, vec2 texel) {
    vec3 center = texture(uTexture, uv).rgb;
    float centerLum = dot(center, vec3(0.299, 0.587, 0.114));

    vec3 sum = center;
    float weight = 1.0;

    // Sample in a small neighborhood, weight by color similarity
    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        if (x == 0 && y == 0) continue;

        vec2 offset = vec2(float(x), float(y)) * texel * 1.5;
        vec3 sample_color = texture(uTexture, uv + offset).rgb;
        float sampleLum = dot(sample_color, vec3(0.299, 0.587, 0.114));

        // Weight by luminance similarity (preserves edges)
        float lumDiff = abs(centerLum - sampleLum);
        float w = exp(-lumDiff * 8.0); // Falloff based on difference

        sum += sample_color * w;
        weight += w;
      }
    }

    return sum / weight;
  }

  void main() {
    vec2 uv = vTextureCoord;
    vec2 pixelCoord = uv * uResolution;
    vec2 texel = 1.0 / uResolution;

    // --- Original color ---
    vec4 original = texture(uTexture, uv);

    // --- Edge-preserving blur for painterly smoothing ---
    vec3 blurred = painteryBlur(uv, texel);

    // Blend original with blurred (keep 40% original for detail)
    vec3 result = mix(blurred, original.rgb, 0.4);

    // --- Subtle emboss for paint ridge effect ---
    // Slowly rotating light direction
    float embossAngle = uTime * 0.1;
    vec2 lightDir = vec2(cos(embossAngle), sin(embossAngle));

    // Sample neighbors for emboss
    float leftLum = dot(texture(uTexture, uv - lightDir * texel).rgb, vec3(0.299, 0.587, 0.114));
    float rightLum = dot(texture(uTexture, uv + lightDir * texel).rgb, vec3(0.299, 0.587, 0.114));
    float emboss = (rightLum - leftLum) * 0.5 + 0.5;

    // Apply subtle emboss lighting
    result *= 0.92 + emboss * 0.16;

    // --- Subtle brush stroke texture ---
    float brushAngle = noise(pixelCoord * 0.015) * 6.28;
    vec2 brushDir = vec2(cos(brushAngle), sin(brushAngle));
    float brushTex = noise(pixelCoord * 0.08 + brushDir * 10.0);
    result *= 0.97 + brushTex * 0.06;

    // --- Canvas weave texture ---
    float canvasX = sin(pixelCoord.x * 0.5) * 0.5 + 0.5;
    float canvasY = sin(pixelCoord.y * 0.5) * 0.5 + 0.5;
    float canvas = canvasX * canvasY * 0.03 + 0.97;
    result *= canvas;

    // --- Slight saturation boost for oil paint richness ---
    float lum = dot(result, vec3(0.299, 0.587, 0.114));
    result = mix(vec3(lum), result, 1.1);

    // --- Warm color temperature shift (oil paint tends warm) ---
    result.r *= 1.02;
    result.b *= 0.98;

    result = clamp(result, 0.0, 1.0);
    finalColor = vec4(result, 1.0);
  }
`;

interface ImpastoState {
  brushSize: number;
  embossStrength: number;
  filterOpacity: number;
}

let state: ImpastoState = {
  brushSize: 2,
  embossStrength: 0.3,
  filterOpacity: 1.0,
};

const actor: Actor = {
  metadata,

  async setup(): Promise<void> {
    // Randomize for variety
    state.brushSize = 2 + Math.floor(Math.random() * 2); // 2-3
    state.embossStrength = 0.2 + Math.random() * 0.2;
    state.filterOpacity = 0.5 + Math.pow(Math.random(), 0.5) * 0.5;

    console.log(`[oil-impasto] Setup: brush=${state.brushSize}, emboss=${state.embossStrength.toFixed(2)}, opacity=${state.filterOpacity.toFixed(2)}`);
  },

  update(api: ActorUpdateAPI, _frame: FrameContext): void {
    const isDark = api.context.display.isDarkMode();

    // Apply the oil impasto shader
    api.filter.customShader(OIL_IMPASTO_SHADER);

    // Contrast boost for rich oil colors
    // Dark mode: stronger contrast for dramatic effect
    // Light mode: softer contrast for airy, delicate feel
    const contrastAmount = isDark ? 1.1 : 1.05;
    api.filter.contrast(contrastAmount);

    // Vignette for gallery look
    // Dark mode: stronger vignette frames the artwork
    // Light mode: subtle vignette to avoid darkening edges too much
    const vignetteStrength = isDark ? 0.2 : 0.12;
    const vignetteSize = isDark ? 0.5 : 0.6;
    api.filter.vignette(vignetteStrength, vignetteSize);

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
    console.log('[oil-impasto] Teardown complete');
  },
};

registerActor(actor);

export default actor;
