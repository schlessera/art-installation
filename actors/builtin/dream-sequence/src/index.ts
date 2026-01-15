/**
 * Dream Sequence Filter Actor
 *
 * Soft, hazy dreamlike quality with:
 * - Radial blur from center (motion blur radiating outward)
 * - Slow undulating distortion (image subtly warps)
 * - Desaturated colors (faded memory feel)
 * - Mode-aware color grading (warm in dark mode, cool in light mode)
 * - Mode-aware vignette (white fog in dark mode, dark fog in light mode)
 *
 * The effect makes artwork feel like a fading memory or dream,
 * with that characteristic soft-focus, slightly surreal quality
 * seen in movie flashback sequences.
 *
 * Light/Dark Mode Adaptation:
 * - Dark mode: Warm ethereal tint, fade to warm white at edges
 * - Light mode: Cool subtle tint, fade to soft dark at edges
 */

import type {
  Actor,
  ActorMetadata,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';
import { registerActor } from '@art/actor-sdk';

const metadata: ActorMetadata = {
  id: 'dream-sequence',
  name: 'Dream Sequence',
  description: 'Soft hazy dreamlike quality with radial blur',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['filter', 'dream', 'blur', 'memory', 'soft', 'ethereal'],
  createdAt: new Date('2026-01-12'),
  preferredDuration: 60,
  requiredContexts: [],
  isGlobalFilter: true,
};

/**
 * Dream sequence shader (dark mode)
 *
 * Key techniques:
 * 1. Radial blur - sample pixels along the line from center to current pixel
 *    This creates "zoom blur" effect radiating from center
 * 2. Undulating distortion - sine waves slowly warp the UV coordinates
 * 3. Desaturation - blend toward grayscale for faded memory look
 * 4. Warm tint - boost reds slightly for nostalgic feel
 * 5. White vignette - edges fade to warm white (opposite of normal vignette)
 *
 * The 8-sample radial blur is a good balance of quality vs performance.
 */
const DREAM_SHADER_DARK = `
  void main() {
    vec2 uv = vTextureCoord;
    vec2 center = vec2(0.5, 0.5);

    // === UNDULATING DISTORTION ===
    // Slow, organic wave that warps the image subtly
    // Creates dreamy, slightly surreal movement
    float distort = sin(uv.x * 5.0 + uTime * 0.5) * sin(uv.y * 4.0 + uTime * 0.4);
    // Apply distortion scaled by distance from center
    // (more distortion at edges, less in center for focus)
    uv += (uv - center) * distort * 0.02;

    // === RADIAL BLUR ===
    // Sample pixels along the line from center to current position
    // This creates a "zoom blur" or "radial motion blur" effect
    vec4 color = vec4(0.0);
    vec2 dir = uv - center;  // Direction from center
    float samples = 8.0;     // Number of samples (more = smoother but slower)

    for(float i = 0.0; i < 8.0; i++) {
      float t = i / samples;            // Sample position (0 to ~1)
      vec2 offset = dir * t * 0.03;     // Offset toward center (0.03 = blur amount)
      color += texture(uTexture, uv - offset);  // Sample along the radial line
    }
    color /= samples;  // Average all samples

    // === DESATURATION ===
    // Blend toward grayscale for faded memory quality
    // 0.4 = 40% gray, 60% color (fairly desaturated)
    float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    color.rgb = mix(color.rgb, vec3(gray), 0.4);

    // === WARM ETHEREAL TINT (Dark Mode) ===
    // Boost reds/yellows slightly for nostalgic warmth
    color.rgb *= vec3(1.1, 1.0, 0.9);

    // === WHITE VIGNETTE (Dark Mode) ===
    // Unlike normal vignette (fade to black), dreams fade to white/cream
    // This creates the "overexposed edges" look of flashback sequences
    float vignette = 1.0 - length(uv - center) * 0.5;  // 0 at edges, 1 at center
    // Mix toward warm cream color at edges
    vec3 fogColor = vec3(1.0, 0.98, 0.95);  // Warm white
    color.rgb = mix(fogColor, color.rgb, vignette);

    finalColor = color;
  }
`;

/**
 * Dream sequence shader (light mode)
 *
 * Adapted for light backgrounds:
 * - Cool subtle tint instead of warm (works better with bright content)
 * - Dark fog vignette instead of white (prevents washout)
 * - Slightly less desaturation to preserve detail
 */
const DREAM_SHADER_LIGHT = `
  void main() {
    vec2 uv = vTextureCoord;
    vec2 center = vec2(0.5, 0.5);

    // === UNDULATING DISTORTION ===
    // Same organic wave distortion as dark mode
    float distort = sin(uv.x * 5.0 + uTime * 0.5) * sin(uv.y * 4.0 + uTime * 0.4);
    uv += (uv - center) * distort * 0.02;

    // === RADIAL BLUR ===
    // Same radial blur technique
    vec4 color = vec4(0.0);
    vec2 dir = uv - center;
    float samples = 8.0;

    for(float i = 0.0; i < 8.0; i++) {
      float t = i / samples;
      vec2 offset = dir * t * 0.03;
      color += texture(uTexture, uv - offset);
    }
    color /= samples;

    // === DESATURATION (Light Mode) ===
    // Slightly less desaturation to preserve detail on light backgrounds
    // 0.3 = 30% gray, 70% color
    float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    color.rgb = mix(color.rgb, vec3(gray), 0.3);

    // === COOL SUBTLE TINT (Light Mode) ===
    // Slight cool/blue shift for ethereal feel on light backgrounds
    // This prevents the warm tint from making light content look muddy
    color.rgb *= vec3(0.95, 0.98, 1.05);

    // === DARK FOG VIGNETTE (Light Mode) ===
    // Fade to soft dark at edges instead of white
    // Prevents washout and creates dramatic focus on light backgrounds
    float vignette = 1.0 - length(uv - center) * 0.5;
    // Mix toward soft dark purple-gray at edges (dreamy shadow)
    vec3 fogColor = vec3(0.15, 0.12, 0.18);  // Soft dark with slight purple
    color.rgb = mix(fogColor, color.rgb, vignette);

    finalColor = color;
  }
`;

interface DreamState {
  blurIntensity: number;
  distortionStrength: number;
  desaturation: number;
}

let state: DreamState = {
  blurIntensity: 0.03,
  distortionStrength: 0.02,
  desaturation: 0.4,
};

const actor: Actor = {
  metadata,

  async setup(): Promise<void> {
    // Randomize for variety
    state.blurIntensity = 0.02 + Math.random() * 0.02;      // 0.02-0.04
    state.distortionStrength = 0.015 + Math.random() * 0.015; // 0.015-0.03
    state.desaturation = 0.3 + Math.random() * 0.2;          // 0.3-0.5

    console.log(`[dream-sequence] Setup: blur=${state.blurIntensity.toFixed(3)}`);
  },

  update(api: ActorUpdateAPI, _frame: FrameContext): void {
    // Select shader based on display mode
    const isDarkMode = api.context.display.isDarkMode();

    // Apply mode-appropriate dream shader
    // Dark mode: warm tint + white fog vignette (classic flashback look)
    // Light mode: cool tint + dark fog vignette (prevents washout)
    if (isDarkMode) {
      api.filter.customShader(DREAM_SHADER_DARK);
      // Soft additional vignette for extra focus on center (dark edges)
      api.filter.vignette(0.2, 0.8);
    } else {
      api.filter.customShader(DREAM_SHADER_LIGHT);
      // In light mode, shader already applies dark fog, so reduce additional vignette
      api.filter.vignette(0.15, 0.9);
    }
  },

  async teardown(): Promise<void> {
    console.log('[dream-sequence] Teardown complete');
  },
};

registerActor(actor);

export default actor;
