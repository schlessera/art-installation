/**
 * Neon Edge Detection Filter Actor
 *
 * Extracts edges from the image and renders them as glowing neon lines
 * against a contrasting background. Creates a Tron-like wireframe aesthetic.
 *
 * Key effects:
 * - Sobel edge detection (finds outlines/edges in the image)
 * - Neon color based on edge direction (different angles = different colors)
 * - Glow effect around edges (bloom)
 * - Contrasting background (dark in dark mode, light in light mode)
 *
 * The Sobel operator is a classic computer vision algorithm that detects
 * edges by computing the gradient (rate of change) of image intensity.
 * Areas where brightness changes rapidly (edges) get high values.
 *
 * Light/Dark Mode Support:
 * - Dark mode: bright neon edges with additive glow on near-black background
 * - Light mode: darker saturated edges with multiply-like effect on near-white background
 */

import type {
  Actor,
  ActorMetadata,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';
import { registerActor } from '@art/actor-sdk';

const metadata: ActorMetadata = {
  id: 'neon-edge',
  name: 'Neon Edge',
  description: 'Tron-like glowing wireframe edge detection with neon colors',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['filter', 'neon', 'edge', 'tron', 'wireframe', 'cyberpunk'],
  createdAt: new Date('2026-01-12'),
  preferredDuration: 60,
  requiredContexts: [],
  isGlobalFilter: true,
};

// Helper to convert HSV to RGB
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return [r + m, g + m, b + m];
}

interface NeonState {
  // Generated shaders for both modes with baked-in values
  darkModeShader: string;
  lightModeShader: string;
  // Glow filter settings
  glowColor: string;
  glowStrength: number;
  glowQuality: number;
  // Track current mode to detect changes
  currentMode: 'dark' | 'light' | null;
}

let state: NeonState = {
  darkModeShader: '',
  lightModeShader: '',
  glowColor: '#ff00ff',
  glowStrength: 0.5,
  glowQuality: 3,
  currentMode: null,
};

/**
 * Generate the shader code with randomized values baked in as constants
 * @param isDarkMode - Whether to generate for dark mode (true) or light mode (false)
 */
