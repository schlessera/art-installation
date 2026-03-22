import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'dancing-parrot',
  name: 'Dancing Parrot',
  description: 'Colorful cartoon parrots dancing in a cage, bobbing to the beat',
  author: {
    name: 'Rolf',
    github: 'rolf',
  },
  version: '1.0.0',
  tags: ['fun', 'animal', 'dance', 'colorful'],
  createdAt: new Date(),
  preferredDuration: 45,
  requiredContexts: ['audio', 'time'],
};

// Parrot color palettes (body, wing, tail, beak)
const PALETTES = [
  { body: 0x22cc44, wing: 0x1188dd, tail: 0xff4444, beak: 0xffaa00 },
  { body: 0xff3355, wing: 0xffaa22, tail: 0x2288ff, beak: 0xffdd00 },
  { body: 0x3399ff, wing: 0x22ddaa, tail: 0xff6622, beak: 0xffcc00 },
  { body: 0xffcc00, wing: 0x44bb33, tail: 0xff4488, beak: 0xff8800 },
  { body: 0xaa44ff, wing: 0xff44aa, tail: 0x44ddff, beak: 0xffbb00 },
];

const MAX_PARROTS = 4;

interface Parrot {
  x: number;
  y: number;
  scale: number;
  palette: (typeof PALETTES)[0];
  phaseOffset: number;
  danceSpeed: number;
  direction: number; // 1 = facing right, -1 = facing left
  beatBounce: number;
  active: boolean;
}

interface Cage {
  x: number;
  y: number;
  w: number;
  h: number;
  barSpacing: number;
}

let parrots: Parrot[];
let cage: Cage;

function initParrot(p: Parrot, x: number, y: number, scale: number, paletteIdx: number): void {
  p.x = x;
  p.y = y;
  p.scale = scale;
  p.palette = PALETTES[paletteIdx % PALETTES.length];
  p.phaseOffset = Math.random() * Math.PI * 2;
  p.danceSpeed = 2.5 + Math.random() * 1.5;
  p.direction = paletteIdx % 2 === 0 ? 1 : -1;
  p.beatBounce = 0;
  p.active = true;
}

// Audio energy levels (updated per frame, shared across parrots)
let audioEnergy = { bass: 0, mid: 0, treble: 0, volume: 0 };

