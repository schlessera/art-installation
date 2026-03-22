import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'peper',
  name: 'Peper',
  description: 'A big bell pepper gently bobbing on the canvas',
  author: { name: 'Lucio Sa', github: 'janw-ll' },
  version: '1.0.0',
  tags: ['pepper', 'vegetable', 'fun'],
  createdAt: new Date(),
  preferredDuration: 30,
  requiredContexts: ['display'],
};

let canvasW = 0;
let canvasH = 0;
let pepperTexture = '';

function createPepperTexture(): string {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = Math.round(size * 1.3);
  const ctx = canvas.getContext('2d')!;

  // Main pepper body
  ctx.beginPath();
  ctx.moveTo(size * 0.5, size * 0.15);
  // Left side
  ctx.bezierCurveTo(size * 0.15, size * 0.2, size * 0.05, size * 0.55, size * 0.18, size * 0.9);
  // Bottom left lobe
  ctx.bezierCurveTo(size * 0.22, size * 1.05, size * 0.32, size * 1.15, size * 0.38, size * 1.2);
  // Bottom center dip
  ctx.bezierCurveTo(size * 0.42, size * 1.22, size * 0.48, size * 1.18, size * 0.5, size * 1.2);
  // Bottom right lobe
  ctx.bezierCurveTo(size * 0.52, size * 1.18, size * 0.58, size * 1.22, size * 0.62, size * 1.2);
  ctx.bezierCurveTo(size * 0.68, size * 1.15, size * 0.78, size * 1.05, size * 0.82, size * 0.9);
  // Right side
  ctx.bezierCurveTo(size * 0.95, size * 0.55, size * 0.85, size * 0.2, size * 0.5, size * 0.15);
  ctx.closePath();

  // Red gradient fill
  const bodyGrad = ctx.createRadialGradient(
    size * 0.4, size * 0.5, size * 0.05,
    size * 0.5, size * 0.65, size * 0.55
  );
  bodyGrad.addColorStop(0, '#ff4422');
  bodyGrad.addColorStop(0.4, '#dd2200');
  bodyGrad.addColorStop(0.7, '#cc1100');
  bodyGrad.addColorStop(1, '#881100');
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  // Highlight / shine
  ctx.beginPath();
  ctx.ellipse(size * 0.38, size * 0.45, size * 0.08, size * 0.22, -0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.fill();

  // Vertical grooves
  ctx.beginPath();
  ctx.moveTo(size * 0.38, size * 0.2);
  ctx.bezierCurveTo(size * 0.36, size * 0.5, size * 0.34, size * 0.85, size * 0.38, size * 1.18);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(size * 0.62, size * 0.2);
  ctx.bezierCurveTo(size * 0.64, size * 0.5, size * 0.66, size * 0.85, size * 0.62, size * 1.18);
  ctx.stroke();

  // Stem
  ctx.beginPath();
  ctx.moveTo(size * 0.45, size * 0.16);
  ctx.bezierCurveTo(size * 0.44, size * 0.08, size * 0.46, size * 0.02, size * 0.5, size * 0.0);
  ctx.bezierCurveTo(size * 0.54, size * 0.02, size * 0.56, size * 0.08, size * 0.55, size * 0.16);
  ctx.closePath();
  const stemGrad = ctx.createLinearGradient(size * 0.45, 0, size * 0.55, size * 0.16);
  stemGrad.addColorStop(0, '#4a8c2a');
  stemGrad.addColorStop(1, '#2d6618');
  ctx.fillStyle = stemGrad;
  ctx.fill();

  // Green calyx (cap around stem)
  ctx.beginPath();
  ctx.ellipse(size * 0.5, size * 0.17, size * 0.14, size * 0.04, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#3a7a22';
  ctx.fill();

  return canvas.toDataURL();
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI) {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    pepperTexture = createPepperTexture();
  },

  update(api: ActorUpdateAPI, frame: FrameContext) {
    const t = frame.time / 1000;

    // Gentle bobbing motion
    const cx = canvasW * 0.5 + Math.sin(t * 0.6) * canvasW * 0.05;
    const cy = canvasH * 0.45 + Math.sin(t * 0.8) * canvasH * 0.03;
    const rotation = Math.sin(t * 0.4) * 0.08;

    // Big pepper size — roughly 60% of canvas width
    const pepperW = canvasW * 0.6;
    const pepperH = pepperW * 1.3;

    // Soft glow behind pepper
    api.brush.circle(cx, cy + pepperH * 0.1, pepperW * 0.5, {
      fill: {
        type: 'radial',
        cx: 0.5, cy: 0.5, radius: 0.5,
        stops: [
          { offset: 0, color: 'rgba(255, 50, 20, 0.3)' },
          { offset: 0.6, color: 'rgba(255, 30, 10, 0.1)' },
          { offset: 1, color: 'rgba(255, 0, 0, 0)' },
        ],
      },
      blendMode: 'add',
    });

    // Draw the pepper sprite
    api.brush.image(pepperTexture, cx, cy, {
      width: pepperW,
      height: pepperH,
      rotation,
      anchorX: 0.5,
      anchorY: 0.5,
      alpha: 0.95,
    });
  },

  async teardown() {
    canvasW = 0;
    canvasH = 0;
    pepperTexture = '';
  },
};

registerActor(actor);
export default actor;
