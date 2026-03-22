import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'lucio',
  name: 'Good Boy',
  description: 'A guy approaches a dog to give it pets — big mistake.',
  author: {
    name: 'Lucio Sa',
    github: 'Lucisu',
  },
  version: '1.0.0',
  tags: ['cartoon', 'comedy', 'dog', 'animation', 'story'],
  createdAt: new Date('2026-03-22'),
  preferredDuration: 30,
  requiredContexts: ['display'],
};

// ─── Animation phases ──────────────────────────────────────────────────────────
const PHASE_APPROACH = 0; // Man walks toward dog (3 s)
const PHASE_PET      = 1; // Man crouches and reaches hand (3 s)
const PHASE_BITE     = 2; // Dog bites! Man jolts back (2.5 s)
const PHASE_RUN      = 3; // Man flees, dog gives chase (4.5 s)

const PHASE_DURATIONS = [1500, 2000, 2000, 4000]; // ms each

// ─── Particle pools ────────────────────────────────────────────────────────────
const MAX_STARS = 8;
const MAX_DUST  = 10;

interface StarPop { active: boolean; x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number }
interface DustPuff { active: boolean; x: number; y: number; vx: number; vy: number; size: number; life: number; maxLife: number }

// ─── Module-level state (pre-allocated) ────────────────────────────────────────
let canvasW = 0;
let canvasH = 0;
let groundY = 0;

let phase = PHASE_APPROACH;
let phaseTime = 0;

let manX = 0;
let manY = 0;
let dogX = 0;
let dogY = 0;

let manLegPhase = 0;
let dogLegPhase = 0;
let biteShake    = 0;

let starIdx = 0;
let dustIdx = 0;
let stars: StarPop[] = [];
let dustPuffs: DustPuff[] = [];

function resetPhase(p: number): void {
  phase = p;
  phaseTime = 0;
}

// ─── Draw helpers ──────────────────────────────────────────────────────────────

