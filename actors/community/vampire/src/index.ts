import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'vampire',
  name: 'Vampire Bats',
  description: 'A swarm of bats flying across the screen with flapping wings and glowing red eyes',
  author: { name: 'Jan', github: 'janw-ll' },
  version: '1.0.0',
  tags: ['bats', 'swarm', 'vampire', 'spooky', 'animal'],
  createdAt: new Date(),
  preferredDuration: 30,
  requiredContexts: ['display', 'audio'],
};

const MAX_BATS = 18;

interface Bat {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  wingPhase: number;
  wingSpeed: number;
  wobble: number;
  wobbleSpeed: number;
  alpha: number;
  eyeGlow: number;
}

let bats: Bat[] = [];
let canvasW = 0;
let canvasH = 0;
let swarmCenterX = 0;
let swarmCenterY = 0;
let swarmVX = 0;
let swarmVY = 0;
let directionTimer = 0;

const BAT_BODY = 0x1a0a2e;
const BAT_WING = 0x2d1452;
const BAT_WING_INNER = 0x3a1a6a;
const EYE_RED = 0xff2222;
const EYE_GLOW = 0xff4444;

function resetBat(bat: Bat, w: number, h: number): void {
  bat.active = true;
  bat.size = 0.7 + Math.random() * 0.6;
  bat.wingPhase = Math.random() * Math.PI * 2;
  bat.wingSpeed = 5 + Math.random() * 3;
  bat.wobble = Math.random() * Math.PI * 2;
  bat.wobbleSpeed = 1.5 + Math.random() * 2;
  bat.alpha = 0.85 + Math.random() * 0.15;
  bat.eyeGlow = 0.6 + Math.random() * 0.4;
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    directionTimer = 0;

    // Swarm enters from a random edge
    const side = Math.floor(Math.random() * 4);
    if (side === 0) { swarmCenterX = -40; swarmCenterY = canvasH * 0.3; swarmVX = 0.6; swarmVY = 0.15; }
    else if (side === 1) { swarmCenterX = canvasW + 40; swarmCenterY = canvasH * 0.3; swarmVX = -0.6; swarmVY = 0.15; }
    else if (side === 2) { swarmCenterX = canvasW * 0.5; swarmCenterY = -40; swarmVX = 0.2; swarmVY = 0.5; }
    else { swarmCenterX = canvasW * 0.5; swarmCenterY = canvasH + 40; swarmVX = -0.2; swarmVY = -0.5; }

    bats = [];
    for (let i = 0; i < MAX_BATS; i++) {
      const bat: Bat = {
        active: true,
        x: swarmCenterX + (Math.random() - 0.5) * 300,
        y: swarmCenterY + (Math.random() - 0.5) * 250,
        vx: 0, vy: 0,
        size: 0, wingPhase: 0, wingSpeed: 0,
        wobble: 0, wobbleSpeed: 0, alpha: 0, eyeGlow: 0,
      };
      resetBat(bat, canvasW, canvasH);
      bats.push(bat);
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time / 1000;
    const dt = frame.deltaTime;
    const s = canvasW / 360;

    const isDark = api.context.display.isDarkMode();
    const bodyColor = isDark ? BAT_BODY : 0x2a1a3e;
    const wingColor = isDark ? BAT_WING : 0x3d2462;
    const wingInner = isDark ? BAT_WING_INNER : 0x4a2a7a;

    // Audio: bats scatter on beat
    let beatBoost = 0;
    if (api.context.audio.isAvailable() && api.context.audio.isBeat()) {
      beatBoost = 1.0;
    }

    // Update swarm direction periodically — gentle sweeping across canvas
    directionTimer += dt;
    if (directionTimer > 3000) {
      directionTimer = 0;
      // Pick a new target area on canvas
      const tx = Math.random() * canvasW;
      const ty = canvasH * 0.15 + Math.random() * canvasH * 0.5;
      const dx = tx - swarmCenterX;
      const dy = ty - swarmCenterY;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      swarmVX = (dx / dist) * (0.4 + Math.random() * 0.4);
      swarmVY = (dy / dist) * (0.3 + Math.random() * 0.3);
    }

    // Move swarm center
    swarmCenterX += swarmVX * dt * 0.06;
    swarmCenterY += swarmVY * dt * 0.06;

    // Wrap swarm center to keep bats on screen
    if (swarmCenterX < -80) swarmCenterX = canvasW + 60;
    if (swarmCenterX > canvasW + 80) swarmCenterX = -60;
    if (swarmCenterY < -80) swarmCenterY = canvasH * 0.3;
    if (swarmCenterY > canvasH + 80) swarmCenterY = canvasH * 0.2;

    for (let i = 0; i < bats.length; i++) {
      const bat = bats[i];
      if (!bat.active) continue;

      // Attraction to swarm center (flocking — very loose)
      const toSwarmX = swarmCenterX + (Math.random() - 0.5) * 350 - bat.x;
      const toSwarmY = swarmCenterY + (Math.random() - 0.5) * 280 - bat.y;
      bat.vx += toSwarmX * 0.00015;
      bat.vy += toSwarmY * 0.00015;

      // Repel from nearby bats to keep them spread out
      for (let j = 0; j < bats.length; j++) {
        if (j === i || !bats[j].active) continue;
        const rx = bat.x - bats[j].x;
        const ry = bat.y - bats[j].y;
        const distSq = rx * rx + ry * ry;
        if (distSq < 4000 && distSq > 0.1) {
          const force = 1.2 / distSq;
          bat.vx += rx * force;
          bat.vy += ry * force;
        }
      }

      // Add swarm velocity
      bat.vx += swarmVX * 0.02;
      bat.vy += swarmVY * 0.02;

      // Beat scatter
      if (beatBoost > 0) {
        bat.vx += (Math.random() - 0.5) * 2.5;
        bat.vy += (Math.random() - 0.5) * 2.0;
      }

      // Damping
      bat.vx *= 0.96;
      bat.vy *= 0.96;

      // Wobble for organic movement
      bat.wobble += bat.wobbleSpeed * dt * 0.001;
      const wobbleX = Math.sin(bat.wobble) * 0.6;
      const wobbleY = Math.cos(bat.wobble * 1.3) * 0.45;

      bat.x += (bat.vx + wobbleX) * dt * 0.06;
      bat.y += (bat.vy + wobbleY) * dt * 0.06;

      // Wrap individual bats
      if (bat.x < -60) bat.x = canvasW + 40;
      if (bat.x > canvasW + 60) bat.x = -40;
      if (bat.y < -60) bat.y = canvasH + 40;
      if (bat.y > canvasH + 60) bat.y = -40;

      // Wing flap
      bat.wingPhase += bat.wingSpeed * dt * 0.001;
      const wingFlap = Math.sin(bat.wingPhase);
      const wingAngle = wingFlap * 0.65;

      // Determine facing direction from velocity
      const facingLeft = bat.vx < 0;
      const tiltAngle = Math.atan2(bat.vy, Math.abs(bat.vx)) * 0.3;

      const bs = bat.size * s;

      api.brush.pushMatrix();
      api.brush.translate(bat.x, bat.y);
      if (facingLeft) api.brush.scale(-1, 1);
      api.brush.rotate(tiltAngle);

      // Left wing
      api.brush.pushMatrix();
      api.brush.translate(-4 * bs, -1 * bs);
      api.brush.rotate(-0.2 - wingAngle);
      // Wing membrane (outer)
      api.brush.polygon([
        { x: 0, y: 0 },
        { x: -18 * bs, y: -8 * bs },
        { x: -22 * bs, y: -3 * bs },
        { x: -16 * bs, y: 4 * bs },
        { x: -8 * bs, y: 6 * bs },
        { x: 0, y: 3 * bs },
      ], { fill: wingColor, alpha: bat.alpha * 0.9 });
      // Wing fingers
      api.brush.line(0, 0, -18 * bs, -8 * bs, { color: bodyColor, width: 1.5 * bs, alpha: bat.alpha * 0.7 });
      api.brush.line(0, 1 * bs, -20 * bs, -2 * bs, { color: bodyColor, width: 1 * bs, alpha: bat.alpha * 0.5 });
      // Inner wing highlight
      api.brush.polygon([
        { x: -2 * bs, y: 0 },
        { x: -12 * bs, y: -4 * bs },
        { x: -14 * bs, y: 0 },
        { x: -8 * bs, y: 4 * bs },
      ], { fill: wingInner, alpha: bat.alpha * 0.4 });
      api.brush.popMatrix();

      // Right wing
      api.brush.pushMatrix();
      api.brush.translate(4 * bs, -1 * bs);
      api.brush.rotate(0.2 + wingAngle);
      api.brush.polygon([
        { x: 0, y: 0 },
        { x: 18 * bs, y: -8 * bs },
        { x: 22 * bs, y: -3 * bs },
        { x: 16 * bs, y: 4 * bs },
        { x: 8 * bs, y: 6 * bs },
        { x: 0, y: 3 * bs },
      ], { fill: wingColor, alpha: bat.alpha * 0.9 });
      api.brush.line(0, 0, 18 * bs, -8 * bs, { color: bodyColor, width: 1.5 * bs, alpha: bat.alpha * 0.7 });
      api.brush.line(0, 1 * bs, 20 * bs, -2 * bs, { color: bodyColor, width: 1 * bs, alpha: bat.alpha * 0.5 });
      api.brush.polygon([
        { x: 2 * bs, y: 0 },
        { x: 12 * bs, y: -4 * bs },
        { x: 14 * bs, y: 0 },
        { x: 8 * bs, y: 4 * bs },
      ], { fill: wingInner, alpha: bat.alpha * 0.4 });
      api.brush.popMatrix();

      // Body
      api.brush.ellipse(0, 0, 5 * bs, 7 * bs, { fill: bodyColor, alpha: bat.alpha });

      // Head
      api.brush.circle(0, -7 * bs, 4 * bs, { fill: bodyColor, alpha: bat.alpha });

      // Ears
      api.brush.polygon([
        { x: -3.5 * bs, y: -9 * bs },
        { x: -1.5 * bs, y: -14 * bs },
        { x: 0, y: -9 * bs },
      ], { fill: bodyColor, alpha: bat.alpha });
      api.brush.polygon([
        { x: 0, y: -9 * bs },
        { x: 1.5 * bs, y: -14 * bs },
        { x: 3.5 * bs, y: -9 * bs },
      ], { fill: bodyColor, alpha: bat.alpha });

      // Eyes — glowing red
      const glowPulse = 0.7 + Math.sin(t * 3 + i) * 0.3;
      api.brush.circle(-2 * bs, -7.5 * bs, 1.2 * bs, {
        fill: EYE_RED, alpha: bat.alpha * bat.eyeGlow * glowPulse,
      });
      api.brush.circle(2 * bs, -7.5 * bs, 1.2 * bs, {
        fill: EYE_RED, alpha: bat.alpha * bat.eyeGlow * glowPulse,
      });
      // Eye glow (additive)
      api.brush.circle(-2 * bs, -7.5 * bs, 2.5 * bs, {
        fill: EYE_GLOW, alpha: bat.alpha * 0.25 * glowPulse, blendMode: 'add',
      });
      api.brush.circle(2 * bs, -7.5 * bs, 2.5 * bs, {
        fill: EYE_GLOW, alpha: bat.alpha * 0.25 * glowPulse, blendMode: 'add',
      });

      // Tiny fangs
      api.brush.polygon([
        { x: -1 * bs, y: -5 * bs },
        { x: -0.5 * bs, y: -3 * bs },
        { x: 0, y: -5 * bs },
      ], { fill: 0xdddddd, alpha: bat.alpha * 0.7 });
      api.brush.polygon([
        { x: 0, y: -5 * bs },
        { x: 0.5 * bs, y: -3 * bs },
        { x: 1 * bs, y: -5 * bs },
      ], { fill: 0xdddddd, alpha: bat.alpha * 0.7 });

      api.brush.popMatrix();
    }
  },

  async teardown(): Promise<void> {
    bats = [];
    canvasW = 0;
    canvasH = 0;
    swarmCenterX = 0;
    swarmCenterY = 0;
    swarmVX = 0;
    swarmVY = 0;
    directionTimer = 0;
  },
};

registerActor(actor);
export default actor;
