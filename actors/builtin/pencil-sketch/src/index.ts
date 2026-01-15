/**
 * Pencil Sketch Filter Actor
 *
 * Transforms the canvas into a pencil sketch with:
 * - Hatching lines for mid-tones
 * - Cross-hatching for dark areas
 * - Sobel edge detection for outlines
 * - Paper grain texture with subtle drift animation
 */

import type {
  Actor,
  ActorMetadata,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';
import { registerActor } from '@art/actor-sdk';

const metadata: ActorMetadata = {
  id: 'pencil-sketch',
  name: 'Pencil Sketch',
  description: 'Pencil sketch effect with hatching and cross-hatching',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['filter', 'sketch', 'pencil', 'drawing', 'traditional'],
  createdAt: new Date('2026-01-13'),
  preferredDuration: 60,
  requiredContexts: [],
  role: 'filter',
};

// Pencil sketch shader with hatching, cross-hatching, and paper texture
// uCustom0 = isDarkMode (0.0 = light mode, 1.0 = dark mode)
const PENCIL_SKETCH_SHADER = `
  // Sobel edge detection kernels
  const mat3 sobelX = mat3(
    -1.0, 0.0, 1.0,
    -2.0, 0.0, 2.0,
    -1.0, 0.0, 1.0
  );
  const mat3 sobelY = mat3(
    -1.0, -2.0, -1.0,
     0.0,  0.0,  0.0,
     1.0,  2.0,  1.0
  );

  // Hash function for procedural noise
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  // Value noise for paper texture
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f); // Smoothstep

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // Get luminance from color
  float getLuminance(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
  }

  // Sample luminance at offset
  float sampleLum(vec2 uv, vec2 offset) {
    vec2 texelSize = 1.0 / uResolution;
    vec4 color = texture(uTexture, uv + offset * texelSize);
    return getLuminance(color.rgb);
  }

  void main() {
    vec2 uv = vTextureCoord;
    vec4 originalColor = texture(uTexture, uv);
    vec2 pixelCoord = uv * uResolution;

    // Display mode: 0.0 = light, 1.0 = dark
    float isDarkMode = uCustom0;

    // --- Edge Detection (Sobel) ---
    float gx = 0.0;
    float gy = 0.0;

    for (int i = -1; i <= 1; i++) {
      for (int j = -1; j <= 1; j++) {
        float lum = sampleLum(uv, vec2(float(i), float(j)));
        gx += lum * sobelX[i + 1][j + 1];
        gy += lum * sobelY[i + 1][j + 1];
      }
    }

    float edgeStrength = sqrt(gx * gx + gy * gy);
    float edges = smoothstep(0.05, 0.3, edgeStrength);

    // --- Luminance for hatching density ---
    float lum = getLuminance(originalColor.rgb);

    // In dark mode, invert luminance so bright areas get hatching
    float hatchLum = isDarkMode > 0.5 ? 1.0 - lum : lum;

    // --- Procedural Hatching ---
    // Hatching frequency and angle
    float hatchFreq = 40.0;
    float hatchAngle1 = 0.785398; // 45 degrees
    float hatchAngle2 = -0.785398; // -45 degrees (perpendicular)

    // Subtle hand tremor animation
    float tremor = sin(uTime * 0.5) * 0.02;

    // First hatching direction (45 degrees)
    vec2 hatchDir1 = vec2(cos(hatchAngle1 + tremor), sin(hatchAngle1 + tremor));
    float hatch1 = sin(dot(pixelCoord, hatchDir1) * hatchFreq * 0.5) * 0.5 + 0.5;

    // Second hatching direction (-45 degrees) for cross-hatching
    vec2 hatchDir2 = vec2(cos(hatchAngle2 - tremor), sin(hatchAngle2 - tremor));
    float hatch2 = sin(dot(pixelCoord, hatchDir2) * hatchFreq * 0.5) * 0.5 + 0.5;

    // Determine hatching based on luminance bands
    float hatchMask = 0.0;

    // Dark areas (<0.3): Cross-hatching (both directions)
    if (hatchLum < 0.3) {
      float darkIntensity = 1.0 - (hatchLum / 0.3);
      hatchMask = max(
        step(0.5 - darkIntensity * 0.3, hatch1),
        step(0.5 - darkIntensity * 0.3, hatch2)
      );
      hatchMask = 1.0 - hatchMask * darkIntensity;
    }
    // Mid-tones (0.3-0.7): Single direction hatching
    else if (hatchLum < 0.7) {
      float midIntensity = 1.0 - ((hatchLum - 0.3) / 0.4);
      hatchMask = step(0.5 - midIntensity * 0.25, hatch1);
      hatchMask = 1.0 - hatchMask * midIntensity * 0.7;
    }
    // Light areas (>0.7): No hatching (paper white)
    else {
      hatchMask = 1.0;
    }

    // --- Paper Texture ---
    // Slowly drifting paper grain
    vec2 paperOffset = vec2(uTime * 0.01, uTime * 0.007);
    float paperGrain = noise((pixelCoord + paperOffset) * 0.15);
    // Subtle texture - adjust range based on mode
    paperGrain = paperGrain * 0.15 + 0.85;

    // --- Mode-aware colors ---
    // Light mode: warm white paper, dark gray pencil
    // Dark mode: dark charcoal paper, light chalk pencil
    vec3 paperColorLight = vec3(0.98, 0.96, 0.92);
    vec3 pencilColorLight = vec3(0.15, 0.13, 0.12);
    vec3 paperColorDark = vec3(0.08, 0.07, 0.06);
    vec3 pencilColorDark = vec3(0.88, 0.85, 0.82);

    vec3 paperColor = mix(paperColorLight, paperColorDark, isDarkMode);
    vec3 pencilColor = mix(pencilColorLight, pencilColorDark, isDarkMode);

    // In dark mode, invert grain effect (darker areas = less grain)
    float grainEffect = isDarkMode > 0.5 ? (2.0 - paperGrain) : paperGrain;

    // Start with paper
    vec3 result = paperColor * grainEffect;

    // Apply hatching
    result = mix(pencilColor, result, hatchMask);

    // Apply edges (outlines)
    result = mix(result, pencilColor, edges * 0.9);

    // Very subtle original color tint for interest
    vec3 tintedResult = mix(result, result * (originalColor.rgb * 0.3 + 0.7), 0.1);

    finalColor = vec4(tintedResult, 1.0);
  }
`;

interface SketchState {
  hatchDensity: number;
  paperRoughness: number;
  filterOpacity: number;
}

let state: SketchState = {
  hatchDensity: 40.0,
  paperRoughness: 0.15,
  filterOpacity: 1.0,
};

const actor: Actor = {
  metadata,

  async setup(): Promise<void> {
    // Randomize for variety
    state.hatchDensity = 35 + Math.random() * 15; // 35-50
    state.paperRoughness = 0.1 + Math.random() * 0.1; // 0.1-0.2
    state.filterOpacity = 0.5 + Math.pow(Math.random(), 0.5) * 0.5;

    console.log(`[pencil-sketch] Setup: density=${state.hatchDensity.toFixed(1)}, opacity=${state.filterOpacity.toFixed(2)}`);
  },

  update(api: ActorUpdateAPI, _frame: FrameContext): void {
    // Get display mode for shader uniform
    const isDarkMode = api.context.display.isDarkMode();

    // Apply the pencil sketch shader with display mode uniform
    api.filter.customShader(PENCIL_SKETCH_SHADER, {
      uCustom0: isDarkMode ? 1.0 : 0.0,
    });

    // Slight vignette for focus - slightly stronger in light mode
    const vignetteStrength = isDarkMode ? 0.2 : 0.25;
    api.filter.vignette(vignetteStrength, 0.6);

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
    console.log('[pencil-sketch] Teardown complete');
  },
};

registerActor(actor);

export default actor;
