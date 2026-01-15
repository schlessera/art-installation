/**
 * Ethereal Glow Filter Actor
 *
 * Creates a dreamy, otherworldly effect that adapts to display mode:
 *
 * Dark Mode (default):
 * - Soft light halos around bright areas (bloom)
 * - Cool color shift (ethereal/magical atmosphere)
 * - Brightness-masked glow with additive blending
 *
 * Light Mode:
 * - Soft shadows around dark areas (inverse bloom)
 * - Warm color shift (golden/sepia atmosphere)
 * - Darkness-masked shadow with darkening blend
 *
 * Both modes feature:
 * - Gentle focus vignette
 * - Slight desaturation for dreamy feel
 *
 * Strength varies randomly from 1x to 3x intensity each cycle,
 * affecting blur size, bloom/shadow intensity, glow/shadow boost, and tint.
 */

import type {
  Actor,
  ActorMetadata,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';
import { registerActor } from '@art/actor-sdk';

const metadata: ActorMetadata = {
  id: 'ethereal-glow',
  name: 'Ethereal Glow',
  description: 'Dreamy otherworldly bloom/shadow effect adapting to light/dark mode',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.1.0',
  tags: ['filter', 'glow', 'bloom', 'dreamy', 'ethereal', 'magical', 'adaptive'],
  createdAt: new Date('2026-01-12'),
  preferredDuration: 60,
  requiredContexts: [],
  isGlobalFilter: true,
};

interface EtherealState {
  blurSize: number;
  bloomIntensity: number;
  glowBoost: number;
  tintStrength: number;
  desaturation: number;
  isDarkMode: boolean;
  darkModeShaderCode: string;
  lightModeShaderCode: string;
}

let state: EtherealState = {
  blurSize: 0.008,
  bloomIntensity: 0.8,
  glowBoost: 0.15,
  tintStrength: 1.0,
  desaturation: 0.1,
  isDarkMode: true,
  darkModeShaderCode: '',
  lightModeShaderCode: '',
};

/**
 * Generate dark mode shader - brightening bloom effect.
 * Creates soft light halos around bright areas with cool tint.
 */
function generateDarkModeShader(): string {
  return `
  void main() {
    vec2 uv = vTextureCoord;
    vec4 color = texture(uTexture, uv);

    // === BLOOM SAMPLING ===
    vec4 bloom = vec4(0.0);
    float blurSize = ${state.blurSize.toFixed(4)};

    for(float x = -2.0; x <= 2.0; x++) {
      for(float y = -2.0; y <= 2.0; y++) {
        bloom += texture(uTexture, uv + vec2(x, y) * blurSize);
      }
    }
    bloom /= 25.0;

    // === BRIGHTNESS-AWARE BLOOM ===
    float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    float bloomMask = smoothstep(0.1, 0.5, luminance) * 0.7 + 0.3;

    // === ETHEREAL COLOR TINT (cool/blue for dark mode) ===
    float tintStrength = ${state.tintStrength.toFixed(2)};
    vec3 etherealTint = mix(vec3(1.0), vec3(0.88, 0.94, 1.12), tintStrength);

    // === SOFT GLOW OVERLAY (brighten) ===
    float glowBoost = 1.0 + luminance * ${state.glowBoost.toFixed(2)};

    // === COMBINE EFFECTS ===
    float bloomIntensity = ${state.bloomIntensity.toFixed(2)};
    finalColor = color * glowBoost + bloom * bloomMask * bloomIntensity;
    finalColor.rgb *= etherealTint;

    // Desaturation for dreamy feel
    float gray = dot(finalColor.rgb, vec3(0.299, 0.587, 0.114));
    finalColor.rgb = mix(finalColor.rgb, vec3(gray), ${state.desaturation.toFixed(2)});

    finalColor.rgb = clamp(finalColor.rgb, 0.0, 1.0);
    finalColor.a = 1.0;
  }
`;
}

/**
 * Generate light mode shader - darkening shadow effect.
 * Creates soft shadows around dark areas with warm tint.
 * Uses multiply-like blending instead of additive.
 */
function generateLightModeShader(): string {
  return `
  void main() {
    vec2 uv = vTextureCoord;
    vec4 color = texture(uTexture, uv);

    // === SHADOW SAMPLING (same blur technique) ===
    vec4 blurred = vec4(0.0);
    float blurSize = ${state.blurSize.toFixed(4)};

    for(float x = -2.0; x <= 2.0; x++) {
      for(float y = -2.0; y <= 2.0; y++) {
        blurred += texture(uTexture, uv + vec2(x, y) * blurSize);
      }
    }
    blurred /= 25.0;

    // === DARKNESS-AWARE SHADOW (inverse of brightness-aware bloom) ===
    float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    // Mask stronger on dark areas (inverse of dark mode)
    float shadowMask = smoothstep(0.9, 0.5, luminance) * 0.7 + 0.3;

    // === ETHEREAL COLOR TINT (warm/golden for light mode) ===
    float tintStrength = ${state.tintStrength.toFixed(2)};
    // Warm sepia-ish tint instead of cool blue
    vec3 etherealTint = mix(vec3(1.0), vec3(1.08, 1.02, 0.92), tintStrength);

    // === SOFT SHADOW OVERLAY (darken instead of brighten) ===
    // Subtract from brightness based on darkness of area
    float shadowBoost = 1.0 - (1.0 - luminance) * ${state.glowBoost.toFixed(2)};

    // === COMBINE EFFECTS (multiply-style blending) ===
    float shadowIntensity = ${state.bloomIntensity.toFixed(2)};
    // Mix towards blurred dark areas instead of adding bright bloom
    vec3 shadowColor = blurred.rgb * shadowMask * shadowIntensity;
    finalColor.rgb = color.rgb * shadowBoost;
    // Darken using multiply blend: result = base * (1 - shadow) + shadow * base
    finalColor.rgb = finalColor.rgb * (1.0 - shadowMask * shadowIntensity * 0.3) + shadowColor * 0.1;
    finalColor.rgb *= etherealTint;

    // Desaturation for dreamy feel
    float gray = dot(finalColor.rgb, vec3(0.299, 0.587, 0.114));
    finalColor.rgb = mix(finalColor.rgb, vec3(gray), ${state.desaturation.toFixed(2)});

    finalColor.rgb = clamp(finalColor.rgb, 0.0, 1.0);
    finalColor.a = 1.0;
  }
`;
}

const actor: Actor = {
  metadata,

  async setup(): Promise<void> {
    // Randomize strength - can be 1x to 3x intensity
    const strengthMultiplier = 1.0 + Math.random() * 2.0; // 1.0 - 3.0

    // Base values scaled by strength multiplier
    state.blurSize = 0.008 * (0.8 + strengthMultiplier * 0.4);      // 0.008 - 0.02
    state.bloomIntensity = 0.8 * strengthMultiplier;                 // 0.8 - 2.4
    state.glowBoost = 0.15 * strengthMultiplier;                     // 0.15 - 0.45
    state.tintStrength = 0.5 + Math.random() * 0.5 * strengthMultiplier; // 0.5 - 2.0
    state.desaturation = 0.1 + Math.random() * 0.15 * strengthMultiplier; // 0.1 - 0.55

    // Initialize with dark mode (will be updated in first update() call)
    state.isDarkMode = true;

    // Pre-generate both shader variants with baked-in parameters
    state.darkModeShaderCode = generateDarkModeShader();
    state.lightModeShaderCode = generateLightModeShader();

    console.log(`[ethereal-glow] Setup: strength=${strengthMultiplier.toFixed(2)}x, blur=${state.blurSize.toFixed(4)}, bloom=${state.bloomIntensity.toFixed(2)}`);
  },

  update(api: ActorUpdateAPI, _frame: FrameContext): void {
    // Check current display mode
    const isDarkMode = api.context.display.isDarkMode();

    // Log mode changes for debugging
    if (isDarkMode !== state.isDarkMode) {
      console.log(`[ethereal-glow] Display mode changed: ${isDarkMode ? 'dark' : 'light'}`);
      state.isDarkMode = isDarkMode;
    }

    // Apply appropriate shader based on display mode
    if (isDarkMode) {
      // Dark mode: brightening bloom with cool tint
      api.filter.customShader(state.darkModeShaderCode);
    } else {
      // Light mode: darkening shadow with warm tint
      api.filter.customShader(state.lightModeShaderCode);
    }

    // Soft vignette draws focus to center, adds depth
    // Slightly stronger in light mode to compensate for brighter background
    api.filter.vignette(isDarkMode ? 0.2 : 0.25, 0.7);
  },

  async teardown(): Promise<void> {
    console.log('[ethereal-glow] Teardown complete');
  },
};

registerActor(actor);

export default actor;
