/**
 * Fresco Crack — Filter Actor
 *
 * Applies an aged Italian fresco effect: desaturated palette,
 * warm sepia-ish color shift, plaster-grain noise, and a soft
 * warm vignette. The result evokes pigment fading into centuries-old
 * lime plaster under Tuscan church light.
 */

import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'fresco-crack',
  name: 'Fresco Crack',
  description:
    'Aged Italian fresco effect — faded pigments, plaster grain, and warm vignette',
  author: {
    name: 'Joost de Valk',
    github: 'jdevalk',
  },
  version: '1.0.0',
  tags: ['filter', 'fresco', 'italy', 'aged', 'vintage'],
  createdAt: new Date('2026-03-20'),
  role: 'filter',
  preferredDuration: 60,
  requiredContexts: ['display'],
};

// Warm sepia-ish color matrix — mimics pigment fading into lime plaster.
// Reds stay warm, greens muted, blues suppressed, slight warm bias offsets.
const FRESCO_MATRIX: [
  number, number, number, number, number,
  number, number, number, number, number,
  number, number, number, number, number,
  number, number, number, number, number,
] = [
  1.05, 0.10, 0.05, 0, 0.02, // R — warm reds, pick up a little green/blue
  0.05, 0.95, 0.05, 0, 0.01, // G — slightly muted, warm lean
  0,    0.05, 0.80, 0, 0,    // B — noticeably reduced (fresco blues fade)
  0,    0,    0,    1, 0,    // A — untouched
];

const actor: Actor = {
  metadata,

  async setup(): Promise<void> {
    // No state needed — pure per-frame filter.
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const isDark = api.context.display.isDarkMode();

    // --- 1. Desaturate — frescos lose vibrancy over centuries ---
    const saturation = isDark ? 0.60 : 0.65;
    api.filter.saturate(saturation);

    // --- 2. Warm sepia-ish color matrix ---
    api.filter.colorMatrix(FRESCO_MATRIX);

    // --- 3. Plaster-grain noise ---
    const noiseAmount = isDark ? 0.08 : 0.06;
    api.filter.noise(noiseAmount, frame.frameCount);

    // --- 4. Warm vignette — darkened edges like chapel alcove lighting ---
    const vignetteIntensity = isDark ? 0.35 : 0.25;
    api.filter.vignette(vignetteIntensity, 0.5);
  },

  async teardown(): Promise<void> {
    // Nothing to clean up.
  },
};

registerActor(actor);
export default actor;
