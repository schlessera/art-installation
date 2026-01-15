/**
 * Underwater Caustics Filter Actor
 *
 * Simulates viewing through rippling water with:
 * - Wave distortion (image warps like underwater refraction)
 * - Dancing caustic light patterns (bright network of light rays)
 * - Blue-green color shift (underwater color absorption)
 * - Depth fog effect (darker toward edges)
 *
 * Caustics are the bright, dancing light patterns you see on pool floors -
 * caused by light refracting through a wavy water surface.
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
  id: 'underwater-caustics',
  name: 'Underwater Caustics',
  description: 'Viewing through rippling water with dancing caustic light patterns',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['filter', 'underwater', 'caustics', 'water', 'ocean', 'dreamy'],
  createdAt: new Date('2026-01-12'),
  preferredDuration: 60,
  requiredContexts: [],
  isGlobalFilter: true,
};

/**
 * Underwater caustics shader (dark mode)
 *
 * Key techniques:
 * 1. Wave distortion - sine waves displace UV coordinates
 * 2. Caustic pattern - overlapping sine waves create bright network
 * 3. Color absorption - reduce red, boost blue (water filters red light)
 * 4. Depth fog - darken edges to suggest depth/murkiness
 */
const UNDERWATER_SHADER_DARK = `
  void main() {
    vec2 uv = vTextureCoord;

    // === WAVE DISTORTION ===
    // Sine waves create rippling displacement effect
    // Different frequencies on X and Y create organic pattern
    // Time offset makes waves appear to move
    float wave1 = sin(uv.y * 15.0 + uTime * 1.5) * 0.004;  // Vertical waves
    float wave2 = sin(uv.x * 12.0 + uTime * 1.2) * 0.003;  // Horizontal waves
    float wave3 = sin((uv.x + uv.y) * 8.0 + uTime * 0.8) * 0.002;  // Diagonal

    // Apply displacement to UV coordinates
    uv += vec2(wave1 + wave3, wave2 + wave3);

    // Sample the distorted image
    vec4 color = texture(uTexture, uv);

    // === CAUSTIC LIGHT PATTERN ===
    // Caustics are created by overlapping sine waves
    // The result forms a bright network pattern like pool floor lighting
    vec2 causticUV = uv * 8.0 + uTime * 0.5;  // Scale and animate

    // Primary caustic pattern - product of two sine waves
    float caustic = sin(causticUV.x) * sin(causticUV.y);
    // Secondary pattern at different angle for complexity
    caustic += sin(causticUV.x * 1.5 + causticUV.y * 0.7 + uTime);
    // Normalize to 0-1 range
    caustic = caustic * 0.5 + 0.5;
    // Power function makes bright spots brighter, dark spots darker
    // This creates the characteristic "network of light" look
    caustic = pow(caustic, 3.0) * 0.15;  // 0.15 = caustic intensity

    // === UNDERWATER COLOR SHIFT ===
    // Water absorbs red light first, then green, blue last
    // This creates the characteristic blue-green underwater look
    color.r *= 0.7;   // Red absorbed most
    color.g *= 0.9;   // Green partially absorbed
    color.b *= 1.1;   // Blue enhanced

    // Add caustic highlights (white light patterns)
    color.rgb += caustic;

    // === DEPTH FOG ===
    // Edges are darker, simulating murky water depth
    // Creates focus on center and sense of being surrounded by water
    float depth = length(uv - 0.5) * 0.3;
    color.rgb *= 1.0 - depth;

    finalColor = color;
  }
`;

/**
 * Underwater caustics shader (light mode)
 *
 * Adapted for light backgrounds:
 * - Caustics are dark shadows instead of bright highlights
 * - Color shift inverted (warm tones instead of blue)
 * - Depth fog lightens edges instead of darkening
 */
