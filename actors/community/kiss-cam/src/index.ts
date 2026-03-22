import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'kiss-cam',
  name: 'Kiss Cam',
  description: 'A fun kiss cam that detects faces via webcam and highlights pairs with hearts and romantic effects',
  author: {
    name: 'Jan',
    github: 'janw-ll',
  },
  version: '1.0.0',
  tags: ['video', 'faces', 'hearts', 'fun', 'interactive'],
  createdAt: new Date(),
  preferredDuration: 30,
  requiredContexts: ['video', 'display'],
};

// Pre-allocated state
const MAX_HEARTS = 30;
const MAX_SPARKLES = 20;

interface FloatingHeart {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  rotation: number;
  rotSpeed: number;
}

interface Sparkle {
  active: boolean;
  x: number;
  y: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
}

let hearts: FloatingHeart[] = [];
let sparkles: Sparkle[] = [];
let canvasW = 0;
let canvasH = 0;
let heartSpawnTimer = 0;
let sparkleSpawnTimer = 0;
let smoothFaceX = 0;
let smoothFaceY = 0;
let hasFaceTarget = false;
let bannerPulse = 0;
let heartDataUrl = '';
// Video pixel grid
const VIDEO_COLS = 36;
const VIDEO_ROWS = 27;
const VIDEO_CELLS = VIDEO_COLS * VIDEO_ROWS;
let videoCellColors: Uint32Array = new Uint32Array(0);
let hasVideoData = false;

function createHeartTexture(): string {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 64, 64);
  // Draw a heart shape
  ctx.fillStyle = 'white';
  ctx.beginPath();
  const cx = 32, cy = 28;
  ctx.moveTo(cx, cy + 14);
  ctx.bezierCurveTo(cx - 2, cy + 10, cx - 18, cy - 2, cx - 18, cy - 10);
  ctx.bezierCurveTo(cx - 18, cy - 22, cx, cy - 20, cx, cy - 8);
  ctx.bezierCurveTo(cx, cy - 20, cx + 18, cy - 22, cx + 18, cy - 10);
  ctx.bezierCurveTo(cx + 18, cy - 2, cx + 2, cy + 10, cx, cy + 14);
  ctx.fill();
  return c.toDataURL();
}

function drawHeart(api: ActorUpdateAPI, x: number, y: number, size: number, color: number, alpha: number, rotation: number): void {
  if (alpha < 0.05) return;
  api.brush.pushMatrix();
  api.brush.translate(x, y);
  api.brush.rotate(rotation);
  api.brush.image(heartDataUrl, 0, 0, {
    width: size,
    height: size,
    anchorX: 0.5,
    anchorY: 0.5,
    tint: color,
    alpha: alpha,
    blendMode: 'add',
  });
  api.brush.popMatrix();
}

function initHeart(h: FloatingHeart, x: number, y: number): void {
  h.active = true;
  h.x = x + (Math.random() - 0.5) * 60;
  h.y = y + Math.random() * 20;
  h.vx = (Math.random() - 0.5) * 0.5;
  h.vy = -(0.5 + Math.random() * 1.0);
  h.size = 10 + Math.random() * 20;
  h.alpha = 0.8 + Math.random() * 0.2;
  h.rotation = (Math.random() - 0.5) * 0.3;
  h.rotSpeed = (Math.random() - 0.5) * 0.02;
}