/** Stick-figure man. Origin translated to (manX, groundY) before this call. */
function drawMan(
  api: ActorUpdateAPI,
  t: number,
  phaseProgress: number,
  legSwing: number,
  facingLeft: boolean,
  isDark: boolean,
): void {
  const flipX = facingLeft ? -1 : 1;
  const skinColor  = 0xf5c5a3;
  const shirtColor = isDark ? 0x5588ee : 0x3366cc;
  const pantsColor = isDark ? 0x556688 : 0x334466;

  // How much the man crouches (0–25 px) during PET phase
  let crouch = 0;
  let bodyTilt = 0;
  if (phase === PHASE_PET) {
    crouch    = Math.min(1, phaseProgress * 2.5) * 25;
    bodyTilt  = Math.min(1, phaseProgress * 2.5) * 0.3 * flipX;
  }
  if (phase === PHASE_BITE) {
    // Jolt upright → lean back
    const j = Math.min(1, phaseProgress * 3);
    crouch   = Math.max(0, 25 * (1 - j));
    bodyTilt = -0.3 * j * flipX;
  }

  const hipY      = -35 - crouch;
  const shoulderY = hipY - 42;
  const headY     = shoulderY - 22;

  api.brush.pushMatrix();
  api.brush.scale(flipX, 1);

  // --- Legs ---
  api.brush.line(0, hipY, -8 + legSwing, 0, { color: pantsColor, width: 7, alpha: 0.9 });
  api.brush.line(0, hipY,  8 - legSwing, 0, { color: pantsColor, width: 7, alpha: 0.9 });
  // Shoes
  api.brush.ellipse(-8 + legSwing, -2, 8, 4, { fill: 0x222222, alpha: 0.9 });
  api.brush.ellipse( 8 - legSwing, -2, 8, 4, { fill: 0x222222, alpha: 0.9 });

  // --- Torso ---
  api.brush.pushMatrix();
  api.brush.translate(0, hipY);
  api.brush.rotate(bodyTilt);

  api.brush.ellipse(0, -20, 14, 22, { fill: shirtColor, alpha: 0.9 });

  // --- Arms ---
  const armSwing = Math.sin(manLegPhase * 6 + Math.PI) * 10;

  // Right arm (facing side): extended forward during PET
  let rightHandX = 20 + armSwing;
  let rightHandY = -5;
  if (phase === PHASE_PET) {
    rightHandX = 20 + phaseProgress * 18;
    rightHandY = -12;
  }
  if (phase === PHASE_BITE && phaseProgress < 0.4) {
    rightHandX = 28 - phaseProgress * 60;
    rightHandY = -14;
  }
  api.brush.line(10, -38, rightHandX, rightHandY, { color: skinColor, width: 4, alpha: 0.9 });
  api.brush.circle(rightHandX, rightHandY, 3.5, { fill: skinColor, alpha: 0.9 });

  // Left arm
  const leftHandX = -20 - armSwing * 0.6;
  const leftHandY = -5 + armSwing * 0.3;
  api.brush.line(-10, -38, leftHandX, leftHandY, { color: skinColor, width: 4, alpha: 0.9 });
  api.brush.circle(leftHandX, leftHandY, 3.5, { fill: skinColor, alpha: 0.9 });

  // --- Head ---
  api.brush.circle(0, shoulderY - hipY, 14, { fill: skinColor, alpha: 0.9 });
  // Hair
  api.brush.ellipse(0, shoulderY - hipY - 10, 15, 6, { fill: 0x332211, alpha: 0.9 });

  // Eyes
  const hy = shoulderY - hipY;
  const eyeW = 0xffffff;
  if (phase === PHASE_BITE || phase === PHASE_RUN) {
    // Wide/scared eyes — bigger whites
    api.brush.circle(-5, hy - 4, 4,   { fill: eyeW, alpha: 0.9 });
    api.brush.circle( 5, hy - 4, 4,   { fill: eyeW, alpha: 0.9 });
    // Tiny pupils
    api.brush.circle(-5, hy - 4, 1.2, { fill: 0x222222, alpha: 0.9 });
    api.brush.circle( 5, hy - 4, 1.2, { fill: 0x222222, alpha: 0.9 });
    // Sweat drop above eye
    if (phase === PHASE_RUN) {
      api.brush.circle(-9, hy - 12, 2.5, { fill: 0x66ccff, alpha: 0.8 * (0.5 + Math.sin(t * 6) * 0.3) });
    }
  } else {
    // Happy eyes (approach/pet)
    api.brush.circle(-5, hy - 4, 3, { fill: eyeW, alpha: 0.9 });
    api.brush.circle( 5, hy - 4, 3, { fill: eyeW, alpha: 0.9 });
    api.brush.circle(-5, hy - 4, 1.5, { fill: 0x332211, alpha: 0.9 });
    api.brush.circle( 5, hy - 4, 1.5, { fill: 0x332211, alpha: 0.9 });
  }

  // Mouth
  if (phase === PHASE_BITE || phase === PHASE_RUN) {
    // Open scream mouth
    api.brush.ellipse(0, hy + 5, 5, 6, { fill: 0x111111, alpha: 0.9 });
  } else {
    // Gentle smile
    api.brush.ellipse(0, hy + 6, 5, 2.5, { fill: 0x331100, alpha: 0.8 });
  }

  api.brush.popMatrix(); // body tilt
  api.brush.popMatrix(); // flip
}

