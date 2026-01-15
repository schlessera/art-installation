/**
 * Holographic Display Filter Actor
 *
 * Futuristic holographic projection effect with:
 * - Rainbow interference patterns (like holographic foil)
 * - Horizontal scan lines that sweep down the image
 * - Subtle flicker (hologram instability)
 * - Translucent color layers
 * - Chromatic aberration for hologram edge effects
 *
 * The effect makes artwork look like it's being projected
 * as a sci-fi hologram, complete with the characteristic
 * shimmer and rainbow reflections.
 *
 * Adapts to light/dark mode:
 * - Dark mode: Blue/cyan sci-fi hologram with additive rainbow tint, dark base tint
 * - Light mode: Magenta/pink hologram with subtractive effects, light translucent overlay
 */

import type {
  Actor,
  ActorMetadata,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';
import { registerActor } from '@art/actor-sdk';

const metadata: ActorMetadata = {
  id: 'holographic-display',
  name: 'Holographic Display',
  description: 'Futuristic holographic projection with rainbow interference',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['filter', 'holographic', 'futuristic', 'scifi', 'rainbow', 'digital'],
  createdAt: new Date('2026-01-12'),
  preferredDuration: 60,
  requiredContexts: ['display'],
  isGlobalFilter: true,
};

/**
 * Holographic display shader for dark mode
 *
 * Key techniques:
 * 1. Rainbow interference - uses angle from center to create color gradient
 *    (simulates light diffraction on holographic surface)
 * 2. Sweeping scan line - vertical position cycles over time
 * 3. Horizontal display lines - simulates projection scan lines
 * 4. Flicker - random brightness variation for unstable hologram feel
 * 5. Color overlay - adds blue/cyan tint typical of holograms
 */
const HOLOGRAPHIC_SHADER_DARK = `
  void main() {
    vec2 uv = vTextureCoord;
    vec4 color = texture(uTexture, uv);

    // === RAINBOW INTERFERENCE PATTERN ===
    // Calculate angle from center - this creates radial color variation
    // Similar to how holographic foil shows different colors at different angles
    float angle = atan(uv.y - 0.5, uv.x - 0.5);
    float rainbow = angle + uTime * 0.5;  // Rotate over time

    // Generate RGB from angle using phase-shifted sine waves
    // 2.094 radians = 120 degrees (RGB are 120° apart on color wheel)
    vec3 interference = vec3(
      sin(rainbow) * 0.5 + 0.5,
      sin(rainbow + 2.094) * 0.5 + 0.5,
      sin(rainbow + 4.188) * 0.5 + 0.5
    );

    // === SWEEPING SCAN LINE ===
    // A bright line that travels down the screen continuously
    // fract() creates repeating 0-1 cycle
    float scanY = fract(uTime * 0.3);  // Vertical position (0-1, repeating)

    // smoothstep creates soft-edged glow around scan line position
    float scanLine = smoothstep(0.0, 0.02, abs(uv.y - scanY));  // Sharp edge
    float scanGlow = 1.0 - smoothstep(0.0, 0.1, abs(uv.y - scanY));  // Soft glow

    // === HORIZONTAL DISPLAY LINES ===
    // Fine horizontal lines like old projection displays
    float lines = sin(uv.y * uResolution.y * 0.5) * 0.03;

    // === HOLOGRAPHIC FLICKER ===
    // Random brightness variation creates unstable projection feel
    // High frequency (30 Hz) for subtle shimmer
    float flicker = 0.95 + sin(uTime * 30.0) * 0.05;

    // === COMBINE EFFECTS ===
    color.rgb *= flicker;                              // Apply flicker
    color.rgb -= lines;                                 // Subtract scan lines (darken)
    color.rgb += interference * 0.1;                    // Add rainbow tint (subtle)
    color.rgb += scanGlow * vec3(0.3, 0.5, 1.0) * 0.3; // Cyan scan line glow

    // === HOLOGRAM BASE TINT ===
    // Mix in dark blue-gray to simulate translucent hologram
    color.rgb = mix(color.rgb, vec3(0.1, 0.15, 0.2), 0.1);

    // Slight blue boost for sci-fi hologram aesthetic
    color.b *= 1.1;

    finalColor = color;
  }
`;

/**
 * Holographic display shader for light mode
 *
 * Inverted approach for light backgrounds:
 * - Magenta/pink hologram tint instead of blue/cyan
 * - Subtractive effects where dark mode uses additive
 * - Lighter translucent overlay instead of dark tint
 * - Scan line creates shadow effect instead of glow
 */
const HOLOGRAPHIC_SHADER_LIGHT = `
  void main() {
    vec2 uv = vTextureCoord;
    vec4 color = texture(uTexture, uv);

    // === RAINBOW INTERFERENCE PATTERN ===
    // Same angle-based rainbow but with shifted phase for warm tones
    float angle = atan(uv.y - 0.5, uv.x - 0.5);
    float rainbow = angle + uTime * 0.5 + 1.57;  // Phase shift for magenta emphasis

    // Generate RGB - slightly different phase offsets for warmer palette
    vec3 interference = vec3(
      sin(rainbow + 1.047) * 0.5 + 0.5,  // Shifted for more red
      sin(rainbow + 3.141) * 0.5 + 0.5,  // Shifted for less green
      sin(rainbow + 5.236) * 0.5 + 0.5   // Shifted for more blue-magenta
    );

    // === SWEEPING SCAN LINE ===
    float scanY = fract(uTime * 0.3);

    // For light mode, scan line creates subtle darkening instead of glow
    float scanShadow = smoothstep(0.0, 0.08, abs(uv.y - scanY));

    // === HORIZONTAL DISPLAY LINES ===
    // Lighter lines for light backgrounds
    float lines = sin(uv.y * uResolution.y * 0.5) * 0.025;

    // === HOLOGRAPHIC FLICKER ===
    // Slightly reduced flicker for light mode
    float flicker = 0.97 + sin(uTime * 30.0) * 0.03;

    // === COMBINE EFFECTS ===
    color.rgb *= flicker;
    color.rgb += lines;                                    // Add scan lines (lighten)
    color.rgb -= interference * 0.08;                      // Subtract rainbow (creates colored shadows)
    color.rgb *= scanShadow * 0.15 + 0.85;                 // Darken at scan line position

    // === HOLOGRAM BASE TINT ===
    // Mix in light pink-lavender for holographic overlay on light backgrounds
    color.rgb = mix(color.rgb, vec3(0.95, 0.9, 0.98), 0.08);

    // Slight magenta boost for warm hologram aesthetic
    color.r *= 1.05;
    color.b *= 1.03;

    finalColor = color;
  }
`;

interface HoloState {
  scanSpeed: number;
  flickerIntensity: number;
  rainbowStrength: number;
}

let state: HoloState = {
  scanSpeed: 0.3,
  flickerIntensity: 0.05,
  rainbowStrength: 0.1,
};

const actor: Actor = {
  metadata,

  async setup(): Promise<void> {
    // Randomize for variety
    state.scanSpeed = 0.2 + Math.random() * 0.2;       // 0.2-0.4
    state.flickerIntensity = 0.03 + Math.random() * 0.04; // 0.03-0.07
    state.rainbowStrength = 0.08 + Math.random() * 0.06;  // 0.08-0.14

    console.log(`[holographic-display] Setup: scanSpeed=${state.scanSpeed.toFixed(2)}`);
  },

  update(api: ActorUpdateAPI, _frame: FrameContext): void {
    const isDarkMode = api.context.display.isDarkMode();

    if (isDarkMode) {
      // Dark mode: Blue/cyan sci-fi hologram
      api.filter.customShader(HOLOGRAPHIC_SHADER_DARK);

      // Cyan/magenta chromatic split for hologram edge dispersion
      // Subtle offset creates "edge bleeding" effect
      api.filter.chromaticAberration([1, 0.5], [-1, -0.5]);
    } else {
      // Light mode: Magenta/pink hologram with warmer tones
      api.filter.customShader(HOLOGRAPHIC_SHADER_LIGHT);

      // Magenta/green chromatic split for warm hologram dispersion
      // Inverted direction for light backgrounds
      api.filter.chromaticAberration([-0.8, 0.4], [0.8, -0.4]);
    }
  },

  async teardown(): Promise<void> {
    console.log('[holographic-display] Teardown complete');
  },
};

registerActor(actor);

export default actor;