function generateShader(isDarkMode: boolean): string {
  // Edge detection parameters - balanced thresholds for consistent edge detection
  const edgeThresholdMin = 0.08 + Math.random() * 0.07; // 0.08-0.15 (more sensitive)
  const edgeThresholdMax = edgeThresholdMin + 0.15 + Math.random() * 0.2; // +0.15-0.35 (narrower range)
  const edgeThickness = 1.0 + Math.random() * 1.0; // 1.0-2.0

  // Main color - adjust brightness based on mode
  const mainHue = Math.random() * 360;
  const mainSaturation = 0.8 + Math.random() * 0.2; // 0.8-1.0 (high saturation for neon)
  // Dark mode: moderate-high brightness (0.5-0.8), Light mode: lower brightness (0.2-0.4)
  const mainValue = isDarkMode
    ? 0.5 + Math.random() * 0.3
    : 0.2 + Math.random() * 0.2;

  // Edge color - offset from main hue for contrast
  const hueOffsets = [60, 90, 120, 150, 180];
  const hueOffset = hueOffsets[Math.floor(Math.random() * hueOffsets.length)];
  const edgeHue = (mainHue + hueOffset + Math.random() * 20 - 10 + 360) % 360;
  const edgeSaturation = 0.8 + Math.random() * 0.2; // 0.8-1.0 (high saturation)
  // Dark mode: moderate brightness (0.4-0.7), Light mode: lower brightness (0.15-0.35)
  const edgeValue = isDarkMode
    ? 0.4 + Math.random() * 0.3
    : 0.15 + Math.random() * 0.2;

  // Background - contrast with edges
  const bgHue = Math.random() < 0.7 ? mainHue : Math.random() * 360;
  // Dark mode: very dark (near black), Light mode: very light (near white)
  const bgSaturation = isDarkMode
    ? 0.3 + Math.random() * 0.3 // 0.3-0.6
    : 0.05 + Math.random() * 0.1; // 0.05-0.15 (low saturation for light)
  const bgValue = isDarkMode
    ? 0.02 + Math.random() * 0.03 // 0.02-0.05 (nearly black)
    : 0.92 + Math.random() * 0.06; // 0.92-0.98 (nearly white)

  // Effects - glow intensity varies by mode
  // Dark mode: additive glow works well, Light mode: reduce glow to avoid washing out
  const glowIntensity = isDarkMode
    ? 0.05 + Math.random() * 0.1 // 0.05-0.15 (minimal)
    : 0.02 + Math.random() * 0.03; // 0.02-0.05 (very subtle in light mode)
  const colorSpeed = 0.3 + Math.random() * 0.7; // 0.3-1.0 (slower)
  const colorBlendMode = Math.floor(Math.random() * 3); // 0, 1, or 2

  // Convert HSV to RGB
  const [mr, mg, mb] = hsvToRgb(mainHue, mainSaturation, mainValue);
  const [er, eg, eb] = hsvToRgb(edgeHue, edgeSaturation, edgeValue);
  const [br, bgr, bb] = hsvToRgb(bgHue, bgSaturation, bgValue);

  // Glow filter settings (only used in dark mode)
  if (isDarkMode) {
    const glowHue = (mainHue + Math.random() * 60 - 30 + 360) % 360;
    const [gr, gg, gb] = hsvToRgb(glowHue, mainSaturation, mainValue);
    state.glowColor = `#${Math.round(gr * 255)
      .toString(16)
      .padStart(2, '0')}${Math.round(gg * 255)
      .toString(16)
      .padStart(2, '0')}${Math.round(gb * 255)
      .toString(16)
      .padStart(2, '0')}`;
    state.glowStrength = 0.15 + Math.random() * 0.2; // 0.15-0.35 (reduced)
    state.glowQuality = 2 + Math.floor(Math.random() * 2); // 2-3
  }

  const modeLabel = isDarkMode ? 'dark' : 'light';
  console.log(
    `[neon-edge] Setup (${modeLabel}): mainHue=${mainHue.toFixed(0)}° edgeHue=${edgeHue.toFixed(0)}° ` +
      `thickness=${edgeThickness.toFixed(2)} blend=${colorBlendMode}`
  );

  // Generate shader with baked-in constants
  // In light mode, we use a subtractive approach for the glow (darken instead of brighten)
  const glowComposition = isDarkMode
    ? `finalRGB += neonColor * glow;` // Additive glow for dark mode
    : `finalRGB -= (vec3(1.0) - neonColor) * glow * 0.5;`; // Subtractive for light mode

  return `
  void main() {
    // Constants baked in at setup time for variety
    float EDGE_THRESHOLD_MIN = ${edgeThresholdMin.toFixed(4)};
    float EDGE_THRESHOLD_MAX = ${edgeThresholdMax.toFixed(4)};
    float EDGE_THICKNESS = ${edgeThickness.toFixed(4)};
    vec3 MAIN_COLOR = vec3(${mr.toFixed(4)}, ${mg.toFixed(4)}, ${mb.toFixed(4)});
    vec3 EDGE_COLOR = vec3(${er.toFixed(4)}, ${eg.toFixed(4)}, ${eb.toFixed(4)});
    vec3 BG_COLOR = vec3(${br.toFixed(4)}, ${bgr.toFixed(4)}, ${bb.toFixed(4)});
    float GLOW_INTENSITY = ${glowIntensity.toFixed(4)};
    float COLOR_SPEED = ${colorSpeed.toFixed(4)};
    int BLEND_MODE = ${colorBlendMode};

    vec2 uv = vTextureCoord;

    // Use 1.0/uResolution for pixel size (uInputSize causes precision mismatch between vertex/fragment shaders)
    vec2 texel = (1.0 / uResolution) * EDGE_THICKNESS;

    // === SOBEL EDGE DETECTION ===
    float tl = dot(texture(uTexture, uv + vec2(-texel.x, -texel.y)).rgb, vec3(0.33));
    float t  = dot(texture(uTexture, uv + vec2(0.0, -texel.y)).rgb, vec3(0.33));
    float tr = dot(texture(uTexture, uv + vec2(texel.x, -texel.y)).rgb, vec3(0.33));
    float l  = dot(texture(uTexture, uv + vec2(-texel.x, 0.0)).rgb, vec3(0.33));
    float r  = dot(texture(uTexture, uv + vec2(texel.x, 0.0)).rgb, vec3(0.33));
    float bl = dot(texture(uTexture, uv + vec2(-texel.x, texel.y)).rgb, vec3(0.33));
    float b  = dot(texture(uTexture, uv + vec2(0.0, texel.y)).rgb, vec3(0.33));
    float brSample = dot(texture(uTexture, uv + vec2(texel.x, texel.y)).rgb, vec3(0.33));

    float gx = -tl - 2.0*l - bl + tr + 2.0*r + brSample;
    float gy = -tl - 2.0*t - tr + bl + 2.0*b + brSample;

    float edge = sqrt(gx*gx + gy*gy);
    edge = smoothstep(EDGE_THRESHOLD_MIN, EDGE_THRESHOLD_MAX, edge);

    // === NEON COLOR CALCULATION ===
    float angle = atan(gy, gx);
    float timeFactor = uTime * COLOR_SPEED;

    vec3 neonColor;
    if (BLEND_MODE == 0) {
      // Simple lerp between main and edge color based on time
      float blend = sin(timeFactor) * 0.5 + 0.5;
      neonColor = mix(MAIN_COLOR, EDGE_COLOR, blend);
    } else if (BLEND_MODE == 1) {
      // Angle-based color
      vec3 angleColor = vec3(
        sin(angle + timeFactor) * 0.5 + 0.5,
        sin(angle + timeFactor + 2.094) * 0.5 + 0.5,
        sin(angle + timeFactor + 4.188) * 0.5 + 0.5
      );
      neonColor = mix(MAIN_COLOR, EDGE_COLOR, angleColor.r);
    } else {
      // Screen blend for brighter results (dark mode) or multiply-like for contrast (light mode)
      vec3 baseColor = mix(MAIN_COLOR, EDGE_COLOR, sin(angle + timeFactor) * 0.5 + 0.5);
      vec3 overlayColor = vec3(
        sin(timeFactor * 0.7) * 0.3 + 0.7,
        sin(timeFactor * 0.7 + 1.0) * 0.3 + 0.7,
        sin(timeFactor * 0.7 + 2.0) * 0.3 + 0.7
      );
      neonColor = vec3(1.0) - (vec3(1.0) - baseColor) * (vec3(1.0) - overlayColor * 0.3);
    }

    // === COMPOSE FINAL IMAGE ===
    vec3 finalRGB = mix(BG_COLOR, neonColor, edge);

    // Add glow around edges (mode-specific composition)
    float glow = edge * GLOW_INTENSITY;
    ${glowComposition}

    finalRGB = clamp(finalRGB, 0.0, 1.0);
    finalColor = vec4(finalRGB, 1.0);
  }
`;
}

const actor: Actor = {
  metadata,

  async setup(_api: ActorSetupAPI): Promise<void> {
    // Generate shaders for both modes with randomized values baked in
    // We generate both upfront so the visual style stays consistent when mode changes
    state.darkModeShader = generateShader(true);
    state.lightModeShader = generateShader(false);
    state.currentMode = null;
  },

  update(api: ActorUpdateAPI, _frame: FrameContext): void {
    // Select shader based on display mode
    const isDarkMode = api.context.display.isDarkMode();
    const shader = isDarkMode ? state.darkModeShader : state.lightModeShader;

    // Log mode changes for debugging
    const newMode = isDarkMode ? 'dark' : 'light';
    if (state.currentMode !== newMode) {
      console.log(`[neon-edge] Switching to ${newMode} mode`);
      state.currentMode = newMode;
    }

    // Apply the pre-generated shader (glow is handled internally)
    api.filter.customShader(shader);
  },

  async teardown(): Promise<void> {
    state.currentMode = null;
    console.log('[neon-edge] Teardown complete');
  },
};

registerActor(actor);

export default actor;
