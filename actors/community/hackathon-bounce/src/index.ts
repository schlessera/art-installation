import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'hackathon-bounce',
  name: 'Hackathon Bounce',
  description: 'Classic DVD screensaver bouncing logo — but it says "Hackathon" and changes color on every wall hit',
  author: {
    name: 'Lucas Radke',
    github: 'lucasradke',
  },
  version: '1.0.0',
  tags: ['retro', 'dvd', 'bounce', 'nostalgia'],
  createdAt: new Date(),
  preferredDuration: 60,
  requiredContexts: ['display'],
};

// --- Constants ---
const TEXT = 'Hackathon';
const FONT_SIZE = 22;
const FONT = `bold ${FONT_SIZE}px monospace`;
const SPEED = 0.05; // pixels per ms

// Color palette for bounces
const COLORS = [
  0xff2222, 0x22ff22, 0x2266ff, 0xffcc00,
  0xff44ff, 0x00ffcc, 0xff8800, 0x44aaff,
  0xff6688, 0x88ff44, 0xcc66ff, 0x00ddaa,
];

// --- State ---
let canvasW = 0;
let canvasH = 0;
let x = 0;
let y = 0;
let vx = 0;
let vy = 0;
let colorIdx = 0;
let currentColor = 0xff2222;
let textDataUrl = '';
let bounceW = 0; // actual rendered width used for bounce detection
let bounceH = 0; // actual rendered height used for bounce detection

// Pre-allocated style for image drawing
const imgStyle = { tint: 0xffffff as number, alpha: 1.0, anchorX: 0, anchorY: 0 };

function nextColor(): void {
  colorIdx = (colorIdx + 1) % COLORS.length;
  currentColor = COLORS[colorIdx];
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    // Pre-render white text as image (api.brush.text leaks Text objects causing trails)
    // Use a large canvas and measure actual pixel bounds
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = 300;
    tmpCanvas.height = 60;
    const ctx = tmpCanvas.getContext('2d')!;
    ctx.font = FONT;
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'top';
    ctx.fillText(TEXT, 0, 0);

    // Scan pixels to find actual text bounds
    const imgData = ctx.getImageData(0, 0, tmpCanvas.width, tmpCanvas.height);
    let minX = tmpCanvas.width, maxX = 0, minY = tmpCanvas.height, maxY = 0;
    for (let py = 0; py < tmpCanvas.height; py++) {
      for (let px = 0; px < tmpCanvas.width; px++) {
        const alpha = imgData.data[(py * tmpCanvas.width + px) * 4 + 3];
        if (alpha > 0) {
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }
      }
    }

    // Crop to exact text bounds
    bounceW = maxX - minX + 1;
    bounceH = maxY - minY + 1;
    const cropped = document.createElement('canvas');
    cropped.width = bounceW;
    cropped.height = bounceH;
    const cropCtx = cropped.getContext('2d')!;
    cropCtx.drawImage(tmpCanvas, minX, minY, bounceW, bounceH, 0, 0, bounceW, bounceH);
    textDataUrl = cropped.toDataURL();

    x = Math.random() * (canvasW - bounceW);
    y = Math.random() * (canvasH - bounceH);

    // Fixed 45-degree angle for classic DVD bounce feel
    const dirX = Math.random() > 0.5 ? 1 : -1;
    const dirY = Math.random() > 0.5 ? 1 : -1;
    vx = SPEED * dirX;
    vy = SPEED * dirY;

    colorIdx = Math.floor(Math.random() * COLORS.length);
    currentColor = COLORS[colorIdx];
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const dt = frame.deltaTime;

    // --- Move ---
    x += vx * dt;
    y += vy * dt;

    // --- Bounce off walls ---
    let hitWall = false;

    if (x <= 0) {
      x = 0;
      vx = Math.abs(vx);
      hitWall = true;
    } else if (x + bounceW >= canvasW) {
      x = canvasW - bounceW;
      vx = -Math.abs(vx);
      hitWall = true;
    }

    if (y <= 0) {
      y = 0;
      vy = Math.abs(vy);
      hitWall = true;
    } else if (y + bounceH >= canvasH) {
      y = canvasH - bounceH;
      vy = -Math.abs(vy);
      hitWall = true;
    }

    if (hitWall) {
      nextColor();
    }

    // --- Draw using image with tint (sprites are properly pooled, unlike text) ---
    imgStyle.tint = currentColor;
    api.brush.image(textDataUrl, x, y, imgStyle);
  },

  async teardown(): Promise<void> {
    x = 0;
    y = 0;
    vx = 0;
    vy = 0;
  },
};

registerActor(actor);
export default actor;
