import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'poop-up-add',
  name: 'Pop-Up Ad',
  description: 'Annoying early 2000s style popup ads that cascade across the canvas',
  author: { name: 'janw-ll', github: 'janw-ll' },
  version: '1.0.0',
  tags: ['retro', 'popup', 'y2k', 'nostalgia', 'humor'],
  createdAt: new Date(),
  preferredDuration: 30,
  requiredContexts: ['display'],
};

// Colors
const TITLE_BAR_BLUE = 0x0a246a;
const TITLE_BAR_LIGHT = 0x3b72a9;
const WINDOW_BG = 0xd4d0c8;
const BUTTON_FACE = 0xd4d0c8;
const BUTTON_HIGHLIGHT = 0xffffff;
const BUTTON_SHADOW = 0x808080;
const BUTTON_DARK = 0x404040;
const RED_X = 0xcc0000;
const YELLOW_ALERT = 0xffff00;
const GREEN_BUTTON = 0x00cc00;
const ORANGE_HOT = 0xff6600;

const MAX_POPUPS = 6;
const TITLE_BAR_H = 16;
const BORDER = 3;

interface Popup {
  active: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  spawnTime: number;
  variant: number;
  blinkPhase: number;
  shakeX: number;
  shakeY: number;
}

const MESSAGES = [
  'CONGRATULATIONS!!!',
  'YOU ARE THE 1,000,000th VISITOR!',
  'CLICK HERE TO CLAIM YOUR PRIZE!',
  'FREE iPod Nano!!!',
  'WARNING: Your PC may be infected!',
  'You have (1) new message!',
  'Hot Singles in YOUR area!!!',
  'Download FREE Smileys Now!',
  'WINNER WINNER WINNER!!!',
  'Your computer has a VIRUS!',
  'Act NOW - Limited Time Offer!',
  'You WON a FREE Vacation!',
  'URGENT: Account Verification',
  'Make $$$$ Working From Home!',
  'FREE Ringtones - Download NOW!',
];

const TITLE_LABELS = [
  'Special Offer!',
  'URGENT MESSAGE',
  'Free Download',
  'Security Alert',
  'You Won!!!',
  'Important!',
];

let popups: Popup[] = [];
let canvasW = 0;
let canvasH = 0;
let nextSpawnTime = 0;
let spawnIndex = 0;

function initPopup(p: Popup, time: number): void {
  const minW = 140;
  const maxW = Math.min(280, canvasW - 20);
  const minH = 100;
  const maxH = Math.min(200, canvasH - 20);
  p.active = true;
  p.w = minW + ((spawnIndex * 47 + 13) % (maxW - minW));
  p.h = minH + ((spawnIndex * 31 + 7) % (maxH - minH));
  p.x = 10 + ((spawnIndex * 73 + 29) % Math.max(1, canvasW - p.w - 20));
  p.y = 10 + ((spawnIndex * 59 + 17) % Math.max(1, canvasH - p.h - 20));
  p.spawnTime = time;
  p.variant = spawnIndex % MESSAGES.length;
  p.blinkPhase = (spawnIndex * 1.7) % (Math.PI * 2);
  p.shakeX = 0;
  p.shakeY = 0;
  spawnIndex++;
}

function drawWindowBorder(api: ActorUpdateAPI, x: number, y: number, w: number, h: number): void {
  // Outer highlight (top-left light)
  api.brush.line(x, y, x + w, y, { color: BUTTON_HIGHLIGHT, width: 2, alpha: 1 });
  api.brush.line(x, y, x, y + h, { color: BUTTON_HIGHLIGHT, width: 2, alpha: 1 });
  // Outer shadow (bottom-right dark)
  api.brush.line(x + w, y, x + w, y + h, { color: BUTTON_DARK, width: 2, alpha: 1 });
  api.brush.line(x, y + h, x + w, y + h, { color: BUTTON_DARK, width: 2, alpha: 1 });
  // Inner shadow
  api.brush.line(x + w - 1, y + 1, x + w - 1, y + h - 1, { color: BUTTON_SHADOW, width: 1, alpha: 1 });
  api.brush.line(x + 1, y + h - 1, x + w - 1, y + h - 1, { color: BUTTON_SHADOW, width: 1, alpha: 1 });
}

