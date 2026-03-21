/**
 * Venetian Fog — Filter Actor
 *
 * Misty atmospheric haze that softens the scene with a dreamy,
 * fog-like quality. Applies gentle blur, desaturation, reduced
 * contrast, and a brightness lift to simulate the famous lagoon
 * mists of Venice.
 */

import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'venetian-fog',
  name: 'Venetian Fog',
  description: 'Misty atmospheric haze with soft focus, muted colors, and gentle brightness lift',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['filter', 'venice', 'fog', 'atmospheric', 'dreamy'],
  createdAt: new Date('2026-03-21'),
  role: 'filter',
  preferredDuration: 60,
  requiredContexts: ['time', 'display'],
};

const actor: Actor = {
  metadata,

  async setup(): Promise<void> {
    // No state needed — pure filter actor
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const tSec = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();

    // --- Filter 1: Soft-focus blur (1-2px, dreamy haze) ---
    // Gently oscillate between 1 and 2px for a living fog feel
    const blurAmount = 1.3 + Math.sin(tSec * 0.3) * 0.4;
    api.filter.blur(isDark ? blurAmount * 0.8 : blurAmount);

    // --- Filter 2: Desaturation (fog mutes colors) ---
    // saturate < 1 desaturates; 0.75-0.85 range
    const saturation = isDark ? 0.82 : 0.78;
    api.filter.saturate(saturation);

    // --- Filter 3: Reduced contrast (fog flattens tones) ---
    const contrast = isDark ? 0.88 : 0.86;
    api.filter.contrast(contrast);

    // --- Filter 4: Slight brightness lift (fog lightens the scene) ---
    // brightness API: -1 to 1, 0 = no change
    const brightness = isDark ? 0.05 : 0.08;
    api.filter.brightness(brightness);

    // --- Filter 5: Light vignette (edges darker than center) ---
    const vignetteIntensity = isDark ? 0.14 : 0.10;
    api.filter.vignette(vignetteIntensity, 0.6);
  },

  async teardown(): Promise<void> {
    // Nothing to clean up
  },
};

registerActor(actor);
export default actor;
