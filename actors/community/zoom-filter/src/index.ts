import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorMetadata,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'zoom-filter',
  name: 'Zoom Filter',
  description: 'Slowly and steadily zooms into the canvas center',
  author: { name: 'Lucas Radke', github: 'Crixu' },
  version: '1.0.0',
  tags: ['filter', 'zoom', 'cinematic'],
  createdAt: new Date(),
  preferredDuration: 60,
  role: 'filter',
};

const ZOOM_SHADER = `
  uniform float uZoom;

  void main() {
    vec2 uv = vTextureCoord;
    // Scale UVs toward center
    vec2 center = vec2(0.5, 0.5);
    uv = center + (uv - center) / uZoom;
    // Clamp to prevent wrapping
    uv = clamp(uv, vec2(0.0), vec2(1.0));
    finalColor = texture(uTexture, uv);
  }
`;

let startTime = 0;

const actor: Actor = {
  metadata,

  async setup(): Promise<void> {
    startTime = 0;
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    if (startTime === 0) startTime = frame.time;
    const elapsed = (frame.time - startTime) / 1000;

    // Slow steady zoom: 1.0 → ~1.5 over 60 seconds
    const zoom = 1.0 + elapsed * 0.008;

    api.filter.customShader(ZOOM_SHADER, { uZoom: zoom });
  },

  async teardown(): Promise<void> {
    startTime = 0;
  },
};

registerActor(actor);
export default actor;
