/**
 * Aged Parchment — Filter Actor
 *
 * Yellowed old paper effect that transforms the canvas into a
 * weathered parchment. Applies sepia-warm color shifting, paper
 * grain noise, faded saturation, and darkened vignette edges.
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
  id: 'aged-parchment',
  name: 'Aged Parchment',
  description: 'Yellowed old paper effect with grain texture, faded ink, and darkened edges',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['filter', 'parchment', 'aged', 'vintage', 'paper'],
  createdAt: new Date('2026-03-21'),
  role: 'filter',
  preferredDuration: 60,
  requiredContexts: ['display'],
};

// Yellowed parchment color matrix — warm sepia shift
// Boosts reds/greens toward yellow, suppresses blues
const PARCHMENT_MATRIX: ColorMatrix = [
  1.12, 0.08, 0.02, 0, 0.04,  // red: boosted with warm bleed
  0.04, 1.06, 0.02, 0, 0.03,  // green: slight warm boost
  0,    0.02, 0.78, 0, 0.01,  // blue: significantly reduced
  0,    0,    0,    1, 0,      // alpha: untouched
];

// Dark mode variant — less aggressive yellowing
const PARCHMENT_MATRIX_DARK: ColorMatrix = [
  1.08, 0.06, 0.01, 0, 0.02,
  0.03, 1.04, 0.01, 0, 0.02,
  0,    0.01, 0.84, 0, 0.005,
  0,    0,    0,    1, 0,
];

const actor: Actor = {
  metadata,

  async setup(): Promise<void> {
    // No state needed — pure filter actor
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const isDark = api.context.display.isDarkMode();

    // --- Filter 1: Yellowed parchment color shift ---
    api.filter.colorMatrix(isDark ? PARCHMENT_MATRIX_DARK : PARCHMENT_MATRIX);

    // --- Filter 2: Reduced saturation — old pages are faded ---
    api.filter.saturate(isDark ? 0.6 : 0.55);

    // --- Filter 3: Slight contrast reduction — ink bleeds over time ---
    api.filter.contrast(isDark ? 0.92 : 0.9);

    // --- Filter 4: Paper grain noise ---
    const noiseAmount = isDark ? 0.06 : 0.07;
    api.filter.noise(noiseAmount, frame.frameCount);

    // --- Filter 5: Warm vignette for aged darkened edges ---
    api.filter.vignette(isDark ? 0.25 : 0.3, 0.5);
  },

  async teardown(): Promise<void> {
    // Nothing to clean up
  },
};

registerActor(actor);
export default actor;
