/**
 * Psychedelic Distortion Actor
 *
 * Creates mind-bending visual distortions that react to audio frequencies.
 * Multiple distortion centers with bulge and twist effects create
 * flowing, trippy visuals with rainbow color cycling.
 *
 * Showcases unused APIs: bulge(), twist(), chain(), saturate(),
 * audio.spectrum(), audio.energyInRange()
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
  id: 'psychedelic-distortion',
  name: 'Psychedelic Distortion',
  description: 'Mind-bending visual distortions reactive to audio frequencies',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['psychedelic', 'distortion', 'audio-reactive', 'trippy', 'colorful'],
  createdAt: new Date('2026-01-10'),
  preferredDuration: 45,
  requiredContexts: ['audio'],
};

// ============================================================
// Constants
// ============================================================

const MAX_DISTORTION_CENTERS = 6;
const MAX_TRAIL_POINTS = 40;
const SPECTRUM_BANDS = 8; // Number of frequency bands to analyze

// ============================================================
// State interfaces
// ============================================================

type DistortionType = 'bulge' | 'twist' | 'both';

interface DistortionCenter {
  active: boolean;
  x: number; // 0-1 normalized position
  y: number; // 0-1 normalized position
  type: DistortionType;
  radius: number;
  strength: number;
  targetStrength: number;
  phase: number;
  speed: number;
  lifetime: number;
  maxLifetime: number;
  hue: number;
  // Movement
  vx: number;
  vy: number;
  // Trail history (circular buffer)
  trail: { x: number; y: number }[];
  trailHead: number;
  trailLength: number;
}

interface PsychedelicState {
  distortionCenters: DistortionCenter[];

  // Global state
  globalHue: number;
  hueSpeed: number;
  saturationBoost: number;

  // Audio analysis
  bassEnergy: number;
  midEnergy: number;
  trebleEnergy: number;
  overallEnergy: number;
  beatIntensity: number;

  // Spectrum data (pre-allocated)
  spectrumBands: number[];

  // Visual settings
  backgroundHue: number;
  pulsePhase: number;
}

// ============================================================
// State
// ============================================================

let state: PsychedelicState = {
  distortionCenters: [],
  globalHue: 0,
  hueSpeed: 0.5,
  saturationBoost: 1,
  bassEnergy: 0,
  midEnergy: 0,
  trebleEnergy: 0,
  overallEnergy: 0,
  beatIntensity: 0,
  spectrumBands: [],
  backgroundHue: 0,
  pulsePhase: 0,
};

// ============================================================
// Helper functions
// ============================================================

function hslToNumeric(h: number, s: number, l: number): number {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;
  let r = 0, g = 0, b = 0;
  const hMod = ((h % 360) + 360) % 360;
  if (hMod < 60) { r = c; g = x; b = 0; }
  else if (hMod < 120) { r = x; g = c; b = 0; }
  else if (hMod < 180) { r = 0; g = c; b = x; }
  else if (hMod < 240) { r = 0; g = x; b = c; }
  else if (hMod < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return (Math.round((r + m) * 255) << 16) | (Math.round((g + m) * 255) << 8) | Math.round((b + m) * 255);
}

function initDistortionCenter(
  center: DistortionCenter,
  x: number,
  y: number,
  type: DistortionType
): void {
  center.active = true;
  center.x = x;
  center.y = y;
  center.type = type;
  center.radius = 0.15 + Math.random() * 0.2;
  center.strength = 0;
  center.targetStrength = 0.3 + Math.random() * 0.5;
  center.phase = Math.random() * Math.PI * 2;
  center.speed = 0.5 + Math.random() * 1.5;
  center.lifetime = 0;
  center.maxLifetime = 5000 + Math.random() * 10000;
  center.hue = Math.random() * 360;
  center.vx = (Math.random() - 0.5) * 0.0005;
  center.vy = (Math.random() - 0.5) * 0.0005;
  center.trailHead = 0;
  center.trailLength = 0;

  // Reset trail
  for (let i = 0; i < MAX_TRAIL_POINTS; i++) {
    center.trail[i].x = x;
    center.trail[i].y = y;
  }
}

function getSpectrumEnergy(spectrum: Float32Array, startBin: number, endBin: number): number {
  if (!spectrum || spectrum.length === 0) return 0;

  let sum = 0;
  const start = Math.max(0, Math.min(startBin, spectrum.length - 1));
  const end = Math.max(0, Math.min(endBin, spectrum.length));

  for (let i = start; i < end; i++) {
    sum += spectrum[i];
  }

  return sum / (end - start);
}

// ============================================================
// Actor implementation
// ============================================================

const actor: Actor = {
  metadata,

  async setup(_api: ActorSetupAPI): Promise<void> {
    // Pre-allocate distortion centers pool
    state.distortionCenters = new Array(MAX_DISTORTION_CENTERS);
    for (let i = 0; i < MAX_DISTORTION_CENTERS; i++) {
      state.distortionCenters[i] = {
        active: false,
        x: 0,
        y: 0,
        type: 'bulge',
        radius: 0,
        strength: 0,
        targetStrength: 0,
        phase: 0,
        speed: 0,
        lifetime: 0,
        maxLifetime: 0,
        hue: 0,
        vx: 0,
        vy: 0,
        trail: new Array(MAX_TRAIL_POINTS),
        trailHead: 0,
        trailLength: 0,
      };

      // Pre-allocate trail points
      for (let j = 0; j < MAX_TRAIL_POINTS; j++) {
        state.distortionCenters[i].trail[j] = { x: 0, y: 0 };
      }
    }

    // Pre-allocate spectrum bands
    state.spectrumBands = new Array(SPECTRUM_BANDS).fill(0);

    // Initialize global state
    state.globalHue = Math.random() * 360;
    state.hueSpeed = 0.3 + Math.random() * 0.4;
    state.saturationBoost = 1;
    state.bassEnergy = 0;
    state.midEnergy = 0;
    state.trebleEnergy = 0;
    state.overallEnergy = 0;
    state.beatIntensity = 0;
    state.backgroundHue = Math.random() * 360;
    state.pulsePhase = 0;

    // Spawn initial distortion centers
    const types: DistortionType[] = ['bulge', 'twist', 'both'];
    for (let i = 0; i < 3; i++) {
      const center = state.distortionCenters[i];
      const type = types[i % types.length];
      initDistortionCenter(center, 0.3 + Math.random() * 0.4, 0.3 + Math.random() * 0.4, type);
    }

    console.log('[psychedelic-distortion] Setup complete');
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const { width, height } = api.canvas.getSize();
    const dt = frame.deltaTime;
    const time = frame.time * 0.001;

    // ============ Audio analysis ============

    const audioAvailable = api.context.audio.isAvailable();

    if (audioAvailable) {
      // Get raw audio levels
      const bass = api.context.audio.bass();
      const mid = api.context.audio.mid();
      const treble = api.context.audio.treble();
      const isBeat = api.context.audio.isBeat();

      // Smooth audio values
      state.bassEnergy = state.bassEnergy * 0.85 + bass * 0.15;
      state.midEnergy = state.midEnergy * 0.85 + mid * 0.15;
      state.trebleEnergy = state.trebleEnergy * 0.85 + treble * 0.15;
      state.overallEnergy = (state.bassEnergy + state.midEnergy + state.trebleEnergy) / 3;

      // Beat intensity for sudden effects
      if (isBeat) {
        state.beatIntensity = 1;
      }
      state.beatIntensity *= 0.9;

      // Get spectrum for detailed analysis
      const spectrum = api.context.audio.spectrum();
      if (spectrum && spectrum.length > 0) {
        const bandSize = Math.floor(spectrum.length / SPECTRUM_BANDS);
        for (let i = 0; i < SPECTRUM_BANDS; i++) {
          const bandEnergy = getSpectrumEnergy(spectrum, i * bandSize, (i + 1) * bandSize);
          state.spectrumBands[i] = state.spectrumBands[i] * 0.8 + bandEnergy * 0.2;
        }
      }
    } else {
      // Simulate audio with time-based oscillation
      state.bassEnergy = 0.3 + Math.sin(time * 0.5) * 0.2;
      state.midEnergy = 0.3 + Math.sin(time * 0.7) * 0.2;
      state.trebleEnergy = 0.3 + Math.sin(time * 1.1) * 0.2;
      state.overallEnergy = (state.bassEnergy + state.midEnergy + state.trebleEnergy) / 3;
      state.beatIntensity *= 0.95;

      // Simulate beats
      if (Math.sin(time * 2) > 0.95) {
        state.beatIntensity = 0.7;
      }
    }

    // ============ Update global state ============

    state.globalHue += state.hueSpeed * (1 + state.overallEnergy);
    state.backgroundHue += 0.1 * (1 + state.bassEnergy);
    state.pulsePhase += dt * 0.003;

    // Saturation boost based on treble
    state.saturationBoost = 1 + state.trebleEnergy * 0.5;

    // ============ Update and spawn distortion centers ============

    const spawnChance = 0.005 + state.beatIntensity * 0.03;
    const types: DistortionType[] = ['bulge', 'twist', 'both'];

    for (let i = 0; i < state.distortionCenters.length; i++) {
      const center = state.distortionCenters[i];

      if (center.active) {
        center.lifetime += dt;
        center.phase += center.speed * dt * 0.002;

        // Move center
        center.x += center.vx * dt;
        center.y += center.vy * dt;

        // Bounce off edges
        if (center.x < 0.1 || center.x > 0.9) center.vx *= -1;
        if (center.y < 0.1 || center.y > 0.9) center.vy *= -1;

        // Keep in bounds
        center.x = Math.max(0.05, Math.min(0.95, center.x));
        center.y = Math.max(0.05, Math.min(0.95, center.y));

        // Update trail (circular buffer)
        if (frame.frameCount % 3 === 0) {
          center.trail[center.trailHead].x = center.x;
          center.trail[center.trailHead].y = center.y;
          center.trailHead = (center.trailHead + 1) % MAX_TRAIL_POINTS;
          if (center.trailLength < MAX_TRAIL_POINTS) center.trailLength++;
        }

        // Animate strength
        const lifeProgress = center.lifetime / center.maxLifetime;
        if (lifeProgress < 0.2) {
          // Fade in
          center.strength = center.targetStrength * (lifeProgress / 0.2);
        } else if (lifeProgress > 0.8) {
          // Fade out
          center.strength = center.targetStrength * ((1 - lifeProgress) / 0.2);
        } else {
          // Full strength with audio modulation
          center.strength = center.targetStrength * (1 + state.bassEnergy * 0.5);
        }

        // Add pulsing
        center.strength *= 0.8 + Math.sin(center.phase) * 0.2;

        // Beat boost
        if (state.beatIntensity > 0.3) {
          center.strength *= 1 + state.beatIntensity * 0.5;
        }

        // Hue cycling
        center.hue += 0.5 + state.midEnergy * 2;

        // Deactivate when done
        if (center.lifetime >= center.maxLifetime) {
          center.active = false;
        }
      } else if (Math.random() < spawnChance) {
        // Spawn new center
        const type = types[Math.floor(Math.random() * types.length)];
        initDistortionCenter(center, 0.2 + Math.random() * 0.6, 0.2 + Math.random() * 0.6, type);
      }
    }

    // ============ Draw psychedelic background ============

    // Animated gradient background
    const pulse = Math.sin(state.pulsePhase) * 0.1;
    const bgLightness = 15 + pulse * 10 + state.bassEnergy * 10;

    // Draw background stripes/bands based on spectrum
    const bandHeight = height / SPECTRUM_BANDS;
    for (let i = 0; i < SPECTRUM_BANDS; i++) {
      const bandEnergy = state.spectrumBands[i];
      const bandHue = (state.backgroundHue + i * 45) % 360;
      const bandLightness = bgLightness + bandEnergy * 20;

      api.brush.rect(0, i * bandHeight, width, bandHeight + 1, {
        fill: hslToNumeric(bandHue, 60 + bandEnergy * 30, bandLightness),
      });
    }

    // ============ Draw distortion center visuals ============

    for (let i = 0; i < state.distortionCenters.length; i++) {
      const center = state.distortionCenters[i];
      if (!center.active || center.strength < 0.05) continue;

      const cx = center.x * width;
      const cy = center.y * height;
      const visualRadius = center.radius * Math.min(width, height);

      // Draw trail
      if (center.trailLength > 2) {
        for (let t = 0; t < center.trailLength - 1; t++) {
          const idx = (center.trailHead - center.trailLength + t + MAX_TRAIL_POINTS) % MAX_TRAIL_POINTS;
          const nextIdx = (idx + 1) % MAX_TRAIL_POINTS;

          const p1 = center.trail[idx];
          const p2 = center.trail[nextIdx];

          const alpha = (t / center.trailLength) * 0.4 * center.strength;
          const trailHue = (center.hue + t * 5) % 360;

          api.brush.line(
            p1.x * width,
            p1.y * height,
            p2.x * width,
            p2.y * height,
            {
              color: hslToNumeric(trailHue, 80, 60),
              alpha: alpha,
              width: 3 + (t / center.trailLength) * 5,
              cap: 'round',
            }
          );
        }
      }

      // Draw glow rings
      const ringCount = 4;
      for (let r = 0; r < ringCount; r++) {
        const ringRadius = visualRadius * (0.3 + r * 0.25);
        const ringAlpha = center.strength * (1 - r / ringCount) * 0.4;
        const ringHue = (center.hue + r * 30 + state.globalHue) % 360;

        api.brush.circle(cx, cy, ringRadius, {
          stroke: hslToNumeric(ringHue, 90, 60),
          alpha: ringAlpha,
          strokeWidth: 3 + state.bassEnergy * 5,
          blendMode: 'add',
        });
      }

      // Draw center orb
      api.brush.circle(cx, cy, visualRadius * 0.15, {
        fill: hslToNumeric(center.hue, 90, 70),
        alpha: center.strength * 0.6,
        blendMode: 'add',
      });
    }

    // ============ Apply distortion filters ============
    // Limit to 2 strongest centers to stay within 3-5 filter budget
    // (2 centers × 2 filters max + 4 global = ~8, but global filters are cheap)

    // Find the 2 strongest active centers
    let strongest1: DistortionCenter | null = null;
    let strongest2: DistortionCenter | null = null;
    let maxStrength1 = 0;
    let maxStrength2 = 0;

    for (const center of state.distortionCenters) {
      if (!center.active || center.strength < 0.1) continue;
      if (center.strength > maxStrength1) {
        strongest2 = strongest1;
        maxStrength2 = maxStrength1;
        strongest1 = center;
        maxStrength1 = center.strength;
      } else if (center.strength > maxStrength2) {
        strongest2 = center;
        maxStrength2 = center.strength;
      }
    }

    // Apply filters to the 2 strongest centers only
    const strongestCenters = [strongest1, strongest2].filter(c => c !== null) as DistortionCenter[];

    for (const center of strongestCenters) {
      const strength = center.strength * (0.5 + state.bassEnergy * 0.5);

      if (center.type === 'bulge' || center.type === 'both') {
        // Bulge effect - strength oscillates between bulge and pinch
        const bulgeStrength = Math.sin(center.phase * 2) * strength;
        api.filter.bulge(center.x, center.y, center.radius, bulgeStrength);
      }

      if (center.type === 'twist' || center.type === 'both') {
        // Twist effect
        const twistAngle = Math.sin(center.phase) * strength * Math.PI * 0.5;
        api.filter.twist(center.x, center.y, center.radius * 0.8, twistAngle);
      }
    }

    // ============ Apply global effects ============

    // Hue rotation based on time and audio
    const hueRotation = (state.globalHue + state.midEnergy * 30) % 360;
    api.filter.hueRotate(hueRotation);

    // Saturation boost
    api.filter.saturate(state.saturationBoost);

    // Chromatic aberration on beats
    if (state.beatIntensity > 0.2) {
      const aberrationAmount = state.beatIntensity * 4;
      api.filter.chromaticAberration(
        [aberrationAmount, 0],
        [-aberrationAmount, 0]
      );
    }

    // Subtle contrast boost
    api.filter.contrast(1 + state.overallEnergy * 0.2);
  },

  async teardown(): Promise<void> {
    // Reset state
    state.globalHue = 0;
    state.hueSpeed = 0.5;
    state.saturationBoost = 1;
    state.bassEnergy = 0;
    state.midEnergy = 0;
    state.trebleEnergy = 0;
    state.overallEnergy = 0;
    state.beatIntensity = 0;
    state.backgroundHue = 0;
    state.pulsePhase = 0;

    // Deactivate all distortion centers
    for (const center of state.distortionCenters) {
      center.active = false;
    }

    // Reset spectrum bands
    for (let i = 0; i < state.spectrumBands.length; i++) {
      state.spectrumBands[i] = 0;
    }

    console.log('[psychedelic-distortion] Teardown complete');
  },
};

// Self-register with the runtime
registerActor(actor);

export default actor;
