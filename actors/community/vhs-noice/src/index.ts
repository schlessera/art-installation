import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'vhs-noice',
  name: 'VHS Noice',
  description: 'VHS tape noise filter with static, scan lines, color bleeding, and tracking glitches',
  author: { name: 'janw-ll', github: 'janw-ll' },
  version: '1.0.0',
  tags: ['filter', 'vhs', 'retro', 'noise', 'glitch'],
  createdAt: new Date(),
  role: 'filter',
  preferredDuration: 30,
};

let noiseSpeed = 0;
let trackingGlitchChance = 0;
let scanLineIntensity = 0;

const actor: Actor = {
  metadata,

  async setup(_api: ActorSetupAPI): Promise<void> {
    noiseSpeed = 0.8 + Math.random() * 0.4;
    trackingGlitchChance = 0.02 + Math.random() * 0.03;
    scanLineIntensity = 0.06 + Math.random() * 0.06;
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time / 1000;

    // Film grain / static noise — shifting seed each frame for animated grain
    const noiseSeed = Math.floor(t * 12 * noiseSpeed) * 0.1;
    api.filter.noise(0.12 + Math.sin(t * 3) * 0.04, noiseSeed);

    // Slight color bleed via chromatic aberration — wobbles over time
    const wobble = Math.sin(t * 1.5) * 0.6;
    const aberrationX = 1.8 + wobble;
    api.filter.chromaticAberration(
      [aberrationX, 0.3],
      [-aberrationX * 0.7, -0.2],
    );

    // Subtle desaturation for that washed-out VHS look
    api.filter.saturate(0.75 + Math.sin(t * 0.7) * 0.08);

    // Slight contrast reduction
    api.filter.contrast(0.92 + Math.sin(t * 1.1) * 0.03);

    // Periodic tracking glitch — brief heavy distortion
    const glitchHash = Math.sin(t * 37.7) * 0.5 + 0.5;
    if (glitchHash < trackingGlitchChance) {
      // Stronger chromatic shift during glitch
      api.filter.chromaticAberration(
        [6 + Math.sin(t * 100) * 3, 2],
        [-5, -1.5],
      );
    }

    // Vignette for that CRT/TV edge darkening
    api.filter.vignette(0.25, 0.6);
  },

  async teardown(): Promise<void> {
    noiseSpeed = 0;
    trackingGlitchChance = 0;
    scanLineIntensity = 0;
  },
};

registerActor(actor);
export default actor;
