/**
 * EP Castello dei Medici — Foreground Actor
 *
 * The Castello dei Medici is the Italian-themed hotel at Europa-Park,
 * a grand Renaissance palazzo with terracotta walls, arched windows,
 * a bell tower, and Mediterranean cypress trees. Rendered against
 * a warm Italian sunset sky with animated fountain, flickering
 * window lights, and gently swaying cypress trees.
 */

import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'ep-castello-medici',
  name: 'EP Castello dei Medici',
  description:
    'Grand Renaissance Italian palazzo with terracotta walls, arched windows, bell tower, cypress trees, and an animated fountain against a warm sunset sky',
  author: { name: 'Taco Verdonschot', github: 'tacoverdonschot' },
  version: '1.0.0',
  tags: ['europapark', 'castello', 'italian', 'renaissance', 'palazzo'],
  createdAt: new Date('2026-03-20'),
  role: 'foreground',
  preferredDuration: 60,
  requiredContexts: ['display'],
};

// ── Constants ────────────────────────────────────────────────
const MAX_WINDOWS = 24;
const MAX_CYPRESS = 5;
const MAX_FOUNTAIN_DROPS = 30;
const MAX_ROOF_TILES = 20;

// Colors (numeric 0xRRGGBB)
const COL_TERRACOTTA = 0xc47a4a;
const COL_TERRACOTTA_DARK = 0x9e5e34;
const COL_TERRACOTTA_LIGHT = 0xd99a6a;
const COL_OCHRE = 0xd4a855;
const COL_OCHRE_LIGHT = 0xe6c47a;
const COL_ROOF_TILE = 0x8b4513;
const COL_ROOF_TILE_LIGHT = 0xa0522d;
const COL_WINDOW_GOLD = 0xffd080;
const COL_WINDOW_GOLD_LIGHT = 0xffe4a8;
const COL_WINDOW_DARK = 0x2a1a0a;
const COL_WINDOW_LIGHT_MODE = 0x4a3520;
const COL_ARCH_STONE = 0xd9c9a5;
const COL_ARCH_STONE_LIGHT = 0xe8dcc0;
const COL_TOWER_TOP = 0x6b3a20;
const COL_TOWER_TOP_LIGHT = 0x8b5a3a;
const COL_SKY_TOP_DARK = 0x1a0a2e;
const COL_SKY_TOP_LIGHT = 0x4a7fb5;
const COL_SKY_MID_DARK = 0x6b2040;
const COL_SKY_MID_LIGHT = 0xe8a060;
const COL_SKY_BOTTOM_DARK = 0xd4601a;
const COL_SKY_BOTTOM_LIGHT = 0xffd090;
const COL_CYPRESS_DARK = 0x1a4a2a;
const COL_CYPRESS_LIGHT = 0x2a6a3a;
const COL_CYPRESS_SHADOW_DARK = 0x0e3018;
const COL_CYPRESS_SHADOW_LIGHT = 0x1e5028;
const COL_FOUNTAIN_STONE = 0xb0a090;
const COL_FOUNTAIN_STONE_LIGHT = 0xc8bca8;
const COL_WATER = 0x88ccee;
const COL_WATER_LIGHT = 0x6aabe0;
const COL_GROUND = 0x5a4a3a;
const COL_GROUND_LIGHT = 0x8a7a6a;

// ── State types ──────────────────────────────────────────────
interface WindowState {
  active: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  flickerPhase: number;
  flickerSpeed: number;
}

interface CypressState {
  active: boolean;
  x: number;
  baseY: number;
  height: number;
  width: number;
  swayPhase: number;
  swaySpeed: number;
}

