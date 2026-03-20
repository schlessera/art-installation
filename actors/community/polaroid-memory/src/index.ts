/**
 * Polaroid Memory — Filter Actor
 *
 * Instant photo effect: Polaroid color matrix, reduced contrast,
 * animated film grain, and a soft vignette. Adapts to dark mode.
 */

import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'polaroid-memory',
  name: 'Polaroid Memory',
  description: 'Instant photo filter with Polaroid color shift, soft contrast, film grain, and vignette',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['filter', 'polaroid', 'vintage', 'photo', 'memory'],
  createdAt: new Date('2026-03-20'),
  role: 'filter',
  preferredDuration: 60,
  requiredContexts: ['display'],
};

// Polaroid color matrix — warm highlights, slightly faded blues, cross-channel bleed
const POLAROID_MATRIX: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number] = [
  1.05, 0.05, 0,   0, 0.03,  // red: slight boost + green bleed + offset
  0,    1.0,  0.05, 0, 0.02,  // green: slight blue bleed + offset
  0.05, 0,    0.9,  0, 0.04,  // blue: reduced + red bleed + offset
  0,    0,    0,    1, 0,     // alpha: unchanged
];

const actor: Actor = {
  metadata,

  async setup(): Promise<void> {
    // No state needed — purely reactive filter
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const isDark = api.context.display.isDarkMode();

    // 1. Polaroid color shift
    api.filter.colorMatrix(POLAROID_MATRIX);

    // 2. Reduced contrast for the soft, slightly washed-out Polaroid look
    const contrast = isDark ? 0.88 : 0.9;
    api.filter.contrast(contrast);

    // 3. Animated film grain — seed changes each frame for movement
    const grainAmount = isDark ? 0.05 : 0.04;
    api.filter.noise(grainAmount, frame.frameCount);

    // 4. Soft vignette — darker edges typical of instant photos
    const vignetteStrength = isDark ? 0.2 : 0.15;
    api.filter.vignette(vignetteStrength, 0.7);
  },

  async teardown(): Promise<void> {
    // Nothing to clean up
  },
};

registerActor(actor);
export default actor;
