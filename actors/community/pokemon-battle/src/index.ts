import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorMetadata,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'pokemon-battle',
  name: 'CloudFest Pokemon Battle',
  description:
    'CloudFest Hackathon 2026 projects battle as Pokemon in classic GameBoy style',
  author: { name: 'Lucas Radke', github: 'lucasradke' },
  version: '1.0.0',
  tags: ['pokemon', 'gameboy', 'pixel-art', 'retro', 'cloudfest', 'hackathon'],
  createdAt: new Date(),
  preferredDuration: 50,
  requiredContexts: ['display'],
};

// GameBoy green palette
const GB_DARKEST = 0x0f380f;
const GB_DARK = 0x306230;
const GB_LIGHT = 0x8bac0f;
const GB_LIGHTEST = 0x9bbc0f;

// Pokemon definitions based on CloudFest Hackathon 2026 projects
interface PokemonDef {
  name: string;
  project: string;
  hp: number;
  attacks: string[];
  // 8x8 pixel sprite as flat array: 0=transparent, 1=darkest, 2=dark, 3=light, 4=lightest
  sprite: number[];
}

const SPRITE_SIZE = 8;

const POKEMON: PokemonDef[] = [
  {
    name: 'ACCESSIMON',
    project: 'Universal Access',
    hp: 95,
    attacks: ['Screen Reader Blast', 'ARIA Shield', 'Great Pitch', 'AI Enhance'],
    sprite: [
      0,0,1,1,1,1,0,0,
      0,1,4,4,4,4,1,0,
      1,4,1,4,4,1,4,1,
      1,4,4,4,4,4,4,1,
      1,4,3,4,4,3,4,1,
      0,1,4,3,3,4,1,0,
      0,0,1,4,4,1,0,0,
      0,1,1,0,0,1,1,0,
    ],
  },
  {
    name: 'TYPO3SAUR',
    project: 'FAIR Packages',
    hp: 110,
    attacks: ['Composer Strike', 'Crypto Verify', 'Federation Beam', 'Amazing Social Media Campaign'],
    sprite: [
      0,0,0,1,1,0,0,0,
      0,0,1,3,3,1,0,0,
      0,1,3,1,3,3,1,0,
      1,3,3,3,3,3,3,1,
      1,2,3,3,3,3,2,1,
      0,1,3,3,3,3,1,0,
      0,1,2,0,0,2,1,0,
      0,1,1,0,0,1,1,0,
    ],
  },
  {
    name: 'DOCUMON',
    project: 'Block2Docs',
    hp: 80,
    attacks: ['Changelog Beam', 'API Reference', 'DocBlock Parse', 'Great Pitch'],
    sprite: [
      0,1,1,1,1,1,1,0,
      0,1,4,4,4,3,1,0,
      0,1,4,2,2,4,1,0,
      0,1,4,2,2,4,1,0,
      0,1,4,4,4,4,1,0,
      0,1,4,2,2,4,1,0,
      0,1,4,4,4,4,1,0,
      0,1,1,1,1,1,1,0,
    ],
  },
  {
    name: 'AGENTIX',
    project: 'WP Agentic Admin',
    hp: 105,
    attacks: ['WebGPU Blast', 'Local Inference', 'Privacy Shield', 'Amazing Social Media Campaign'],
    sprite: [
      0,0,1,1,1,1,0,0,
      0,1,2,3,3,2,1,0,
      1,2,4,2,2,4,2,1,
      1,3,3,3,3,3,3,1,
      0,1,3,4,4,3,1,0,
      0,0,1,3,3,1,0,0,
      0,1,2,1,1,2,1,0,
      1,2,0,0,0,0,2,1,
    ],
  },
  {
    name: 'TESTALLY',
    project: 'TestAlly',
    hp: 90,
    attacks: ['WCAG Slam', 'Manual Test', 'Green Foundation', 'Step-by-Step Strike'],
    sprite: [
      0,0,1,1,1,0,0,0,
      0,1,3,3,3,1,0,0,
      1,3,1,3,1,3,1,0,
      1,3,3,3,3,3,1,0,
      0,1,3,2,3,1,0,0,
      0,1,4,4,4,1,0,0,
      0,1,2,4,2,1,0,0,
      0,1,0,0,0,1,0,0,
    ],
  },
  {
    name: 'GREENROUTE',
    project: 'Frugal AI',
    hp: 100,
    attacks: ['Carbon Dash', 'Green Foundation', 'Efficient Route', 'Great Pitch'],
    sprite: [
      0,0,0,3,3,0,0,0,
      0,0,3,4,4,3,0,0,
      0,3,4,3,3,4,3,0,
      3,4,3,2,2,3,4,3,
      3,3,3,3,3,3,3,3,
      0,1,3,3,3,3,1,0,
      0,0,1,2,2,1,0,0,
      0,0,1,0,0,1,0,0,
    ],
  },
  {
    name: 'SWORDOCK',
    project: 'SWORD Docker',
    hp: 115,
    attacks: ['Container Slash', 'Self-Host Shield', 'Docker Compose', 'Amazing Social Media Campaign'],
    sprite: [
      0,0,0,1,0,0,0,0,
      0,0,1,3,1,0,0,0,
      0,1,3,3,3,1,0,0,
      0,0,1,3,1,0,0,0,
      0,0,1,2,1,0,0,0,
      0,1,1,2,1,1,0,0,
      0,0,0,2,0,0,0,0,
      0,0,1,1,1,0,0,0,
    ],
  },
  {
    name: 'INSIGHTOR',
    project: 'WP Plugin Insight',
    hp: 95,
    attacks: ['Code Scan', 'Vuln Detect', 'Great Pitch', 'Deep Analysis'],
    sprite: [
      0,0,0,0,1,1,0,0,
      0,0,0,1,3,3,1,0,
      0,0,1,3,4,3,1,0,
      0,0,1,3,3,3,1,0,
      0,0,0,1,1,1,0,0,
      0,1,1,0,0,0,0,0,
      1,3,3,1,0,0,0,0,
      1,1,1,1,0,0,0,0,
    ],
  },
  {
    name: 'BUILDEON',
    project: 'AI Plugin Builder',
    hp: 85,
    attacks: ['Auto Generate', 'Plugin Forge', 'Green Foundation', 'Amazing Social Media Campaign'],
    sprite: [
      0,1,1,1,1,1,1,0,
      1,3,3,3,3,3,3,1,
      1,3,1,3,3,1,3,1,
      1,3,3,4,4,3,3,1,
      1,3,3,4,4,3,3,1,
      1,2,3,3,3,3,2,1,
      0,1,2,2,2,2,1,0,
      0,0,1,1,1,1,0,0,
    ],
  },
  {
    name: 'SCANATRON',
    project: 'Responsibility Scanner',
    hp: 100,
    attacks: ['Sustainability Beam', 'Accessibility Scan', 'Great Pitch', 'Green Foundation'],
    sprite: [
      0,0,1,1,1,1,0,0,
      0,1,3,3,3,3,1,0,
      1,3,4,3,3,4,3,1,
      1,3,3,4,4,3,3,1,
      1,3,3,4,4,3,3,1,
      1,3,4,3,3,4,3,1,
      0,1,3,3,3,3,1,0,
      0,0,1,1,1,1,0,0,
    ],
  },
];

