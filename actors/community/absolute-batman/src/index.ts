import { registerActor } from '@art/actor-sdk';
import type { Actor, ActorSetupAPI, ActorUpdateAPI, FrameContext } from '@art/types';
import batmanImageUrl from './absolute-batman.jpg?inline';

const actor: Actor = {
  metadata: {
    id: 'absolute-batman',
    name: 'Absolute Batman',
    description: 'Absolute Batman background with a dramatic film filter',
    author: { name: 'Jan', github: 'janw-ll' },
    version: '1.0.0',
    tags: ['background', 'batman', 'image'],
    createdAt: new Date(),
    preferredDuration: 30,
    role: 'background',
  },

  async setup(_api: ActorSetupAPI): Promise<void> {},

  update(api: ActorUpdateAPI, _frame: FrameContext): void {
    const { width, height } = api.canvas.getSize();

    // Draw the batman image covering the full canvas
    api.brush.image(batmanImageUrl, width / 2, height / 2, {
      width,
      height,
      anchorX: 0.5,
      anchorY: 0.5,
    });

    // Apply a dramatic dark filter overlay
    api.filter.vignette(0.6, 0.4);
    api.filter.contrast(1.3);
    api.filter.saturate(0.6);
    api.filter.brightness(-0.1);
  },

  async teardown(): Promise<void> {},
};

registerActor(actor);
export default actor;
