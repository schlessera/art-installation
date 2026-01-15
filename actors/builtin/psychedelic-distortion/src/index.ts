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

  // Variability settings (set in setup)
  backgroundOpacity: number;           // 0.3 - 1.0 for background bands
  backgroundOpacityVariation: number;  // How much opacity varies per band
  ringCountMin: number;                // 2-4 rings per center
  ringCountMax: number;                // 4-8 rings per center
  baseTrailWidth: number;              // 2-5 base trail width
  trailWidthMultiplier: number;        // 1.0-3.0 how much trail grows
  ringWidthBase: number;               // 2-5 base ring stroke width
  ringWidthAudioMultiplier: number;    // 3-8 how much audio affects ring width
  orbSizeMultiplier: number;           // 0.1-0.25 orb size relative to radius
  glowIntensity: number;               // 0.3-0.6 glow alpha multiplier
  centerMovementSpeed: number;         // 0.0003-0.001 how fast centers move
  trailUpdateFrequency: number;        // 2-5 frames between trail updates
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
  // Variability defaults (will be randomized in setup)
  backgroundOpacity: 0.8,
  backgroundOpacityVariation: 0.2,
  ringCountMin: 3,
  ringCountMax: 5,
  baseTrailWidth: 3,
  trailWidthMultiplier: 2,
  ringWidthBase: 3,
  ringWidthAudioMultiplier: 5,
  orbSizeMultiplier: 0.15,
  glowIntensity: 0.4,
  centerMovementSpeed: 0.0005,
  trailUpdateFrequency: 3,
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
  type: DistortionType,
  movementSpeed: number
): void {
  center.active = true;
  center.x = x;
  center.y = y;
  center.type = type;
  center.radius = 0.12 + Math.random() * 0.25;  // More variation: 0.12-0.37
  center.strength = 0;
  center.targetStrength = 0.25 + Math.random() * 0.6;  // More variation: 0.25-0.85
  center.phase = Math.random() * Math.PI * 2;
  center.speed = 0.3 + Math.random() * 2.0;  // More variation: 0.3-2.3
  center.lifetime = 0;
  center.maxLifetime = 4000 + Math.random() * 14000;  // More variation: 4-18 seconds
  center.hue = Math.random() * 360;
  // Use the configurable movement speed with ±50% variation
  const speedVariation = 0.5 + Math.random();
  center.vx = (Math.random() - 0.5) * movementSpeed * 2 * speedVariation;
  center.vy = (Math.random() - 0.5) * movementSpeed * 2 * speedVariation;
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
    state.hueSpeed = 0.2 + Math.random() * 0.6;  // More variation: 0.2-0.8
    state.saturationBoost = 1;
    state.bassEnergy = 0;
    state.midEnergy = 0;
    state.trebleEnergy = 0;
    state.overallEnergy = 0;
    state.beatIntensity = 0;
    state.backgroundHue = Math.random() * 360;
    state.pulsePhase = 0;

    // === Randomize variability settings ===
    // Background opacity: 0.3-1.0 (allows for transparent to opaque)
    state.backgroundOpacity = 0.3 + Math.random() * 0.7;
    // How much opacity varies between bands: 0.05-0.35
    state.backgroundOpacityVariation = 0.05 + Math.random() * 0.3;

    // Ring counts: vary per instance
    state.ringCountMin = 2 + Math.floor(Math.random() * 3);  // 2-4
    state.ringCountMax = state.ringCountMin + 2 + Math.floor(Math.random() * 3);  // +2-4 more

    // Trail thickness: 2-6 base, 1.5-3.5 multiplier
    state.baseTrailWidth = 2 + Math.random() * 4;
    state.trailWidthMultiplier = 1.5 + Math.random() * 2;

    // Ring thickness: 2-6 base, 3-10 audio multiplier
    state.ringWidthBase = 2 + Math.random() * 4;
    state.ringWidthAudioMultiplier = 3 + Math.random() * 7;

    // Orb size: 0.08-0.25 of center radius
    state.orbSizeMultiplier = 0.08 + Math.random() * 0.17;

    // Glow intensity: 0.25-0.7
    state.glowIntensity = 0.25 + Math.random() * 0.45;

    // Movement speed: 0.0002-0.0012 (can be slow or quite fast)
    state.centerMovementSpeed = 0.0002 + Math.random() * 0.001;

    // Trail update frequency: 2-6 frames
    state.trailUpdateFrequency = 2 + Math.floor(Math.random() * 5);

    // Spawn initial distortion centers (2-4 initial centers)
    const initialCount = 2 + Math.floor(Math.random() * 3);
    const types: DistortionType[] = ['bulge', 'twist', 'both'];
    for (let i = 0; i < initialCount; i++) {
      const center = state.distortionCenters[i];
      const type = types[i % types.length];
      initDistortionCenter(
        center,
        0.2 + Math.random() * 0.6,  // More spread: 0.2-0.8
        0.2 + Math.random() * 0.6,
        type,
        state.centerMovementSpeed
      );
    }

    console.log(
      `[psychedelic-distortion] Setup: bgOpacity=${state.backgroundOpacity.toFixed(2)}, ` +
      `rings=${state.ringCountMin}-${state.ringCountMax}, ` +
      `trailWidth=${state.baseTrailWidth.toFixed(1)}×${state.trailWidthMultiplier.toFixed(1)}, ` +
      `ringWidth=${state.ringWidthBase.toFixed(1)}+audio×${state.ringWidthAudioMultiplier.toFixed(1)}, ` +
      `initialCenters=${initialCount}`
    );
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

        // Update trail (circular buffer) - variable frequency
        if (frame.frameCount % state.trailUpdateFrequency === 0) {
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
        initDistortionCenter(
          center,
          0.15 + Math.random() * 0.7,  // Even more spread: 0.15-0.85
          0.15 + Math.random() * 0.7,
          type,
          state.centerMovementSpeed
        );
      }
    }

    // ============ Draw psychedelic background ============

    // Mode-aware settings
    const isDarkMode = api.context.display.isDarkMode();
    const glowBlendMode = isDarkMode ? 'add' : 'multiply';

    // Animated gradient background
    const pulse = Math.sin(state.pulsePhase) * 0.1;
    // Dark mode: low lightness (15-35), Light mode: high lightness (65-85)
    const bgLightnessBase = isDarkMode ? 15 : 85;
    const bgLightnessRange = isDarkMode ? 1 : -1; // Direction of lightness change
    const bgLightness = bgLightnessBase + bgLightnessRange * (pulse * 10 + state.bassEnergy * 10);

    // Draw background stripes/bands based on spectrum with variable opacity
    const bandHeight = height / SPECTRUM_BANDS;
    for (let i = 0; i < SPECTRUM_BANDS; i++) {
      const bandEnergy = state.spectrumBands[i];
      const bandHue = (state.backgroundHue + i * 45) % 360;
      const bandLightness = bgLightness + bgLightnessRange * bandEnergy * 20;

      // Variable opacity per band: base + variation based on position and energy
      const bandOpacityOffset = Math.sin(i * 0.8 + state.pulsePhase * 0.5) * state.backgroundOpacityVariation;
      const bandOpacity = Math.max(0.1, Math.min(1.0,
        state.backgroundOpacity + bandOpacityOffset + bandEnergy * 0.15
      ));

      // Variable band thickness (some bands slightly thicker/thinner)
      const thicknessVariation = 0.85 + Math.sin(i * 1.2) * 0.3;
      const adjustedBandHeight = bandHeight * thicknessVariation;

      api.brush.rect(0, i * bandHeight, width, adjustedBandHeight + 1, {
        fill: hslToNumeric(bandHue, 60 + bandEnergy * 30, bandLightness),
        alpha: bandOpacity,
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
        // Dark mode: high lightness (60%), Light mode: low lightness (30%)
        const trailLightness = isDarkMode ? 60 : 30;

        for (let t = 0; t < center.trailLength - 1; t++) {
          const idx = (center.trailHead - center.trailLength + t + MAX_TRAIL_POINTS) % MAX_TRAIL_POINTS;
          const nextIdx = (idx + 1) % MAX_TRAIL_POINTS;

          const p1 = center.trail[idx];
          const p2 = center.trail[nextIdx];

          const baseAlpha = (t / center.trailLength) * 0.4 * center.strength;
          const alpha = isDarkMode ? baseAlpha : baseAlpha * 0.85;
          const trailHue = (center.hue + t * 5) % 360;

          // Variable trail width using configurable base and multiplier
          const trailWidth = state.baseTrailWidth + (t / center.trailLength) * state.baseTrailWidth * state.trailWidthMultiplier;

          api.brush.line(
            p1.x * width,
            p1.y * height,
            p2.x * width,
            p2.y * height,
            {
              color: hslToNumeric(trailHue, 80, trailLightness),
              alpha: alpha,
              width: trailWidth,
              cap: 'round',
            }
          );
        }
      }

      // Draw glow rings with variable count and thickness
      // Dark mode: high lightness (60%), Light mode: low lightness (25%)
      const ringLightness = isDarkMode ? 60 : 25;
      // Ring count varies per center based on its index and configured range
      const ringCount = state.ringCountMin + Math.floor((i / MAX_DISTORTION_CENTERS) * (state.ringCountMax - state.ringCountMin));
      const ringSpacing = 0.7 / ringCount;  // Adjust spacing based on count

      for (let r = 0; r < ringCount; r++) {
        const ringRadius = visualRadius * (0.2 + r * ringSpacing);
        const baseRingAlpha = center.strength * (1 - r / ringCount) * state.glowIntensity;
        const ringAlpha = isDarkMode ? baseRingAlpha : baseRingAlpha * 0.8;
        const ringHue = (center.hue + r * (360 / ringCount) + state.globalHue) % 360;

        // Variable ring width using configurable base and audio multiplier
        const ringWidth = state.ringWidthBase + state.bassEnergy * state.ringWidthAudioMultiplier;

        api.brush.circle(cx, cy, ringRadius, {
          stroke: hslToNumeric(ringHue, 90, ringLightness),
          alpha: ringAlpha,
          strokeWidth: ringWidth,
          blendMode: glowBlendMode,
        });
      }

      // Draw center orb with variable size
      // Dark mode: high lightness (70%), Light mode: low lightness (20%)
      const orbLightness = isDarkMode ? 70 : 20;
      const orbAlpha = isDarkMode ? center.strength * state.glowIntensity * 1.5 : center.strength * state.glowIntensity * 1.2;
      const orbSize = visualRadius * state.orbSizeMultiplier;

      api.brush.circle(cx, cy, orbSize, {
        fill: hslToNumeric(center.hue, 90, orbLightness),
        alpha: orbAlpha,
        blendMode: glowBlendMode,
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

    // Reset variability settings to defaults
    state.backgroundOpacity = 0.8;
    state.backgroundOpacityVariation = 0.2;
    state.ringCountMin = 3;
    state.ringCountMax = 5;
    state.baseTrailWidth = 3;
    state.trailWidthMultiplier = 2;
    state.ringWidthBase = 3;
    state.ringWidthAudioMultiplier = 5;
    state.orbSizeMultiplier = 0.15;
    state.glowIntensity = 0.4;
    state.centerMovementSpeed = 0.0005;
    state.trailUpdateFrequency = 3;

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
