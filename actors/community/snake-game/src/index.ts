import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'snake-game',
  name: 'Snake Game',
  description: 'A self-playing Snake game with AI that eventually bites itself and flashes on death',
  author: {
    name: 'Lucas Radke',
    github: 'lucasradke',
  },
  version: '1.0.0',
  tags: ['game', 'snake', 'retro', 'ai'],
  createdAt: new Date(),
  preferredDuration: 55,
  requiredContexts: ['display'],
};

// Grid configuration
const GRID_COLS = 18;
const GRID_ROWS = 32;
const MAX_SNAKE_LENGTH = GRID_COLS * GRID_ROWS;
const DEATH_TIME_MS = 45000;
const MOVE_INTERVAL_MS = 100; // snake moves every 100ms

// Direction vectors
const DIR_UP = 0;
const DIR_RIGHT = 1;
const DIR_DOWN = 2;
const DIR_LEFT = 3;
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

// Pre-allocated state
let snakeX: Int16Array;
let snakeY: Int16Array;
let snakeLength = 0;
let snakeHead = 0; // circular buffer head index
let direction = DIR_RIGHT;
let foodX = 0;
let foodY = 0;
let canvasW = 0;
let canvasH = 0;
let cellW = 0;
let cellH = 0;
let marginX = 0;
let marginY = 0;
let lastMoveTime = 0;
let isDead = false;
let deathTime = 0;
let foodPulsePhase = 0;

// Grid occupancy for fast collision checks (pre-allocated)
let grid: Uint8Array;

// Reusable style objects
const bodyStyle = { fill: 0x00ff00 as number, alpha: 0.85 };
const headStyle = { fill: 0x44ff44 as number, alpha: 1.0 };
const foodStyle = { fill: 0xff3333 as number, alpha: 0.9 };
const borderStyle = { color: 0x33ff33 as number, width: 2.5, alpha: 0.6 };

function gridIndex(x: number, y: number): number {
  return y * GRID_COLS + x;
}

function clearGrid(): void {
  grid.fill(0);
}

function markSnakeOnGrid(): void {
  clearGrid();
  for (let i = 0; i < snakeLength; i++) {
    const idx = (snakeHead - i + MAX_SNAKE_LENGTH) % MAX_SNAKE_LENGTH;
    grid[gridIndex(snakeX[idx], snakeY[idx])] = 1;
  }
}

function isOnSnake(x: number, y: number): boolean {
  return grid[gridIndex(x, y)] === 1;
}

function placeFood(): void {
  // Count free cells
  let freeCells = GRID_COLS * GRID_ROWS - snakeLength;
  if (freeCells <= 0) return;

  let pick = Math.floor(Math.random() * freeCells);
  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      if (!isOnSnake(x, y)) {
        if (pick === 0) {
          foodX = x;
          foodY = y;
          return;
        }
        pick--;
      }
    }
  }
}

// BFS pathfinding for "perfect" AI
// Pre-allocated BFS arrays
let bfsQueue: Int16Array; // stores encoded (x + y * GRID_COLS)
let bfsVisited: Uint8Array;
let bfsParentDir: Int8Array; // direction that led to this cell

function findBestDirection(): number {
  const headX = snakeX[snakeHead];
  const headY = snakeY[snakeHead];

  // BFS from head to food
  bfsVisited.fill(0);
  bfsParentDir.fill(-1);

  let qHead = 0;
  let qTail = 0;

  const startIdx = gridIndex(headX, headY);
  bfsVisited[startIdx] = 1;
  bfsQueue[qTail++] = startIdx;

  let foundFood = false;
  let foodIdx = gridIndex(foodX, foodY);

  while (qHead < qTail && !foundFood) {
    const current = bfsQueue[qHead++];
    const cx = current % GRID_COLS;
    const cy = (current - cx) / GRID_COLS;

    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d];
      const ny = cy + DY[d];

      if (nx < 0 || nx >= GRID_COLS || ny < 0 || ny >= GRID_ROWS) continue;

      const ni = gridIndex(nx, ny);
      if (bfsVisited[ni]) continue;
      if (grid[ni] === 1 && ni !== foodIdx) continue; // skip snake body (but food cell is ok)

      // Tail cell is also safe since it will move by the time we get there
      bfsVisited[ni] = 1;
      bfsParentDir[ni] = d;
      bfsQueue[qTail++] = ni;

      if (nx === foodX && ny === foodY) {
        foundFood = true;
        break;
      }
    }
  }

  if (foundFood) {
    // Trace back from food to find first step direction
    let ci = foodIdx;
    while (true) {
      const d = bfsParentDir[ci];
      const px = (ci % GRID_COLS) - DX[d];
      const py = (((ci - (ci % GRID_COLS)) / GRID_COLS)) - DY[d];
      const pi = gridIndex(px, py);
      if (pi === startIdx) {
        return d;
      }
      ci = pi;
    }
  }

  // No path to food — pick any safe direction
  for (let d = 0; d < 4; d++) {
    const nx = headX + DX[d];
    const ny = headY + DY[d];
    if (nx >= 0 && nx < GRID_COLS && ny >= 0 && ny < GRID_ROWS && !isOnSnake(nx, ny)) {
      return d;
    }
  }

  // No safe move — just go current direction (will die)
  return direction;
}

