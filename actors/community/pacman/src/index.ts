import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'pacman',
  name: 'Pacman',
  description: 'Classic Pacman chomping pills along a winding path',
  author: { name: 'Jan', github: 'janw-ll' },
  version: '1.0.0',
  tags: ['retro', 'game', 'pacman', 'arcade'],
  createdAt: new Date(),
  preferredDuration: 30,
  requiredContexts: ['display'],
};

// --- Constants ---
const MAX_PILLS = 60;
const PACMAN_RADIUS = 14;
const PILL_RADIUS = 3;
const POWER_PILL_RADIUS = 6;
const PACMAN_SPEED = 1.8;
const CHOMP_SPEED = 8;
const PILL_SPACING = 22;

// --- Pre-allocated state ---
interface Pill { active: boolean; x: number; y: number; power: boolean }
interface Ghost {
  x: number; y: number; vx: number; vy: number;
  color: number; scaredTimer: number; eyeOnly: boolean;
}

let pills: Pill[] = [];
let ghosts: Ghost[] = [];
let pacX = 0;
let pacY = 0;
let pacDirX = 1;
let pacDirY = 0;
let pacTargetIdx = 0;
let mouthAngle = 0;
let canvasW = 0;
let canvasH = 0;
let score = 0;

// Waypoints for Pacman's path (pre-allocated, filled in setup)
const MAX_WAYPOINTS = 20;
let waypoints: { x: number; y: number }[] = [];
let waypointCount = 0;

// Ghost colors
const GHOST_COLORS = [0xff0000, 0xffb8ff, 0x00ffff, 0xffb852];

function buildPath(w: number, h: number) {
  const margin = 30;
  const cols = 3;
  const rowH = (h - margin * 2) / 4;
  waypointCount = 0;

  // Serpentine path across the canvas
  for (let row = 0; row <= 4; row++) {
    const y = margin + row * rowH;
    if (row % 2 === 0) {
      for (let c = 0; c <= cols; c++) {
        if (waypointCount >= MAX_WAYPOINTS) break;
        waypoints[waypointCount] = { x: margin + c * ((w - margin * 2) / cols), y };
        waypointCount++;
      }
    } else {
      for (let c = cols; c >= 0; c--) {
        if (waypointCount >= MAX_WAYPOINTS) break;
        waypoints[waypointCount] = { x: margin + c * ((w - margin * 2) / cols), y };
        waypointCount++;
      }
    }
  }
}

function placePills() {
  let pillIdx = 0;
  for (let i = 0; i < waypointCount - 1 && pillIdx < MAX_PILLS; i++) {
    const ax = waypoints[i].x;
    const ay = waypoints[i].y;
    const bx = waypoints[i + 1].x;
    const by = waypoints[i + 1].y;
    const dx = bx - ax;
    const dy = by - ay;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.floor(segLen / PILL_SPACING);
    for (let s = 1; s <= steps && pillIdx < MAX_PILLS; s++) {
      const t = s / (steps + 1);
      pills[pillIdx].active = true;
      pills[pillIdx].x = ax + dx * t;
      pills[pillIdx].y = ay + dy * t;
      pills[pillIdx].power = (pillIdx % 12 === 0);
      pillIdx++;
    }
  }
  // Deactivate remaining
  for (let i = pillIdx; i < MAX_PILLS; i++) {
    pills[i].active = false;
  }
}

