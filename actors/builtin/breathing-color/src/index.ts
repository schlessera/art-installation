/**
 * Breathing Color Background Actor
 *
 * Simple pulsating solid color background that:
 * - Pulses alpha using sine wave
 * - Optionally cycles through hue over time
 * - Uses radial gradient for soft vignette effect
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
  id: 'breathing-color',
  name: 'Breathing Color',
  description: 'Pulsating solid color background with optional hue cycling',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['background', 'ambient', 'simple', 'color'],
  createdAt: new Date('2026-01-13'),
  preferredDuration: 60,
  role: 'background',
};

// Color palettes (HSL base hue, saturation, lightness for dark mode)
interface ColorPalette {
  name: string;
  baseHue: number;
  saturation: number;
  darkLightness: number; // Lightness for dark mode
  lightLightness: number; // Lightness for light mode (inverted)
  hueRange: number; // How much hue can vary (0 = no cycling)
}

const PALETTES: ColorPalette[] = [
  { name: 'Warm', baseHue: 20, saturation: 70, darkLightness: 25, lightLightness: 85, hueRange: 40 },
  { name: 'Cool', baseHue: 220, saturation: 60, darkLightness: 20, lightLightness: 88, hueRange: 60 },
  { name: 'Neon', baseHue: 280, saturation: 100, darkLightness: 30, lightLightness: 80, hueRange: 120 },
  { name: 'Earth', baseHue: 30, saturation: 40, darkLightness: 15, lightLightness: 90, hueRange: 20 },
  { name: 'Monochrome', baseHue: 0, saturation: 0, darkLightness: 10, lightLightness: 95, hueRange: 0 },
];

// Animation settings
const PULSE_SPEED = 0.0015; // Radians per ms
const HUE_CYCLE_SPEED = 0.00005; // Hue degrees per ms
// Alpha ranges - light mode uses slightly lower alpha for similar visual weight
const DARK_MIN_ALPHA = 0.6;
const DARK_MAX_ALPHA = 1.0;
const LIGHT_MIN_ALPHA = 0.5;
const LIGHT_MAX_ALPHA = 0.9;

interface State {
  palette: ColorPalette;
  startTime: number;
}

let state: State;

function hslToRgb(h: number, s: number, l: number): number {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return (
    (Math.round(f(0) * 255) << 16) |
    (Math.round(f(8) * 255) << 8) |
    Math.round(f(4) * 255)
  );
}

const actor: Actor = {
  metadata,

  setup(_api: ActorSetupAPI): Promise<void> {
    // Pick random palette
    state = {
      palette: PALETTES[Math.floor(Math.random() * PALETTES.length)],
      startTime: Date.now(),
    };
    return Promise.resolve();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const { width, height } = api.canvas.getSize();
    const elapsed = frame.time - state.startTime;
    const isDarkMode = api.context.display.isDarkMode();

    // Calculate pulsing alpha using sine wave (mode-aware ranges)
    const minAlpha = isDarkMode ? DARK_MIN_ALPHA : LIGHT_MIN_ALPHA;
    const maxAlpha = isDarkMode ? DARK_MAX_ALPHA : LIGHT_MAX_ALPHA;
    const alphaPhase = elapsed * PULSE_SPEED;
    const alpha =
      minAlpha + ((maxAlpha - minAlpha) * (Math.sin(alphaPhase) + 1)) / 2;

    // Calculate hue with optional cycling
    const hueOffset =
      state.palette.hueRange > 0
        ? Math.sin(elapsed * HUE_CYCLE_SPEED) * state.palette.hueRange
        : 0;
    const currentHue = (state.palette.baseHue + hueOffset + 360) % 360;

    // Get lightness based on display mode
    const baseLightness = isDarkMode
      ? state.palette.darkLightness
      : state.palette.lightLightness;

    // Get RGB color
    const baseColor = hslToRgb(
      currentHue,
      state.palette.saturation,
      baseLightness
    );

    // Get center color for gradient (vignette effect)
    // Dark mode: center is brighter than edges
    // Light mode: center is darker than edges (inverted vignette)
    const centerLightnessDelta = isDarkMode ? 10 : -10;
    const centerLightness = isDarkMode
      ? Math.min(baseLightness + centerLightnessDelta, 50)
      : Math.max(baseLightness + centerLightnessDelta, 50);
    const centerColor = hslToRgb(
      currentHue,
      state.palette.saturation,
      centerLightness
    );

    // Draw full-screen rect with radial gradient (soft vignette effect)
    api.brush.rect(0, 0, width, height, {
      fill: {
        type: 'radial',
        cx: 0.5,
        cy: 0.5,
        radius: 0.8,
        stops: [
          { offset: 0, color: `#${centerColor.toString(16).padStart(6, '0')}` },
          { offset: 1, color: `#${baseColor.toString(16).padStart(6, '0')}` },
        ],
      },
      alpha,
    });
  },
};

registerActor(actor);

export default actor;
