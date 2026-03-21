/**
 * Chiaro Scuro — Filter Actor
 *
 * Dramatic Renaissance lighting effect inspired by Caravaggio's
 * chiaroscuro technique. Strong contrast separates light from shadow,
 * slight desaturation lends a painterly quality, and a heavy vignette
 * darkens the edges to focus the viewer's eye on the illuminated center.
 * A subtle warm color shift adds the amber tone of candlelit interiors.
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
  id: 'chiaro-scuro',
  name: 'Chiaro Scuro',
  description: 'Dramatic Renaissance lighting with strong contrast, desaturation, heavy vignette, and warm color shift',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['filter', 'renaissance', 'dramatic', 'lighting', 'contrast'],
  createdAt: new Date('2026-03-21'),
  role: 'filter',
  preferredDuration: 60,
  requiredContexts: ['display'],
};

// Warm color shift matrix — subtle amber push for candlelit Renaissance feel
// Boosts red channel slightly, nudges green warm, pulls blue down
const WARM_MATRIX: ColorMatrix = [
  1.08, 0.04, 0,    0, 0.02,
  0.02, 1.02, 0,    0, 0.01,
  0,    0,    0.90, 0, 0,
  0,    0,    0,    1, 0,
];

// Darker variant — less aggressive to avoid crushing shadows further
const WARM_MATRIX_DARK: ColorMatrix = [
  1.05, 0.03, 0,    0, 0.01,
  0.01, 1.01, 0,    0, 0.005,
  0,    0,    0.93, 0, 0,
  0,    0,    0,    1, 0,
];

const actor: Actor = {
  metadata,

  async setup(): Promise<void> {
    // No persistent state needed — pure filter actor
  },

  update(api: ActorUpdateAPI, _frame: FrameContext): void {
    const isDark = api.context.display.isDarkMode();

    // --- Filter 1: Strong contrast boost for dramatic light/dark separation ---
    // Higher in light mode for maximum drama; slightly less in dark mode
    // to avoid completely crushing already-dark content.
    api.filter.contrast(isDark ? 1.3 : 1.45);

    // --- Filter 2: Desaturation for painterly quality ---
    // Pull saturation down to give a muted, oil-painting feel.
    // Not fully desaturated — just enough to remove modern vibrancy.
    api.filter.saturate(isDark ? 0.75 : 0.72);

    // --- Filter 3: Heavy vignette to darken edges dramatically ---
    // Renaissance paintings focus light on the subject; the vignette
    // recreates that by darkening the periphery.
    api.filter.vignette(isDark ? 0.45 : 0.5, 0.4);

    // --- Filter 4: Warm color shift via colorMatrix ---
    // Adds the amber/sepia tone of candlelight and aged varnish
    // that characterizes Renaissance oil paintings.
    api.filter.colorMatrix(isDark ? WARM_MATRIX_DARK : WARM_MATRIX);
  },

  async teardown(): Promise<void> {
    // Nothing to clean up
  },
};

registerActor(actor);
export default actor;
