/**
 * Film Grain Filter Actor
 *
 * Cinematic 35mm film aesthetic with organic grain that varies in intensity,
 * subtle exposure flicker, and warm/cool color grading.
 *
 * Adapts to light/dark mode:
 * - Dark mode: Traditional film look with warm highlights, cool shadows, darkening vignette
 * - Light mode: Inverted grading with cool highlights, warm shadows, lightening vignette
 */

import type {
  Actor,
  ActorMetadata,
  ActorUpdateAPI,
  FrameContext,
  ColorMatrix,
} from '@art/types';
import { registerActor } from '@art/actor-sdk';

const metadata: ActorMetadata = {
  id: 'film-grain',
  name: 'Film Grain',
  description: 'Cinematic 35mm film aesthetic with organic grain',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['filter', 'film', 'grain', 'cinematic', 'vintage'],
  createdAt: new Date('2026-01-12'),
  preferredDuration: 60,
  requiredContexts: ['display'],
  isGlobalFilter: true,
};

// Film grain shader for dark mode - warm highlights, cool shadows
const FILM_GRAIN_SHADER_DARK = `
  void main() {
    vec2 uv = vTextureCoord;
    vec4 color = texture(uTexture, uv);

    // Organic grain pattern (24fps film grain)
    float grainTime = floor(uTime * 24.0);
    vec2 grainUV = uv * uResolution;
    float grain = fract(sin(dot(grainUV + grainTime, vec2(12.9898, 78.233))) * 43758.5453);
    grain = (grain - 0.5) * 0.08;

    // Subtle exposure flicker
    float flicker = 1.0 + sin(uTime * 12.0) * 0.015;

    // Warm highlights, cool shadows (cinematic grade for dark backgrounds)
    vec3 warmTint = vec3(1.05, 1.0, 0.95);
    vec3 coolTint = vec3(0.95, 0.98, 1.05);
    float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    color.rgb *= mix(coolTint, warmTint, luminance);

    // Apply grain and flicker
    color.rgb += grain;
    color.rgb *= flicker;

    // Slight contrast boost for film look
    color.rgb = (color.rgb - 0.5) * 1.05 + 0.5;

    finalColor = color;
  }
`;

// Film grain shader for light mode - cool highlights, warm shadows (inverted grading)
const FILM_GRAIN_SHADER_LIGHT = `
  void main() {
    vec2 uv = vTextureCoord;
    vec4 color = texture(uTexture, uv);

    // Organic grain pattern (24fps film grain)
    float grainTime = floor(uTime * 24.0);
    vec2 grainUV = uv * uResolution;
    float grain = fract(sin(dot(grainUV + grainTime, vec2(12.9898, 78.233))) * 43758.5453);
    grain = (grain - 0.5) * 0.06; // Slightly less grain on light backgrounds

    // Subtle exposure flicker
    float flicker = 1.0 + sin(uTime * 12.0) * 0.012;

    // Cool highlights, warm shadows (inverted for light backgrounds)
    vec3 coolTint = vec3(0.96, 0.98, 1.04);
    vec3 warmTint = vec3(1.04, 1.0, 0.96);
    float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    color.rgb *= mix(warmTint, coolTint, luminance);

    // Apply grain and flicker
    color.rgb += grain;
    color.rgb *= flicker;

    // Slight contrast boost for film look
    color.rgb = (color.rgb - 0.5) * 1.04 + 0.5;

    finalColor = color;
  }
`;

// Vintage color matrix for dark mode - additional warmth
const VINTAGE_MATRIX_DARK: ColorMatrix = [
  1.1, 0.1, 0.0, 0, 0.02,
  0.0, 1.0, 0.1, 0, 0.0,
  -0.1, 0.0, 0.9, 0, 0.02,
  0, 0, 0, 1, 0,
];

// Vintage color matrix for light mode - cooler tones, subtle sepia in shadows
const VINTAGE_MATRIX_LIGHT: ColorMatrix = [
  0.95, 0.05, 0.0, 0, 0.0,
  0.0, 1.0, 0.05, 0, 0.0,
  0.05, 0.0, 1.05, 0, -0.02,
  0, 0, 0, 1, 0,
];

interface FilmState {
  grainIntensity: number;
  flickerSpeed: number;
  colorGradeStrength: number;
}

let state: FilmState = {
  grainIntensity: 0.08,
  flickerSpeed: 12,
  colorGradeStrength: 1.0,
};

const actor: Actor = {
  metadata,

  async setup(): Promise<void> {
    // Randomize for variety
    state.grainIntensity = 0.05 + Math.random() * 0.06; // 0.05-0.11
    state.flickerSpeed = 10 + Math.random() * 8; // 10-18 Hz
    state.colorGradeStrength = 0.7 + Math.random() * 0.6; // 0.7-1.3

    console.log(`[film-grain] Setup: grain=${state.grainIntensity.toFixed(3)}`);
  },

  update(api: ActorUpdateAPI, _frame: FrameContext): void {
    const isDarkMode = api.context.display.isDarkMode();

    // Apply mode-appropriate custom shader for grain and flicker
    if (isDarkMode) {
      api.filter.customShader(FILM_GRAIN_SHADER_DARK);
      // Vintage color grading for dark mode
      api.filter.colorMatrix(VINTAGE_MATRIX_DARK);
      // Film-like vignette (darker edges for dark mode)
      api.filter.vignette(0.35, 0.5);
    } else {
      api.filter.customShader(FILM_GRAIN_SHADER_LIGHT);
      // Cooler color grading for light mode
      api.filter.colorMatrix(VINTAGE_MATRIX_LIGHT);
      // Inverted vignette effect for light mode (lighten edges)
      // Using negative vignette strength creates a lightening effect at edges
      api.filter.vignette(-0.25, 0.5);
    }
  },

  async teardown(): Promise<void> {
    console.log('[film-grain] Teardown complete');
  },
};

registerActor(actor);

export default actor;