interface FountainDrop {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

// ── Pre-allocated state ──────────────────────────────────────
let canvasW = 0;
let canvasH = 0;
let windows: WindowState[] = [];
let cypresses: CypressState[] = [];
let fountainDrops: FountainDrop[] = [];
let glowDataUrl = '';

// Building layout computed in setup
let buildingBaseY = 0;
let buildingLeft = 0;
let buildingRight = 0;
let buildingWidth = 0;
let buildingTopY = 0;
let towerLeft = 0;
let towerRight = 0;
let towerTopY = 0;
let towerWidth = 0;
let fountainX = 0;
let fountainBaseY = 0;
let groundY = 0;

// Reusable style objects
const rectStyle = { fill: 0, alpha: 1.0, blendMode: 'normal' as const };
const circleStyle = { fill: 0, alpha: 1.0, blendMode: 'normal' as const };
const lineStyle = { color: 0, width: 3, alpha: 1.0, blendMode: 'normal' as const };
const imageStyle = { width: 0, height: 0, tint: 0, alpha: 1.0, blendMode: 'add' as const };

// Spawn counter for fountain drops
let nextDropIndex = 0;

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    // Layout constants
    groundY = canvasH * 0.82;
    buildingBaseY = groundY;
    buildingLeft = canvasW * 0.1;
    buildingRight = canvasW * 0.9;
    buildingWidth = buildingRight - buildingLeft;
    buildingTopY = canvasH * 0.25;

    // Bell tower on the right
    towerWidth = buildingWidth * 0.18;
    towerLeft = buildingRight - towerWidth - buildingWidth * 0.05;
    towerRight = towerLeft + towerWidth;
    towerTopY = canvasH * 0.1;

    // Fountain centered in front
    fountainX = canvasW * 0.5;
    fountainBaseY = canvasH * 0.9;

    // Pre-allocate windows (3 rows x 8 columns = 24 max)
    windows = [];
    const windowRows = 3;
    const windowCols = 6;
    let wIdx = 0;
    const winMarginX = buildingWidth * 0.06;
    const winAreaW = buildingWidth - winMarginX * 2;
    const winW = winAreaW / windowCols * 0.55;
    const winH = winW * 1.6;
    const winSpacingX = winAreaW / windowCols;
    const rowStartY = buildingTopY + (buildingBaseY - buildingTopY) * 0.12;
    const rowHeight = (buildingBaseY - buildingTopY - (buildingBaseY - buildingTopY) * 0.2) / windowRows;

    for (let i = 0; i < MAX_WINDOWS; i++) {
      const row = Math.floor(i / windowCols);
      const col = i % windowCols;
      const active = row < windowRows && col < windowCols;
      const wx = buildingLeft + winMarginX + col * winSpacingX + winSpacingX * 0.5;
      const wy = rowStartY + row * rowHeight + rowHeight * 0.45;

      // Skip windows that overlap the tower
      const overlaps = active && wx > towerLeft - winW * 0.5 && wx < towerRight + winW * 0.5;

      windows.push({
        active: active && !overlaps && wIdx < MAX_WINDOWS,
        x: wx,
        y: wy,
        w: winW,
        h: winH,
        flickerPhase: Math.random() * Math.PI * 2,
        flickerSpeed: 0.8 + Math.random() * 1.5,
      });
      if (active && !overlaps) wIdx++;
    }

    // Pre-allocate cypress trees
    cypresses = [];
    const cypressPositions = [
      { x: canvasW * 0.02, h: canvasH * 0.35 },
      { x: canvasW * 0.06, h: canvasH * 0.4 },
      { x: canvasW * 0.94, h: canvasH * 0.38 },
      { x: canvasW * 0.98, h: canvasH * 0.33 },
      { x: canvasW * 0.5, h: canvasH * 0.18 },
    ];
    for (let i = 0; i < MAX_CYPRESS; i++) {
      const pos = cypressPositions[i];
      cypresses.push({
        active: true,
        x: pos.x,
        baseY: groundY,
        height: pos.h,
        width: pos.h * 0.16,
        swayPhase: Math.random() * Math.PI * 2,
        swaySpeed: 0.4 + Math.random() * 0.4,
      });
    }
    // The last cypress is smaller, in front of the building
    cypresses[4].baseY = fountainBaseY - 15;
    cypresses[4].width = cypresses[4].height * 0.14;