const UNDERWATER_SHADER_LIGHT = `
  void main() {
    vec2 uv = vTextureCoord;

    // === WAVE DISTORTION ===
    // Same wave pattern, slightly reduced intensity for light mode
    float wave1 = sin(uv.y * 15.0 + uTime * 1.5) * 0.003;  // Vertical waves
    float wave2 = sin(uv.x * 12.0 + uTime * 1.2) * 0.0025;  // Horizontal waves
    float wave3 = sin((uv.x + uv.y) * 8.0 + uTime * 0.8) * 0.0015;  // Diagonal

    // Apply displacement to UV coordinates
    uv += vec2(wave1 + wave3, wave2 + wave3);

    // Sample the distorted image
    vec4 color = texture(uTexture, uv);

    // === CAUSTIC SHADOW PATTERN ===
    // In light mode, caustics appear as subtle dark shadows
    // (light refracting creates both bright and dark areas)
    vec2 causticUV = uv * 8.0 + uTime * 0.5;  // Scale and animate

    // Primary caustic pattern - product of two sine waves
    float caustic = sin(causticUV.x) * sin(causticUV.y);
    // Secondary pattern at different angle for complexity
    caustic += sin(causticUV.x * 1.5 + causticUV.y * 0.7 + uTime);
    // Normalize to 0-1 range
    caustic = caustic * 0.5 + 0.5;
    // Power function creates the network pattern
    caustic = pow(caustic, 3.0) * 0.12;  // Slightly reduced intensity

    // === UNDERWATER COLOR SHIFT (INVERTED) ===
    // For light mode, shift toward warmer underwater tones
    // This represents shallow, sun-lit water
    color.r *= 1.05;   // Slightly warm
    color.g *= 0.95;   // Green slightly reduced
    color.b *= 0.9;    // Blue reduced (inverted from dark mode)

    // Subtract caustic shadows (dark patterns on light background)
    color.rgb -= caustic;

    // === DEPTH FOG (INVERTED) ===
    // Edges brighten slightly, creating ethereal underwater glow
    float depth = length(uv - 0.5) * 0.15;
    color.rgb = mix(color.rgb, vec3(1.0), depth * 0.3);

    finalColor = color;
  }
`;

/**
 * Color matrix to enhance underwater blue tones (dark mode)
 * Further reduces red channel and boosts blue
 */
const UNDERWATER_MATRIX_DARK: ColorMatrix = [
  0.8, 0, 0, 0, 0,      // Red reduced to 80%
  0, 0.9, 0, 0, 0,      // Green reduced to 90%
  0, 0, 1.2, 0, 0.05,   // Blue boosted to 120% + 0.05 offset
  0, 0, 0, 1, 0,        // Alpha unchanged
];

/**
 * Color matrix for light mode underwater effect
 * Warmer tones representing sun-lit shallow water
 */
const UNDERWATER_MATRIX_LIGHT: ColorMatrix = [
  1.1, 0, 0, 0, 0,      // Red slightly boosted
  0, 0.95, 0, 0, 0,     // Green slightly reduced
  0, 0, 0.85, 0, 0,     // Blue reduced (inverted from dark)
  0, 0, 0, 1, 0,        // Alpha unchanged
];

interface UnderwaterState {
  waveIntensity: number;
  causticBrightness: number;
}

let state: UnderwaterState = {
  waveIntensity: 0.004,
  causticBrightness: 0.15,
};

const actor: Actor = {
  metadata,

  async setup(): Promise<void> {
    // Randomize for variety - calm vs turbulent water
    state.waveIntensity = 0.003 + Math.random() * 0.003;  // 0.003-0.006
    state.causticBrightness = 0.1 + Math.random() * 0.1;  // 0.1-0.2

    console.log(`[underwater-caustics] Setup: waves=${state.waveIntensity.toFixed(4)}`);
  },

  update(api: ActorUpdateAPI, _frame: FrameContext): void {
    // Select shader and color matrix based on display mode
    const isDarkMode = api.context.display.isDarkMode();

    // Apply underwater distortion and caustics shader
    // Dark mode: bright caustic highlights on dark background
    // Light mode: subtle caustic shadows on light background
    api.filter.customShader(isDarkMode ? UNDERWATER_SHADER_DARK : UNDERWATER_SHADER_LIGHT);

    // Additional color grading for underwater feel
    // Dark mode: blue-green deep water tones
    // Light mode: warmer sun-lit shallow water tones
    api.filter.colorMatrix(isDarkMode ? UNDERWATER_MATRIX_DARK : UNDERWATER_MATRIX_LIGHT);
  },

  async teardown(): Promise<void> {
    console.log('[underwater-caustics] Teardown complete');
  },
};

registerActor(actor);

export default actor;
