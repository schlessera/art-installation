import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'asm-coder',
  name: 'ASM Coder',
  description: 'Live assembler coding — types out x86 assembly line by line like a ghostly programmer',
  author: {
    name: 'Lucas Radke',
    github: 'lucasradke',
  },
  version: '1.0.0',
  tags: ['code', 'assembler', 'retro', 'text'],
  createdAt: new Date(),
  preferredDuration: 60,
  requiredContexts: ['display'],
};

// --- Assembly code lines (realistic x86-ish) ---
const ASM_LINES = [
  '; cloudfest hackathon 2026',
  '; art-installation kernel',
  'section .data',
  '  msg db "Hello, CloudFest!", 0',
  '  len equ $ - msg',
  '  fmt db "%d pixels rendered", 10, 0',
  '  buf times 64 db 0',
  '',
  'section .bss',
  '  framebuf resb 921600',
  '  counter resd 1',
  '',
  'section .text',
  '  global _start',
  '',
  '_start:',
  '  push rbp',
  '  mov rbp, rsp',
  '  sub rsp, 32',
  '',
  '  ; init display',
  '  mov eax, 0x13',
  '  int 0x10',
  '  mov edi, framebuf',
  '  xor eax, eax',
  '  mov ecx, 230400',
  '  rep stosd',
  '',
  'render_loop:',
  '  mov esi, [counter]',
  '  inc esi',
  '  mov [counter], esi',
  '',
  '  ; calculate pixel color',
  '  mov eax, esi',
  '  shr eax, 4',
  '  and eax, 0xFF',
  '  mov edx, esi',
  '  shl edx, 2',
  '  xor eax, edx',
  '  and eax, 0x3F3F3F',
  '',
  '  ; write to framebuffer',
  '  lea rdi, [framebuf]',
  '  mov ecx, 640',
  '  imul ecx, 480',
  '.fill_loop:',
  '  mov [rdi], eax',
  '  add rdi, 4',
  '  dec ecx',
  '  jnz .fill_loop',
  '',
  '  ; vsync wait',
  '  mov dx, 0x3DA',
  '.wait_retrace:',
  '  in al, dx',
  '  test al, 8',
  '  jz .wait_retrace',
  '',
  '  ; check for exit key',
  '  mov ah, 0x01',
  '  int 0x16',
  '  jz render_loop',
  '',
  '  ; cleanup & exit',
  '  mov eax, 0x03',
  '  int 0x10',
  '  mov rsp, rbp',
  '  pop rbp',
  '  xor edi, edi',
  '  mov eax, 60',
  '  syscall',
  '',
  '; --- subroutines ---',
  'blend_pixel:',
  '  push rbx',
  '  mov ebx, eax',
  '  shr ebx, 1',
  '  and ebx, 0x7F7F7F',
  '  add eax, ebx',
  '  pop rbx',
  '  ret',
  '',
  'set_palette:',
  '  mov dx, 0x3C8',
  '  xor al, al',
  '  out dx, al',
  '  inc dx',
  '  mov ecx, 768',
  '.pal_loop:',
  '  mov al, cl',
  '  out dx, al',
  '  dec ecx',
  '  jnz .pal_loop',
  '  ret',
];

const TOTAL_LINES = ASM_LINES.length;

// --- Timing ---
const CHARS_PER_SEC = 12; // typing speed
const LINE_PAUSE_MS = 8000; // pause between lines (8-10s total per line)
const MAX_VISIBLE_LINES = 28; // lines visible on screen
const LINE_HEIGHT = 14;
const LEFT_MARGIN = 12;
const TOP_MARGIN = 20;
const CURSOR_BLINK_MS = 500;

// --- State ---
let canvasW = 0;
let canvasH = 0;
let currentLineIdx = 0;
let charIdx = 0;
let lineTimer = 0;
let isTyping = false;
let typingTimer = 0;
let scrollOffset = 0; // which line is at the top of visible area

// Pre-built visible lines buffer (stores how many chars are revealed per line)
let revealedChars: Int16Array; // -1 = fully revealed, 0+ = chars shown so far

