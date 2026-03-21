import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorMetadata,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'clippy-assistant',
  name: 'Clippy Assistant',
  description:
    'The classic Office paperclip pops up to "help" you make art, gets impatient, swears, and walks away',
  author: { name: 'Lucas Radke', github: 'lucasradke' },
  version: '1.0.0',
  tags: ['clippy', 'retro', 'nostalgia', 'office', 'pixel-art'],
  createdAt: new Date(),
  preferredDuration: 50,
  requiredContexts: ['display'],
};

// --- State ---
let canvasW = 0;
let canvasH = 0;
let slideProgress = 0;
let blinkTimer = 0;
let isBlinking = false;

// Pre-rendered bubble images (created in setup to avoid text smearing)
let bubbleFriendly = '';
let bubbleImpatient = '';
let bubbleAngry = '';

// Phase timing (seconds)
const SLIDE_DURATION = 1.5;
const FRIENDLY_END = 20;
const IMPATIENT_END = 30;
const ANGRY_END = 37;
const WALK_START = 37;
const WALK_AWAY_DURATION = 8;

const BUBBLE_W = 185;
const BUBBLE_H = 90;

// Phases
const PHASE_SLIDE = 0;
const PHASE_FRIENDLY = 1;
const PHASE_IMPATIENT = 2;
const PHASE_ANGRY = 3;
const PHASE_WALK = 4;
const PHASE_GONE = 5;

function getPhase(t: number): number {
  if (t < SLIDE_DURATION) return PHASE_SLIDE;
  if (t < FRIENDLY_END) return PHASE_FRIENDLY;
  if (t < IMPATIENT_END) return PHASE_IMPATIENT;
  if (t < ANGRY_END) return PHASE_ANGRY;
  if (t < WALK_START + WALK_AWAY_DURATION) return PHASE_WALK;
  return PHASE_GONE;
}

function renderBubbleToDataUrl(
  lines: string[],
  textColor: string,
  bgColor: string,
  borderColor: string
): string {
  const canvas = document.createElement('canvas');
  canvas.width = BUBBLE_W;
  canvas.height = BUBBLE_H;
  const ctx = canvas.getContext('2d')!;

  // Bubble background
  const r = 8;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(BUBBLE_W - r, 0);
  ctx.quadraticCurveTo(BUBBLE_W, 0, BUBBLE_W, r);
  ctx.lineTo(BUBBLE_W, BUBBLE_H - 18 - r);
  ctx.quadraticCurveTo(BUBBLE_W, BUBBLE_H - 18, BUBBLE_W - r, BUBBLE_H - 18);
  ctx.lineTo(30, BUBBLE_H - 18);
  // Tail
  ctx.lineTo(12, BUBBLE_H);
  ctx.lineTo(15, BUBBLE_H - 18);
  ctx.lineTo(r, BUBBLE_H - 18);
  ctx.quadraticCurveTo(0, BUBBLE_H - 18, 0, BUBBLE_H - 18 - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();

  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Text
  ctx.fillStyle = textColor;
  ctx.font = '12px sans-serif';
  ctx.textBaseline = 'top';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], 10, 10 + i * 16);
  }

  const url = canvas.toDataURL();
  canvas.width = 0;
  canvas.height = 0;
  return url;
}

