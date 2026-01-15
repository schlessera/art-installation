/**
 * Chromatic Pulse Filter Actor
 *
 * Rhythmic RGB separation that pulses with time, creating a "living"
 * glitch aesthetic. Colors separate and recombine in waves.
 *
 * Uses only built-in filters (no custom shaders) for simplicity.
 */

import type {
  Actor,
  ActorMetadata,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';
import { registerActor } from '@art/actor-sdk';

const metadata: ActorMetadata = {
  id: 'chromatic-pulse',
  name: 'Chromatic Pulse',
  description: 'Rhythmic RGB separation that pulses with time',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['filter', 'chromatic', 'pulse', 'glitch', 'rgb'],
  createdAt: new Date('2026-01-12'),
  preferredDuration: 60,
  requiredContexts: [],
  isGlobalFilter: true,
};

interface PulseState {
  pulseSpeed: number;
  rotationSpeed: number;
  baseIntensity: number;
  maxIntensity: number;
}

let state: PulseState = {
  pulseSpeed: 0.5,
  rotationSpeed: 0.3,
  baseIntensity: 3,
  maxIntensity: 8,
};

const actor: Actor = {
  metadata,

  async setup(): Promise<void> {
    // Randomize parameters for variety
    state.pulseSpeed = 0.3 + Math.random() * 0.4; // 0.3-0.7 Hz
    state.rotationSpeed = 0.2 + Math.random() * 0.3; // 0.2-0.5 rad/s
    state.baseIntensity = 2 + Math.random() * 2; // 2-4 pixels
    state.maxIntensity = 6 + Math.random() * 4; // 6-10 pixels

    console.log(`[chromatic-pulse] Setup: speed=${state.pulseSpeed.toFixed(2)}Hz`);
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const time = frame.time;
    const isDark = api.context.display.isDarkMode();

    // Calculate pulse intensity (sine wave)
    const pulse = Math.sin(time * Math.PI * 2 * state.pulseSpeed);
    const intensity = state.baseIntensity + (pulse * 0.5 + 0.5) * (state.maxIntensity - state.baseIntensity);

    // Offset directions rotate over time for dynamic movement
    const angle = time * state.rotationSpeed;
    const offsetR: [number, number] = [
      Math.cos(angle) * intensity,
      Math.sin(angle) * intensity,
    ];
    const offsetB: [number, number] = [
      Math.cos(angle + Math.PI) * intensity,
      Math.sin(angle + Math.PI) * intensity,
    ];

    // Apply chromatic aberration
    api.filter.chromaticAberration(offsetR, offsetB);

    // Add subtle hue rotation during peak intensity
    if (pulse > 0.7) {
      const hueShift = (pulse - 0.7) / 0.3 * 30; // 0-30 degrees
      api.filter.hueRotate(hueShift);
    }

    // Subtle vignette to focus attention
    // In light mode, reduce vignette intensity as dark edges look harsh
    // against light backgrounds
    const vignetteIntensity = isDark ? 0.15 : 0.08;
    api.filter.vignette(vignetteIntensity, 0.7);
  },

  async teardown(): Promise<void> {
    console.log('[chromatic-pulse] Teardown complete');
  },
};

registerActor(actor);

export default actor;