// After death time, steer INTO the snake body to self-destruct
function findSuicideDirection(): number {
  const headX = snakeX[snakeHead];
  const headY = snakeY[snakeHead];

  // Try to steer into own body
  for (let d = 0; d < 4; d++) {
    const nx = headX + DX[d];
    const ny = headY + DY[d];
    if (nx >= 0 && nx < GRID_COLS && ny >= 0 && ny < GRID_ROWS && isOnSnake(nx, ny)) {
      return d;
    }
  }

  // If can't hit body yet, just move forward (will eventually collide)
  return findBestDirection();
}

let elapsedMs = 0;

function moveSnake(): void {
  if (isDead) return;

  markSnakeOnGrid();

  // After 45s, steer into own body to self-destruct
  if (elapsedMs >= DEATH_TIME_MS) {
    direction = findSuicideDirection();
  } else {
    direction = findBestDirection();
  }

  const headX = snakeX[snakeHead];
  const headY = snakeY[snakeHead];
  const newX = headX + DX[direction];
  const newY = headY + DY[direction];

  // Check death conditions
  if (newX < 0 || newX >= GRID_COLS || newY < 0 || newY >= GRID_ROWS || isOnSnake(newX, newY)) {
    isDead = true;
    return;
  }

  // Move head forward in circular buffer
  snakeHead = (snakeHead + 1) % MAX_SNAKE_LENGTH;
  snakeX[snakeHead] = newX;
  snakeY[snakeHead] = newY;

  // Check food
  if (newX === foodX && newY === foodY) {
    snakeLength++;
    markSnakeOnGrid();
    placeFood();
  }
  // If no food eaten, length stays the same (tail effectively removed by not incrementing length)
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    // Calculate cell size with margin for border
    const margin = 8;
    marginX = margin;
    marginY = margin;
    cellW = (canvasW - margin * 2) / GRID_COLS;
    cellH = (canvasH - margin - marginY) / GRID_ROWS;

    // Pre-allocate arrays
    snakeX = new Int16Array(MAX_SNAKE_LENGTH);
    snakeY = new Int16Array(MAX_SNAKE_LENGTH);
    grid = new Uint8Array(GRID_COLS * GRID_ROWS);
    bfsQueue = new Int16Array(GRID_COLS * GRID_ROWS);
    bfsVisited = new Uint8Array(GRID_COLS * GRID_ROWS);
    bfsParentDir = new Int8Array(GRID_COLS * GRID_ROWS);

    // Initialize snake at center, length 3, going right
    snakeLength = 3;
    snakeHead = 2;
    const startX = Math.floor(GRID_COLS / 2);
    const startY = Math.floor(GRID_ROWS / 2);
    snakeX[0] = startX - 2;
    snakeY[0] = startY;
    snakeX[1] = startX - 1;
    snakeY[1] = startY;
    snakeX[2] = startX;
    snakeY[2] = startY;
    direction = DIR_RIGHT;

    isDead = false;
    deathTime = 0;
    lastMoveTime = 0;
    foodPulsePhase = 0;
    elapsedMs = 0;

    // Place initial food
    markSnakeOnGrid();
    placeFood();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time;
    const isDark = api.context.display.isDarkMode();

    // Update colors based on theme
    const snakeColor = isDark ? 0x33ff66 : 0x228833;
    const snakeHeadColor = isDark ? 0x66ff99 : 0x33aa55;
    const foodColor = isDark ? 0xff4444 : 0xcc2222;
    const borderColor = isDark ? 0x33ff33 : 0x227722;
    bodyStyle.fill = snakeColor;
    headStyle.fill = snakeHeadColor;
    foodStyle.fill = foodColor;
    borderStyle.color = borderColor;

    elapsedMs = t;

    // Move snake at fixed intervals
    if (!isDead && t - lastMoveTime >= MOVE_INTERVAL_MS) {
      moveSnake();
      if (isDead) deathTime = t;
      lastMoveTime = t;
    }

    // Draw border
    const gridW = GRID_COLS * cellW;
    const gridH = GRID_ROWS * cellH;
    api.brush.rect(marginX - 1, marginY - 1, gridW + 2, gridH + 2, {
      stroke: borderColor,
      strokeWidth: 2.5,
      alpha: 0.6,
    });

    // Draw food with pulse
    foodPulsePhase += frame.deltaTime * 0.005;
    const foodAlpha = 0.7 + Math.sin(foodPulsePhase * 4) * 0.2;
    const foodScale = 1.0 + Math.sin(foodPulsePhase * 3) * 0.15;
    if (!isDead) {
      const fx = marginX + foodX * cellW + cellW * 0.5;
      const fy = marginY + foodY * cellH + cellH * 0.5;
      const fr = Math.min(cellW, cellH) * 0.4 * foodScale;
      foodStyle.alpha = foodAlpha;
      api.brush.circle(fx, fy, fr, foodStyle);
    }

    // Flash effect when dead — toggle visibility rapidly
    const flashVisible = !isDead || Math.sin(t * 0.02) > 0;

    // Draw snake body
    if (snakeLength > 0 && flashVisible) {
      for (let i = 0; i < snakeLength; i++) {
        const idx = (snakeHead - i + MAX_SNAKE_LENGTH) % MAX_SNAKE_LENGTH;
        const sx = marginX + snakeX[idx] * cellW;
        const sy = marginY + snakeY[idx] * cellH;
        const padding = 0.5;

        if (i === 0) {
          // Head — red when dead, normal otherwise
          if (isDead) {
            headStyle.fill = 0xff4444;
          }
          api.brush.rect(sx + padding, sy + padding, cellW - padding * 2, cellH - padding * 2, headStyle);
        } else {
          // Body - gradient fade towards tail
          const fadeAlpha = 0.85 - (i / snakeLength) * 0.25;
          bodyStyle.alpha = fadeAlpha;
          api.brush.rect(sx + padding, sy + padding, cellW - padding * 2, cellH - padding * 2, bodyStyle);
        }
      }

      // Draw eyes on head (X eyes when dead)
      const hx = snakeX[snakeHead];
      const hy = snakeY[snakeHead];
      const cx = marginX + hx * cellW + cellW * 0.5;
      const cy = marginY + hy * cellH + cellH * 0.5;

      if (isDead) {
        // X eyes
        const xSize = cellW * 0.18;
        const eyeStyle = { color: 0x000000 as number, width: 2.5, alpha: 0.9 };
        // Left X
        api.brush.line(cx - cellW * 0.2 - xSize, cy - xSize, cx - cellW * 0.2 + xSize, cy + xSize, eyeStyle);
        api.brush.line(cx - cellW * 0.2 + xSize, cy - xSize, cx - cellW * 0.2 - xSize, cy + xSize, eyeStyle);
        // Right X
        api.brush.line(cx + cellW * 0.2 - xSize, cy - xSize, cx + cellW * 0.2 + xSize, cy + xSize, eyeStyle);
        api.brush.line(cx + cellW * 0.2 + xSize, cy - xSize, cx + cellW * 0.2 - xSize, cy + xSize, eyeStyle);
      } else {
        const eyeOff = cellW * 0.2;
        const eyeR = cellW * 0.12;
        let ex1 = cx, ey1 = cy, ex2 = cx, ey2 = cy;
        if (direction === DIR_UP || direction === DIR_DOWN) {
          ex1 = cx - eyeOff; ey1 = cy;
          ex2 = cx + eyeOff; ey2 = cy;
        } else {
          ex1 = cx; ey1 = cy - eyeOff;
          ex2 = cx; ey2 = cy + eyeOff;
        }
        api.brush.circle(ex1, ey1, eyeR, { fill: 0x000000, alpha: 0.9 });
        api.brush.circle(ex2, ey2, eyeR, { fill: 0x000000, alpha: 0.9 });
      }
    }

  },

  async teardown(): Promise<void> {
    snakeLength = 0;
    snakeHead = 0;
    isDead = false;
    deathTime = 0;
    lastMoveTime = 0;
  },
};

registerActor(actor);
export default actor;
