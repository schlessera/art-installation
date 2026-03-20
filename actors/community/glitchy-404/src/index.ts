import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'glitchy-404',
  name: 'Glitchy 404',
  description: 'Glitchy 404 page fragments float around — they reassemble when a face is detected and shatter when it disappears',
  author: {
    name: 'Lucas Radke',
    github: 'lucasradke',
  },
  version: '1.0.0',
  tags: ['glitch', '404', 'camera', 'interactive', 'retro'],
  createdAt: new Date(),
  preferredDuration: 60,
  requiredContexts: ['video', 'display'],
};

// --- Constants ---
const MAX_FRAGMENTS = 20;
const MAX_GLITCH_LINES = 8;
const REASSEMBLE_SPEED = 0.03;
const SHATTER_FORCE = 3;

// Fragment texts — web error themed
const FRAG_TEXTS = [
  '404', 'NOT', 'FOUND', 'ERR', '<!>', '</>',
  'NULL', 'undefined', '???', 'LOST',
  ':(', 'OOPS', '0x404', 'MISSING',
  'BROKEN', 'GONE', 'VOID', 'NO DATA',
  'TIMEOUT', 'CRASH',
];

// Broken image icon pixel pattern (6x6)
const BROKEN_IMG = [
  [0, 1, 1, 1, 1, 0],
  [1, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 0, 1],
  [1, 0, 0, 0, 0, 1],
  [1, 0, 0, 1, 0, 1],
  [0, 1, 1, 1, 1, 0],
];

// --- Pre-allocated state ---
interface Fragment {
  active: boolean;
  // Current position
  x: number;
  y: number;
  // Home position (assembled)
  homeX: number;
  homeY: number;
  // Velocity (when shattered)
  vx: number;
  vy: number;
  // Visual
  textIdx: number;
  rotation: number;
  rotSpeed: number;
  scale: number;
  isIcon: boolean; // true = broken image icon, false = text
  glitchOffset: number;
  alpha: number;
}

interface GlitchLine {
  active: boolean;
  y: number;
  width: number;
  offset: number;
  life: number;
  maxLife: number;
}

let fragments: Fragment[];
let glitchLines: GlitchLine[];
let canvasW = 0;
let canvasH = 0;
let hasFace = false;
let hadFacePrev = false;
let assembleProgress = 0; // 0=shattered, 1=assembled
let timeSinceFaceLost = 0;
let glitchIntensity = 0;
let cursorX = 0;
let cursorY = 0;

// Styles
const fragTextStyle = { fontSize: 16, fill: 0xff3333 as number, alpha: 0.9, font: 'monospace' };
const fragTextStyleAlt = { fontSize: 12, fill: 0x33ff33 as number, alpha: 0.8, font: 'monospace' };
const iconPixelStyle = { fill: 0x6666ff as number, alpha: 0.8 };
const glitchLineStyle = { fill: 0xff3333 as number, alpha: 0.3 };
const cursorStyle = { fill: 0xffffff as number, alpha: 0.8 };
const bigTextStyle = { fontSize: 48, fill: 0xff3333 as number, alpha: 0.0, font: 'monospace', align: 'center' as const };
const subTextStyle = { fontSize: 11, fill: 0x888888 as number, alpha: 0.0, font: 'monospace', align: 'center' as const };
const scanlineStyle = { fill: 0x000000 as number, alpha: 0.08 };

function shatterFragments(t: number): void {
  for (let i = 0; i < MAX_FRAGMENTS; i++) {
    const f = fragments[i];
    if (!f.active) continue;
    // Explode from center
    const dx = f.x - canvasW * 0.5;
    const dy = f.y - canvasH * 0.5;
    const dist = Math.sqrt(dx * dx + dy * dy) + 1;
    f.vx = (dx / dist) * SHATTER_FORCE + (Math.random() - 0.5) * 4;
    f.vy = (dy / dist) * SHATTER_FORCE + (Math.random() - 0.5) * 4;
    f.rotSpeed = (Math.random() - 0.5) * 0.08;
  }
}

