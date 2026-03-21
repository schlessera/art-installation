import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'matrix',
  name: 'Matrix',
  description: 'Classic Matrix digital rain with cascading green characters',
  author: { name: 'Jan', github: 'janw-ll' },
  version: '1.0.0',
  tags: ['matrix', 'rain', 'text', 'retro', 'code'],
  createdAt: new Date(),
  preferredDuration: 45,
  requiredContexts: ['display'],
};

// Matrix characters: katakana-inspired + digits + symbols
const CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFZ<>{}[]|=+-*/:;';

const MAX_COLUMNS = 30;
const MAX_TRAIL = 6;

interface Drop {
  active: boolean;
  col: number;       // x position (column index)
  head: number;      // y position of the leading character
  speed: number;     // pixels per second
  trailLen: number;  // number of trailing characters
  charIndices: number[]; // pre-allocated character index buffer (circular)
  charHead: number;  // circular buffer write index
  brightness: number; // 0.5-1.0 intensity multiplier
}

let drops: Drop[] = [];
let canvasW = 0;
let canvasH = 0;
let colWidth = 0;
let rowHeight = 0;
let charChangeTimer = 0;

function initDrop(d: Drop, col: number, startY: number): void {
  d.active = true;
  d.col = col;
  d.head = startY;
  d.speed = 60 + Math.random() * 120;
  d.trailLen = 2 + Math.floor(Math.random() * (MAX_TRAIL - 2));
  d.brightness = 0.5 + Math.random() * 0.5;
  d.charHead = 0;
  for (let i = 0; i < MAX_TRAIL; i++) {
    d.charIndices[i] = Math.floor(Math.random() * CHARS.length);
  }
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    // Size characters to fit canvas
    const fontSize = Math.max(10, Math.floor(canvasW / 26));
    colWidth = fontSize * 1.1;
    rowHeight = fontSize * 1.4;

    const numCols = Math.min(MAX_COLUMNS, Math.floor(canvasW / colWidth));

    // Pre-allocate drop pool
    drops = [];
    for (let i = 0; i < MAX_COLUMNS; i++) {
      drops.push({
        active: false,
        col: 0,
        head: 0,
        speed: 100,
        trailLen: 15,
        charIndices: new Array(MAX_TRAIL).fill(0),
        charHead: 0,
        brightness: 1,
      });
    }

    // Activate initial drops staggered across columns
    for (let i = 0; i < numCols; i++) {
      initDrop(drops[i], i, -Math.random() * canvasH);
    }

    charChangeTimer = 0;
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    api.brush.clear();
    const dt = frame.deltaTime / 1000;
    const isDark = api.context.display.isDarkMode();
    const fontSize = Math.max(10, Math.floor(canvasW / 30));

    // Periodically randomize some characters for flicker effect
    charChangeTimer += dt;
    const shouldFlicker = charChangeTimer > 0.08;
    if (shouldFlicker) charChangeTimer = 0;

    const numCols = Math.min(MAX_COLUMNS, Math.floor(canvasW / colWidth));

    for (let i = 0; i < MAX_COLUMNS; i++) {
      const d = drops[i];
      if (!d.active) continue;

      // Advance the drop
      d.head += d.speed * dt;

      // Flicker: randomly change 1-2 chars in the trail
      if (shouldFlicker) {
        const ri = Math.floor(Math.random() * d.trailLen);
        d.charIndices[ri] = Math.floor(Math.random() * CHARS.length);
      }

      const x = d.col * colWidth + colWidth * 0.5;
      const bottomY = d.head;
      const topY = bottomY - d.trailLen * rowHeight;

      // Skip if entirely off screen
      if (topY > canvasH || bottomY < -rowHeight) {
        // Respawn if fully past the bottom
        if (topY > canvasH) {
          const newCol = Math.floor(Math.random() * numCols);
          initDrop(d, newCol, -Math.random() * canvasH * 0.5);
        }
        continue;
      }

      // Draw trail characters from tail to head
      for (let j = 0; j < d.trailLen; j++) {
        const charY = bottomY - (d.trailLen - 1 - j) * rowHeight;

        // Cull off-screen characters
        if (charY < -rowHeight || charY > canvasH + rowHeight) continue;

        const progress = j / (d.trailLen - 1); // 0 = tail, 1 = head
        const charIdx = d.charIndices[j % MAX_TRAIL];
        const ch = CHARS[charIdx];

        if (j === d.trailLen - 1) {
          // Leading character: bright white-green
          const leadColor = isDark ? 0xccffcc : 0x88ff88;
          api.brush.text(ch, x, charY, {
            fontSize,
            fill: leadColor,
            alpha: 0.95 * d.brightness,
            align: 'center',
          });
        } else {
          // Trail: green fading out toward tail
          const alpha = (0.15 + 0.75 * progress) * d.brightness;
          if (alpha < 0.05) continue;

          // Brighter chars near head, dimmer near tail
          const green = Math.floor(120 + 135 * progress);
          const rb = Math.floor(30 * progress);
          const color = (rb << 16) | (green << 8) | rb;

          api.brush.text(ch, x, charY, {
            fontSize,
            fill: color,
            alpha,
            align: 'center',
          });
        }
      }
    }
  },

  async teardown(): Promise<void> {
    drops = [];
    canvasW = 0;
    canvasH = 0;
    charChangeTimer = 0;
  },
};

registerActor(actor);
export default actor;