function initSparkle(s: Sparkle, x: number, y: number, spread: number): void {
  s.active = true;
  s.x = x + (Math.random() - 0.5) * spread;
  s.y = y + (Math.random() - 0.5) * spread;
  s.size = 2 + Math.random() * 4;
  s.alpha = 0.9;
  s.life = 0;
  s.maxLife = 30 + Math.random() * 30;
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    heartDataUrl = createHeartTexture();

    // Pre-allocate pools
    hearts = [];
    for (let i = 0; i < MAX_HEARTS; i++) {
      hearts.push({
        active: false, x: 0, y: 0, vx: 0, vy: 0,
        size: 0, alpha: 0, rotation: 0, rotSpeed: 0,
      });
    }
    sparkles = [];
    for (let i = 0; i < MAX_SPARKLES; i++) {
      sparkles.push({
        active: false, x: 0, y: 0, size: 0, alpha: 0, life: 0, maxLife: 60,
      });
    }

    smoothFaceX = canvasW * 0.5;
    smoothFaceY = canvasH * 0.4;
    hasFaceTarget = false;
    heartSpawnTimer = 0;
    sparkleSpawnTimer = 0;
    bannerPulse = 0;
    hasVideoData = false;
    videoCellColors = new Uint32Array(VIDEO_CELLS);
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time / 1000;
    const dt = frame.deltaTime;
    const isDark = api.context.display.isDarkMode();

    // Colors
    const heartPink = 0xff3077;
    const heartRed = 0xff1744;
    const heartLight = isDark ? 0xff80ab : 0xd81b60;
    const textColor = isDark ? 0xffffff : 0xff1744;
    const bannerBg = 0xcc0033;
    const sparkleColor = isDark ? 0xffccdd : 0xff6699;

    // --- Sample video frame into pixel grid ---
    if (api.context.video.isAvailable()) {
      const vFrame = api.context.video.getFrame();
      if (vFrame) {
        hasVideoData = true;
        const data = vFrame.data;
        const fw = vFrame.width;
        const fh = vFrame.height;
        for (let row = 0; row < VIDEO_ROWS; row++) {
          const sy = Math.floor((row + 0.5) / VIDEO_ROWS * fh);
          for (let col = 0; col < VIDEO_COLS; col++) {
            // Mirror: sample from right-to-left so display is mirrored
            const sx = Math.floor((1 - (col + 0.5) / VIDEO_COLS) * fw);
            const idx = (sy * fw + sx) * 4;
            videoCellColors[row * VIDEO_COLS + col] =
              (data[idx] << 16) | (data[idx + 1] << 8) | data[idx + 2];
          }
        }
      }
    }

    // --- Face detection ---
    const faces = api.context.video.getFaces();
    const vidDims = api.context.video.getDimensions();

    let targetX = canvasW * 0.5;
    let targetY = canvasH * 0.4;
    let faceCount = faces.length;
    let highlightW = canvasW * 0.6;
    let highlightH = canvasH * 0.4;

    if (faceCount >= 2 && vidDims) {
      // Two or more faces: find the pair closest together
      const f1 = faces[0];
      const f2 = faces[1];
      const cx1 = f1.bounds.x + f1.bounds.width * 0.5;
      const cy1 = f1.bounds.y + f1.bounds.height * 0.5;
      const cx2 = f2.bounds.x + f2.bounds.width * 0.5;
      const cy2 = f2.bounds.y + f2.bounds.height * 0.5;

      // Midpoint between faces, mapped to canvas (mirror X)
      targetX = (1 - ((cx1 + cx2) * 0.5) / vidDims.width) * canvasW;
      targetY = (((cy1 + cy2) * 0.5) / vidDims.height) * canvasH;

      // Frame size encompasses both faces
      const spanX = Math.abs(cx1 - cx2) / vidDims.width * canvasW;
      const spanY = Math.abs(cy1 - cy2) / vidDims.height * canvasH;
      highlightW = Math.max(canvasW * 0.4, spanX + 100);
      highlightH = Math.max(canvasH * 0.25, spanY + 120);
      hasFaceTarget = true;
    } else if (faceCount === 1 && vidDims) {
      const f = faces[0];
      targetX = (1 - (f.bounds.x + f.bounds.width * 0.5) / vidDims.width) * canvasW;
      targetY = ((f.bounds.y + f.bounds.height * 0.5) / vidDims.height) * canvasH;
      highlightW = Math.max(canvasW * 0.35, (f.bounds.width / vidDims.width) * canvasW + 80);
      highlightH = Math.max(canvasH * 0.25, (f.bounds.height / vidDims.height) * canvasH + 100);
      hasFaceTarget = true;
    } else {
      hasFaceTarget = false;
    }

    // Smooth face tracking
    smoothFaceX += (targetX - smoothFaceX) * 0.1;
    smoothFaceY += (targetY - smoothFaceY) * 0.1;

    // --- "KISS CAM" Banner ---
    bannerPulse = (bannerPulse + dt * 0.003) % (Math.PI * 2);
    const bannerH = 50;
    const pulseAlpha = 0.8 + Math.sin(bannerPulse * 3) * 0.15;

    // Banner background
    api.brush.rect(0, 0, canvasW, bannerH, {
      fill: bannerBg,
      alpha: pulseAlpha,
    });

    // Banner border flash
    const borderFlash = Math.sin(t * 4) * 0.5 + 0.5;
    api.brush.rect(0, bannerH - 3, canvasW, 3, {
      fill: 0xffcc00,
      alpha: 0.6 + borderFlash * 0.4,
    });

    // "KISS CAM" text
    api.brush.text('KISS CAM', canvasW * 0.5, bannerH * 0.5, {
      fontSize: 28,
      fill: 0xffffff,
      alpha: 1.0,
      align: 'center',
      baseline: 'middle',
      letterSpacing: 4,
    });

    // Small hearts flanking the text
    drawHeart(api, canvasW * 0.5 - 85, bannerH * 0.5, 20, heartPink, 0.9, Math.sin(t * 2) * 0.1);
    drawHeart(api, canvasW * 0.5 + 85, bannerH * 0.5, 20, heartPink, 0.9, -Math.sin(t * 2) * 0.1);

    // --- Highlight frame (always shown, tracks faces when detected) ---
    {
      const frameX = smoothFaceX - highlightW * 0.5;
      const frameY = smoothFaceY - highlightH * 0.5;
      const framePulse = 0.7 + Math.sin(t * 3) * 0.15;

      // Draw webcam feed as pixel grid inside the rectangle
      if (hasVideoData) {
        const cellW = highlightW / VIDEO_COLS;
        const cellH = highlightH / VIDEO_ROWS;
        for (let row = 0; row < VIDEO_ROWS; row++) {
          const cy = frameY + row * cellH;
          for (let col = 0; col < VIDEO_COLS; col++) {
            api.brush.rect(frameX + col * cellW, cy, cellW + 0.5, cellH + 0.5, {
              fill: videoCellColors[row * VIDEO_COLS + col],
              alpha: 0.92,
            });
          }
        }
      } else {
        // No video yet — dark placeholder
        api.brush.rect(frameX, frameY, highlightW, highlightH, {
          fill: 0x110011,
          alpha: 0.7,
        });
      }

      // Rounded heart-shaped frame border
      api.brush.roundRect(frameX, frameY, highlightW, highlightH, 16, {
        stroke: heartRed,
        strokeWidth: 4,
        alpha: framePulse,
      });
      // Inner glow border
      api.brush.roundRect(frameX + 4, frameY + 4, highlightW - 8, highlightH - 8, 12, {
        stroke: heartPink,
        strokeWidth: 2,
        alpha: framePulse * 0.6,
      });

      // Corner hearts
      drawHeart(api, frameX + 10, frameY + 10, 18, heartRed, 0.8, -0.2);
      drawHeart(api, frameX + highlightW - 10, frameY + 10, 18, heartRed, 0.8, 0.2);
      drawHeart(api, frameX + 10, frameY + highlightH - 10, 18, heartPink, 0.8, 0.2);
      drawHeart(api, frameX + highlightW - 10, frameY + highlightH - 10, 18, heartPink, 0.8, -0.2);

      // "Kiss!" prompt when two faces
      if (faceCount >= 2) {
        const kissAlpha = 0.7 + Math.sin(t * 5) * 0.3;
        api.brush.text('Kiss!', smoothFaceX, frameY + highlightH + 20, {
          fontSize: 22,
          fill: textColor,
          alpha: kissAlpha,
          align: 'center',
          baseline: 'top',
        });
      }
    }

    // --- Floating hearts ---
    heartSpawnTimer += dt;
    if (heartSpawnTimer > 200) {
      heartSpawnTimer = 0;
      for (let i = 0; i < MAX_HEARTS; i++) {
        if (!hearts[i].active) {
          const spawnX = hasFaceTarget ? smoothFaceX : canvasW * (0.2 + Math.random() * 0.6);
          const spawnY = hasFaceTarget ? smoothFaceY : canvasH * 0.5;
          initHeart(hearts[i], spawnX, spawnY);
          break;
        }
      }
    }

    for (let i = 0; i < MAX_HEARTS; i++) {
      const h = hearts[i];
      if (!h.active) continue;

      h.x += h.vx * dt * 0.06;
      h.y += h.vy * dt * 0.06;
      h.vx += Math.sin(t * 2 + i) * 0.01;
      h.rotation += h.rotSpeed;
      h.alpha -= 0.005 * (dt / 16);

      if (h.alpha < 0.05 || h.y < -20) {
        h.active = false;
        continue;
      }

      const color = i % 3 === 0 ? heartRed : (i % 3 === 1 ? heartPink : heartLight);
      drawHeart(api, h.x, h.y, h.size, color, h.alpha, h.rotation);
    }

    // --- Sparkles ---
    sparkleSpawnTimer += dt;
    if (sparkleSpawnTimer > 100 && hasFaceTarget) {
      sparkleSpawnTimer = 0;
      for (let i = 0; i < MAX_SPARKLES; i++) {
        if (!sparkles[i].active) {
          initSparkle(sparkles[i], smoothFaceX, smoothFaceY, Math.max(highlightW, highlightH));
          break;
        }
      }
    }

    for (let i = 0; i < MAX_SPARKLES; i++) {
      const s = sparkles[i];
      if (!s.active) continue;

      s.life++;
      const progress = s.life / s.maxLife;
      if (progress >= 1) {
        s.active = false;
        continue;
      }

      // Twinkle: fade in then out
      let alpha: number;
      if (progress < 0.3) {
        alpha = progress / 0.3;
      } else {
        alpha = 1 - (progress - 0.3) / 0.7;
      }
      if (alpha < 0.05) continue;

      const sz = s.size * (0.5 + Math.sin(progress * Math.PI) * 0.5);
      // 4-point star sparkle
      api.brush.star(s.x, s.y, sz, sz * 0.3, 4, {
        fill: sparkleColor,
        alpha: alpha * 0.8,
        blendMode: 'add',
      });
    }

    // --- Side decoration hearts (ambient) ---
    for (let i = 0; i < 4; i++) {
      const px = i < 2 ? 20 : canvasW - 20;
      const py = canvasH * 0.3 + i * (canvasH * 0.15);
      const bob = Math.sin(t * 1.5 + i * 1.2) * 5;
      const sAlpha = 0.3 + Math.sin(t * 2 + i) * 0.15;
      drawHeart(api, px, py + bob, 14, heartPink, sAlpha, Math.sin(t + i) * 0.15);
    }
  },

  async teardown(): Promise<void> {
    hearts = [];
    sparkles = [];
    canvasW = 0;
    canvasH = 0;
    hasFaceTarget = false;
    heartDataUrl = '';
    hasVideoData = false;
    videoCellColors = new Uint32Array(0);
  },
};

registerActor(actor);
export default actor;
