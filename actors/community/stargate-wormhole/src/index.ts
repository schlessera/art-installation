import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorMetadata,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'stargate-wormhole',
  name: 'Stargate Wormhole',
  description: 'A shimmering blue vortex with ripples and inward light streaks',
  author: {
    name: 'Codex',
    github: 'openai',
  },
  version: '1.0.0',
  tags: ['sci-fi', 'wormhole', 'vortex', 'stargate', 'energy'],
  createdAt: new Date('2026-03-22'),
  preferredDuration: 45,
  requiredContexts: ['audio'],
};

const STREAM_COUNT = 72;
const RIPPLE_COUNT = 20;
const TWO_PI = Math.PI * 2;

interface Stream {
  angle: number;
  speed: number;
  phase: number;
  width: number;
  length: number;
  jitter: number;
  color: number;
}

interface Ripple {
  offset: number;
  speed: number;
  wobbleAmp: number;
  wobbleFreq: number;
}

interface WormholeState {
  width: number;
  height: number;
  cx: number;
  cy: number;
  time: number;
  pulse: number;
  ringRadius: number;
  coreRadius: number;
  streams: Stream[];
  ripples: Ripple[];
}

const state: WormholeState = {
  width: 0,
  height: 0,
  cx: 0,
  cy: 0,
  time: 0,
  pulse: 0,
  ringRadius: 0,
  coreRadius: 0,
  streams: [],
  ripples: [],
};

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();
    state.width = width;
    state.height = height;
    state.cx = width * 0.5;
    state.cy = height * 0.52;
    state.ringRadius = Math.min(width, height) * 0.34;
    state.coreRadius = state.ringRadius * 0.84;
    state.time = 0;
    state.pulse = 0;

    state.streams.length = 0;
    for (let i = 0; i < STREAM_COUNT; i++) {
      state.streams.push({
        angle: (i / STREAM_COUNT) * TWO_PI + (Math.random() - 0.5) * 0.08,
        speed: 0.48 + Math.random() * 0.9,
        phase: Math.random(),
        width: 2.6 + Math.random() * 2.8,
        length: 24 + Math.random() * 30,
        jitter: 0.02 + Math.random() * 0.07,
        color: Math.random() > 0.5 ? 0x7ed7ff : 0x44b3ff,
      });
    }

    state.ripples.length = 0;
    for (let i = 0; i < RIPPLE_COUNT; i++) {
      state.ripples.push({
        offset: Math.random(),
        speed: 0.35 + Math.random() * 0.5,
        wobbleAmp: 0.003 + Math.random() * 0.011,
        wobbleFreq: 1.5 + Math.random() * 3.8,
      });
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const dt = clamp(frame.deltaTime * 0.001, 0.001, 0.05);
    state.time += dt;

    const bass = api.context.audio.bass();
    if (api.context.audio.isBeat()) {
      state.pulse = 1;
    }
    state.pulse = Math.max(state.pulse - dt * 2.1, bass * 0.8);

    const ringEnergy = 1 + state.pulse * 0.12;
    const ringRadius = state.ringRadius * ringEnergy;
    const coreRadius = state.coreRadius * (1 + state.pulse * 0.08);

    api.brush.circle(state.cx, state.cy, ringRadius * 1.18, {
      fill: {
        type: 'radial',
        cx: 0.5,
        cy: 0.5,
        radius: 0.5,
        stops: [
          { offset: 0, color: 'rgba(40,120,190,0.08)' },
          { offset: 0.6, color: 'rgba(20,80,140,0.06)' },
          { offset: 1, color: 'rgba(5,18,36,0)' },
        ],
      },
      blendMode: 'add',
    });

    api.brush.circle(state.cx, state.cy, ringRadius, {
      stroke: 0xb8ecff,
      strokeWidth: 8 + state.pulse * 2.5,
      alpha: 0.9,
      blendMode: 'add',
    });
    api.brush.circle(state.cx, state.cy, ringRadius - 10, {
      stroke: 0x56b9ff,
      strokeWidth: 3.5,
      alpha: 0.9,
      blendMode: 'add',
    });

    api.brush.circle(state.cx, state.cy, coreRadius, {
      fill: {
        type: 'radial',
        cx: 0.5,
        cy: 0.5,
        radius: 0.5,
        stops: [
          { offset: 0, color: 'rgba(215,245,255,0.95)' },
          { offset: 0.18, color: 'rgba(120,210,255,0.8)' },
          { offset: 0.55, color: 'rgba(20,100,170,0.7)' },
          { offset: 1, color: 'rgba(6,24,55,0.9)' },
        ],
      },
      alpha: 0.94,
      blendMode: 'add',
    });

    for (let i = 0; i < state.ripples.length; i++) {
      const ripple = state.ripples[i];
      const cycle = (state.time * ripple.speed + ripple.offset) % 1;
      const depth = 1 - cycle;
      const wobble = Math.sin((state.time + ripple.offset) * ripple.wobbleFreq * TWO_PI) * ripple.wobbleAmp;
      const radius = coreRadius * (0.12 + cycle * 0.86 + wobble);
      const alpha = depth * depth * (0.62 + state.pulse * 0.18);

      if (alpha < 0.05) {
        continue;
      }

      api.brush.circle(state.cx, state.cy, radius, {
        stroke: i % 2 === 0 ? 0x99e8ff : 0x58bbff,
        strokeWidth: 2.5 + depth * 1.7,
        alpha,
        blendMode: 'add',
      });
    }

    for (let i = 0; i < state.streams.length; i++) {
      const stream = state.streams[i];
      const travel = (state.time * stream.speed + stream.phase) % 1;
      const depth = 1 - travel;
      const baseR = coreRadius * (0.24 + travel * 0.72);
      const jitter = Math.sin(state.time * 6 + i * 0.73) * stream.jitter;
      const angle = stream.angle + jitter;

      const x1 = state.cx + Math.cos(angle) * baseR;
      const y1 = state.cy + Math.sin(angle) * baseR;
      const x2 = state.cx + Math.cos(angle + jitter * 0.6) * Math.max(6, baseR - stream.length);
      const y2 = state.cy + Math.sin(angle + jitter * 0.6) * Math.max(6, baseR - stream.length);

      const alpha = 0.2 + depth * depth * 0.75 + state.pulse * 0.12;
      if (alpha < 0.05) {
        continue;
      }

      api.brush.line(x1, y1, x2, y2, {
        color: stream.color,
        width: stream.width * (0.65 + depth * 0.55),
        alpha,
        blendMode: 'add',
        cap: 'round',
      });
    }
  },

  async teardown(): Promise<void> {
    state.time = 0;
    state.pulse = 0;
    state.streams.length = 0;
    state.ripples.length = 0;
  },
};

registerActor(actor);
export default actor;