// Styles
const codeStyle = { fontSize: 11, fill: 0x00ff00 as number, alpha: 0.9, font: 'monospace' };
const commentStyle = { fontSize: 11, fill: 0x666666 as number, alpha: 0.7, font: 'monospace' };
const labelStyle = { fontSize: 11, fill: 0xffcc00 as number, alpha: 0.9, font: 'monospace' };
const keywordStyle = { fontSize: 11, fill: 0x44bbff as number, alpha: 0.9, font: 'monospace' };
const numberStyle = { fontSize: 11, fill: 0xff8844 as number, alpha: 0.9, font: 'monospace' };
const stringStyle = { fontSize: 11, fill: 0xff6688 as number, alpha: 0.9, font: 'monospace' };
const lineNumStyle = { fontSize: 9, fill: 0x444444 as number, alpha: 0.6, font: 'monospace' };
const cursorStyle = { fill: 0x00ff00 as number, alpha: 1.0 };

// Keywords for syntax highlighting
const KEYWORDS = ['mov', 'push', 'pop', 'sub', 'add', 'xor', 'and', 'or', 'shr', 'shl',
  'int', 'inc', 'dec', 'jnz', 'jz', 'ret', 'call', 'lea', 'rep', 'stosd',
  'imul', 'test', 'in', 'out', 'syscall', 'global', 'section', 'db', 'equ',
  'resb', 'resd', 'times'];

function getLineType(line: string): 'comment' | 'label' | 'directive' | 'code' | 'empty' {
  const trimmed = line.trim();
  if (trimmed === '') return 'empty';
  if (trimmed.startsWith(';')) return 'comment';
  if (trimmed.endsWith(':')) return 'label';
  if (trimmed.startsWith('.') && trimmed.endsWith(':')) return 'label';
  if (trimmed.startsWith('section')) return 'directive';
  return 'code';
}

