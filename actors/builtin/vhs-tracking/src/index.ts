/**
 * VHS Tracking Filter Actor
 *
 * Nostalgic VHS tape aesthetic with:
 * - Horizontal tracking distortion (wavy lines that shift horizontally)
 * - Color bleeding between RGB channels (analog signal degradation)
 * - Analog noise grain
 * - Occasional severe "tracking" glitches that displace portions of image
 * - Slight desaturation (worn tape look)
 *
 * The effect simulates a VHS tape with imperfect tracking,
 * evoking 1980s-90s home video nostalgia.
 */

import type {
  Actor,
  ActorMetadata,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';
import { registerActor } from '@art/actor-sdk';

const metadata: ActorMetadata = {
  id: 'vhs-tracking',
  name: 'VHS Tracking',
  description: 'Nostalgic VHS tape aesthetic with tracking distortion',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['filter', 'vhs', 'retro', 'glitch', 'analog', 'vintage'],
  createdAt: new Date('2026-01-12'),
  preferredDuration: 60,
  requiredContexts: [],
  isGlobalFilter: true,
};

/**
 * VHS distortion shader (dark mode)
 *
 * Key effects:
 * 1. Tracking noise - sinusoidal horizontal displacement that varies by Y position
 * 2. Glitch bands - occasional severe horizontal shifts (step function triggers)
 * 3. Color separation - R channel offset simulates YIQ color bleeding
 * 4. Desaturation - reduces color intensity for worn tape look
 */
const VHS_SHADER_DARK = `
  void main() {
    vec2 uv = vTextureCoord;

    // === TRACKING DISTORTION ===
    // Multiple sine waves at different frequencies create organic "wobble"
    // The tracking error varies by vertical position (uv.y)
    float trackingNoise = sin(uv.y * 50.0 + uTime * 3.0) * 0.003;  // Primary wobble
    trackingNoise += sin(uv.y * 120.0 + uTime * 7.0) * 0.001;      // High-freq detail
    trackingNoise += sin(uv.y * 25.0 - uTime * 2.0) * 0.002;       // Slower drift

    // === SEVERE GLITCH BANDS ===
    // Occasionally trigger large horizontal displacement
    // step() creates sharp on/off, sin() provides timing variation
    float glitchTrigger = sin(uTime * 0.5 + uv.y * 10.0);
    float glitch = step(0.995, glitchTrigger) * 0.05;  // 0.5% of time, 5% displacement

    // Apply horizontal displacement
    uv.x += trackingNoise + glitch;

    // === COLOR CHANNEL SEPARATION ===
    // VHS uses YIQ color encoding which bleeds between channels
    // Simulate by offsetting R channel horizontally
    float rOffset = 0.003;  // Red channel shift amount
    vec4 color;
    color.r = texture(uTexture, uv + vec2(rOffset, 0.0)).r;   // Red shifted right
    color.g = texture(uTexture, uv).g;                          // Green centered
    color.b = texture(uTexture, uv - vec2(rOffset * 0.5, 0.0)).b; // Blue slight left
    color.a = 1.0;

    // === DESATURATION ===
    // Worn VHS tapes lose color saturation over time
    float gray = dot(color.rgb, vec3(0.3, 0.59, 0.11));  // Luminance
    color.rgb = mix(vec3(gray), color.rgb, 0.8);         // 80% color, 20% gray

    // === SCAN LINE HINT ===
    // Subtle horizontal lines from analog video (darken for dark mode)
    float scanline = sin(uv.y * uResolution.y * 1.0) * 0.02;
    color.rgb -= scanline;

    finalColor = color;
  }
`;

/**
 * VHS distortion shader (light mode)
 *
 * Same effects as dark mode but with inverted scanline behavior
 * to work properly on light backgrounds.
 */
const VHS_SHADER_LIGHT = `
  void main() {
    vec2 uv = vTextureCoord;

    // === TRACKING DISTORTION ===
    float trackingNoise = sin(uv.y * 50.0 + uTime * 3.0) * 0.003;
    trackingNoise += sin(uv.y * 120.0 + uTime * 7.0) * 0.001;
    trackingNoise += sin(uv.y * 25.0 - uTime * 2.0) * 0.002;

    // === SEVERE GLITCH BANDS ===
    float glitchTrigger = sin(uTime * 0.5 + uv.y * 10.0);
    float glitch = step(0.995, glitchTrigger) * 0.05;

    uv.x += trackingNoise + glitch;

    // === COLOR CHANNEL SEPARATION ===
    float rOffset = 0.003;
    vec4 color;
    color.r = texture(uTexture, uv + vec2(rOffset, 0.0)).r;
    color.g = texture(uTexture, uv).g;
    color.b = texture(uTexture, uv - vec2(rOffset * 0.5, 0.0)).b;
    color.a = 1.0;

    // === DESATURATION ===
    // Light mode uses slightly more desaturation for washed-out look
    float gray = dot(color.rgb, vec3(0.3, 0.59, 0.11));
    color.rgb = mix(vec3(gray), color.rgb, 0.75);  // 75% color, 25% gray

    // === SCAN LINE HINT ===
    // Add scanlines (lighten) instead of subtract for light mode
    float scanline = sin(uv.y * uResolution.y * 1.0) * 0.02;
    color.rgb += scanline;

    finalColor = color;
  }
`;

interface VhsState {
  noiseIntensity: number;
  glitchFrequency: number;
}

let state: VhsState = {
  noiseIntensity: 0.15,
  glitchFrequency: 0.5,
};

const actor: Actor = {
  metadata,

  async setup(): Promise<void> {
    // Randomize for variety - some "tapes" are more worn than others
    state.noiseIntensity = 0.1 + Math.random() * 0.1;  // 0.1-0.2
    state.glitchFrequency = 0.3 + Math.random() * 0.4; // 0.3-0.7

    console.log(`[vhs-tracking] Setup: noise=${state.noiseIntensity.toFixed(2)}`);
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const isDark = api.context.display.isDarkMode();

    // Apply VHS distortion shader (handles tracking, color bleed, desaturation)
    // Use mode-appropriate shader for correct scanline behavior
    api.filter.customShader(isDark ? VHS_SHADER_DARK : VHS_SHADER_LIGHT);

    // Analog noise grain - varies each frame for authentic grain movement
    // Slightly reduce intensity in light mode for better visibility
    const noiseIntensity = isDark ? state.noiseIntensity : state.noiseIntensity * 0.7;
    api.filter.noise(noiseIntensity, frame.frameCount);

    // Subtle vignette - old TVs had darker/lighter edges
    // Dark mode: darken edges (standard vignette)
    // Light mode: use lighter vignette for "overexposed edges" effect
    if (isDark) {
      api.filter.vignette(0.25, 0.6);
    } else {
      // Light mode: softer, more subtle vignette
      api.filter.vignette(0.2, 0.5);
    }
  },

  async teardown(): Promise<void> {
    console.log('[vhs-tracking] Teardown complete');
  },
};

registerActor(actor);

export default actor;