/** Cartoon dog. Origin translated to (dogX, groundY) before this call. */
function drawDog(
  api: ActorUpdateAPI,
  t: number,
  facingRight: boolean,
  biting: boolean,
  legPhase: number,
): void {
  const bodyColor = 0x8b6914;
  const darkColor = 0x6b4c0e;
  const eyeWhite  = 0xffffff;

  const flipX = facingRight ? 1 : -1;
  const legSwing  = Math.sin(legPhase * 8) * 9;
  const jawOpen   = biting
    ? 5 + Math.sin(t * 18) * 2
    : 2 + Math.sin(t * 5) * 1.5;

  api.brush.pushMatrix();
  api.brush.scale(flipX, 1);

  // Tail (wag fast when happy, stiff up when biting)
  const tailWag = biting ? -0.5 : Math.sin(t * 10) * 12;
  api.brush.line(-22, -20, -36, -32 + tailWag, { color: darkColor, width: 5, alpha: 0.9 });

  // Back legs
  api.brush.line(-14, -5, -18 + legSwing * 0.4,  16, { color: bodyColor, width: 5, alpha: 0.9 });
  api.brush.line( -8, -5,  -4 - legSwing * 0.4,  16, { color: bodyColor, width: 5, alpha: 0.9 });
  // Front legs
  api.brush.line( 10, -5,  14 + legSwing * 0.5,  16, { color: bodyColor, width: 5, alpha: 0.9 });
  api.brush.line(  6, -5,   2 - legSwing * 0.5,  16, { color: bodyColor, width: 5, alpha: 0.9 });

  // Body
  api.brush.ellipse(0, -14, 28, 14, { fill: bodyColor, alpha: 0.9 });
  // Belly patch
  api.brush.ellipse(0, -10, 20, 8, { fill: 0xc4a050, alpha: 0.7 });

  // Head
  api.brush.circle(22, -20, 12, { fill: bodyColor, alpha: 0.9 });
  // Snout
  api.brush.ellipse(33, -17, 10, 7, { fill: 0xa07820, alpha: 0.9 });
  // Nose
  api.brush.circle(40, -18, 2.5, { fill: 0x222222, alpha: 0.9 });

  // Jaws
  api.brush.ellipse(34, -21 - jawOpen * 0.3, 9, 3.5, { fill: 0xcc2222, alpha: 0.9 });
  api.brush.ellipse(34, -14 + jawOpen * 0.3, 9, 3.5, { fill: 0xaa1111, alpha: 0.9 });
  // Teeth
  for (let ti = 0; ti < 4; ti++) {
    const tx = 28 + ti * 3.5;
    api.brush.rect(tx, -21 - jawOpen * 0.2, 2.5, 3, { fill: 0xffffff, alpha: 0.9 });
    api.brush.rect(tx, -14 + jawOpen * 0.2, 2.5, 3, { fill: 0xffffff, alpha: 0.9 });
  }

  // Eyes — angry brows
  api.brush.circle(16, -24, 3.5, { fill: eyeWhite, alpha: 0.9 });
  api.brush.circle(26, -24, 3.5, { fill: eyeWhite, alpha: 0.9 });
  const pupilColor = biting ? 0xcc2200 : 0x222222;
  api.brush.circle(16, -24, 2, { fill: pupilColor, alpha: 0.9 });
  api.brush.circle(26, -24, 2, { fill: pupilColor, alpha: 0.9 });
  api.brush.line(13, -29, 19, -27, { color: 0x222222, width: 2.5, alpha: 0.9 });
  api.brush.line(29, -27, 23, -29, { color: 0x222222, width: 2.5, alpha: 0.9 });

  // Ears
  api.brush.polygon(
    [{ x: 14, y: -28 }, { x: 10, y: -40 }, { x: 20, y: -30 }],
    { fill: darkColor, alpha: 0.9 },
  );
  api.brush.polygon(
    [{ x: 24, y: -28 }, { x: 28, y: -40 }, { x: 18, y: -30 }],
    { fill: darkColor, alpha: 0.9 },
  );

  api.brush.popMatrix();
}