function initGhosts() {
  for (let i = 0; i < 4; i++) {
    const wp = waypoints[Math.floor(Math.random() * waypointCount)];
    ghosts[i].x = wp.x;
    ghosts[i].y = wp.y;
    ghosts[i].vx = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5);
    ghosts[i].vy = (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.3);
    ghosts[i].color = GHOST_COLORS[i];
    ghosts[i].scaredTimer = 0;
    ghosts[i].eyeOnly = false;
  }
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI) {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    score = 0;

    // Pre-allocate waypoints
    waypoints = [];
    for (let i = 0; i < MAX_WAYPOINTS; i++) {
      waypoints.push({ x: 0, y: 0 });
    }

    // Pre-allocate pills
    pills = [];
    for (let i = 0; i < MAX_PILLS; i++) {
      pills.push({ active: false, x: 0, y: 0, power: false });
    }

    // Pre-allocate ghosts
    ghosts = [];
    for (let i = 0; i < 4; i++) {
      ghosts.push({ x: 0, y: 0, vx: 0, vy: 0, color: 0, scaredTimer: 0, eyeOnly: false });
    }

    buildPath(canvasW, canvasH);
    placePills();
    initGhosts();

    pacX = waypoints[0].x;
    pacY = waypoints[0].y;
    pacTargetIdx = 1;
    pacDirX = 1;
    pacDirY = 0;
    mouthAngle = 0;
  },

  update(api: ActorUpdateAPI, frame: FrameContext) {
    const t = frame.time / 1000;
    const dt = frame.deltaTime / 16.67; // normalized to 60fps
    const isDark = api.context.display.isDarkMode();

    // --- Move Pacman along waypoints ---
    if (pacTargetIdx < waypointCount) {
      const tx = waypoints[pacTargetIdx].x;
      const ty = waypoints[pacTargetIdx].y;
      const dx = tx - pacX;
      const dy = ty - pacY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < PACMAN_SPEED * dt * 2) {
        pacX = tx;
        pacY = ty;
        pacTargetIdx++;
        // Loop back
        if (pacTargetIdx >= waypointCount) {
          pacTargetIdx = 0;
          placePills(); // respawn pills
        }
      } else {
        const nx = dx / dist;
        const ny = dy / dist;
        pacX += nx * PACMAN_SPEED * dt;
        pacY += ny * PACMAN_SPEED * dt;
        pacDirX = nx;
        pacDirY = ny;
      }
    }

    // Animate mouth (chomping)
    mouthAngle = Math.abs(Math.sin(t * CHOMP_SPEED)) * 0.8;

    // --- Eat pills ---
    for (let i = 0; i < MAX_PILLS; i++) {
      if (!pills[i].active) continue;
      const dx = pills[i].x - pacX;
      const dy = pills[i].y - pacY;
      const distSq = dx * dx + dy * dy;
      const eatDist = pills[i].power ? PACMAN_RADIUS + POWER_PILL_RADIUS : PACMAN_RADIUS + PILL_RADIUS;
      if (distSq < eatDist * eatDist) {
        pills[i].active = false;
        score++;
        if (pills[i].power) {
          // Scare ghosts
          for (let g = 0; g < 4; g++) {
            ghosts[g].scaredTimer = 300; // ~5 seconds at 60fps
            ghosts[g].eyeOnly = false;
          }
        }
      }
    }

    // --- Update ghosts ---
    for (let g = 0; g < 4; g++) {
      const ghost = ghosts[g];
      if (ghost.scaredTimer > 0) ghost.scaredTimer--;

      // Move ghost
      ghost.x += ghost.vx * dt;
      ghost.y += ghost.vy * dt;

      // Bounce off walls
      if (ghost.x < 15 || ghost.x > canvasW - 15) ghost.vx *= -1;
      if (ghost.y < 15 || ghost.y > canvasH - 15) ghost.vy *= -1;
      ghost.x = Math.max(15, Math.min(canvasW - 15, ghost.x));
      ghost.y = Math.max(15, Math.min(canvasH - 15, ghost.y));

      // Check collision with Pacman
      const dx = ghost.x - pacX;
      const dy = ghost.y - pacY;
      const distSq = dx * dx + dy * dy;
      if (distSq < (PACMAN_RADIUS + 10) * (PACMAN_RADIUS + 10)) {
        if (ghost.scaredTimer > 0 && !ghost.eyeOnly) {
          ghost.eyeOnly = true;
          score += 10;
        }
      }
    }

    // --- Draw maze walls (simplified path outline) ---
    const wallColor = isDark ? 0x2233aa : 0x1122aa;
    for (let i = 0; i < waypointCount - 1; i++) {
      api.brush.line(
        waypoints[i].x, waypoints[i].y,
        waypoints[i + 1].x, waypoints[i + 1].y,
        { color: wallColor, width: 3, alpha: 0.3 }
      );
    }

    // --- Draw pills ---
    const pillColor = isDark ? 0xffcc66 : 0xffaa33;
    for (let i = 0; i < MAX_PILLS; i++) {
      if (!pills[i].active) continue;
      if (pills[i].power) {
        // Power pill pulses
        const pulse = 1 + Math.sin(t * 4) * 0.3;
        api.brush.circle(pills[i].x, pills[i].y, POWER_PILL_RADIUS * pulse, {
          fill: 0xffaaaa,
          alpha: 0.9,
          blendMode: 'add',
        });
      } else {
        api.brush.circle(pills[i].x, pills[i].y, PILL_RADIUS, {
          fill: pillColor,
          alpha: 0.85,
        });
      }
    }

    // --- Draw ghosts ---
    for (let g = 0; g < 4; g++) {
      const ghost = ghosts[g];
      const gx = ghost.x;
      const gy = ghost.y;
      const ghostSize = 12;

      if (ghost.eyeOnly) {
        // Just eyes
        api.brush.circle(gx - 3, gy - 2, 3, { fill: 0xffffff, alpha: 0.9 });
        api.brush.circle(gx + 3, gy - 2, 3, { fill: 0xffffff, alpha: 0.9 });
        api.brush.circle(gx - 3, gy - 2, 1.5, { fill: 0x1111dd, alpha: 0.9 });
        api.brush.circle(gx + 3, gy - 2, 1.5, { fill: 0x1111dd, alpha: 0.9 });
        continue;
      }

      const bodyColor = ghost.scaredTimer > 0 ? 0x2222ff : ghost.color;
      const bodyAlpha = ghost.scaredTimer > 0 && ghost.scaredTimer < 90 && Math.floor(ghost.scaredTimer / 8) % 2 === 0 ? 0.5 : 0.85;

      // Ghost body (rounded top + wavy bottom using overlapping shapes)
      api.brush.circle(gx, gy - 3, ghostSize, {
        fill: bodyColor,
        alpha: bodyAlpha,
      });
      api.brush.rect(gx - ghostSize, gy - 3, ghostSize * 2, ghostSize + 2, {
        fill: bodyColor,
        alpha: bodyAlpha,
      });
      // Wavy bottom feet
      for (let f = -1; f <= 1; f++) {
        const footX = gx + f * (ghostSize * 0.6);
        const footY = gy + ghostSize - 1;
        const wave = Math.sin(t * 6 + f * 2) * 2;
        api.brush.circle(footX, footY + wave, ghostSize * 0.35, {
          fill: bodyColor,
          alpha: bodyAlpha,
        });
      }

      // Eyes
      api.brush.circle(gx - 4, gy - 5, 4, { fill: 0xffffff, alpha: 0.95 });
      api.brush.circle(gx + 4, gy - 5, 4, { fill: 0xffffff, alpha: 0.95 });
      api.brush.circle(gx - 4, gy - 5, 2, { fill: ghost.scaredTimer > 0 ? 0xffffff : 0x1111dd, alpha: 0.95 });
      api.brush.circle(gx + 4, gy - 5, 2, { fill: ghost.scaredTimer > 0 ? 0xffffff : 0x1111dd, alpha: 0.95 });

      // Scared mouth
      if (ghost.scaredTimer > 0) {
        api.brush.line(gx - 5, gy + 2, gx + 5, gy + 2, { color: 0xffffff, width: 1.5, alpha: 0.8 });
      }
    }

    // --- Draw Pacman ---
    const angle = Math.atan2(pacDirY, pacDirX);
    const halfMouth = mouthAngle * 0.5;

    api.brush.pushMatrix();
    api.brush.translate(pacX, pacY);
    api.brush.rotate(angle);

    // Body arc (draw as a filled polygon approximation)
    const segments = 20;
    const bodyPoints: { x: number; y: number }[] = [{ x: 0, y: 0 }];
    for (let i = 0; i <= segments; i++) {
      const a = halfMouth + (Math.PI * 2 - mouthAngle) * (i / segments);
      bodyPoints.push({
        x: Math.cos(a) * PACMAN_RADIUS,
        y: Math.sin(a) * PACMAN_RADIUS,
      });
    }

    api.brush.polygon(bodyPoints, {
      fill: 0xffdd00,
      alpha: 0.95,
    });

    // Eye
    api.brush.circle(3, -PACMAN_RADIUS * 0.45, 2, { fill: 0x111111, alpha: 0.9 });

    api.brush.popMatrix();

    // --- Draw score ---
    api.brush.text(`${score}`, canvasW - 15, 18, {
      fontSize: 14,
      fill: isDark ? 0xffffff : 0xeeeeee,
      alpha: 0.7,
      align: 'right',
    });
  },

  async teardown() {
    pills = [];
    ghosts = [];
    waypoints = [];
    waypointCount = 0;
    score = 0;
    pacX = 0;
    pacY = 0;
  },
};

registerActor(actor);
export default actor;
