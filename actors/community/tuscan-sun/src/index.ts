/**
 * Tuscan Sun — Filter Actor
 *
 * Warm golden color grade with a subtle lens flare that drifts
 * across the canvas based on time of day.
 */

import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'tuscan-sun',
  name: 'Tuscan Sun',
  description: 'Warm golden color grade with drifting lens flare, warmer at golden hour',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['filter', 'warm', 'italy', 'sun', 'golden'],
  createdAt: new Date('2026-03-20'),
  role: 'filter',
  preferredDuration: 60,
  requiredContexts: ['time', 'display'],
};

// Warm color matrix — shifts towards golden tones
const WARM_MATRIX: number[] = [
  1.1,  0.05, 0,    0, 0.02,  // red
  0.02, 1.0,  0,    0, 0.01,  // green
  0,    0,    0.85, 0, 0,     // blue (reduced)
  0,    0,    0,    1, 0,     // alpha
];

// Extra warm for golden hour
const GOLDEN_MATRIX: number[] = [
  1.2,  0.08, 0,    0, 0.04,
  0.04, 1.05, 0.02, 0, 0.02,
  0,    0,    0.75, 0, 0,
  0,    0,    0,    1, 0,
];

let warmth = 0;

const actor: Actor = {
  metadata,

  async setup(): Promise<void> {
    warmth = 0.5;
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const tSec = frame.time / 1000;
    const hour = api.context.time.hour();
    const isDark = api.context.display.isDarkMode();

    // Calculate warmth based on time of day
    // Golden hour: early morning (6-8) and late afternoon (16-19)
    let targetWarmth: number;
    if ((hour >= 6 && hour <= 8) || (hour >= 16 && hour <= 19)) {
      targetWarmth = 1.0; // Full golden
    } else if (hour >= 9 && hour <= 15) {
      targetWarmth = 0.5; // Midday — moderate warmth
    } else {
      targetWarmth = 0.3; // Night — subtle warmth
    }

    // Smoothly interpolate warmth
    warmth += (targetWarmth - warmth) * 0.01;

    // Blend between warm and golden matrices
    const matrix: number[] = [];
    for (let i = 0; i < 20; i++) {
      matrix[i] = WARM_MATRIX[i] + (GOLDEN_MATRIX[i] - WARM_MATRIX[i]) * warmth;
    }

    // Apply warm color grade
    api.filter.colorMatrix(matrix as [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]);

    // Subtle vignette — warmer at edges
    const vignetteStrength = isDark ? 0.2 : 0.12;
    api.filter.vignette(vignetteStrength + warmth * 0.05, 0.6);

    // Very slight saturation boost
    api.filter.saturate(1.0 + warmth * 0.15);
  },

  async teardown(): Promise<void> {
    warmth = 0;
  },
};

registerActor(actor);
export default actor;
