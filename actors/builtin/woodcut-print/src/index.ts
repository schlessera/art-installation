/**
 * Woodcut Print Filter Actor
 *
 * Transforms the canvas into a traditional woodcut print with:
 * - High contrast posterization (2-3 levels)
 * - Bold carved edges with roughness
 * - Wood grain texture along x-axis
 * - Ink distribution variation
 * - Subtle animation: ink pulse, wood grain drift
 */

import type {
  Actor,
  ActorMetadata,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';
import { registerActor } from '@art/actor-sdk';

const metadata: ActorMetadata = {
  id: 'woodcut-print',
  name: 'Woodcut Print',
  description: 'Traditional woodcut print effect with wood grain and bold contrast',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['filter', 'woodcut', 'print', 'traditional', 'graphic'],
  createdAt: new Date('2026-01-13'),
  preferredDuration: 60,
  requiredContexts: [],
  role: 'filter',
};

// Woodcut print shader - mode-aware version
// uCustom0: isDarkMode (0.0 = light, 1.0 = dark)
const WOODCUT_SHADER = `
  // Hash function for procedural noise
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  // 1D noise for wood grain
  float noise1D(float x) {
    float i = floor(x);
    float f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(hash(vec2(i, 0.0)), hash(vec2(i + 1.0, 0.0)), f);
  }

  // 2D noise for ink variation
  float noise2D(vec2 p) {
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

  // Sobel edge detection
  float getEdge(vec2 uv) {
    vec2 texel = 1.0 / uResolution;
    float gx = 0.0;
    float gy = 0.0;

    // Sample 3x3 neighborhood
    for (int i = -1; i <= 1; i++) {
      for (int j = -1; j <= 1; j++) {
        vec4 s = texture(uTexture, uv + vec2(float(i), float(j)) * texel);
        float lum = getLuminance(s.rgb);

        // Sobel X kernel
        float sx = float(i) * (j == 0 ? 2.0 : 1.0);
        // Sobel Y kernel
        float sy = float(j) * (i == 0 ? 2.0 : 1.0);

        gx += lum * sx;
        gy += lum * sy;
      }
    }

    return sqrt(gx * gx + gy * gy);
  }

  void main() {
    vec2 uv = vTextureCoord;
    vec4 originalColor = texture(uTexture, uv);
    vec2 pixelCoord = uv * uResolution;

    // Display mode: 0.0 = light mode, 1.0 = dark mode
    float isDarkMode = uCustom0;

    // --- Luminance and posterization ---
    float lum = getLuminance(originalColor.rgb);

    // Posterize to 3 levels
    float posterized;
    if (lum < 0.33) {
      posterized = 0.0; // Black (ink in light mode)
    } else if (lum < 0.66) {
      posterized = 0.5; // Mid-tone
    } else {
      posterized = 1.0; // White (paper/wood in light mode)
    }

    // --- Edge detection for bold carved lines ---
    float edge = getEdge(uv);
    float edgeMask = smoothstep(0.1, 0.4, edge);

    // --- Wood grain texture ---
    // Grain flows along x-axis with slight drift animation
    float grainOffset = uTime * 0.5;
    float grainY = pixelCoord.y * 0.02 + grainOffset;

    // Multi-octave wood grain
    float grain = 0.0;
    grain += noise1D(grainY * 1.0) * 0.5;
    grain += noise1D(grainY * 2.5) * 0.3;
    grain += noise1D(grainY * 6.0) * 0.2;

    // Wood grain rings
    float rings = sin(pixelCoord.y * 0.15 + grain * 8.0) * 0.5 + 0.5;
    rings = smoothstep(0.3, 0.7, rings);

    // --- Ink distribution variation ---
    // Subtle pulsing of ink intensity
    float inkPulse = 1.0 + sin(uTime * 0.3) * 0.05;

    // Random ink splatter/variation
    float inkNoise = noise2D(pixelCoord * 0.03);
    float inkVariation = 0.85 + inkNoise * 0.3;

    // --- Edge roughness (carved imperfections) ---
    float roughness = noise2D(pixelCoord * 0.1 + uTime * 0.1);
    float edgeRough = smoothstep(0.4, 0.6, roughness);

    // --- Mode-aware colors ---
    // Light mode: dark ink on warm cream paper/wood (traditional)
    // Dark mode: light/cream ink on dark wood (inverted, like a print negative)

    // Light mode wood: warm cream
    vec3 woodColorLight = vec3(0.95, 0.90, 0.80);
    // Dark mode wood: dark warm brown
    vec3 woodColorDark = vec3(0.12, 0.10, 0.08);

    // Light mode ink: rich dark brown-black
    vec3 inkColorLight = vec3(0.08, 0.06, 0.05);
    // Dark mode ink: warm cream/off-white
    vec3 inkColorDark = vec3(0.90, 0.85, 0.75);

    // Interpolate based on mode
    vec3 woodBase = mix(woodColorLight, woodColorDark, isDarkMode);
    vec3 inkBase = mix(inkColorLight, inkColorDark, isDarkMode);

    // Apply wood grain rings (inverted effect for dark mode)
    vec3 woodColor = woodBase * (0.9 + rings * 0.15);

    // Apply ink variation and pulse
    vec3 inkColor = inkBase * inkPulse * inkVariation;

    // Start with wood base
    vec3 result = woodColor;

    // Apply posterized ink based on luminance
    if (posterized < 0.25) {
      // Dark areas: full ink
      result = inkColor;
    } else if (posterized < 0.75) {
      // Mid-tones: partial ink with carved lines
      float midMix = (posterized - 0.25) / 0.5;
      // Create carved line pattern
      float carvePattern = sin(pixelCoord.x * 0.3 + pixelCoord.y * 0.1) * 0.5 + 0.5;
      carvePattern = step(midMix, carvePattern);
      result = mix(inkColor, woodColor, carvePattern);
    }
    // Light areas stay as wood

    // Apply bold edges
    result = mix(result, inkColor, edgeMask * 0.8 * edgeRough);

    // Subtle paper texture overlay
    float paperTex = noise2D(pixelCoord * 0.08);
    result *= 0.95 + paperTex * 0.1;

    finalColor = vec4(result, 1.0);
  }
`;

interface WoodcutState {
  grainDensity: number;
  inkIntensity: number;
  filterOpacity: number;
}

let state: WoodcutState = {
  grainDensity: 0.02,
  inkIntensity: 1.0,
  filterOpacity: 1.0,
};

const actor: Actor = {
  metadata,

  async setup(): Promise<void> {
    // Randomize for variety
    state.grainDensity = 0.015 + Math.random() * 0.01; // Subtle variation
    state.inkIntensity = 0.9 + Math.random() * 0.2;
    state.filterOpacity = 0.5 + Math.pow(Math.random(), 0.5) * 0.5;

    console.log(`[woodcut-print] Setup: grain=${state.grainDensity.toFixed(3)}, ink=${state.inkIntensity.toFixed(2)}, opacity=${state.filterOpacity.toFixed(2)}`);
  },

  update(api: ActorUpdateAPI, _frame: FrameContext): void {
    // Get display mode for mode-aware rendering
    const isDarkMode = api.context.display.isDarkMode();

    // Apply the woodcut shader with mode uniform
    // uCustom0: isDarkMode (0.0 = light, 1.0 = dark)
    api.filter.customShader(WOODCUT_SHADER, {
      uCustom0: isDarkMode ? 1.0 : 0.0,
    });

    // Slight vignette for aged print look
    // Stronger vignette in dark mode for dramatic effect
    const vignetteStrength = isDarkMode ? 0.3 : 0.25;
    api.filter.vignette(vignetteStrength, 0.5);

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
    console.log('[woodcut-print] Teardown complete');
  },
};

registerActor(actor);

export default actor;
