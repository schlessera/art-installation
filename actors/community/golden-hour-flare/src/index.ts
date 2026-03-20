/**
 * Golden Hour Flare — Filter Actor
 *
 * Anamorphic lens flares that drift across the frame with warm
 * golden-hour color grading. Uses chromatic aberration for the
 * characteristic horizontal streak of anamorphic lenses.
 */

import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
  ColorMatrix,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'golden-hour-flare',
  name: 'Golden Hour Flare',
  description: 'Anamorphic lens flares with warm color grading that drift across the frame',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['filter', 'lens-flare', 'golden', 'cinematic', 'light'],
  createdAt: new Date('2026-03-20'),
  role: 'filter',
  preferredDuration: 60,
  requiredContexts: ['time', 'display'],
};

// Warm golden color matrix — boosts reds/greens, reduces blues
const WARM_MATRIX: ColorMatrix = [
  1.15, 0.06, 0,    0, 0.03,
  0.03, 1.02, 0,    0, 0.01,
  0,    0,    0.82, 0, 0,
  0,    0,    0,    1, 0,
];

// Subtler warm matrix for dark mode (less aggressive)
const WARM_MATRIX_DARK: ColorMatrix = [
  1.08, 0.04, 0,    0, 0.02,
  0.02, 1.01, 0,    0, 0.005,
  0,    0,    0.88, 0, 0,
  0,    0,    0,    1, 0,
];

// Flare position state
let flarePhase = 0;

const actor: Actor = {
  metadata,

  async setup(): Promise<void> {
    flarePhase = Math.random() * Math.PI * 2;
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const tSec = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();

    // --- Filter 1: Warm color grade ---
    api.filter.colorMatrix(isDark ? WARM_MATRIX_DARK : WARM_MATRIX);

    // --- Filter 2: Slight contrast boost for cinematic feel ---
    api.filter.contrast(isDark ? 1.06 : 1.08);

    // --- Filter 3: Chromatic aberration for anamorphic streak ---
    // The offset drifts slowly over time, simulating a lens flare
    // moving across the frame. Anamorphic flares are horizontal,
    // so we only offset on the X axis.
    const drift = Math.sin(tSec * 0.15 + flarePhase) * 0.8 + 0.5;
    const aberrationStrength = isDark ? 2.5 : 3.5;
    const xOffset = Math.sin(tSec * 0.2 + flarePhase) * aberrationStrength * drift;

    api.filter.chromaticAberration(
      [xOffset, 0],
      [-xOffset * 0.8, 0],
    );

    // --- Filter 4: Warm vignette to frame the flare ---
    const vignetteIntensity = isDark ? 0.18 : 0.12;
    api.filter.vignette(vignetteIntensity, 0.55);
  },

  async teardown(): Promise<void> {
    flarePhase = 0;
  },
};

registerActor(actor);
export default actor;
