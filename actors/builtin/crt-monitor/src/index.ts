/**
 * CRT Monitor Filter Actor
 *
 * Classic CRT television aesthetic with scanlines, screen curvature,
 * phosphor glow, and subtle color bleeding. Adapts to light/dark mode.
 */

import type {
  Actor,
  ActorMetadata,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';
import { registerActor } from '@art/actor-sdk';

const metadata: ActorMetadata = {
  id: 'crt-monitor',
  name: 'CRT Monitor',
  description: 'Classic CRT television aesthetic with scanlines and curvature',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['filter', 'crt', 'retro', 'scanlines', 'vintage'],
  createdAt: new Date('2026-01-12'),
  preferredDuration: 60,
  requiredContexts: ['display'],
  isGlobalFilter: true,
};

/**
 * Generate CRT shader with mode-aware parameters.
 * @param isDarkMode - Whether dark mode is active
 */
function createCrtShader(isDarkMode: boolean): string {
  // Out-of-bounds color: black for dark mode, white for light mode
  const boundsColor = isDarkMode ? '0.0, 0.0, 0.0' : '1.0, 1.0, 1.0';

  // Scanline operation: subtract in dark mode (darker lines), add in light mode (lighter lines)
  const scanlineOp = isDarkMode ? '-' : '+';

  // Phosphor glow direction: add brightness in dark mode, subtract in light mode
  const glowOp = isDarkMode ? '+' : '-';

  // Color tint: green tint for dark mode (classic CRT), slight sepia for light mode
  const tintCode = isDarkMode
    ? 'color.g *= 1.02;' // Green tint
    : 'color.r *= 1.01; color.g *= 0.99;'; // Warm sepia-ish tint

  // Brightness adjustment: boost for dark mode, slight reduction for light mode
  const brightnessMultiplier = isDarkMode ? '1.1' : '0.95';

  return `
  void main() {
    vec2 uv = vTextureCoord - 0.5;

    // Barrel distortion (screen curvature)
    float dist = length(uv);
    float distortion = 1.0 + dist * dist * 0.1;
    uv *= distortion;
    uv += 0.5;

    // Check bounds (mode-aware outside color)
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      finalColor = vec4(${boundsColor}, 1.0);
      return;
    }

    vec4 color = texture(uTexture, uv);

    // Scanlines (horizontal lines) - direction depends on mode
    float scanline = sin(uv.y * uResolution.y * 2.0) * 0.04;
    color.rgb ${scanlineOp}= scanline;

    // RGB phosphor subpixel pattern
    float pixelX = fract(uv.x * uResolution.x);
    vec3 phosphor = vec3(
      smoothstep(0.0, 0.33, pixelX) * smoothstep(0.66, 0.33, pixelX),
      smoothstep(0.33, 0.66, pixelX) * smoothstep(1.0, 0.66, pixelX),
      smoothstep(0.66, 1.0, pixelX) + smoothstep(0.33, 0.0, pixelX)
    );
    color.rgb *= 0.8 + phosphor * 0.4;

    // Phosphor glow simulation (subtle brightness variation) - direction depends on mode
    float glow = sin(uv.y * uResolution.y * 0.5 + uTime * 2.0) * 0.02;
    color.rgb ${glowOp}= glow;

    // Mode-aware color tint
    ${tintCode}

    // Mode-aware brightness adjustment
    color.rgb *= ${brightnessMultiplier};

    finalColor = color;
  }
`;
}

interface CrtState {
  scanlineIntensity: number;
  curvatureStrength: number;
  phosphorGlow: number;
  lastMode: boolean | null;
  cachedDarkShader: string;
  cachedLightShader: string;
}

let state: CrtState = {
  scanlineIntensity: 0.04,
  curvatureStrength: 0.1,
  phosphorGlow: 0.02,
  lastMode: null,
  cachedDarkShader: '',
  cachedLightShader: '',
};

const actor: Actor = {
  metadata,

  async setup(): Promise<void> {
    // Randomize slightly for variety
    state.scanlineIntensity = 0.03 + Math.random() * 0.03;
    state.curvatureStrength = 0.08 + Math.random() * 0.05;
    state.phosphorGlow = 0.015 + Math.random() * 0.015;

    // Pre-generate shaders for both modes
    state.cachedDarkShader = createCrtShader(true);
    state.cachedLightShader = createCrtShader(false);
    state.lastMode = null;

    console.log(`[crt-monitor] Setup: scanlines=${state.scanlineIntensity.toFixed(3)}`);
  },

  update(api: ActorUpdateAPI, _frame: FrameContext): void {
    const isDarkMode = api.context.display.isDarkMode();

    // Use cached shader for current mode
    const shader = isDarkMode ? state.cachedDarkShader : state.cachedLightShader;
    api.filter.customShader(shader);

    // Chromatic aberration for color fringing at edges
    api.filter.chromaticAberration([2, 0], [-2, 0]);

    // Vignette - darken edges in dark mode, lighten edges in light mode
    // In light mode, use inverted vignette (lighter at edges)
    if (isDarkMode) {
      api.filter.vignette(0.3, 0.5);
    } else {
      // For light mode, reduce vignette intensity for subtle edge lightening effect
      // The shader already handles the main contrast, so we use minimal vignette
      api.filter.vignette(0.15, 0.3);
    }

    // Log mode change for debugging
    if (state.lastMode !== isDarkMode) {
      console.log(`[crt-monitor] Mode changed to ${isDarkMode ? 'dark' : 'light'}`);
      state.lastMode = isDarkMode;
    }
  },

  async teardown(): Promise<void> {
    state.lastMode = null;
    console.log('[crt-monitor] Teardown complete');
  },
};

registerActor(actor);

export default actor;