function drawParrot(
  api: ActorUpdateAPI,
  p: Parrot,
  time: number,
): void {
  const t = time * p.danceSpeed + p.phaseOffset;

  // Audio-driven intensity multipliers
  const bassScale = 1 + audioEnergy.bass * 2.5;   // bounce height
  const midScale = 1 + audioEnergy.mid * 2;        // wing flap speed
  const trebleScale = 1 + audioEnergy.treble * 1.5; // head bob
  const volumeScale = 1 + audioEnergy.volume * 0.8; // overall energy

  // Dance motion — scales with audio
  const bounceY = Math.sin(t * 2) * 8 * p.scale * bassScale;
  const bodyTilt = Math.sin(t * 2 * volumeScale) * 0.08 * bassScale;
  const extraBounce = p.beatBounce * 16 * p.scale;

  api.brush.pushMatrix();
  api.brush.translate(p.x, p.y + bounceY - extraBounce);
  api.brush.scale(p.direction * p.scale, p.scale);
  api.brush.rotate(bodyTilt);

  // Tail feathers (behind body)
  const tailWag = Math.sin(t * 3 * volumeScale) * 0.2 * midScale;
  api.brush.pushMatrix();
  api.brush.translate(-18, 10);
  api.brush.rotate(-0.6 + tailWag);
  api.brush.ellipse(0, 0, 22, 8, { fill: p.palette.tail, alpha: 0.9 });
  api.brush.ellipse(-4, -5, 20, 7, { fill: p.palette.tail, alpha: 0.8 });
  api.brush.ellipse(-2, 5, 18, 6, { fill: p.palette.tail, alpha: 0.8 });
  api.brush.popMatrix();

  // Body
  api.brush.ellipse(0, 0, 22, 28, { fill: p.palette.body, alpha: 0.95 });

  // Belly highlight
  api.brush.ellipse(4, 4, 14, 18, {
    fill: p.palette.body,
    alpha: 0.5,
    blendMode: 'screen',
  });

  // Wing (animated flap) — mid frequencies drive flap speed
  const wingFlap = Math.sin(t * 4 * midScale) * 0.35 * midScale;
  api.brush.pushMatrix();
  api.brush.translate(-8, -2);
  api.brush.rotate(wingFlap - 0.3);
  api.brush.ellipse(0, 0, 18, 12, { fill: p.palette.wing, alpha: 0.9 });
  // Wing detail line
  api.brush.ellipse(-2, 3, 14, 8, { fill: p.palette.wing, alpha: 0.5, blendMode: 'screen' });
  api.brush.popMatrix();

  // Head — treble drives head bob intensity
  const headBob = Math.sin(t * 2 * trebleScale + 0.5) * 3 * trebleScale;
  api.brush.pushMatrix();
  api.brush.translate(6, -28 + headBob);

  // Head circle
  api.brush.circle(0, 0, 16, { fill: p.palette.body, alpha: 0.95 });

  // Eye (white + black pupil)
  api.brush.circle(8, -3, 6, { fill: 0xffffff, alpha: 0.95 });
  api.brush.circle(9, -3, 3.5, { fill: 0x111111, alpha: 0.95 });
  // Eye highlight
  api.brush.circle(10.5, -4.5, 1.5, { fill: 0xffffff, alpha: 0.9 });

  // Beak
  api.brush.polygon(
    [
      { x: 12, y: 2 },
      { x: 26, y: 4 },
      { x: 12, y: 8 },
    ],
    { fill: p.palette.beak, alpha: 0.95 },
  );
  // Upper beak line
  api.brush.line(12, 5, 26, 4, { color: 0x000000, alpha: 0.2, width: 1 });

  // Crest feathers on top of head
  api.brush.pushMatrix();
  api.brush.translate(-2, -14);
  const crestWave = Math.sin(t * 3 * volumeScale) * 0.15 * trebleScale;
  api.brush.rotate(crestWave - 0.2);
  api.brush.ellipse(0, 0, 4, 10, { fill: p.palette.tail, alpha: 0.85 });
  api.brush.rotate(0.3);
  api.brush.ellipse(3, 0, 3.5, 9, { fill: p.palette.tail, alpha: 0.75 });
  api.brush.popMatrix();

  api.brush.popMatrix(); // end head

  // Feet (little orange feet that tap) — bass drives foot tapping
  const leftFootTap = Math.sin(t * 4 * bassScale) * 3 * bassScale;
  const rightFootTap = Math.sin(t * 4 * bassScale + Math.PI) * 3 * bassScale;

  // Left foot
  api.brush.pushMatrix();
  api.brush.translate(-6, 28 + leftFootTap);
  api.brush.ellipse(0, 0, 6, 3, { fill: p.palette.beak, alpha: 0.9 });
  api.brush.popMatrix();

  // Right foot
  api.brush.pushMatrix();
  api.brush.translate(6, 28 + rightFootTap);
  api.brush.ellipse(0, 0, 6, 3, { fill: p.palette.beak, alpha: 0.9 });
  api.brush.popMatrix();

  api.brush.popMatrix(); // end parrot
}

