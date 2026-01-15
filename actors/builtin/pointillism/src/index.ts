/**
 * Pointillism Filter Actor
 *
 * Transforms the canvas into a pointillist painting with:
 * - Halftone-style dots of color
 * - Dot size varies with luminance (darker = larger in light mode, lighter = larger in dark mode)
 * - Optional RGB channel separation for CMYK effect
 * - Canvas texture background (light or dark based on display mode)
 * - Subtle breathing animation on dot sizes
 */

import type {
  Actor,
  ActorMetadata,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';
import { registerActor } from '@art/actor-sdk';

const metadata: ActorMetadata = {
  id: 'pointillism',
  name: 'Pointillism',
  description: 'Pointillist painting effect with halftone dots',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['filter', 'pointillism', 'halftone', 'dots', 'impressionist'],
  createdAt: new Date('2026-01-13'),
  preferredDuration: 60,
  requiredContexts: ['display'],
  role: 'filter',
};

// Pointillism shader - parameterized for light/dark mode
// uDarkMode: 0.0 = light mode (light canvas), 1.0 = dark mode (dark canvas)
// Note: uDarkMode is auto-declared by customShader() from the uniforms object
const POINTILLISM_SHADER = `
  // Hash for noise
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  // Get luminance
  float getLuminance(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
  }

  void main() {
    vec2 uv = vTextureCoord;
    vec2 pixelCoord = uv * uResolution;

    // --- Grid Configuration ---
    float cellSize = 6.0; // Base dot spacing

    // --- Breathing animation (dots pulse in size) ---
    float breathe = 1.0 + sin(uTime * 0.8) * 0.1;

    // --- Calculate cell position ---
    vec2 cell = floor(pixelCoord / cellSize);
    vec2 cellCenter = (cell + 0.5) * cellSize;
    vec2 localPos = pixelCoord - cellCenter;

    // --- Sample color at cell center ---
    vec2 sampleUV = cellCenter / uResolution;
    vec4 sampleColor = texture(uTexture, sampleUV);
    float lum = getLuminance(sampleColor.rgb);

    // --- Dot size based on luminance ---
    // Light mode: darker = larger dots (traditional halftone)
    // Dark mode: lighter = larger dots (inverted for dark canvas)
    float maxRadius = cellSize * 0.45;
    float lumFactor = mix(1.0 - lum * 0.85, 0.15 + lum * 0.85, uDarkMode);
    float dotRadius = maxRadius * lumFactor * breathe;

    // --- Distance from cell center ---
    float dist = length(localPos);

    // --- Draw dot with antialiasing ---
    float dot = smoothstep(dotRadius, dotRadius - 1.0, dist);

    // --- Canvas/paper background ---
    // Light mode: warm cream paper
    // Dark mode: dark charcoal/slate
    vec3 lightCanvas = vec3(0.98, 0.96, 0.93);
    vec3 darkCanvas = vec3(0.08, 0.08, 0.10);
    vec3 canvasColor = mix(lightCanvas, darkCanvas, uDarkMode);

    // Subtle canvas texture
    float canvasTex = hash(cell * 0.1) * 0.05;
    // In dark mode, texture adds brightness; in light mode, it subtracts
    canvasColor *= mix(0.97 + canvasTex, 1.0 + canvasTex * 0.5, uDarkMode);

    // --- Dot color with slight saturation boost ---
    vec3 dotColor = sampleColor.rgb;
    // Boost saturation slightly for vibrant pointillist look
    float sat = max(max(dotColor.r, dotColor.g), dotColor.b) - min(min(dotColor.r, dotColor.g), dotColor.b);
    vec3 gray = vec3(lum);
    dotColor = mix(gray, dotColor, 1.0 + sat * 0.3);

    // --- RGB Channel Separation (subtle CMYK-like effect) ---
    // Offset for each channel creates color fringing
    vec2 offsetR = vec2(0.8, 0.0);
    vec2 offsetG = vec2(-0.4, 0.7);
    vec2 offsetB = vec2(-0.4, -0.7);

    // Sample each channel with slight offset
    vec2 cellR = floor((pixelCoord - offsetR) / cellSize);
    vec2 cellG = floor((pixelCoord - offsetG) / cellSize);
    vec2 cellB = floor((pixelCoord - offsetB) / cellSize);

    vec2 centerR = (cellR + 0.5) * cellSize;
    vec2 centerG = (cellG + 0.5) * cellSize;
    vec2 centerB = (cellB + 0.5) * cellSize;

    vec4 colorR = texture(uTexture, centerR / uResolution);
    vec4 colorG = texture(uTexture, centerG / uResolution);
    vec4 colorB = texture(uTexture, centerB / uResolution);

    float lumR = getLuminance(colorR.rgb);
    float lumG = getLuminance(colorG.rgb);
    float lumB = getLuminance(colorB.rgb);

    // Apply same luminance factor logic for channel separation
    float lumFactorR = mix(1.0 - lumR * 0.85, 0.15 + lumR * 0.85, uDarkMode);
    float lumFactorG = mix(1.0 - lumG * 0.85, 0.15 + lumG * 0.85, uDarkMode);
    float lumFactorB = mix(1.0 - lumB * 0.85, 0.15 + lumB * 0.85, uDarkMode);
    float radiusR = maxRadius * lumFactorR * breathe;
    float radiusG = maxRadius * lumFactorG * breathe;
    float radiusB = maxRadius * lumFactorB * breathe;

    float distR = length(pixelCoord - offsetR - centerR);
    float distG = length(pixelCoord - offsetG - centerG);
    float distB = length(pixelCoord - offsetB - centerB);

    float dotR = smoothstep(radiusR, radiusR - 1.0, distR);
    float dotG = smoothstep(radiusG, radiusG - 1.0, distG);
    float dotB = smoothstep(radiusB, radiusB - 1.0, distB);

    // --- Combine channels ---
    vec3 result = canvasColor;

    // Apply color dots with channel separation
    result.r = mix(result.r, colorR.r, dotR);
    result.g = mix(result.g, colorG.g, dotG);
    result.b = mix(result.b, colorB.b, dotB);

    // --- Add subtle dot shadow/glow ---
    // Light mode: shadow beneath dots
    // Dark mode: subtle glow around dots
    float shadowEffect = smoothstep(dotRadius + 1.5, dotRadius + 0.5, dist) * 0.15;
    float glowEffect = smoothstep(dotRadius + 2.0, dotRadius, dist) * 0.1;
    result *= mix(1.0 - shadowEffect, 1.0 + glowEffect, uDarkMode);

    finalColor = vec4(result, 1.0);
  }
`;

interface PointillismState {
  dotSize: number;
  separation: boolean;
  isDarkMode: boolean;
  filterOpacity: number;
}

let state: PointillismState = {
  dotSize: 6.0,
  separation: true,
  isDarkMode: false,
  filterOpacity: 1.0,
};

const actor: Actor = {
  metadata,

  async setup(): Promise<void> {
    // Randomize dot size
    state.dotSize = 5 + Math.random() * 4; // 5-9px
    state.separation = Math.random() > 0.3; // 70% chance of channel separation
    state.filterOpacity = 0.5 + Math.pow(Math.random(), 0.5) * 0.5;

    console.log(`[pointillism] Setup: dotSize=${state.dotSize.toFixed(1)}, separation=${state.separation}, opacity=${state.filterOpacity.toFixed(2)}`);
  },

  update(api: ActorUpdateAPI, _frame: FrameContext): void {
    // Check display mode
    state.isDarkMode = api.context.display?.isDarkMode() ?? false;

    // Apply the pointillism shader with dark mode uniform
    api.filter.customShader(POINTILLISM_SHADER, {
      uDarkMode: state.isDarkMode ? 1.0 : 0.0,
    });

    // Slight saturation boost (more in dark mode for vibrancy)
    api.filter.saturate(state.isDarkMode ? 1.2 : 1.1);

    // Subtle vignette (slightly stronger in dark mode)
    api.filter.vignette(state.isDarkMode ? 0.2 : 0.15, 0.6);

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
    console.log('[pointillism] Teardown complete');
  },
};

registerActor(actor);

export default actor;