function drawCodeLine(api: ActorUpdateAPI, line: string, x: number, y: number, maxChars: number, isDark: boolean): void {
  const displayText = maxChars >= 0 ? line.substring(0, maxChars) : line;
  if (displayText === '') return;

  const lineType = getLineType(line);

  // Simple single-color rendering based on line type
  if (lineType === 'comment') {
    commentStyle.fill = isDark ? 0x666666 : 0x888888;
    api.brush.text(displayText, x, y, commentStyle);
  } else if (lineType === 'label') {
    labelStyle.fill = isDark ? 0xffcc00 : 0xaa8800;
    api.brush.text(displayText, x, y, labelStyle);
  } else if (lineType === 'directive') {
    keywordStyle.fill = isDark ? 0x44bbff : 0x2266aa;
    api.brush.text(displayText, x, y, keywordStyle);
  } else {
    // Check if line contains a string literal
    if (displayText.includes('"')) {
      stringStyle.fill = isDark ? 0xff6688 : 0xcc3355;
      api.brush.text(displayText, x, y, stringStyle);
    } else {
      codeStyle.fill = isDark ? 0x00ff00 : 0x007700;
      api.brush.text(displayText, x, y, codeStyle);
    }
  }
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    currentLineIdx = 0;
    charIdx = 0;
    lineTimer = 0;
    isTyping = true;
    typingTimer = 0;
    scrollOffset = 0;

    revealedChars = new Int16Array(TOTAL_LINES);
    revealedChars.fill(0);
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time;
    const dt = frame.deltaTime;
    const isDark = api.context.display.isDarkMode();

    // --- Typing logic ---
    if (currentLineIdx < TOTAL_LINES) {
      const currentLine = ASM_LINES[currentLineIdx];

      if (isTyping) {
        typingTimer += dt;
        const charsToShow = Math.floor(typingTimer / (1000 / CHARS_PER_SEC));

        if (currentLine.length === 0) {
          // Empty line — just skip quickly
          revealedChars[currentLineIdx] = -1;
          isTyping = false;
          lineTimer = 0;
        } else if (charsToShow >= currentLine.length) {
          // Line complete
          revealedChars[currentLineIdx] = -1;
          isTyping = false;
          lineTimer = 0;
        } else {
          revealedChars[currentLineIdx] = charsToShow;
        }
      } else {
        // Pausing between lines
        lineTimer += dt;
        // Vary pause: empty lines are quick, others wait 1-2s
        const pauseTime = currentLine.length === 0 ? 300 : 800 + Math.random() * 400;
        if (lineTimer >= pauseTime) {
          currentLineIdx++;
          charIdx = 0;
          typingTimer = 0;
          isTyping = true;

          // Auto-scroll when needed
          if (currentLineIdx - scrollOffset >= MAX_VISIBLE_LINES) {
            scrollOffset++;
          }
        }
      }
    }

    // --- Draw ---

    // Faint background panel
    api.brush.rect(4, TOP_MARGIN - 6, canvasW - 8, canvasH - TOP_MARGIN, {
      fill: isDark ? 0x0a0a0a : 0xf0f0f0,
      alpha: 0.3,
    });

    // Title bar
    api.brush.rect(4, 4, canvasW - 8, TOP_MARGIN - 8, {
      fill: isDark ? 0x1a1a2e : 0xdddddd,
      alpha: 0.5,
    });
    api.brush.text('asm-coder.s — CloudFest 2026', canvasW * 0.5, 10, {
      fontSize: 8,
      fill: isDark ? 0x888888 : 0x666666,
      alpha: 0.7,
      font: 'monospace',
      align: 'center' as const,
    });

    // Draw visible lines
    const visibleEnd = Math.min(scrollOffset + MAX_VISIBLE_LINES, TOTAL_LINES);

    for (let i = scrollOffset; i < visibleEnd; i++) {
      const screenRow = i - scrollOffset;
      const y = TOP_MARGIN + screenRow * LINE_HEIGHT;

      // Line number
      lineNumStyle.fill = isDark ? 0x444444 : 0xaaaaaa;
      const lineNumStr = String(i + 1).padStart(3, ' ');
      api.brush.text(lineNumStr, 6, y, lineNumStyle);

      // Code
      const line = ASM_LINES[i];
      const revealed = revealedChars[i];

      if (revealed === 0 && i >= currentLineIdx) continue; // not started yet
      if (line === '') continue; // empty line

      drawCodeLine(api, line, LEFT_MARGIN + 24, y, revealed, isDark);
    }

    // Blinking cursor
    const cursorVisible = Math.floor(t / CURSOR_BLINK_MS) % 2 === 0;
    if (cursorVisible && currentLineIdx < TOTAL_LINES) {
      const cursorRow = currentLineIdx - scrollOffset;
      if (cursorRow >= 0 && cursorRow < MAX_VISIBLE_LINES) {
        const currentLine = ASM_LINES[currentLineIdx];
        const charsShown = revealedChars[currentLineIdx];
        const displayedChars = charsShown >= 0 ? charsShown : currentLine.length;

        // Approximate cursor X position (monospace ~6.6px per char at fontSize 11)
        const charWidth = 6.6;
        const cx = LEFT_MARGIN + 24 + displayedChars * charWidth;
        const cy = TOP_MARGIN + cursorRow * LINE_HEIGHT;

        cursorStyle.fill = isDark ? 0x00ff00 : 0x007700;
        api.brush.rect(cx, cy - 1, 7, 12, cursorStyle);
      }
    }

    // Scrollbar hint
    if (TOTAL_LINES > MAX_VISIBLE_LINES) {
      const scrollFrac = scrollOffset / (TOTAL_LINES - MAX_VISIBLE_LINES);
      const barH = canvasH - TOP_MARGIN - 10;
      const thumbH = Math.max(20, barH * (MAX_VISIBLE_LINES / TOTAL_LINES));
      const thumbY = TOP_MARGIN + scrollFrac * (barH - thumbH);
      api.brush.rect(canvasW - 6, thumbY, 3, thumbH, {
        fill: isDark ? 0x333333 : 0xcccccc,
        alpha: 0.4,
      });
    }
  },

  async teardown(): Promise<void> {
    currentLineIdx = 0;
    charIdx = 0;
    isTyping = false;
    scrollOffset = 0;
  },
};

registerActor(actor);
export default actor;
