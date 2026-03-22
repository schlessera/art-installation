import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'dog-attack',
  name: 'Dog Attack',
  description: 'A cartoon scene of a guy being chased and bitten by an angry dog',
  author: { name: 'Lucio Sa', github: 'janw-me' },
  version: '1.0.0',
  tags: ['cartoon', 'comedy', 'dog', 'animation'],
  createdAt: new Date(),
  preferredDuration: 30,
  requiredContexts: ['display'],
};

// Animation phases
const PHASE_CHASE = 0;    // Dog chasing the guy
const PHASE_BITE = 1;     // Dog latches on
const PHASE_DRAG = 2;     // Dog drags the guy

const MAX_SWEAT = 6;
const MAX_DUST = 10;

interface SweatDrop { x: number; y: number; vy: number; life: number; maxLife: number; active: boolean }
interface DustPuff { x: number; y: number; vx: number; vy: number; size: number; life: number; maxLife: number; active: boolean }

let canvasW = 0;
let canvasH = 0;
let groundY = 0;
let phase = PHASE_CHASE;
let phaseTime = 0;
let manX = 0;
let manY = 0;
let dogX = 0;
let dogY = 0;
let manLegPhase = 0;
let dogLegPhase = 0;
let sweatDrops: SweatDrop[] = [];
let dustPuffs: DustPuff[] = [];
let sweatIdx = 0;
let dustIdx = 0;
let biteShake = 0;

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    groundY = canvasH * 0.78;
    phase = PHASE_CHASE;
    phaseTime = 0;
    manX = canvasW * 0.7;
    manY = groundY;
    dogX = canvasW * -0.1;
    dogY = groundY;
    manLegPhase = 0;
    dogLegPhase = 0;
    sweatIdx = 0;
    dustIdx = 0;
    biteShake = 0;

    sweatDrops = [];
    for (let i = 0; i < MAX_SWEAT; i++) {
      sweatDrops.push({ x: 0, y: 0, vy: 0, life: 0, maxLife: 30, active: false });
    }
    dustPuffs = [];
    for (let i = 0; i < MAX_DUST; i++) {
      dustPuffs.push({ x: 0, y: 0, vx: 0, vy: 0, size: 0, life: 0, maxLife: 25, active: false });
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const dt = frame.deltaTime / 16.67; // normalize to ~60fps
    const t = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();

    phaseTime += frame.deltaTime;

    // Colors
    const skinColor = 0xf5c5a3;
    const shirtColor = isDark ? 0x5588dd : 0x3366bb;
    const pantsColor = isDark ? 0x556688 : 0x334466;
    const dogBodyColor = 0x8b6914;
    const dogDarkColor = 0x6b4c0e;
    const eyeWhite = 0xffffff;
    const mouthColor = 0xcc2222;

    // === Phase logic ===
    if (phase === PHASE_CHASE) {
      // Dog rushes in from left, man runs right
      dogX += 2.8 * dt;
      manX += 1.2 * dt;
      manLegPhase += 0.35 * dt;
      dogLegPhase += 0.45 * dt;

      // Man stays on screen
      if (manX > canvasW * 0.75) manX = canvasW * 0.75;

      // Transition to bite when dog reaches man
      if (dogX + 50 >= manX - 10) {
        phase = PHASE_BITE;
        phaseTime = 0;
        biteShake = 1;
      }

      // Spawn dust behind dog
      if (frame.frameCount % 4 === 0) {
        const d = dustPuffs[dustIdx % MAX_DUST];
        d.x = dogX - 15;
        d.y = groundY + 2;
        d.vx = -0.8 - Math.random() * 0.5;
        d.vy = -0.3 - Math.random() * 0.4;
        d.size = 4 + Math.random() * 5;
        d.life = 0;
        d.maxLife = 20 + Math.random() * 10;
        d.active = true;
        dustIdx++;
      }
    } else if (phase === PHASE_BITE) {
      // Dog latches onto man's leg, shaking
      biteShake *= 0.97;
      const shake = Math.sin(t * 25) * 4 * biteShake;
      dogX = manX - 30 + shake * 0.5;
      manLegPhase += 0.05 * dt; // slow struggling

      // Spawn sweat from man's head
      if (frame.frameCount % 8 === 0) {
        const s = sweatDrops[sweatIdx % MAX_SWEAT];
        s.x = manX + (Math.random() - 0.5) * 12;
        s.y = manY - 68;
        s.vy = 0.5 + Math.random() * 0.5;
        s.life = 0;
        s.maxLife = 25 + Math.random() * 10;
        s.active = true;
        sweatIdx++;
      }

      if (phaseTime > 4000) {
        phase = PHASE_DRAG;
        phaseTime = 0;
      }
    } else if (phase === PHASE_DRAG) {
      // Dog drags man offscreen left
      dogX -= 1.5 * dt;
      manX = dogX + 30;
      dogLegPhase += 0.3 * dt;
      manLegPhase += 0.15 * dt;

      // Dust trail
      if (frame.frameCount % 3 === 0) {
        const d = dustPuffs[dustIdx % MAX_DUST];
        d.x = manX + 10;
        d.y = groundY + 2;
        d.vx = 0.5 + Math.random() * 0.5;
        d.vy = -0.2 - Math.random() * 0.3;
        d.size = 3 + Math.random() * 4;
        d.life = 0;
        d.maxLife = 18 + Math.random() * 8;
        d.active = true;
        dustIdx++;
      }

      // Loop back to chase
      if (manX < -80) {
        phase = PHASE_CHASE;
        phaseTime = 0;
        manX = canvasW * 0.7;
        dogX = canvasW * -0.1;
      }
    }

    // === Draw dust puffs ===
    for (let i = 0; i < MAX_DUST; i++) {
      const d = dustPuffs[i];
      if (!d.active) continue;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.life += dt;
      if (d.life >= d.maxLife) { d.active = false; continue; }
      const progress = d.life / d.maxLife;
      const alpha = 0.4 * (1 - progress);
      if (alpha < 0.05) continue;
      api.brush.circle(d.x, d.y, d.size * (1 + progress * 0.5), {
        fill: isDark ? 0x887766 : 0xbbaa88,
        alpha,
      });
    }

    // === Draw man ===
    const manShake = phase === PHASE_BITE ? Math.sin(t * 20) * 2 : 0;
    const mx = manX + manShake;
    const my = manY;
    const legSwing = Math.sin(manLegPhase * 6) * 12;
    const armSwing = Math.sin(manLegPhase * 6 + Math.PI) * 10;
    const leanBack = phase === PHASE_DRAG ? -0.2 : phase === PHASE_BITE ? 0.1 : -0.05;

    api.brush.pushMatrix();
    api.brush.translate(mx, my);
    api.brush.rotate(leanBack);

    // Legs
    api.brush.line(0, -10, -6 + legSwing * 0.5, 18, { color: pantsColor, width: 5, alpha: 0.9 });
    api.brush.line(0, -10, 6 - legSwing * 0.5, 18, { color: pantsColor, width: 5, alpha: 0.9 });
    // Shoes
    api.brush.circle(-6 + legSwing * 0.5, 20, 4, { fill: 0x333333, alpha: 0.9 });
    api.brush.circle(6 - legSwing * 0.5, 20, 4, { fill: 0x333333, alpha: 0.9 });

    // Body (shirt)
    api.brush.ellipse(0, -22, 14, 18, { fill: shirtColor, alpha: 0.9 });

    // Arms
    const armUpR = phase === PHASE_BITE ? -15 : 0;
    const armUpL = phase === PHASE_BITE ? -20 : 0;
    api.brush.line(-10, -28, -18 + armSwing, -12 + armUpR, { color: skinColor, width: 4, alpha: 0.9 });
    api.brush.line(10, -28, 18 - armSwing, -12 + armUpL, { color: skinColor, width: 4, alpha: 0.9 });
    // Hands
    api.brush.circle(-18 + armSwing, -12 + armUpR, 3, { fill: skinColor, alpha: 0.9 });
    api.brush.circle(18 - armSwing, -12 + armUpL, 3, { fill: skinColor, alpha: 0.9 });

    // Head
    api.brush.circle(0, -48, 12, { fill: skinColor, alpha: 0.9 });
    // Hair
    api.brush.ellipse(0, -56, 13, 6, { fill: 0x332211, alpha: 0.9 });

    // Eyes - scared expression
    const eyeSize = phase === PHASE_CHASE ? 3 : 4;
    api.brush.circle(-4, -50, eyeSize, { fill: eyeWhite, alpha: 0.9 });
    api.brush.circle(4, -50, eyeSize, { fill: eyeWhite, alpha: 0.9 });
    api.brush.circle(-4, -50, 1.5, { fill: 0x222222, alpha: 0.9 });
    api.brush.circle(4, -50, 1.5, { fill: 0x222222, alpha: 0.9 });

    // Mouth - open scream
    if (phase === PHASE_BITE || phase === PHASE_DRAG) {
      api.brush.ellipse(0, -43, 5, 4, { fill: 0x111111, alpha: 0.9 });
    } else {
      api.brush.ellipse(0, -43, 4, 2.5, { fill: 0x111111, alpha: 0.9 });
    }

    // Exclamation mark above head when being bitten
    if (phase === PHASE_BITE) {
      const exAlpha = 0.6 + Math.sin(t * 8) * 0.3;
      api.brush.rect(-2, -76, 4, 12, { fill: 0xff3333, alpha: exAlpha });
      api.brush.circle(0, -60, 2.5, { fill: 0xff3333, alpha: exAlpha });
    }

    api.brush.popMatrix();

    // === Draw dog ===
    const dx = dogX;
    const dy = dogY;
    const dogLegSwing = Math.sin(dogLegPhase * 8) * 8;
    const dogFacing = phase === PHASE_DRAG ? -1 : 1; // faces right during chase, left during drag

    api.brush.pushMatrix();
    api.brush.translate(dx, dy);
    api.brush.scale(dogFacing, 1);

    // Tail - wagging aggressively
    api.brush.line(-22, -18, -34, -28 + Math.sin(t * 12) * 8, {
      color: dogDarkColor, width: 4, alpha: 0.9,
    });

    // Back legs
    api.brush.line(-12, -4, -16 + dogLegSwing * 0.4, 16, { color: dogBodyColor, width: 4.5, alpha: 0.9 });
    api.brush.line(-8, -4, -4 - dogLegSwing * 0.4, 16, { color: dogBodyColor, width: 4.5, alpha: 0.9 });
    // Front legs
    api.brush.line(12, -4, 16 + dogLegSwing * 0.5, 16, { color: dogBodyColor, width: 4.5, alpha: 0.9 });
    api.brush.line(8, -4, 4 - dogLegSwing * 0.5, 16, { color: dogBodyColor, width: 4.5, alpha: 0.9 });

    // Body
    api.brush.ellipse(0, -12, 28, 14, { fill: dogBodyColor, alpha: 0.9 });
    // Belly
    api.brush.ellipse(0, -8, 22, 8, { fill: 0xc4a050, alpha: 0.7 });

    // Head
    api.brush.circle(22, -18, 11, { fill: dogBodyColor, alpha: 0.9 });
    // Snout
    api.brush.ellipse(32, -15, 10, 6, { fill: 0xa07820, alpha: 0.9 });
    // Nose
    api.brush.circle(38, -16, 2.5, { fill: 0x222222, alpha: 0.9 });

    // Open jaws
    const jawOpen = phase === PHASE_CHASE
      ? 3 + Math.sin(t * 10) * 2
      : 5 + Math.sin(t * 15) * 1.5;
    // Upper jaw
    api.brush.ellipse(33, -18 - jawOpen * 0.3, 8, 3, { fill: mouthColor, alpha: 0.9 });
    // Lower jaw
    api.brush.ellipse(33, -12 + jawOpen * 0.3, 8, 3, { fill: 0xaa1111, alpha: 0.9 });
    // Teeth
    for (let ti = 0; ti < 4; ti++) {
      const tx = 28 + ti * 3;
      api.brush.rect(tx, -17 - jawOpen * 0.2, 2, 3, { fill: 0xffffff, alpha: 0.9 });
      api.brush.rect(tx, -13 + jawOpen * 0.2, 2, 3, { fill: 0xffffff, alpha: 0.9 });
    }

    // Angry eyes
    api.brush.circle(18, -22, 3.5, { fill: eyeWhite, alpha: 0.9 });
    api.brush.circle(26, -22, 3.5, { fill: eyeWhite, alpha: 0.9 });
    api.brush.circle(18, -22, 2, { fill: 0xcc2200, alpha: 0.9 });
    api.brush.circle(26, -22, 2, { fill: 0xcc2200, alpha: 0.9 });
    // Angry eyebrows
    api.brush.line(15, -27, 21, -25, { color: 0x222222, width: 2.5, alpha: 0.9 });
    api.brush.line(29, -25, 23, -27, { color: 0x222222, width: 2.5, alpha: 0.9 });

    // Ears
    api.brush.polygon([
      { x: 14, y: -26 },
      { x: 10, y: -36 },
      { x: 20, y: -28 },
    ], { fill: dogDarkColor, alpha: 0.9 });
    api.brush.polygon([
      { x: 24, y: -26 },
      { x: 28, y: -36 },
      { x: 18, y: -28 },
    ], { fill: dogDarkColor, alpha: 0.9 });

    api.brush.popMatrix();

    // === Sweat drops ===
    for (let i = 0; i < MAX_SWEAT; i++) {
      const s = sweatDrops[i];
      if (!s.active) continue;
      s.y += s.vy * dt;
      s.life += dt;
      if (s.life >= s.maxLife) { s.active = false; continue; }
      const progress = s.life / s.maxLife;
      const alpha = 0.7 * (1 - progress);
      if (alpha < 0.05) continue;
      // Teardrop shape: circle + triangle
      api.brush.circle(s.x, s.y, 2.5, { fill: 0x66ccff, alpha });
      api.brush.polygon([
        { x: s.x - 2, y: s.y },
        { x: s.x, y: s.y - 5 },
        { x: s.x + 2, y: s.y },
      ], { fill: 0x66ccff, alpha });
    }

    // === Action lines during chase ===
    if (phase === PHASE_CHASE) {
      for (let i = 0; i < 4; i++) {
        const ly = groundY - 20 - i * 15 + Math.sin(t * 3 + i) * 5;
        const lx = dogX - 20 - i * 8;
        const lineAlpha = 0.3 - i * 0.06;
        if (lineAlpha < 0.05) continue;
        api.brush.line(lx, ly, lx - 25 - i * 5, ly, {
          color: isDark ? 0xcccccc : 0x666666, width: 2.5, alpha: lineAlpha,
        });
      }
    }

    // === Ground line ===
    api.brush.line(0, groundY + 22, canvasW, groundY + 22, {
      color: isDark ? 0x555555 : 0x998877, width: 3, alpha: 0.6,
    });
  },

  async teardown(): Promise<void> {
    canvasW = 0;
    canvasH = 0;
    groundY = 0;
    phase = PHASE_CHASE;
    phaseTime = 0;
    manX = 0;
    manY = 0;
    dogX = 0;
    dogY = 0;
    sweatDrops = [];
    dustPuffs = [];
  },
};

registerActor(actor);
export default actor;