function draw3DButton(api: ActorUpdateAPI, x: number, y: number, w: number, h: number, label: string, fillColor: number): void {
  api.brush.rect(x, y, w, h, { fill: fillColor, alpha: 1 });
  // Highlight top-left
  api.brush.line(x, y, x + w, y, { color: BUTTON_HIGHLIGHT, width: 1, alpha: 1 });
  api.brush.line(x, y, x, y + h, { color: BUTTON_HIGHLIGHT, width: 1, alpha: 1 });
  // Shadow bottom-right
  api.brush.line(x + w, y, x + w, y + h, { color: BUTTON_DARK, width: 1, alpha: 1 });
  api.brush.line(x, y + h, x + w, y + h, { color: BUTTON_DARK, width: 1, alpha: 1 });
  api.brush.text(label, x + w / 2, y + h / 2, {
    fontSize: 9,
    fill: 0x000000,
    align: 'center',
    baseline: 'middle',
    alpha: 1,
  });
}

function drawPopup(api: ActorUpdateAPI, p: Popup, time: number): void {
  const age = time - p.spawnTime;
  // Fade in
  let alpha = 1;
  if (age < 0.3) alpha = age / 0.3;
  if (alpha < 0.05) return;

  // Slight shake for "urgent" popups
  const isUrgent = p.variant % 3 === 0;
  if (isUrgent && age > 0.5) {
    const shake = Math.sin(time * 30 + p.blinkPhase) * 1.5;
    p.shakeX = shake;
    p.shakeY = Math.cos(time * 25 + p.blinkPhase) * 1;
  } else {
    p.shakeX = 0;
    p.shakeY = 0;
  }

  const px = p.x + p.shakeX;
  const py = p.y + p.shakeY;

  api.brush.pushMatrix();
  api.brush.translate(px, py);

  // Drop shadow
  api.brush.rect(4, 4, p.w, p.h, { fill: 0x000000, alpha: 0.35 * alpha });

  // Window background
  api.brush.rect(0, 0, p.w, p.h, { fill: WINDOW_BG, alpha: alpha });

  // 3D border
  drawWindowBorder(api, 0, 0, p.w, p.h);

  // Title bar gradient (classic Win98/XP blue)
  api.brush.rect(BORDER, BORDER, p.w - BORDER * 2, TITLE_BAR_H, {
    fill: {
      type: 'linear',
      x0: 0, y0: 0.5, x1: 1, y1: 0.5,
      stops: [
        { offset: 0, color: '#0a246a' },
        { offset: 1, color: '#3b72a9' },
      ],
    },
    alpha: alpha,
  });

  // Title text
  const titleLabel = TITLE_LABELS[p.variant % TITLE_LABELS.length];
  api.brush.text(titleLabel, BORDER + 4, BORDER + TITLE_BAR_H / 2, {
    fontSize: 9,
    fill: 0xffffff,
    align: 'left',
    baseline: 'middle',
    alpha: alpha,
  });

  // Close button [X]
  const closeX = p.w - BORDER - 14;
  const closeY = BORDER + 2;
  api.brush.rect(closeX, closeY, 12, 12, { fill: BUTTON_FACE, alpha: alpha });
  api.brush.line(closeX, closeY, closeX + 12, closeY, { color: BUTTON_HIGHLIGHT, width: 1, alpha: alpha });
  api.brush.line(closeX, closeY, closeX, closeY + 12, { color: BUTTON_HIGHLIGHT, width: 1, alpha: alpha });
  api.brush.line(closeX + 12, closeY, closeX + 12, closeY + 12, { color: BUTTON_DARK, width: 1, alpha: alpha });
  api.brush.line(closeX, closeY + 12, closeX + 12, closeY + 12, { color: BUTTON_DARK, width: 1, alpha: alpha });
  api.brush.text('X', closeX + 6, closeY + 6, {
    fontSize: 8,
    fill: 0x000000,
    align: 'center',
    baseline: 'middle',
    alpha: alpha,
  });

  // Content area
  const contentY = BORDER + TITLE_BAR_H + 6;
  const contentW = p.w - BORDER * 2 - 10;

  // Blinking warning icon for some variants
  const blink = Math.sin(time * 6 + p.blinkPhase) > 0;

  if (p.variant % 5 === 0) {
    // "Security Alert" style
    if (blink) {
      api.brush.text('⚠', BORDER + 8, contentY + 6, {
        fontSize: 18,
        fill: RED_X,
        align: 'left',
        baseline: 'top',
        alpha: alpha,
      });
    }
    api.brush.text(MESSAGES[p.variant], BORDER + 8, contentY + 28, {
      fontSize: 8,
      fill: RED_X,
      align: 'left',
      baseline: 'top',
      alpha: alpha,
    });
    api.brush.text(MESSAGES[(p.variant + 4) % MESSAGES.length], BORDER + 8, contentY + 42, {
      fontSize: 7,
      fill: 0x000000,
      align: 'left',
      baseline: 'top',
      alpha: alpha,
    });

    const btnY = contentY + 58;
    draw3DButton(api, BORDER + 8, btnY, 70, 18, 'Fix Now!', BUTTON_FACE);
    draw3DButton(api, BORDER + 86, btnY, 50, 18, 'Cancel', BUTTON_FACE);

  } else if (p.variant % 5 === 1) {
    // "You Won!" style
    const flashColor = blink ? YELLOW_ALERT : ORANGE_HOT;
    api.brush.text('★ ★ ★', p.w / 2 - BORDER, contentY + 2, {
      fontSize: 12,
      fill: flashColor,
      align: 'center',
      baseline: 'top',
      alpha: alpha,
    });
    api.brush.text(MESSAGES[p.variant], BORDER + 8, contentY + 20, {
      fontSize: 8,
      fill: 0x000000,
      align: 'left',
      baseline: 'top',
      alpha: alpha,
    });
    api.brush.text(MESSAGES[(p.variant + 1) % MESSAGES.length], BORDER + 8, contentY + 34, {
      fontSize: 7,
      fill: 0x333333,
      align: 'left',
      baseline: 'top',
      alpha: alpha,
    });

    const btnY = contentY + 52;
    draw3DButton(api, p.w / 2 - BORDER - 40, btnY, 80, 20, 'CLAIM NOW', GREEN_BUTTON);

  } else if (p.variant % 5 === 2) {
    // "Free Download" style
    api.brush.text(MESSAGES[p.variant], BORDER + 8, contentY + 4, {
      fontSize: 9,
      fill: 0x0000cc,
      align: 'left',
      baseline: 'top',
      alpha: alpha,
    });
    api.brush.text(MESSAGES[(p.variant + 2) % MESSAGES.length], BORDER + 8, contentY + 20, {
      fontSize: 7,
      fill: 0x333333,
      align: 'left',
      baseline: 'top',
      alpha: alpha,
    });
    // Fake progress bar
    const barX = BORDER + 8;
    const barY = contentY + 38;
    const barW = contentW - 8;
    const barH = 12;
    api.brush.rect(barX, barY, barW, barH, { fill: 0xffffff, alpha: alpha });
    api.brush.line(barX, barY, barX + barW, barY, { color: BUTTON_SHADOW, width: 1, alpha: alpha });
    api.brush.line(barX, barY, barX, barY + barH, { color: BUTTON_SHADOW, width: 1, alpha: alpha });
    api.brush.line(barX + barW, barY, barX + barW, barY + barH, { color: BUTTON_HIGHLIGHT, width: 1, alpha: alpha });
    api.brush.line(barX, barY + barH, barX + barW, barY + barH, { color: BUTTON_HIGHLIGHT, width: 1, alpha: alpha });
    // Fill progress
    const progress = ((time * 0.15 + p.blinkPhase) % 1);
    const fillW = Math.max(0, (barW - 2) * progress);
    api.brush.rect(barX + 1, barY + 1, fillW, barH - 2, { fill: 0x0078d4, alpha: alpha });
    api.brush.text(Math.floor(progress * 100) + '%', barX + barW / 2, barY + barH / 2, {
      fontSize: 7,
      fill: progress > 0.5 ? 0xffffff : 0x000000,
      align: 'center',
      baseline: 'middle',
      alpha: alpha,
    });

    const btnY2 = contentY + 58;
    draw3DButton(api, BORDER + 8, btnY2, 55, 16, 'OK', BUTTON_FACE);
    draw3DButton(api, BORDER + 70, btnY2, 55, 16, 'Cancel', BUTTON_FACE);

  } else if (p.variant % 5 === 3) {
    // "Hot Singles" / spam style
    api.brush.text(MESSAGES[p.variant], BORDER + 8, contentY + 4, {
      fontSize: 9,
      fill: ORANGE_HOT,
      align: 'left',
      baseline: 'top',
      alpha: alpha,
    });
    api.brush.text(MESSAGES[(p.variant + 3) % MESSAGES.length], BORDER + 8, contentY + 20, {
      fontSize: 7,
      fill: 0x660000,
      align: 'left',
      baseline: 'top',
      alpha: alpha,
    });
    api.brush.text(MESSAGES[(p.variant + 7) % MESSAGES.length], BORDER + 8, contentY + 34, {
      fontSize: 7,
      fill: 0x333333,
      align: 'left',
      baseline: 'top',
      alpha: alpha,
    });

    const btnY = contentY + 52;
    draw3DButton(api, p.w / 2 - BORDER - 35, btnY, 70, 18, 'Click Here!', YELLOW_ALERT);

  } else {
    // Generic "Congratulations" style
    if (blink) {
      api.brush.rect(BORDER + 4, contentY, contentW, 16, { fill: YELLOW_ALERT, alpha: alpha * 0.8 });
    }
    api.brush.text(MESSAGES[p.variant], BORDER + 8, contentY + 4, {
      fontSize: 9,
      fill: 0x000000,
      align: 'left',
      baseline: 'top',
      alpha: alpha,
    });
    api.brush.text(MESSAGES[(p.variant + 5) % MESSAGES.length], BORDER + 8, contentY + 22, {
      fontSize: 7,
      fill: 0x333333,
      align: 'left',
      baseline: 'top',
      alpha: alpha,
    });
    api.brush.text(MESSAGES[(p.variant + 9) % MESSAGES.length], BORDER + 8, contentY + 36, {
      fontSize: 7,
      fill: 0x0000cc,
      align: 'left',
      baseline: 'top',
      alpha: alpha,
    });

    const btnY = contentY + 54;
    draw3DButton(api, BORDER + 8, btnY, 50, 16, 'Yes!', GREEN_BUTTON);
    draw3DButton(api, BORDER + 66, btnY, 50, 16, 'No', BUTTON_FACE);
  }

  api.brush.popMatrix();
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    spawnIndex = 0;
    nextSpawnTime = 0.5;

    popups = [];
    for (let i = 0; i < MAX_POPUPS; i++) {
      popups.push({
        active: false, x: 0, y: 0, w: 0, h: 0,
        spawnTime: 0, variant: 0, blinkPhase: 0, shakeX: 0, shakeY: 0,
      });
    }

    // Spawn the first popup immediately
    initPopup(popups[0], 0);
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const time = frame.time / 1000;

    // Spawn new popups over time
    if (time > nextSpawnTime) {
      for (let i = 0; i < MAX_POPUPS; i++) {
        if (!popups[i].active) {
          initPopup(popups[i], time);
          nextSpawnTime = time + 1.5 + (spawnIndex % 3) * 0.8;
          break;
        }
      }
    }

    // Draw all active popups
    for (let i = 0; i < MAX_POPUPS; i++) {
      if (popups[i].active) {
        drawPopup(api, popups[i], time);
      }
    }
  },

  async teardown(): Promise<void> {
    for (let i = 0; i < popups.length; i++) {
      popups[i].active = false;
    }
    popups = [];
    canvasW = 0;
    canvasH = 0;
    spawnIndex = 0;
    nextSpawnTime = 0;
  },
};

registerActor(actor);
export default actor;