function drawClippy(
  api: ActorUpdateAPI,
  cx: number,
  cy: number,
  scale: number,
  blink: boolean,
  angry: boolean
): void {
  const s = scale;
  const wireColor = angry ? 0xcc5555 : 0xb0b0b0;
  const wireHighlight = angry ? 0xee7777 : 0xd8d8d8;
  const wireWidth = Math.max(3, 4 * s);

  // Outer clip shape
  api.brush.arc(cx, cy + 20 * s, 12 * s, 0, Math.PI, {
    color: wireColor, width: wireWidth, alpha: 0.95,
  });
  api.brush.line(cx - 12 * s, cy + 20 * s, cx - 12 * s, cy - 25 * s, {
    color: wireColor, width: wireWidth, alpha: 0.95,
  });
  api.brush.arc(cx, cy - 25 * s, 12 * s, Math.PI, 0, {
    color: wireColor, width: wireWidth, alpha: 0.95,
  });
  api.brush.line(cx + 12 * s, cy - 25 * s, cx + 12 * s, cy + 10 * s, {
    color: wireHighlight, width: wireWidth, alpha: 0.95,
  });

  // Inner clip loop
  const innerWireW = Math.max(2.5, 3 * s);
  api.brush.arc(cx, cy + 10 * s, 6 * s, 0, Math.PI, {
    color: wireHighlight, width: innerWireW, alpha: 0.9,
  });
  api.brush.line(cx - 6 * s, cy + 10 * s, cx - 6 * s, cy - 18 * s, {
    color: wireHighlight, width: innerWireW, alpha: 0.9,
  });
  api.brush.arc(cx, cy - 18 * s, 6 * s, Math.PI, 0, {
    color: wireColor, width: innerWireW, alpha: 0.9,
  });
  api.brush.line(cx + 6 * s, cy - 18 * s, cx + 6 * s, cy - 5 * s, {
    color: wireColor, width: innerWireW, alpha: 0.9,
  });

  // Eyes
  const eyeY = cy - 12 * s;
  const eyeSpacing = 7 * s;
  const eyeR = 4.5 * s;
  const pupilR = 2 * s;

  api.brush.circle(cx - eyeSpacing * 0.5, eyeY, eyeR, {
    fill: 0xffffff, alpha: 0.95,
  });
  api.brush.circle(cx + eyeSpacing * 0.5, eyeY, eyeR, {
    fill: 0xffffff, alpha: 0.95,
  });

  if (blink) {
    api.brush.line(
      cx - eyeSpacing * 0.5 - 3 * s, eyeY,
      cx - eyeSpacing * 0.5 + 3 * s, eyeY,
      { color: 0x222222, width: Math.max(2.5, 2 * s), alpha: 0.9 }
    );
    api.brush.line(
      cx + eyeSpacing * 0.5 - 3 * s, eyeY,
      cx + eyeSpacing * 0.5 + 3 * s, eyeY,
      { color: 0x222222, width: Math.max(2.5, 2 * s), alpha: 0.9 }
    );
  } else {
    api.brush.circle(cx - eyeSpacing * 0.5 + 1 * s, eyeY - 0.5 * s, pupilR, {
      fill: 0x222222, alpha: 0.95,
    });
    api.brush.circle(cx + eyeSpacing * 0.5 + 1 * s, eyeY - 0.5 * s, pupilR, {
      fill: 0x222222, alpha: 0.95,
    });
  }

  // Eyebrows
  if (angry) {
    api.brush.line(
      cx - eyeSpacing * 0.5 - 3 * s, eyeY - 8 * s,
      cx - eyeSpacing * 0.5 + 3 * s, eyeY - 5 * s,
      { color: 0xcc2222, width: Math.max(2.5, 2 * s), alpha: 0.9 }
    );
    api.brush.line(
      cx + eyeSpacing * 0.5 - 3 * s, eyeY - 5 * s,
      cx + eyeSpacing * 0.5 + 3 * s, eyeY - 8 * s,
      { color: 0xcc2222, width: Math.max(2.5, 2 * s), alpha: 0.9 }
    );
  } else {
    api.brush.line(
      cx - eyeSpacing * 0.5 - 3 * s, eyeY - 6 * s,
      cx - eyeSpacing * 0.5 + 3 * s, eyeY - 7 * s,
      { color: 0x666666, width: Math.max(2.5, 1.5 * s), alpha: 0.7 }
    );
    api.brush.line(
      cx + eyeSpacing * 0.5 - 3 * s, eyeY - 7 * s,
      cx + eyeSpacing * 0.5 + 3 * s, eyeY - 6 * s,
      { color: 0x666666, width: Math.max(2.5, 1.5 * s), alpha: 0.7 }
    );
  }
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    slideProgress = 0;
    blinkTimer = 2 + Math.random() * 3;
    isBlinking = false;

    // Pre-render all speech bubbles as images to avoid text smearing
    bubbleFriendly = renderBubbleToDataUrl(
      ['It looks like you\'re trying', 'to make art.', 'Would you like help?'],
      '#222222', '#ffffee', '#444444'
    );
    bubbleImpatient = renderBubbleToDataUrl(
      ['Helloooo?', 'Are you there??', 'I\'m trying to help', 'you here...'],
      '#886600', '#fff8dd', '#aa8800'
    );
    bubbleAngry = renderBubbleToDataUrl(
      ['Oh f#@k off then!', 'I\'m SO done with you', '$h!t artists...', '*@#%&! your "art"!'],
      '#aa2222', '#ffeeee', '#cc4444'
    );
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time / 1000;
    const dt = frame.deltaTime / 1000;
    const phase = getPhase(t);

    if (phase === PHASE_GONE) return;

    const clippyScale = Math.min(canvasW, canvasH) / 300;
    const clippyBaseX = 45;
    const clippyRestY = canvasH - 55;
    const clippyStartY = canvasH + 60;

    const isAngry = phase >= PHASE_ANGRY;

    // Slide in
    if (slideProgress < 1) {
      slideProgress = Math.min(1, t / SLIDE_DURATION);
    }
    const eased = 1 - Math.pow(1 - slideProgress, 3);

    // Clippy position
    let clippyX = clippyBaseX;
    let clippyY = clippyStartY + (clippyRestY - clippyStartY) * eased;

    if (phase === PHASE_WALK) {
      const walkTime = t - WALK_START;
      const walkProgress = Math.min(1, walkTime / WALK_AWAY_DURATION);
      const walkEased = walkProgress * walkProgress;
      clippyX = clippyBaseX - (canvasW * 0.3 + 80) * walkEased;
      const stepBounce = Math.abs(Math.sin(walkTime * 6)) * 3;
      clippyY = clippyRestY + stepBounce;
    }

    if (clippyX < -80) return;

    // Eye blinking
    blinkTimer -= dt;
    if (blinkTimer <= 0) {
      if (isBlinking) {
        isBlinking = false;
        blinkTimer = isAngry ? 1 + Math.random() * 2 : 2.5 + Math.random() * 4;
      } else {
        isBlinking = true;
        blinkTimer = 0.12;
      }
    }

    // Draw Clippy
    drawClippy(api, clippyX, clippyY, clippyScale, isBlinking, isAngry);

    // Speech bubble — pre-rendered image, no text smearing
    if (phase !== PHASE_WALK && phase !== PHASE_SLIDE) {
      const bubbleX = clippyBaseX + 15;
      const bubbleY = clippyRestY - 115;

      let bubbleImg = bubbleFriendly;
      if (phase === PHASE_IMPATIENT) bubbleImg = bubbleImpatient;
      if (phase === PHASE_ANGRY) bubbleImg = bubbleAngry;

      // Scale bubble to fit canvas width
      const scale = Math.min(1, (canvasW - bubbleX - 5) / BUBBLE_W);
      api.brush.image(bubbleImg, bubbleX, bubbleY, {
        width: BUBBLE_W * scale,
        height: BUBBLE_H * scale,
        anchorX: 0,
        anchorY: 0,
      });
    }
  },

  async teardown(): Promise<void> {
    canvasW = 0;
    canvasH = 0;
    slideProgress = 0;
    blinkTimer = 0;
    isBlinking = false;
  },
};

registerActor(actor);
export default actor;