function drawCage(api: ActorUpdateAPI, c: Cage, time: number): void {
  const barColor = 0xccaa44;
  const barAlpha = 0.85;
  const barWidth = 3;

  // Dome top (arc of bars curving inward)
  const domeHeight = c.h * 0.18;

  // Horizontal top ring
  api.brush.ellipse(c.x + c.w / 2, c.y, c.w / 2, domeHeight, {
    stroke: barColor, strokeWidth: barWidth, alpha: barAlpha,
  });

  // Vertical bars
  const numBars = Math.floor(c.w / c.barSpacing);
  for (let i = 0; i <= numBars; i++) {
    const bx = c.x + i * c.barSpacing;
    const t = i / numBars; // 0 to 1 across cage width
    // Dome curve: bars are shorter at edges, tallest in center
    const domeOffset = Math.sin(t * Math.PI) * domeHeight;
    api.brush.line(bx, c.y + c.h, bx, c.y - domeOffset, {
      color: barColor, alpha: barAlpha, width: barWidth,
    });
  }

  // Bottom horizontal bar
  api.brush.line(c.x, c.y + c.h, c.x + c.w, c.y + c.h, {
    color: barColor, alpha: barAlpha, width: barWidth + 1,
  });

  // Middle perch bar (where parrots stand)
  const perchY = c.y + c.h * 0.65;
  api.brush.line(c.x, perchY, c.x + c.w, perchY, {
    color: 0x886633, alpha: 0.9, width: 4,
  });

  // Top horizontal ring
  api.brush.line(c.x, c.y, c.x + c.w, c.y, {
    color: barColor, alpha: barAlpha, width: barWidth + 1,
  });

  // Hook at top center
  const hookX = c.x + c.w / 2;
  api.brush.arc(hookX, c.y - domeHeight - 8, 8, Math.PI, 0, {
    color: barColor, alpha: barAlpha, width: barWidth,
  });
  // Chain link above hook
  api.brush.line(hookX, c.y - domeHeight - 16, hookX, c.y - domeHeight - 30, {
    color: barColor, alpha: 0.7, width: 2.5,
  });

}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();

    // Set up cage centered on canvas
    const cageW = width * 0.75;
    const cageH = height * 0.55;
    const cageX = (width - cageW) / 2;
    const cageY = height * 0.2;
    cage = { x: cageX, y: cageY, w: cageW, h: cageH, barSpacing: cageW / 8 };

    // Pre-allocate parrot pool
    parrots = new Array(MAX_PARROTS);
    for (let i = 0; i < MAX_PARROTS; i++) {
      parrots[i] = {
        x: 0, y: 0, scale: 1,
        palette: PALETTES[0],
        phaseOffset: 0, danceSpeed: 2.5,
        direction: 1, beatBounce: 0, active: false,
      };
    }

    // Place parrots on the perch inside the cage
    const perchY = cageY + cageH * 0.65;
    const innerMargin = cageW * 0.12;
    const usableWidth = cageW - innerMargin * 2;
    for (let i = 0; i < MAX_PARROTS; i++) {
      const x = cageX + innerMargin + (usableWidth / (MAX_PARROTS - 1)) * i;
      const y = perchY - 28; // feet sit on perch
      const scale = 0.7 + Math.random() * 0.3;
      initParrot(parrots[i], x, y, scale, i);
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const time = frame.time / 1000;

    // Read audio levels from microphone
    let isBeat = false;
    try {
      if (api.context.audio.isAvailable()) {
        isBeat = api.context.audio.isBeat();
        audioEnergy.bass = api.context.audio.bass();
        audioEnergy.mid = api.context.audio.mid();
        audioEnergy.treble = api.context.audio.treble();
        audioEnergy.volume = api.context.audio.volume();
      } else {
        audioEnergy.bass = 0;
        audioEnergy.mid = 0;
        audioEnergy.treble = 0;
        audioEnergy.volume = 0;
      }
    } catch {
      audioEnergy.bass = 0;
      audioEnergy.mid = 0;
      audioEnergy.treble = 0;
      audioEnergy.volume = 0;
    }

    // Draw parrots first, then cage bars on top for the "caged" look
    for (let i = 0; i < MAX_PARROTS; i++) {
      const p = parrots[i];
      if (!p.active) continue;

      // Beat bounce decay
      if (isBeat) {
        p.beatBounce = 1;
      } else {
        p.beatBounce *= 0.88;
        if (p.beatBounce < 0.01) p.beatBounce = 0;
      }

      drawParrot(api, p, time);
    }

    // Draw cage over parrots
    drawCage(api, cage, time);

    // "Make some noise!" text below the cage
    const { width } = api.canvas.getSize();
    const textY = cage.y + cage.h + 36;
    api.brush.text('Make some noise!', width / 2, textY, {
      fontSize: 18,
      fill: 0xffcc44,
      alpha: 0.9,
      align: 'center',
      baseline: 'top',
    });
  },

  async teardown(): Promise<void> {
    for (let i = 0; i < MAX_PARROTS; i++) {
      parrots[i].active = false;
      parrots[i].beatBounce = 0;
    }
  },
};

registerActor(actor);
export default actor;
