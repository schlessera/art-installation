/**
 * Thermal Vision Filter Actor
 *
 * Infrared/thermal camera look that maps brightness to a heat-map gradient.
 * Dark mode: black -> blue -> purple -> red -> orange -> yellow -> white
 * Light mode: white -> cyan -> teal -> green -> olive -> brown -> black (inverted)
 * Includes subtle noise and scan lines for authenticity.
 */

import type {
  Actor,
  ActorMetadata,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';
import { registerActor } from '@art/actor-sdk';

const metadata: ActorMetadata = {
  id: 'thermal-vision',
  name: 'Thermal Vision',
  description: 'Infrared thermal camera look with heat-map color mapping',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['filter', 'thermal', 'infrared', 'heatmap', 'vision'],
  createdAt: new Date('2026-01-12'),
  preferredDuration: 60,
  requiredContexts: [],
  isGlobalFilter: true,
};

// Thermal color mapping shader for dark mode
// Maps brightness to heat gradient: black -> blue -> purple -> red -> orange -> yellow -> white
const THERMAL_SHADER_DARK = `
  void main() {
    vec2 uv = vTextureCoord;
    vec4 color = texture(uTexture, uv);

    // Convert to luminance (heat value)
    float heat = dot(color.rgb, vec3(0.299, 0.587, 0.114));

    // Thermal gradient: black -> blue -> purple -> red -> orange -> yellow -> white
    vec3 thermal;
    if (heat < 0.2) {
      // Black to blue
      thermal = mix(vec3(0.0, 0.0, 0.0), vec3(0.0, 0.0, 0.6), heat / 0.2);
    } else if (heat < 0.35) {
      // Blue to purple
      thermal = mix(vec3(0.0, 0.0, 0.6), vec3(0.6, 0.0, 0.6), (heat - 0.2) / 0.15);
    } else if (heat < 0.5) {
      // Purple to red
      thermal = mix(vec3(0.6, 0.0, 0.6), vec3(1.0, 0.0, 0.0), (heat - 0.35) / 0.15);
    } else if (heat < 0.7) {
      // Red to orange
      thermal = mix(vec3(1.0, 0.0, 0.0), vec3(1.0, 0.5, 0.0), (heat - 0.5) / 0.2);
    } else if (heat < 0.9) {
      // Orange to yellow
      thermal = mix(vec3(1.0, 0.5, 0.0), vec3(1.0, 1.0, 0.0), (heat - 0.7) / 0.2);
    } else {
      // Yellow to white
      thermal = mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 1.0, 1.0), (heat - 0.9) / 0.1);
    }

    // Scan lines for thermal camera authenticity
    float scanline = sin(uv.y * uResolution.y * 1.5) * 0.03;
    thermal -= scanline;

    // Subtle heat shimmer effect
    float shimmer = sin(uv.y * 20.0 + uTime * 5.0) * 0.01;
    thermal += shimmer;

    finalColor = vec4(thermal, 1.0);
  }
`;

// Thermal color mapping shader for light mode
// Inverted heat gradient: white -> cyan -> teal -> green -> olive -> brown -> black
// Cold areas are light, hot areas are dark - opposite of traditional thermal
const THERMAL_SHADER_LIGHT = `
  void main() {
    vec2 uv = vTextureCoord;
    vec4 color = texture(uTexture, uv);

    // Convert to luminance (heat value)
    float heat = dot(color.rgb, vec3(0.299, 0.587, 0.114));

    // Inverted thermal gradient for light mode
    // white -> light cyan -> teal -> green -> olive -> brown -> dark brown
    vec3 thermal;
    if (heat < 0.2) {
      // White to light cyan (cold areas = light)
      thermal = mix(vec3(1.0, 1.0, 1.0), vec3(0.8, 0.95, 1.0), heat / 0.2);
    } else if (heat < 0.35) {
      // Light cyan to teal
      thermal = mix(vec3(0.8, 0.95, 1.0), vec3(0.3, 0.7, 0.7), (heat - 0.2) / 0.15);
    } else if (heat < 0.5) {
      // Teal to green
      thermal = mix(vec3(0.3, 0.7, 0.7), vec3(0.2, 0.6, 0.2), (heat - 0.35) / 0.15);
    } else if (heat < 0.7) {
      // Green to olive
      thermal = mix(vec3(0.2, 0.6, 0.2), vec3(0.5, 0.5, 0.1), (heat - 0.5) / 0.2);
    } else if (heat < 0.9) {
      // Olive to brown
      thermal = mix(vec3(0.5, 0.5, 0.1), vec3(0.4, 0.2, 0.1), (heat - 0.7) / 0.2);
    } else {
      // Brown to dark brown (hot areas = dark)
      thermal = mix(vec3(0.4, 0.2, 0.1), vec3(0.15, 0.05, 0.0), (heat - 0.9) / 0.1);
    }

    // Scan lines for thermal camera authenticity (lighter for light mode)
    float scanline = sin(uv.y * uResolution.y * 1.5) * 0.02;
    thermal += scanline;

    // Subtle heat shimmer effect
    float shimmer = sin(uv.y * 20.0 + uTime * 5.0) * 0.01;
    thermal -= shimmer;

    finalColor = vec4(thermal, 1.0);
  }
`;

interface ThermalState {
  noiseIntensity: number;
  scanlineStrength: number;
}

let state: ThermalState = {
  noiseIntensity: 0.1,
  scanlineStrength: 0.03,
};

const actor: Actor = {
  metadata,

  async setup(): Promise<void> {
    state.noiseIntensity = 0.08 + Math.random() * 0.06;
    state.scanlineStrength = 0.02 + Math.random() * 0.02;

    console.log(`[thermal-vision] Setup: noise=${state.noiseIntensity.toFixed(3)}`);
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const isDarkMode = api.context.display.isDarkMode();

    // Apply thermal color mapping shader based on display mode
    // Dark mode: traditional thermal (cold=dark, hot=bright)
    // Light mode: inverted thermal (cold=light, hot=dark)
    api.filter.customShader(isDarkMode ? THERMAL_SHADER_DARK : THERMAL_SHADER_LIGHT);

    // Sensor noise for authenticity (slightly reduced in light mode)
    const noiseAmount = isDarkMode ? state.noiseIntensity : state.noiseIntensity * 0.7;
    api.filter.noise(noiseAmount, frame.frameCount);

    // UI overlay vignette
    // Dark mode: darker edges (traditional thermal camera look)
    // Light mode: lighter vignette effect
    const vignetteSize = isDarkMode ? 0.4 : 0.35;
    const vignetteStrength = isDarkMode ? 0.4 : 0.25;
    api.filter.vignette(vignetteSize, vignetteStrength);
  },

  async teardown(): Promise<void> {
    console.log('[thermal-vision] Teardown complete');
  },
};

registerActor(actor);

export default actor;
