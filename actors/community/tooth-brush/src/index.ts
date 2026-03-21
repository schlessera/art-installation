import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'tooth-brush',
  name: 'Tooth Brush',
  description: 'A toothbrush with sparkles and a scrolling reminder to brush your teeth 3 times a day',
  author: { name: 'Jan', github: 'janw-ll' },
  version: '1.0.0',
  tags: ['toothbrush', 'health', 'text', 'fun'],
  createdAt: new Date(),
  preferredDuration: 30,
  requiredContexts: ['display'],
};

const MAX_SPARKLES = 15;

interface Sparkle {
  active: boolean;
  x: number;
  y: number;
  size: number;
  alpha: number;
  decay: number;
  vy: number;
}

let sparkles: Sparkle[] = [];
let sparkleIndex = 0;
let sparkleTimer = 0;
let canvasW = 0;
let canvasH = 0;
let scrollOffset = 0;
let scrollTextDataUrl = '';
let scrollTextW = 0;
let scrollTextH = 0;
let badgeTextDataUrl = '';
let aDayTextDataUrl = '';

const BRUSH_HANDLE = 0x4488dd;
const BRUSH_HANDLE_LIGHT = 0x66aaee;
const BRUSH_HEAD = 0xeeeeee;
const BRISTLE_COLOR = 0x55ccff;
const BRISTLE_LIGHT = 0x88ddff;
const PASTE_WHITE = 0xffffff;
const SPARKLE_COLOR = 0xaaeeff;

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    scrollOffset = canvasW;
    sparkleIndex = 0;
    sparkleTimer = 0;

    sparkles = [];
    for (let i = 0; i < MAX_SPARKLES; i++) {
      sparkles.push({
        active: false, x: 0, y: 0, size: 0,
        alpha: 0, decay: 0, vy: 0,
      });
    }

    // Pre-render scrolling text to avoid text object leaks
    const s = canvasW / 360;
    const fontSize = 28 * s;
    const words = ['Brush', 'your', 'teeth', '3', 'times', 'a', 'day!'];
    const colorStrs = ['#ff4488', '#ffaa22', '#44dd66', '#22aaff', '#cc44ff', '#ff6644', '#44ccaa'];
    const charW = 18 * s;
    let totalW = 0;
    for (const word of words) totalW += (word.length + 1) * charW;
    scrollTextW = Math.ceil(totalW);
    scrollTextH = Math.ceil(fontSize * 1.6);
    const tCanvas = document.createElement('canvas');
    tCanvas.width = scrollTextW;
    tCanvas.height = scrollTextH;
    const tCtx = tCanvas.getContext('2d')!;
    tCtx.font = `bold ${fontSize}px sans-serif`;
    tCtx.textBaseline = 'middle';
    tCtx.lineWidth = 3 * s;
    let xOff = 0;
    for (let w = 0; w < words.length; w++) {
      tCtx.strokeStyle = '#000000';
      tCtx.strokeText(words[w], xOff, scrollTextH / 2);
      tCtx.fillStyle = colorStrs[w];
      tCtx.fillText(words[w], xOff, scrollTextH / 2);
      xOff += (words[w].length + 1) * charW;
    }
    scrollTextDataUrl = tCanvas.toDataURL();

    // Pre-render "3x" badge text
    const bFontSize = 18 * s;
    const bCanvas = document.createElement('canvas');
    bCanvas.width = Math.ceil(bFontSize * 2.5);
    bCanvas.height = Math.ceil(bFontSize * 1.6);
    const bCtx = bCanvas.getContext('2d')!;
    bCtx.font = `bold ${bFontSize}px sans-serif`;
    bCtx.fillStyle = '#ffffff';
    bCtx.textAlign = 'center';
    bCtx.textBaseline = 'middle';
    bCtx.fillText('3x', bCanvas.width / 2, bCanvas.height / 2);
    badgeTextDataUrl = bCanvas.toDataURL();

    // Pre-render "a day!" text
    const aFontSize = 10 * s;
    const aCanvas = document.createElement('canvas');
    aCanvas.width = Math.ceil(aFontSize * 5);
    aCanvas.height = Math.ceil(aFontSize * 1.6);
    const aCtx = aCanvas.getContext('2d')!;
    aCtx.font = `${aFontSize}px sans-serif`;
    aCtx.fillStyle = '#2266aa';
    aCtx.textAlign = 'center';
    aCtx.textBaseline = 'middle';
    aCtx.fillText('a day!', aCanvas.width / 2, aCanvas.height / 2);
    aDayTextDataUrl = aCanvas.toDataURL();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time / 1000;
    const dt = frame.deltaTime;
    const s = canvasW / 360;
    const isDark = api.context.display.isDarkMode();

    // === SCROLLING TEXT at bottom (pre-rendered image to avoid text leaks) ===
    scrollOffset -= dt * 0.08;
    if (scrollOffset < -scrollTextW) {
      scrollOffset = canvasW;
    }
    api.brush.image(scrollTextDataUrl, scrollOffset + scrollTextW / 2, canvasH * 0.87, {
      width: scrollTextW, height: scrollTextH, alpha: 0.95,
    });

    // === TOOTHBRUSH ===
    const brushX = canvasW * 0.5;
    const brushY = canvasH * 0.42;
    const brushAngle = Math.sin(t * 3) * 0.15;
    const brushShake = Math.sin(t * 12) * 2 * s;

    api.brush.pushMatrix();
    api.brush.translate(brushX, brushY);
    api.brush.rotate(brushAngle);

    // Handle
    api.brush.roundRect(-8 * s, -5 * s, 16 * s, 120 * s, 6 * s, {
      fill: BRUSH_HANDLE, alpha: 0.95,
    });
    // Handle stripe
    api.brush.roundRect(-4 * s, 20 * s, 8 * s, 80 * s, 3 * s, {
      fill: BRUSH_HANDLE_LIGHT, alpha: 0.4,
    });
    // Handle grip dots
    for (let i = 0; i < 5; i++) {
      api.brush.circle(0, (35 + i * 14) * s, 2 * s, {
        fill: BRUSH_HANDLE_LIGHT, alpha: 0.3,
      });
    }

    // Head (top of brush)
    api.brush.roundRect(-10 * s, -45 * s, 20 * s, 45 * s, 5 * s, {
      fill: BRUSH_HEAD, alpha: 0.95,
    });

    // Bristles (rows)
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 3; col++) {
        const bx = (-6 + col * 6) * s + brushShake * 0.3;
        const by = (-40 + row * 7) * s;
        api.brush.roundRect(bx - 2 * s, by - 4 * s, 4 * s, 5 * s, 1 * s, {
          fill: row % 2 === 0 ? BRISTLE_COLOR : BRISTLE_LIGHT,
          alpha: 0.9,
        });
      }
    }

    // Toothpaste blob on top
    const pasteWobble = Math.sin(t * 4) * 1.5 * s;
    api.brush.ellipse(pasteWobble, -48 * s, 12 * s, 6 * s, {
      fill: PASTE_WHITE, alpha: 0.9,
    });
    // Paste swirl
    api.brush.bezier(
      { x: -8 * s + pasteWobble, y: -48 * s },
      { x: -2 * s + pasteWobble, y: -54 * s },
      { x: 4 * s + pasteWobble, y: -44 * s },
      { x: 10 * s + pasteWobble, y: -50 * s },
      { color: 0xddffff, width: 2.5 * s, cap: 'round', alpha: 0.6 },
    );

    api.brush.popMatrix();

    // === SPARKLES around the brush ===
    sparkleTimer += dt;
    if (sparkleTimer > 150) {
      sparkleTimer = 0;
      const sp = sparkles[sparkleIndex];
      sp.active = true;
      sp.x = brushX + (Math.random() - 0.5) * 60 * s;
      sp.y = brushY - 30 * s + (Math.random() - 0.5) * 80 * s;
      sp.size = (4 + Math.random() * 8) * s;
      sp.alpha = 0.9;
      sp.decay = 0.012 + Math.random() * 0.008;
      sp.vy = -(0.2 + Math.random() * 0.4);
      sparkleIndex = (sparkleIndex + 1) % MAX_SPARKLES;
    }

    for (let i = 0; i < sparkles.length; i++) {
      const sp = sparkles[i];
      if (!sp.active) continue;

      sp.alpha -= sp.decay;
      sp.y += sp.vy;

      if (sp.alpha < 0.05) {
        sp.active = false;
        continue;
      }

      api.brush.star(sp.x, sp.y, sp.size * 0.5, sp.size * 0.18, 4, {
        fill: SPARKLE_COLOR, alpha: sp.alpha * 0.8, blendMode: 'add',
      });
    }

    // === "3x" badge ===
    const badgeX = canvasW * 0.78;
    const badgeY = canvasH * 0.22;
    const badgePulse = 1 + Math.sin(t * 2.5) * 0.08;
    api.brush.pushMatrix();
    api.brush.translate(badgeX, badgeY);
    api.brush.scale(badgePulse, badgePulse);
    api.brush.circle(0, 0, 22 * s, {
      fill: isDark ? 0x2266aa : 0x3388cc, alpha: 0.85,
    });
    api.brush.circle(0, 0, 19 * s, {
      fill: isDark ? 0x115599 : 0x2277bb, alpha: 0.7,
    });
    api.brush.image(badgeTextDataUrl, 0, 0, {
      alpha: 0.95,
    });
    api.brush.popMatrix();
    api.brush.image(aDayTextDataUrl, badgeX, badgeY + 28 * s, {
      alpha: 0.7,
    });
  },

  async teardown(): Promise<void> {
    sparkles = [];
    canvasW = 0;
    canvasH = 0;
    scrollOffset = 0;
    sparkleIndex = 0;
    sparkleTimer = 0;
    scrollTextDataUrl = '';
    badgeTextDataUrl = '';
    aDayTextDataUrl = '';
  },
};

registerActor(actor);
export default actor;