    // Pre-allocate fountain drops
    fountainDrops = [];
    for (let i = 0; i < MAX_FOUNTAIN_DROPS; i++) {
      fountainDrops.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 0,
        size: 0,
      });
    }
    nextDropIndex = 0;

    // Pre-render glow texture
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.3)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    glowDataUrl = c.toDataURL();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time;
    const tSec = t / 1000;
    const isDark = api.context.display.isDarkMode();
    const dt = frame.deltaTime;

    // ── SKY ──────────────────────────────────────────────────
    const skyTop = isDark ? COL_SKY_TOP_DARK : COL_SKY_TOP_LIGHT;
    const skyMid = isDark ? COL_SKY_MID_DARK : COL_SKY_MID_LIGHT;
    const skyBottom = isDark ? COL_SKY_BOTTOM_DARK : COL_SKY_BOTTOM_LIGHT;

    // Sky gradient top portion
    api.brush.rect(0, 0, canvasW, canvasH * 0.45, {
      fill: {
        type: 'linear',
        x0: 0.5, y0: 0,
        x1: 0.5, y1: 1,
        stops: [
          { offset: 0, color: skyTop },
          { offset: 1, color: skyMid },
        ],
      },
      alpha: 0.9,
      blendMode: 'normal',
    });

    // Sky gradient lower portion
    api.brush.rect(0, canvasH * 0.3, canvasW, canvasH * 0.55, {
      fill: {
        type: 'linear',
        x0: 0.5, y0: 0,
        x1: 0.5, y1: 1,
        stops: [
          { offset: 0, color: skyMid },
          { offset: 1, color: skyBottom },
        ],
      },
      alpha: 0.85,
      blendMode: 'normal',
    });

    // Sun glow near horizon
    const sunX = canvasW * 0.3;
    const sunY = canvasH * 0.42;
    imageStyle.width = 180;
    imageStyle.height = 180;
    imageStyle.tint = isDark ? 0xff6020 : 0xffaa50;
    imageStyle.alpha = isDark ? 0.25 : 0.35;
    imageStyle.blendMode = 'add';
    api.brush.image(glowDataUrl, sunX, sunY, imageStyle);

    // ── GROUND ───────────────────────────────────────────────
    rectStyle.fill = isDark ? COL_GROUND : COL_GROUND_LIGHT;
    rectStyle.alpha = 0.95;
    rectStyle.blendMode = 'normal';
    api.brush.rect(0, groundY, canvasW, canvasH - groundY, rectStyle);

    // Cobblestone forecourt
    const courtColor = isDark ? 0x70604a : 0x9a8a70;
    rectStyle.fill = courtColor;
    rectStyle.alpha = 0.8;
    api.brush.rect(buildingLeft - 10, groundY, buildingWidth + 20, canvasH * 0.12, rectStyle);

    // ── MAIN BUILDING ────────────────────────────────────────
    const wallColor = isDark ? COL_TERRACOTTA : COL_TERRACOTTA_LIGHT;
    const wallDark = isDark ? COL_TERRACOTTA_DARK : COL_TERRACOTTA;

    // Main wall
    api.brush.rect(buildingLeft, buildingTopY, buildingWidth, buildingBaseY - buildingTopY, {
      fill: {
        type: 'linear',
        x0: 0.5, y0: 0,
        x1: 0.5, y1: 1,
        stops: [
          { offset: 0, color: wallColor },
          { offset: 1, color: wallDark },
        ],
      },
      alpha: 0.95,
      blendMode: 'normal',
    });

    // Decorative cornice at top
    const corniceColor = isDark ? COL_ARCH_STONE : COL_ARCH_STONE_LIGHT;
    rectStyle.fill = corniceColor;
    rectStyle.alpha = 0.9;
    api.brush.rect(buildingLeft - 4, buildingTopY - 4, buildingWidth + 8, 10, rectStyle);

    // Cornice shadow line
    lineStyle.color = wallDark;
    lineStyle.width = 2.5;
    lineStyle.alpha = 0.6;
    lineStyle.blendMode = 'normal';
    api.brush.line(buildingLeft, buildingTopY + 8, buildingRight, buildingTopY + 8, lineStyle);

    // Mid-building string course (horizontal divider)
    const midCourseY1 = buildingTopY + (buildingBaseY - buildingTopY) * 0.35;
    const midCourseY2 = buildingTopY + (buildingBaseY - buildingTopY) * 0.67;
    rectStyle.fill = corniceColor;
    rectStyle.alpha = 0.7;
    api.brush.rect(buildingLeft, midCourseY1 - 2, buildingWidth, 5, rectStyle);
    api.brush.rect(buildingLeft, midCourseY2 - 2, buildingWidth, 5, rectStyle);

    // ── ROOF TILES ───────────────────────────────────────────
    const roofColor = isDark ? COL_ROOF_TILE : COL_ROOF_TILE_LIGHT;
    const roofY = buildingTopY - 15;
    const roofHeight = 18;

    // Roof base
    rectStyle.fill = roofColor;
    rectStyle.alpha = 0.9;
    api.brush.rect(buildingLeft - 6, roofY, buildingWidth + 12, roofHeight, rectStyle);

    // Decorative dentils under the cornice
    const dentilCount = Math.min(MAX_ROOF_TILES, 18);
    const dentilSpacing = (buildingWidth + 8) / dentilCount;
    rectStyle.fill = corniceColor;
    rectStyle.alpha = 0.7;
    for (let i = 0; i < dentilCount; i++) {
      const dx = buildingLeft - 2 + i * dentilSpacing;
      api.brush.rect(dx, buildingTopY - 6, dentilSpacing * 0.4, 5, rectStyle);
    }

    // ── BELL TOWER ───────────────────────────────────────────
    const towerColor = isDark ? COL_TERRACOTTA_DARK : COL_TERRACOTTA;

    // Tower body
    api.brush.rect(towerLeft, towerTopY + 30, towerWidth, buildingTopY - towerTopY - 30 + 5, {
      fill: {
        type: 'linear',
        x0: 0,
        y0: 0.5,
        x1: 1,
        y1: 0.5,
        stops: [
          { offset: 0, color: wallColor },
          { offset: 0.5, color: wallDark },
          { offset: 1, color: wallColor },
        ],
      },
      alpha: 0.95,
      blendMode: 'normal',
    });

    // Tower pyramid/cap
    const towerCapColor = isDark ? COL_TOWER_TOP : COL_TOWER_TOP_LIGHT;
    const towerCenterX = (towerLeft + towerRight) / 2;
    api.brush.polygon(
      [
        { x: towerCenterX, y: towerTopY },
        { x: towerLeft - 3, y: towerTopY + 32 },
        { x: towerRight + 3, y: towerTopY + 32 },
      ],
      { fill: towerCapColor, alpha: 0.9, blendMode: 'normal' }
    );

    // Tower cornice
    rectStyle.fill = corniceColor;
    rectStyle.alpha = 0.85;
    api.brush.rect(towerLeft - 4, towerTopY + 30, towerWidth + 8, 6, rectStyle);

    // Bell tower arched opening
    const bellOpenY = towerTopY + 45;
    const bellOpenW = towerWidth * 0.5;
    const bellOpenH = towerWidth * 0.7;
    const bellDark = isDark ? 0x0e0808 : 0x2a1e18;
    rectStyle.fill = bellDark;
    rectStyle.alpha = 0.9;
    api.brush.rect(towerCenterX - bellOpenW / 2, bellOpenY, bellOpenW, bellOpenH, rectStyle);

    // Arch top of bell opening
    circleStyle.fill = bellDark;
    circleStyle.alpha = 0.9;
    circleStyle.blendMode = 'normal';
    api.brush.ellipse(towerCenterX, bellOpenY, bellOpenW / 2, bellOpenW / 3, circleStyle);

    // Arch stone frame
    api.brush.arc(towerCenterX, bellOpenY, bellOpenW / 2 + 2, Math.PI, 0, {
      color: corniceColor,
      width: 3,
      alpha: 0.8,
      blendMode: 'normal',
    });

    // Bell (small circle inside opening)
    const bellFlicker = 0.7 + Math.sin(tSec * 0.3) * 0.1;
    circleStyle.fill = isDark ? 0x8b7355 : 0xa89070;
    circleStyle.alpha = bellFlicker;
    api.brush.circle(towerCenterX, bellOpenY + bellOpenH * 0.4, bellOpenW * 0.2, circleStyle);

    // ── ARCHED WINDOWS ───────────────────────────────────────
    const winBackColor = isDark ? COL_WINDOW_DARK : COL_WINDOW_LIGHT_MODE;
    const winGlowColor = isDark ? COL_WINDOW_GOLD : COL_WINDOW_GOLD_LIGHT;

    for (let i = 0; i < MAX_WINDOWS; i++) {
      const w = windows[i];
      if (!w.active) continue;

      // Window recess (dark background)
      rectStyle.fill = winBackColor;
      rectStyle.alpha = 0.9;
      api.brush.rect(w.x - w.w / 2, w.y, w.w, w.h, rectStyle);

      // Arch top of window
      circleStyle.fill = winBackColor;
      circleStyle.alpha = 0.9;
      api.brush.ellipse(w.x, w.y, w.w / 2, w.w / 3, circleStyle);

      // Arch stone surround
      api.brush.arc(w.x, w.y, w.w / 2 + 2, Math.PI, 0, {
        color: corniceColor,
        width: 2.5,
        alpha: 0.75,
        blendMode: 'normal',
      });

      // Window sill
      rectStyle.fill = corniceColor;
      rectStyle.alpha = 0.7;
      api.brush.rect(w.x - w.w / 2 - 2, w.y + w.h, w.w + 4, 3, rectStyle);

      // Warm golden light glow (flickering)
      const flicker = 0.5 + 0.3 * Math.sin(tSec * w.flickerSpeed + w.flickerPhase)
        + 0.15 * Math.sin(tSec * w.flickerSpeed * 2.3 + w.flickerPhase * 1.7);
      const glowAlpha = Math.max(0.05, flicker) * (isDark ? 0.6 : 0.25);

      if (glowAlpha >= 0.05) {
        imageStyle.width = w.w * 3;
        imageStyle.height = w.h * 2.5;
        imageStyle.tint = winGlowColor;
        imageStyle.alpha = glowAlpha;
        imageStyle.blendMode = 'add';
        api.brush.image(glowDataUrl, w.x, w.y + w.h * 0.3, imageStyle);
      }

      // Center divider (mullion)
      lineStyle.color = corniceColor;
      lineStyle.width = 2.5;
      lineStyle.alpha = 0.6;
      api.brush.line(w.x, w.y - w.w * 0.15, w.x, w.y + w.h, lineStyle);
    }

    // ── MAIN ENTRANCE ────────────────────────────────────────
    const entranceX = canvasW * 0.5;
    const entranceW = buildingWidth * 0.12;
    const entranceH = (buildingBaseY - buildingTopY) * 0.28;
    const entranceY = buildingBaseY - entranceH;

    // Door recess
    rectStyle.fill = isDark ? 0x1a0e08 : 0x3a2a1e;
    rectStyle.alpha = 0.95;
    api.brush.rect(entranceX - entranceW / 2, entranceY, entranceW, entranceH, rectStyle);

    // Arch over entrance
    circleStyle.fill = isDark ? 0x1a0e08 : 0x3a2a1e;
    circleStyle.alpha = 0.95;
    api.brush.ellipse(entranceX, entranceY, entranceW / 2, entranceW / 3, circleStyle);

    // Entrance arch stone surround
    api.brush.arc(entranceX, entranceY, entranceW / 2 + 3, Math.PI, 0, {
      color: corniceColor,
      width: 3,
      alpha: 0.8,
      blendMode: 'normal',
    });

    // Entrance columns
    const colWidth = 5;
    rectStyle.fill = corniceColor;
    rectStyle.alpha = 0.8;
    api.brush.rect(entranceX - entranceW / 2 - colWidth, entranceY - 5, colWidth, entranceH + 5, rectStyle);
    api.brush.rect(entranceX + entranceW / 2, entranceY - 5, colWidth, entranceH + 5, rectStyle);

    // Warm light from entrance
    if (isDark) {
      imageStyle.width = entranceW * 4;
      imageStyle.height = entranceH * 2;
      imageStyle.tint = 0xffaa50;
      imageStyle.alpha = 0.2;
      imageStyle.blendMode = 'add';
      api.brush.image(glowDataUrl, entranceX, entranceY + entranceH * 0.3, imageStyle);
    }

    // ── CYPRESS TREES ────────────────────────────────────────
    const cypressColor = isDark ? COL_CYPRESS_DARK : COL_CYPRESS_LIGHT;
    const cypressShadow = isDark ? COL_CYPRESS_SHADOW_DARK : COL_CYPRESS_SHADOW_LIGHT;

    for (let i = 0; i < MAX_CYPRESS; i++) {
      const c = cypresses[i];
      if (!c.active) continue;

      const sway = Math.sin(tSec * c.swaySpeed + c.swayPhase) * 3;
      const swayTop = sway * 1.5;

      api.brush.pushMatrix();
      api.brush.translate(c.x, c.baseY);

      // Trunk
      lineStyle.color = isDark ? 0x3a2a1a : 0x5a4a30;
      lineStyle.width = 3;
      lineStyle.alpha = 0.8;
      api.brush.line(0, 0, sway * 0.3, -c.height * 0.6, lineStyle);

      // Cypress body (tall narrow triangle / ellipse)
      // Shadow side
      api.brush.ellipse(sway * 0.4 - c.width * 0.08, -c.height * 0.5, c.width * 0.55, c.height * 0.5, {
        fill: cypressShadow,
        alpha: 0.85,
        blendMode: 'normal',
      });

      // Main body
      api.brush.ellipse(sway * 0.5, -c.height * 0.52, c.width * 0.45, c.height * 0.48, {
        fill: cypressColor,
        alpha: 0.9,
        blendMode: 'normal',
      });

      // Pointed top
      api.brush.polygon(
        [
          { x: swayTop, y: -c.height },
          { x: sway * 0.5 - c.width * 0.3, y: -c.height * 0.72 },
          { x: sway * 0.5 + c.width * 0.3, y: -c.height * 0.72 },
        ],
        { fill: cypressColor, alpha: 0.85, blendMode: 'normal' }
      );

      api.brush.popMatrix();
    }

    // ── FOUNTAIN ─────────────────────────────────────────────
    const stoneColor = isDark ? COL_FOUNTAIN_STONE : COL_FOUNTAIN_STONE_LIGHT;

    // Fountain basin (large ellipse)
    const basinW = 50;
    const basinH = 16;
    api.brush.ellipse(fountainX, fountainBaseY, basinW, basinH, {
      fill: stoneColor,
      alpha: 0.9,
      blendMode: 'normal',
    });

    // Inner basin water surface
    const waterColor = isDark ? COL_WATER : COL_WATER_LIGHT;
    api.brush.ellipse(fountainX, fountainBaseY - 2, basinW - 6, basinH - 4, {
      fill: waterColor,
      alpha: 0.6,
      blendMode: 'normal',
    });

    // Fountain pedestal
    rectStyle.fill = stoneColor;
    rectStyle.alpha = 0.9;
    api.brush.rect(fountainX - 6, fountainBaseY - 35, 12, 35, rectStyle);

    // Top bowl
    api.brush.ellipse(fountainX, fountainBaseY - 35, 14, 5, {
      fill: stoneColor,
      alpha: 0.9,
      blendMode: 'normal',
    });

    // ── FOUNTAIN WATER ANIMATION ─────────────────────────────
    // Spawn new drops
    const spawnRate = 3; // drops per frame roughly
    for (let s = 0; s < spawnRate; s++) {
      const drop = fountainDrops[nextDropIndex];
      drop.active = true;
      drop.x = fountainX + (Math.random() - 0.5) * 4;
      drop.y = fountainBaseY - 38;
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
      const speed = 0.8 + Math.random() * 0.6;
      drop.vx = Math.cos(angle) * speed;
      drop.vy = Math.sin(angle) * speed;
      drop.life = 0;
      drop.maxLife = 50 + Math.random() * 30;
      drop.size = 1.5 + Math.random() * 1.5;
      nextDropIndex = (nextDropIndex + 1) % MAX_FOUNTAIN_DROPS;
    }

    // Update and draw drops
    const dtScale = dt * 0.06;
    for (let i = 0; i < MAX_FOUNTAIN_DROPS; i++) {
      const d = fountainDrops[i];
      if (!d.active) continue;

      d.life += 1;
      d.x += d.vx * dtScale;
      d.y += d.vy * dtScale;
      d.vy += 0.06 * dtScale; // gravity

      if (d.life > d.maxLife || d.y > fountainBaseY) {
        d.active = false;
        continue;
      }

      const lifeRatio = d.life / d.maxLife;
      const dropAlpha = lifeRatio < 0.1 ? lifeRatio / 0.1 : lifeRatio > 0.7 ? (1 - lifeRatio) / 0.3 : 1.0;
      if (dropAlpha < 0.05) continue;

      // Sparkle effect
      const sparkle = 0.6 + 0.4 * Math.sin(tSec * 8 + i * 2.3);

      circleStyle.fill = waterColor;
      circleStyle.alpha = dropAlpha * sparkle * 0.8;
      circleStyle.blendMode = 'add';
      api.brush.circle(d.x, d.y, d.size, circleStyle);
    }

    // Water splash glow at base
    const splashPulse = 0.3 + 0.15 * Math.sin(tSec * 3);
    imageStyle.width = basinW * 1.5;
    imageStyle.height = basinH * 3;
    imageStyle.tint = waterColor;
    imageStyle.alpha = splashPulse;
    imageStyle.blendMode = 'add';
    api.brush.image(glowDataUrl, fountainX, fountainBaseY - 5, imageStyle);

    // ── MEDICI CREST / ORNAMENT ──────────────────────────────
    // Simple shield shape above entrance
    const crestX = entranceX;
    const crestY = entranceY - 18;
    const crestSize = 10;
    const crestColor = isDark ? COL_OCHRE : COL_OCHRE_LIGHT;

    // Shield body
    api.brush.polygon(
      [
        { x: crestX - crestSize, y: crestY - crestSize * 0.6 },
        { x: crestX + crestSize, y: crestY - crestSize * 0.6 },
        { x: crestX + crestSize, y: crestY + crestSize * 0.3 },
        { x: crestX, y: crestY + crestSize },
        { x: crestX - crestSize, y: crestY + crestSize * 0.3 },
      ],
      { fill: crestColor, alpha: 0.85, blendMode: 'normal' }
    );

    // Medici balls (simplified — 3 small circles)
    circleStyle.fill = isDark ? 0xaa3030 : 0xcc4040;
    circleStyle.alpha = 0.8;
    circleStyle.blendMode = 'normal';
    api.brush.circle(crestX - 4, crestY - 2, 2.5, circleStyle);
    api.brush.circle(crestX + 4, crestY - 2, 2.5, circleStyle);
    api.brush.circle(crestX, crestY + 3, 2.5, circleStyle);

    // ── ATMOSPHERE ───────────────────────────────────────────
    // Warm sunset haze at bottom
    if (isDark) {
      imageStyle.width = canvasW * 1.2;
      imageStyle.height = canvasH * 0.4;
      imageStyle.tint = 0xff6030;
      imageStyle.alpha = 0.06;
      imageStyle.blendMode = 'add';
      api.brush.image(glowDataUrl, canvasW * 0.5, canvasH * 0.5, imageStyle);
    }
  },

  async teardown(): Promise<void> {
    windows = [];
    cypresses = [];
    fountainDrops = [];
    canvasW = 0;
    canvasH = 0;
    glowDataUrl = '';
    nextDropIndex = 0;
  },
};

registerActor(actor);
export default actor;