function initFragmentHomes(): void {
  const cx = canvasW * 0.5;
  const cy = canvasH * 0.35;

  // Place fragments in a rough "404 page" layout
  for (let i = 0; i < MAX_FRAGMENTS; i++) {
    const f = fragments[i];
    f.active = true;
    f.textIdx = i % FRAG_TEXTS.length;
    f.isIcon = i % 5 === 0; // every 5th is a broken image icon

    // Distribute homes in a scattered page layout
    if (i < 3) {
      // Big "404" area — top center
      f.homeX = cx + (i - 1) * 40;
      f.homeY = cy - 30;
    } else if (i < 6) {
      // "NOT FOUND" line
      f.homeX = cx + (i - 4) * 50 - 25;
      f.homeY = cy + 30;
    } else {
      // Scattered around the page
      const angle = (i / MAX_FRAGMENTS) * Math.PI * 2;
      const radius = 60 + (i % 4) * 35;
      f.homeX = cx + Math.cos(angle) * radius;
      f.homeY = cy + 60 + Math.sin(angle) * radius * 0.6;
    }

    // Start scattered
    f.x = Math.random() * canvasW;
    f.y = Math.random() * canvasH;
    f.vx = (Math.random() - 0.5) * 2;
    f.vy = (Math.random() - 0.5) * 2;
    f.rotation = Math.random() * Math.PI * 2;
    f.rotSpeed = (Math.random() - 0.5) * 0.03;
    f.scale = 0.8 + Math.random() * 0.4;
    f.glitchOffset = 0;
    f.alpha = 0.9;
  }
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    // Pre-allocate fragments
    fragments = new Array(MAX_FRAGMENTS);
    for (let i = 0; i < MAX_FRAGMENTS; i++) {
      fragments[i] = {
        active: false, x: 0, y: 0, homeX: 0, homeY: 0,
        vx: 0, vy: 0, textIdx: 0, rotation: 0, rotSpeed: 0,
        scale: 1, isIcon: false, glitchOffset: 0, alpha: 0.9,
      };
    }

    // Pre-allocate glitch lines
    glitchLines = new Array(MAX_GLITCH_LINES);
    for (let i = 0; i < MAX_GLITCH_LINES; i++) {
      glitchLines[i] = { active: false, y: 0, width: 0, offset: 0, life: 0, maxLife: 200 };
    }

    hasFace = false;
    hadFacePrev = false;
    assembleProgress = 0;
    timeSinceFaceLost = 10000; // start as if no face for a while
    glitchIntensity = 0.5;
    cursorX = canvasW * 0.5;
    cursorY = canvasH * 0.5;

    initFragmentHomes();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time;
    const dt = frame.deltaTime;
    const isDark = api.context.display.isDarkMode();

    // Colors based on theme
    const errorColor = isDark ? 0xff4444 : 0xcc2222;
    const greenColor = isDark ? 0x44ff44 : 0x228822;
    const blueColor = isDark ? 0x6688ff : 0x4444cc;
    const textColor = isDark ? 0xffffff : 0x222222;

    fragTextStyle.fill = errorColor;
    fragTextStyleAlt.fill = greenColor;
    iconPixelStyle.fill = blueColor;
    bigTextStyle.fill = errorColor;
    subTextStyle.fill = isDark ? 0x888888 : 0x666666;
    cursorStyle.fill = textColor;

    // --- Face detection ---
    const faces = api.context.video.getFaces();
    hadFacePrev = hasFace;
    hasFace = faces.length > 0;

    if (hasFace) {
      const face = faces[0];
      const vidDims = api.context.video.getDimensions();
      let fx = face.bounds.x + face.bounds.width * 0.5;
      let fy = face.bounds.y + face.bounds.height * 0.5;
      if (vidDims) {
        fx = (1 - fx / vidDims.width) * canvasW;
        fy = (fy / vidDims.height) * canvasH;
      }
      cursorX += (fx - cursorX) * 0.15;
      cursorY += (fy - cursorY) * 0.15;
    }

    // --- State transitions ---
    if (hasFace) {
      timeSinceFaceLost = 0;
      // Reassemble
      assembleProgress = Math.min(1, assembleProgress + REASSEMBLE_SPEED * (dt / 16));
      glitchIntensity = Math.max(0.05, glitchIntensity - 0.01);
    } else {
      timeSinceFaceLost += dt;
      // Shatter if face just disappeared
      if (hadFacePrev && !hasFace && assembleProgress > 0.3) {
        shatterFragments(t);
        glitchIntensity = 1.0;
      }
      // Drift apart slowly
      assembleProgress = Math.max(0, assembleProgress - 0.005 * (dt / 16));
      glitchIntensity = Math.min(0.7, glitchIntensity + 0.002);
    }

    // --- Update fragments ---
    for (let i = 0; i < MAX_FRAGMENTS; i++) {
      const f = fragments[i];
      if (!f.active) continue;

      if (assembleProgress > 0.1) {
        // Lerp toward home
        const lerpStrength = assembleProgress * 0.06;
        f.x += (f.homeX - f.x) * lerpStrength;
        f.y += (f.homeY - f.y) * lerpStrength;
        f.rotation *= (1 - assembleProgress * 0.05);
        f.vx *= 0.95;
        f.vy *= 0.95;
      } else {
        // Float freely
        f.x += f.vx * dt * 0.06;
        f.y += f.vy * dt * 0.06;
        f.rotation += f.rotSpeed * dt * 0.06;

        // Bounce off edges
        if (f.x < -20) { f.x = -20; f.vx = Math.abs(f.vx) * 0.8; }
        if (f.x > canvasW + 20) { f.x = canvasW + 20; f.vx = -Math.abs(f.vx) * 0.8; }
        if (f.y < -20) { f.y = -20; f.vy = Math.abs(f.vy) * 0.8; }
        if (f.y > canvasH + 20) { f.y = canvasH + 20; f.vy = -Math.abs(f.vy) * 0.8; }

        // Slow drift
        f.vx *= 0.998;
        f.vy *= 0.998;
      }

      // Glitch offset — more when disassembled
      f.glitchOffset = (1 - assembleProgress) * Math.sin(t * 0.01 + i * 3) * 8 * glitchIntensity;
    }

    // --- Spawn glitch lines ---
    if (Math.random() < glitchIntensity * 0.3) {
      for (let i = 0; i < MAX_GLITCH_LINES; i++) {
        if (!glitchLines[i].active) {
          glitchLines[i].active = true;
          glitchLines[i].y = Math.random() * canvasH;
          glitchLines[i].width = canvasW * (0.3 + Math.random() * 0.7);
          glitchLines[i].offset = (Math.random() - 0.5) * 20;
          glitchLines[i].life = 0;
          glitchLines[i].maxLife = 80 + Math.random() * 120;
          break;
        }
      }
    }

    // Update glitch lines
    for (let i = 0; i < MAX_GLITCH_LINES; i++) {
      const gl = glitchLines[i];
      if (!gl.active) continue;
      gl.life += dt;
      if (gl.life >= gl.maxLife) {
        gl.active = false;
      }
    }

    // --- Draw ---

    // Scanlines (subtle CRT effect)
    for (let y = 0; y < canvasH; y += 4) {
      api.brush.rect(0, y, canvasW, 1, scanlineStyle);
    }

    // Glitch lines
    for (let i = 0; i < MAX_GLITCH_LINES; i++) {
      const gl = glitchLines[i];
      if (!gl.active) continue;
      const progress = gl.life / gl.maxLife;
      const alpha = progress < 0.2 ? progress / 0.2 : (1 - progress) / 0.8;
      if (alpha < 0.05) continue;
      glitchLineStyle.fill = i % 2 === 0 ? errorColor : greenColor;
      glitchLineStyle.alpha = alpha * 0.25 * glitchIntensity;
      api.brush.rect(gl.offset, gl.y, gl.width, 2 + Math.random() * 3, glitchLineStyle);
    }

    // Big "404" watermark when assembled
    if (assembleProgress > 0.5) {
      const watermarkAlpha = (assembleProgress - 0.5) * 2;
      bigTextStyle.alpha = watermarkAlpha * 0.9;
      api.brush.text('404', canvasW * 0.5, canvasH * 0.3, bigTextStyle);
      subTextStyle.alpha = watermarkAlpha * 0.7;
      api.brush.text('PAGE NOT FOUND', canvasW * 0.5, canvasH * 0.3 + 40, subTextStyle);

      // Fake URL bar at top
      if (watermarkAlpha > 0.3) {
        api.brush.rect(20, 12, canvasW - 40, 16, {
          fill: isDark ? 0x333333 : 0xeeeeee,
          alpha: watermarkAlpha * 0.6,
        });
        api.brush.text('https://cloudfest.com/hackathon/2026', canvasW * 0.5, 16, {
          fontSize: 8,
          fill: isDark ? 0x999999 : 0x666666,
          alpha: watermarkAlpha * 0.6,
          font: 'monospace',
          align: 'center' as const,
        });
      }
    }

    // Draw fragments
    for (let i = 0; i < MAX_FRAGMENTS; i++) {
      const f = fragments[i];
      if (!f.active) continue;

      const drawX = f.x + f.glitchOffset;
      const drawY = f.y;

      if (f.isIcon) {
        // Draw broken image icon
        api.brush.pushMatrix();
        api.brush.translate(drawX, drawY);
        api.brush.rotate(f.rotation * (1 - assembleProgress));
        const pxSize = 4 * f.scale;
        for (let py = 0; py < 6; py++) {
          for (let px = 0; px < 6; px++) {
            if (BROKEN_IMG[py][px] === 1) {
              iconPixelStyle.alpha = 0.7 + assembleProgress * 0.2;
              api.brush.rect(
                (px - 3) * pxSize,
                (py - 3) * pxSize,
                pxSize - 1,
                pxSize - 1,
                iconPixelStyle,
              );
            }
          }
        }
        api.brush.popMatrix();
      } else {
        // Draw text fragment
        api.brush.pushMatrix();
        api.brush.translate(drawX, drawY);
        api.brush.rotate(f.rotation * (1 - assembleProgress));

        const style = i % 3 === 0 ? fragTextStyleAlt : fragTextStyle;
        style.alpha = 0.6 + assembleProgress * 0.3;
        style.fontSize = Math.round(10 + f.scale * 8);
        api.brush.text(FRAG_TEXTS[f.textIdx], 0, 0, style);

        // Chromatic aberration effect on text when glitchy
        if (glitchIntensity > 0.2) {
          const abOffset = glitchIntensity * 3;
          api.brush.text(FRAG_TEXTS[f.textIdx], abOffset, 0, {
            fontSize: style.fontSize,
            fill: 0xff0000,
            alpha: glitchIntensity * 0.2,
            font: 'monospace',
          });
          api.brush.text(FRAG_TEXTS[f.textIdx], -abOffset, 0, {
            fontSize: style.fontSize,
            fill: 0x0000ff,
            alpha: glitchIntensity * 0.2,
            font: 'monospace',
          });
        }

        api.brush.popMatrix();
      }
    }

    // Mouse cursor (follows face position)
    if (hasFace) {
      // Arrow cursor shape
      api.brush.polygon([
        { x: cursorX, y: cursorY },
        { x: cursorX, y: cursorY + 14 },
        { x: cursorX + 4, y: cursorY + 11 },
        { x: cursorX + 8, y: cursorY + 16 },
        { x: cursorX + 10, y: cursorY + 15 },
        { x: cursorX + 6, y: cursorY + 10 },
        { x: cursorX + 10, y: cursorY + 10 },
      ], cursorStyle);
      // Cursor outline
      api.brush.polygon([
        { x: cursorX, y: cursorY },
        { x: cursorX, y: cursorY + 14 },
        { x: cursorX + 4, y: cursorY + 11 },
        { x: cursorX + 8, y: cursorY + 16 },
        { x: cursorX + 10, y: cursorY + 15 },
        { x: cursorX + 6, y: cursorY + 10 },
        { x: cursorX + 10, y: cursorY + 10 },
      ], { stroke: 0x000000, strokeWidth: 1.5, alpha: 0.6 });
    }

    // Occasional screen "flicker" when very glitchy
    if (glitchIntensity > 0.6 && Math.random() < 0.05) {
      api.brush.rect(0, 0, canvasW, canvasH, {
        fill: 0xffffff,
        alpha: 0.08,
      });
    }
  },

  async teardown(): Promise<void> {
    hasFace = false;
    hadFacePrev = false;
    assembleProgress = 0;
    glitchIntensity = 0;
    for (let i = 0; i < MAX_FRAGMENTS; i++) fragments[i].active = false;
    for (let i = 0; i < MAX_GLITCH_LINES; i++) glitchLines[i].active = false;
  },
};

registerActor(actor);
export default actor;