// ─── Actor ─────────────────────────────────────────────────────────────────────
const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    groundY = canvasH * 0.78;

    phase     = PHASE_APPROACH;
    phaseTime = 0;
    manX      = canvasW * 0.75;
    manY      = groundY;
    dogX      = canvasW * 0.22;
    dogY      = groundY;
    manLegPhase = 0;
    dogLegPhase = 0;
    biteShake   = 0;
    starIdx     = 0;
    dustIdx     = 0;

    stars = [];
    for (let i = 0; i < MAX_STARS; i++) {
      stars.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 30, size: 5 });
    }
    dustPuffs = [];
    for (let i = 0; i < MAX_DUST; i++) {
      dustPuffs.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, size: 0, life: 0, maxLife: 25 });
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const dt   = frame.deltaTime / 16.67;
    const t    = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();

    phaseTime += frame.deltaTime;
    const phaseProgress = Math.min(1, phaseTime / PHASE_DURATIONS[phase]);

    // ── Phase transitions & movement ─────────────────────────────────────────
    if (phase === PHASE_APPROACH) {
      // Man walks left toward dog
      const targetX = dogX + 68;
      if (manX > targetX) {
        manX -= 1.8 * dt;
        manLegPhase += 0.3 * dt;
      }
      // Dust from man's feet while walking
      if (frame.frameCount % 5 === 0 && manX > targetX + 5) {
        const d = dustPuffs[dustIdx % MAX_DUST];
        d.x = manX + 10; d.y = groundY + 2;
        d.vx = 0.6 + Math.random() * 0.4; d.vy = -0.2 - Math.random() * 0.3;
        d.size = 3 + Math.random() * 3; d.life = 0; d.maxLife = 18 + Math.random() * 8;
        d.active = true; dustIdx++;
      }
      if (phaseTime >= PHASE_DURATIONS[PHASE_APPROACH]) resetPhase(PHASE_PET);
    } else if (phase === PHASE_PET) {
      // Both stay still; man leans down
      if (phaseTime >= PHASE_DURATIONS[PHASE_PET]) {
        resetPhase(PHASE_BITE);
        biteShake = 1;
        // Spawn pain stars
        for (let i = 0; i < MAX_STARS; i++) {
          const s = stars[starIdx % MAX_STARS];
          const angle = (i / MAX_STARS) * Math.PI * 2;
          s.x = manX + 30; s.y = groundY - 20;
          s.vx = Math.cos(angle) * (1.5 + Math.random());
          s.vy = Math.sin(angle) * (1.5 + Math.random()) - 1;
          s.size = 4 + Math.random() * 5;
          s.life = 0; s.maxLife = 35 + Math.random() * 15;
          s.active = true; starIdx++;
        }
      }
    } else if (phase === PHASE_BITE) {
      biteShake *= 0.96;
      // Dog shakes the man
      const shake = Math.sin(t * 22) * 3 * biteShake;
      dogX = manX - 55 + shake * 0.4;
      manX += shake * 0.5;
      if (phaseTime >= PHASE_DURATIONS[PHASE_BITE]) {
        resetPhase(PHASE_RUN);
        biteShake = 0;
      }
    } else if (phase === PHASE_RUN) {
      // Man flees right; dog chases
      manX += 2.2 * dt;
      dogX += 1.9 * dt;
      manLegPhase += 0.42 * dt;
      dogLegPhase += 0.48 * dt;
      // Dust from both
      if (frame.frameCount % 4 === 0) {
        const d = dustPuffs[dustIdx % MAX_DUST];
        d.x = manX - 10; d.y = groundY + 2;
        d.vx = -0.7 - Math.random() * 0.4; d.vy = -0.3 - Math.random() * 0.3;
        d.size = 3 + Math.random() * 4; d.life = 0; d.maxLife = 20;
        d.active = true; dustIdx++;
      }
      // Loop when off-screen
      if (manX > canvasW + 80) {
        manX = canvasW * 0.75;
        dogX = canvasW * 0.22;
        manLegPhase = 0;
        dogLegPhase = 0;
        resetPhase(PHASE_APPROACH);
      }
    }

    // ── Dust puffs ────────────────────────────────────────────────────────────
    for (let i = 0; i < MAX_DUST; i++) {
      const d = dustPuffs[i];
      if (!d.active) continue;
      d.x += d.vx * dt; d.y += d.vy * dt; d.life += dt;
      if (d.life >= d.maxLife) { d.active = false; continue; }
      const alpha = 0.45 * (1 - d.life / d.maxLife);
      if (alpha < 0.05) continue;
      api.brush.circle(d.x, d.y, d.size * (1 + d.life / d.maxLife * 0.5), {
        fill: isDark ? 0x998877 : 0xbbaa88, alpha,
      });
    }

    // ── Pain stars ─────────────────────────────────────────────────────────────
    for (let i = 0; i < MAX_STARS; i++) {
      const s = stars[i];
      if (!s.active) continue;
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.vy += 0.04 * dt; // gravity
      s.life += dt;
      if (s.life >= s.maxLife) { s.active = false; continue; }
      const alpha = 0.9 * (1 - s.life / s.maxLife);
      if (alpha < 0.05) continue;
      api.brush.star(s.x, s.y, s.size, s.size * 0.45, 5, { fill: 0xffdd00, alpha });
    }

    // ── Man ───────────────────────────────────────────────────────────────────
    const manShake = (phase === PHASE_BITE) ? Math.sin(t * 22) * 2.5 * biteShake : 0;
    const legSwing  = Math.sin(manLegPhase * 6) * 12;

    api.brush.pushMatrix();
    api.brush.translate(manX + manShake, manY);
    drawMan(api, t, phaseProgress, legSwing, false, isDark);
    api.brush.popMatrix();

    // ── Dog ───────────────────────────────────────────────────────────────────
    const dogFacingRight = phase !== PHASE_APPROACH;
    // During approach and pet the dog is on the left facing the man (right),
    // during bite/run the dog is also moving right.
    const biting = phase === PHASE_BITE;
    api.brush.pushMatrix();
    api.brush.translate(dogX, dogY);
    drawDog(api, t, dogFacingRight, biting, dogLegPhase);
    api.brush.popMatrix();

    if (phase === PHASE_PET && phaseProgress < 0.2) {
      const alpha = Math.min(1, phaseProgress * 5) * (1 - phaseProgress * 1.2);
      if (alpha > 0.05) {
        api.brush.text('Who\'s a good boy???', manX - 55, manY - 115, {
          fontSize: 16,
          fill: isDark ? 0xffffff : 0x222222,
          alpha,
        });
      }
    }
    if (phase === PHASE_BITE) {
      const pulse = 0.7 + Math.sin(t * 14) * 0.25;
      api.brush.text('AAAAAAAAAAAAAA', manX - 28, manY - 130, {
        fontSize: 26,
        fill: 0xff2222,
        alpha: Math.min(1, phaseProgress * 6) * pulse,
      });
    }

    // ── Action lines (chase / bite) ───────────────────────────────────────────
    if (phase === PHASE_RUN) {
      for (let i = 0; i < 4; i++) {
        const ly = groundY - 18 - i * 14 + Math.sin(t * 4 + i) * 4;
        const lx = dogX - 14 - i * 8;
        const alpha = 0.3 - i * 0.06;
        if (alpha < 0.05) continue;
        api.brush.line(lx, ly, lx - 22 - i * 4, ly, {
          color: isDark ? 0xcccccc : 0x777777, width: 2.5, alpha,
        });
      }
    }

    // ── Ground ────────────────────────────────────────────────────────────────
    api.brush.line(0, groundY + 22, canvasW, groundY + 22, {
      color: isDark ? 0x555555 : 0x998877, width: 3, alpha: 0.6,
    });
  },

  async teardown(): Promise<void> {
    canvasW = 0; canvasH = 0; groundY = 0;
    phase = PHASE_APPROACH; phaseTime = 0;
    manX = 0; manY = 0; dogX = 0; dogY = 0;
    manLegPhase = 0; dogLegPhase = 0; biteShake = 0;
    stars = []; dustPuffs = [];
  },
};

registerActor(actor);
export default actor;