// GB palette lookup
const GB_COLORS = [0x000000, GB_DARKEST, GB_DARK, GB_LIGHT, GB_LIGHTEST];

// --- State ---
let canvasW = 0;
let canvasH = 0;

// Pre-rendered sprites and text
let spriteDataUrls: string[] = [];
let nameTextures: string[] = [];
let attackTextures: string[][] = [];
let miscTextures: Record<string, string> = {};

// Pre-rendered HP bars at discrete steps (0%, 5%, 10%, ... 100%)
const HP_STEPS = 21;
let hpBarTextures: string[] = [];

// Pre-rendered battle text (indexed by pokemon)
let usedTextures: string[] = [];      // "X used"
let faintedTextures: string[] = [];   // "X fainted!"
let winsTextures: string[] = [];      // "X wins!"
let vsTextures: string[] = [];        // "X vs Y!" — indexed as playerIdx * POKEMON.length + enemyIdx
let projTextures: string[] = [];      // project name per pokemon
let vsProjTextures: string[] = [];    // "vs ProjectName" per pokemon
let attackNameTextures: string[][] = []; // "AttackName!" per pokemon per attack

// Battle state
let playerIdx = 0;
let enemyIdx = 1;
let playerHp = 100;
let enemyHp = 100;
let playerMaxHp = 100;
let enemyMaxHp = 100;
let battlePhase = 0; // 0=intro, 1=playerAttack, 2=enemyAttack, 3=faint, 4=nextBattle
let phaseTimer = 0;
let currentAttackName = '';
let currentAttackIdx = 0;
let attackFlashTimer = 0;
let battlesCompleted = 0;
let shakeOffsetX = 0;
let shakeOffsetY = 0;

