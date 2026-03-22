import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'adds',
  name: 'Ad Banner',
  description: 'A scrolling ad banner at the bottom of the canvas',
  author: { name: 'janw-ll', github: 'janw-ll' },
  version: '1.0.0',
  tags: ['banner', 'text', 'scrolling', 'humor'],
  createdAt: new Date(),
  preferredDuration: 200,
  requiredContexts: ['display'],
};

const BANNER_HEIGHT = 36;
const SCROLL_SPEED = 120; // pixels per second

const messages = [
  'BUY NOW! CloudFest 2026 tickets — 50% OFF!',
  'HOT SINGLES in your server rack want to connect!',
  'You won\'t BELIEVE what this actor does next!',
  'FREE V-BUCKS — just mass-assign port 443!',
  'SUBSCRIBE for more pixels!',
  'This ad space available — contact admin@polychorus.art',
  'Have YOU tried turning it off and on again?',
  'Certified 100% organic, free-range pixels',
  'WARNING: Side effects may include mass art appreciation',
  'Act now and receive a BONUS gradient — absolutely FREE!',
];

let scrollX = 0;
let canvasW = 0;
let canvasH = 0;
let textImageDark = '';
let textImageLight = '';
let adLabelImage = '';
let textImageWidth = 0;

function renderTextToDataUrl(
  text: string, fontSize: number, color: string, bgColor: string, height: number,
): { url: string; width: number } {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = `${fontSize}px monospace`;
  const measured = ctx.measureText(text);
  const w = Math.ceil(measured.width) + 4;
  canvas.width = w;
  canvas.height = height;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, w, height);
  ctx.font = `${fontSize}px monospace`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 2, height / 2);
  return { url: canvas.toDataURL(), width: w };
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI) {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    scrollX = canvasW;

    const bannerText = messages.join('   \u2605   ');

    // Pre-render text images for dark and light modes
    const dark = renderTextToDataUrl(bannerText, 14, '#ffee00', '#1a1a2e', BANNER_HEIGHT);
    textImageDark = dark.url;
    textImageWidth = dark.width;

    const light = renderTextToDataUrl(bannerText, 14, '#cc0000', '#ffdd00', BANNER_HEIGHT);
    textImageLight = light.url;

    // Pre-render AD label
    const adCanvas = document.createElement('canvas');
    adCanvas.width = 32;
    adCanvas.height = BANNER_HEIGHT;
    const actx = adCanvas.getContext('2d')!;
    actx.fillStyle = '#cc0000';
    actx.fillRect(0, 0, 32, BANNER_HEIGHT);
    actx.font = '12px monospace';
    actx.fillStyle = '#ffffff';
    actx.textBaseline = 'middle';
    actx.fillText('AD', 4, BANNER_HEIGHT / 2);
    adLabelImage = adCanvas.toDataURL();
  },

  update(api: ActorUpdateAPI, frame: FrameContext) {
    const dt = frame.deltaTime / 1000;
    const isDark = api.context.display.isDarkMode();

    scrollX -= SCROLL_SPEED * dt;

    const bannerY = canvasH - BANNER_HEIGHT;

    // Banner background
    api.brush.rect(0, bannerY, canvasW, BANNER_HEIGHT, {
      fill: isDark ? 0x1a1a2e : 0xffdd00,
      alpha: 0.92,
    });

    // Top accent line
    api.brush.line(0, bannerY, canvasW, bannerY, {
      color: isDark ? 0xff4444 : 0xcc0000,
      width: 2.5,
      alpha: 0.9,
    });

    // Scrolling text as pre-rendered image (avoids text object leak)
    const textSrc = isDark ? textImageDark : textImageLight;
    api.brush.image(textSrc, scrollX, bannerY, {
      width: textImageWidth,
      height: BANNER_HEIGHT,
      anchorX: 0,
      anchorY: 0,
    });

    if (scrollX < -textImageWidth) {
      scrollX = canvasW;
    }

    // Flashing "AD" label on the left
    const flash = Math.sin(frame.time / 300) > 0;
    if (flash) {
      api.brush.image(adLabelImage, 0, bannerY, {
        width: 32,
        height: BANNER_HEIGHT,
        anchorX: 0,
        anchorY: 0,
      });
    }
  },

  async teardown() {
    scrollX = 0;
    canvasW = 0;
    canvasH = 0;
    textImageDark = '';
    textImageLight = '';
    adLabelImage = '';
    textImageWidth = 0;
  },
};

registerActor(actor);
export default actor;
