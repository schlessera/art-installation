/**
 * Marble Veins — Filter Actor
 *
 * Subtle marble-vein texture effect, like viewing through polished
 * Carrara marble. Applies slight desaturation for a stone-like quality,
 * gentle noise for grain, contrast adjustment, and a soft vignette.
 */

import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'marble-veins',
  name: 'Marble Veins',
  description: 'Subtle marble texture filter with stone-like desaturation, grain, and soft vignette',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['filter', 'marble', 'italy', 'stone', 'texture'],
  createdAt: new Date('2026-03-20'),
  role: 'filter',
  preferredDuration: 60,
  requiredContexts: ['display'],
};

// Carrara marble color matrix — cool desaturation with a slight warm shift
// to emulate the ivory-white warmth of real Carrara marble.
// Rows: R, G, B, A (5 values each: multiply R, G, B, A, offset)
const MARBLE_MATRIX_LIGHT: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number] = [
  0.95, 0.08, 0.04, 0, 0.01,  // red: slight warmth
  0.04, 0.90, 0.06, 0, 0.01,  // green: gentle desaturation
  0.03, 0.06, 0.88, 0, 0.02,  // blue: slightly cool stone tone
  0,    0,    0,    1, 0,      // alpha: unchanged
];

const MARBLE_MATRIX_DARK: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number] = [
  0.92, 0.10, 0.05, 0, 0.00,  // red: a touch more blended in dark
  0.05, 0.87, 0.08, 0, 0.00,  // green: stronger desaturation
  0.04, 0.07, 0.85, 0, 0.01,  // blue: deeper stone
  0,    0,    0,    1, 0,      // alpha: unchanged
];

const actor: Actor = {
  metadata,

  async setup(): Promise<void> {
    // No state needed — purely reactive filter
  },

  update(api: ActorUpdateAPI, _frame: FrameContext): void {
    const isDark = api.context.display.isDarkMode();

    // 1. Stone-like color grade via color matrix (desaturation + warmth)
    api.filter.colorMatrix(isDark ? MARBLE_MATRIX_DARK : MARBLE_MATRIX_LIGHT);

    // 2. Slight desaturation to reinforce the stone quality
    api.filter.saturate(isDark ? 0.82 : 0.88);

    // 3. Gentle contrast bump to bring out vein-like detail in the artwork
    api.filter.contrast(isDark ? 1.08 : 1.05);

    // 4. Soft vignette for that polished-slab framing effect
    const vignetteStrength = isDark ? 0.18 : 0.12;
    api.filter.vignette(vignetteStrength, 0.55);
  },

  async teardown(): Promise<void> {
    // Nothing to clean up
  },
};

registerActor(actor);
export default actor;