// Pre-render text to canvas data URL
function renderText(text: string, color: string, fontSize: number, width: number, height: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.font = `bold ${fontSize}px monospace`;
  ctx.textBaseline = 'top';
  ctx.fillText(text, 2, 2);
  const url = canvas.toDataURL();
  canvas.width = 0;
  canvas.height = 0;
  return url;
}

// Pre-render a Pokemon sprite (scaled up)
function renderSprite(pokemon: PokemonDef, scale: number, flip: boolean): string {
  const size = SPRITE_SIZE * scale;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  for (let y = 0; y < SPRITE_SIZE; y++) {
    for (let x = 0; x < SPRITE_SIZE; x++) {
      const val = pokemon.sprite[y * SPRITE_SIZE + x];
      if (val === 0) continue;
      const hex = GB_COLORS[val];
      const r = (hex >> 16) & 0xff;
      const g = (hex >> 8) & 0xff;
      const b = hex & 0xff;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      const px = flip ? (SPRITE_SIZE - 1 - x) * scale : x * scale;
      ctx.fillRect(px, y * scale, scale, scale);
    }
  }

  const url = canvas.toDataURL();
  canvas.width = 0;
  canvas.height = 0;
  return url;
}

// Pre-render the text box background
function renderTextBox(w: number, h: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // GB style border
  const r = (GB_LIGHTEST >> 16) & 0xff;
  const g = (GB_LIGHTEST >> 8) & 0xff;
  const b = GB_LIGHTEST & 0xff;
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, w, h);

  const r2 = (GB_DARKEST >> 16) & 0xff;
  const g2 = (GB_DARKEST >> 8) & 0xff;
  const b2 = GB_DARKEST & 0xff;
  ctx.strokeStyle = `rgb(${r2},${g2},${b2})`;
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, w - 4, h - 4);

  const url = canvas.toDataURL();
  canvas.width = 0;
  canvas.height = 0;
  return url;
}

// Pre-render HP bar
function renderHpBar(current: number, max: number, w: number, h: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = '#0f380f';
  ctx.fillRect(0, 0, w, h);

  // HP fill
  const ratio = Math.max(0, current / max);
  let fillColor = '#8bac0f'; // green
  if (ratio < 0.5) fillColor = '#c8b800'; // yellow-ish in GB
  if (ratio < 0.2) fillColor = '#a03030'; // red-ish
  ctx.fillStyle = fillColor;
  ctx.fillRect(2, 2, (w - 4) * ratio, h - 4);

  // Border
  ctx.strokeStyle = '#306230';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, w, h);

  const url = canvas.toDataURL();
  canvas.width = 0;
  canvas.height = 0;
  return url;
}

function pickTwoPokemon(): void {
  playerIdx = Math.floor(Math.random() * POKEMON.length);
  do {
    enemyIdx = Math.floor(Math.random() * POKEMON.length);
  } while (enemyIdx === playerIdx);

  playerMaxHp = POKEMON[playerIdx].hp;
  enemyMaxHp = POKEMON[enemyIdx].hp;
  playerHp = playerMaxHp;
  enemyHp = enemyMaxHp;
  battlePhase = 0;
  phaseTimer = 0;
  currentAttackIdx = 0;
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    // Pre-render all sprites (enemy = normal, player = flipped, both scaled)
    const spriteScale = Math.max(4, Math.floor(canvasW / 50));
    spriteDataUrls = [];
    nameTextures = [];
    attackTextures = [];

    for (let i = 0; i < POKEMON.length; i++) {
      const p = POKEMON[i];
      // Render both orientations and store as "idx_normal" and "idx_flip"
      spriteDataUrls.push(renderSprite(p, spriteScale, false));
      spriteDataUrls.push(renderSprite(p, spriteScale, true));

      // Name texture
      nameTextures.push(renderText(p.name, '#0f380f', 14, 180, 20));

      // Attack textures
      const atkTextures: string[] = [];
      for (let a = 0; a < p.attacks.length; a++) {
        atkTextures.push(renderText(p.attacks[a], '#0f380f', 12, 250, 18));
      }
      attackTextures.push(atkTextures);
    }

    // Misc textures
    miscTextures = {
      textBox: renderTextBox(canvasW - 10, 80),
    };

    // Pre-render HP bars at discrete levels
    hpBarTextures = [];
    for (let step = 0; step < HP_STEPS; step++) {
      const ratio = step / (HP_STEPS - 1);
      hpBarTextures.push(renderHpBar(ratio * 100, 100, 130, 12));
    }

    // Pre-render all battle text per pokemon
    usedTextures = [];
    faintedTextures = [];
    winsTextures = [];
    projTextures = [];
    vsProjTextures = [];
    attackNameTextures = [];

    for (let i = 0; i < POKEMON.length; i++) {
      const p = POKEMON[i];
      usedTextures.push(renderText(`${p.name} used`, '#0f380f', 11, canvasW - 30, 18));
      faintedTextures.push(renderText(`${p.name} fainted!`, '#0f380f', 12, canvasW - 30, 18));
      winsTextures.push(renderText(`${p.name} wins!`, '#0f380f', 12, canvasW - 30, 18));
      projTextures.push(renderText(p.project, '#306230', 10, 200, 16));
      vsProjTextures.push(renderText(`vs ${p.project}`, '#306230', 10, 200, 16));

      const atkNameTexts: string[] = [];
      for (let a = 0; a < p.attacks.length; a++) {
        atkNameTexts.push(renderText(p.attacks[a] + '!', '#0f380f', 12, canvasW - 30, 18));
      }
      attackNameTextures.push(atkNameTexts);
    }

    // Pre-render VS matchup text for all pairs
    vsTextures = [];
    for (let i = 0; i < POKEMON.length; i++) {
      for (let j = 0; j < POKEMON.length; j++) {
        vsTextures.push(renderText(
          `${POKEMON[i].name} vs ${POKEMON[j].name}!`,
          '#0f380f', 11, canvasW - 30, 18
        ));
      }
    }

    pickTwoPokemon();
    battlesCompleted = 0;
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const dt = frame.deltaTime / 1000;
    phaseTimer += dt;

    // GB-style background
    api.brush.background(GB_LIGHTEST);

    const spriteScale = Math.max(4, Math.floor(canvasW / 50));
    const spritePixels = SPRITE_SIZE * spriteScale;

    // --- Layout ---
    // Enemy: top-right area
    const enemyX = canvasW - spritePixels - 20;
    const enemyY = 40;
    // Player: bottom-left area
    const playerX = 20;
    const playerY = canvasH - spritePixels - 140;

    // --- Attack flash & shake ---
    attackFlashTimer = Math.max(0, attackFlashTimer - dt);
    if (attackFlashTimer > 0) {
      const shake = Math.sin(attackFlashTimer * 40) * 3;
      if (battlePhase === 1) {
        shakeOffsetX = shake;
        shakeOffsetY = 0;
      } else if (battlePhase === 2) {
        shakeOffsetX = 0;
        shakeOffsetY = shake;
      }
    } else {
      shakeOffsetX = 0;
      shakeOffsetY = 0;
    }

    // --- Draw enemy Pokemon ---
    const eShakeX = battlePhase === 1 ? shakeOffsetX : 0;
    const eShakeY = battlePhase === 1 ? shakeOffsetY : 0;
    api.brush.image(spriteDataUrls[enemyIdx * 2], enemyX + eShakeX, enemyY + eShakeY, {
      width: spritePixels, height: spritePixels, anchorX: 0, anchorY: 0,
    });

    // Enemy name & HP
    api.brush.image(nameTextures[enemyIdx], 15, enemyY, {
      width: 160, height: 18, anchorX: 0, anchorY: 0,
    });
    // Enemy HP bar (use pre-rendered discrete step)
    const eHpStep = Math.round((Math.max(0, enemyHp) / enemyMaxHp) * (HP_STEPS - 1));
    api.brush.image(hpBarTextures[eHpStep], 15, enemyY + 22, {
      width: 130, height: 12, anchorX: 0, anchorY: 0,
    });

    // --- Draw player Pokemon (flipped) ---
    const pShakeX = battlePhase === 2 ? shakeOffsetX : 0;
    const pShakeY = battlePhase === 2 ? shakeOffsetY : 0;
    api.brush.image(spriteDataUrls[playerIdx * 2 + 1], playerX + pShakeX, playerY + pShakeY, {
      width: spritePixels, height: spritePixels, anchorX: 0, anchorY: 0,
    });

    // Player name & HP (right-aligned area)
    const pInfoX = canvasW - 175;
    api.brush.image(nameTextures[playerIdx], pInfoX, playerY + 10, {
      width: 160, height: 18, anchorX: 0, anchorY: 0,
    });
    // Player HP bar (use pre-rendered discrete step)
    const pHpStep = Math.round((Math.max(0, playerHp) / playerMaxHp) * (HP_STEPS - 1));
    api.brush.image(hpBarTextures[pHpStep], pInfoX, playerY + 32, {
      width: 130, height: 12, anchorX: 0, anchorY: 0,
    });

    // --- GB-style divider line ---
    api.brush.line(0, canvasH - 120, canvasW, canvasH - 120, {
      color: GB_DARKEST, width: 3, alpha: 1,
    });

    // --- Text box at bottom ---
    api.brush.image(miscTextures.textBox, 5, canvasH - 115, {
      width: canvasW - 10, height: 80, anchorX: 0, anchorY: 0,
    });

    // --- Battle logic ---
    const enemy = POKEMON[enemyIdx];
    const player = POKEMON[playerIdx];

    if (battlePhase === 0) {
      // Intro phase - show matchup (use pre-rendered VS text)
      api.brush.image(vsTextures[playerIdx * POKEMON.length + enemyIdx], 20, canvasH - 100, {
        width: canvasW - 40, height: 16, anchorX: 0, anchorY: 0,
      });
      // Show project names
      api.brush.image(projTextures[playerIdx], 20, canvasH - 78, {
        width: 200, height: 14, anchorX: 0, anchorY: 0,
      });
      api.brush.image(vsProjTextures[enemyIdx], 20, canvasH - 60, {
        width: 200, height: 14, anchorX: 0, anchorY: 0,
      });

      if (phaseTimer > 3) {
        battlePhase = 1;
        phaseTimer = 0;
        currentAttackIdx = Math.floor(Math.random() * player.attacks.length);
        attackFlashTimer = 0.5;
      }
    } else if (battlePhase === 1) {
      // Player attacks — use pre-rendered textures
      api.brush.image(usedTextures[playerIdx], 20, canvasH - 100, {
        width: canvasW - 40, height: 16, anchorX: 0, anchorY: 0,
      });
      api.brush.image(attackNameTextures[playerIdx][currentAttackIdx], 20, canvasH - 78, {
        width: canvasW - 40, height: 16, anchorX: 0, anchorY: 0,
      });

      // Damage over time
      if (phaseTimer > 0.5 && phaseTimer < 2) {
        enemyHp = Math.max(0, enemyHp - dt * 25);
      }

      if (phaseTimer > 2.5) {
        if (enemyHp <= 0) {
          battlePhase = 3;
          phaseTimer = 0;
        } else {
          battlePhase = 2;
          phaseTimer = 0;
          currentAttackIdx = Math.floor(Math.random() * enemy.attacks.length);
          attackFlashTimer = 0.5;
        }
      }
    } else if (battlePhase === 2) {
      // Enemy attacks — use pre-rendered textures
      api.brush.image(usedTextures[enemyIdx], 20, canvasH - 100, {
        width: canvasW - 40, height: 16, anchorX: 0, anchorY: 0,
      });
      api.brush.image(attackNameTextures[enemyIdx][currentAttackIdx], 20, canvasH - 78, {
        width: canvasW - 40, height: 16, anchorX: 0, anchorY: 0,
      });

      if (phaseTimer > 0.5 && phaseTimer < 2) {
        playerHp = Math.max(0, playerHp - dt * 20);
      }

      if (phaseTimer > 2.5) {
        if (playerHp <= 0) {
          battlePhase = 3;
          phaseTimer = 0;
        } else {
          battlePhase = 1;
          phaseTimer = 0;
          currentAttackIdx = Math.floor(Math.random() * player.attacks.length);
          attackFlashTimer = 0.5;
        }
      }
    } else if (battlePhase === 3) {
      // Faint — use pre-rendered textures
      const faintedIdx = enemyHp <= 0 ? enemyIdx : playerIdx;
      const winnerIdx = enemyHp <= 0 ? playerIdx : enemyIdx;
      api.brush.image(faintedTextures[faintedIdx], 20, canvasH - 100, {
        width: canvasW - 40, height: 16, anchorX: 0, anchorY: 0,
      });
      api.brush.image(winsTextures[winnerIdx], 20, canvasH - 78, {
        width: canvasW - 40, height: 16, anchorX: 0, anchorY: 0,
      });

      if (phaseTimer > 4) {
        battlesCompleted++;
        pickTwoPokemon();
      }
    }

    // Pixelate for GB feel
    api.filter.pixelate(2);
  },

  async teardown(): Promise<void> {
    canvasW = 0;
    canvasH = 0;
    spriteDataUrls = [];
    nameTextures = [];
    attackTextures = [];
    miscTextures = {};
    hpBarTextures = [];
    usedTextures = [];
    faintedTextures = [];
    winsTextures = [];
    vsTextures = [];
    projTextures = [];
    vsProjTextures = [];
    attackNameTextures = [];
    battlesCompleted = 0;
  },
};

registerActor(actor);
export default actor;
