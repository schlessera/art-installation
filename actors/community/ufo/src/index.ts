import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'ufo',
  name: 'UFO Cow Abduction',
  description: 'A UFO descends and abducts a cow with a tractor beam',
  author: { name: 'Jan', github: 'janw-ll' },
  version: '1.0.0',
  tags: ['ufo', 'cow', 'abduction', 'funny', 'animation'],
  createdAt: new Date(),
  preferredDuration: 30,
  requiredContexts: ['display'],
};

// Pre-allocated state
const MAX_LIGHTS = 6;
const CYCLE_DURATION = 12; // seconds per abduction cycle

let canvasW = 0;
let canvasH = 0;
let groundY = 0;
let ufoX = 0;
let ufoY = 0;
let cowBaseX = 0;
let cowBaseY = 0;
let cowCurrentY = 0;
let cowRotation = 0;
let beamOn = false;
let cycleTime = 0;

// UFO lights - pre-allocated
const lights: Array<{ angle: number; color: number }> = [];

// Pre-rendered glow texture
let glowDataUrl = '';

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    groundY = canvasH * 0.82;
    ufoX = canvasW * 0.5;
    ufoY = canvasH * 0.18;
    cowBaseX = canvasW * 0.5;
    cowBaseY = groundY;
    cowCurrentY = cowBaseY;
    cowRotation = 0;
    beamOn = false;
    cycleTime = 0;

    // Pre-allocate UFO lights
    lights.length = 0;
    const lightColors = [0xff0000, 0x00ff00, 0x0088ff, 0xffff00, 0xff00ff, 0x00ffff];
    for (let i = 0; i < MAX_LIGHTS; i++) {
      lights.push({
        angle: (i / MAX_LIGHTS) * Math.PI * 2,
        color: lightColors[i % lightColors.length],
      });
    }

    // Pre-render glow texture for beam particles
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
    const t = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();
    cycleTime = t % CYCLE_DURATION;

    // Animation phases within each cycle:
    // 0-2s:   UFO arrives/hovers
    // 2-3s:   Beam turns on
    // 3-8s:   Cow rises
    // 8-9.5s: Cow near UFO
    // 9.5-10.5s: Cow disappears
    // 10.5-12s: UFO hovers, beam off, cow resets

    const ufoHoverOffset = Math.sin(t * 1.5) * 8;
    const ufoBaseY = canvasH * 0.18;
    ufoY = ufoBaseY + ufoHoverOffset;
    ufoX = canvasW * 0.5 + Math.sin(t * 0.7) * 15;

    // Determine cow position based on cycle phase
    if (cycleTime < 2) {
      // UFO arriving - cow on ground
      beamOn = false;
      cowCurrentY = cowBaseY;
      cowRotation = 0;
    } else if (cycleTime < 3) {
      // Beam turning on
      beamOn = true;
      cowCurrentY = cowBaseY;
      cowRotation = 0;
    } else if (cycleTime < 8) {
      // Cow rising
      beamOn = true;
      const liftProgress = (cycleTime - 3) / 5;
      const eased = 1 - Math.pow(1 - liftProgress, 2); // ease-out quad
      cowCurrentY = cowBaseY - eased * (cowBaseY - ufoY - 50);
      cowRotation = Math.sin(t * 3) * 0.15 * eased;
    } else if (cycleTime < 9.5) {
      // Cow near UFO, wobbling
      beamOn = true;
      cowCurrentY = ufoY + 50 + Math.sin(t * 4) * 5;
      cowRotation = Math.sin(t * 5) * 0.25;
    } else if (cycleTime < 10.5) {
      // Cow disappearing (shrink + fade handled in draw)
      beamOn = true;
      cowCurrentY = ufoY + 40;
      cowRotation = t * 4;
    } else {
      // Reset
      beamOn = false;
      cowCurrentY = cowBaseY;
      cowRotation = 0;
    }

    // --- Draw grass/ground ---
    const grassColor = isDark ? 0x1a3a1a : 0x2d5a1e;
    api.brush.rect(0, groundY, canvasW, canvasH - groundY, { fill: grassColor, alpha: 0.8 });

    // Grass tufts
    for (let gx = 10; gx < canvasW; gx += 25) {
      const gh = 6 + Math.sin(gx * 0.3 + t) * 3;
      api.brush.line(gx, groundY, gx - 3, groundY - gh, { color: 0x3a7a2a, width: 2, alpha: 0.7 });
      api.brush.line(gx, groundY, gx + 3, groundY - gh, { color: 0x3a7a2a, width: 2, alpha: 0.7 });
    }

    // --- Draw tractor beam ---
    if (beamOn) {
      const beamAlpha = cycleTime < 3
        ? (cycleTime - 2) * 0.6
        : cycleTime > 9.5 && cycleTime < 10.5
          ? (10.5 - cycleTime) * 0.6
          : 0.6;

      if (beamAlpha >= 0.05) {
        // Beam cone - use polygon for trapezoid shape
        const beamTopHalfW = 18;
        const beamBotHalfW = 45;
        const beamTop = ufoY + 18;
        const beamBot = groundY;

        api.brush.polygon(
          [
            { x: ufoX - beamTopHalfW, y: beamTop },
            { x: ufoX + beamTopHalfW, y: beamTop },
            { x: ufoX + beamBotHalfW, y: beamBot },
            { x: ufoX - beamBotHalfW, y: beamBot },
          ],
          { fill: 0x88ffaa, alpha: beamAlpha * 0.3, blendMode: 'add' }
        );

        // Inner brighter beam
        api.brush.polygon(
          [
            { x: ufoX - beamTopHalfW * 0.5, y: beamTop },
            { x: ufoX + beamTopHalfW * 0.5, y: beamTop },
            { x: ufoX + beamBotHalfW * 0.5, y: beamBot },
            { x: ufoX - beamBotHalfW * 0.5, y: beamBot },
          ],
          { fill: 0xccffdd, alpha: beamAlpha * 0.25, blendMode: 'add' }
        );

        // Beam particles using pre-rendered glow
        for (let p = 0; p < 8; p++) {
          const py = beamTop + ((t * 80 + p * 50) % (beamBot - beamTop));
          const widthAtY = beamTopHalfW + (beamBotHalfW - beamTopHalfW) * ((py - beamTop) / (beamBot - beamTop));
          const px = ufoX + Math.sin(t * 3 + p * 1.7) * widthAtY * 0.6;
          api.brush.image(glowDataUrl, px, py, {
            width: 12, height: 12,
            tint: 0x88ffcc,
            alpha: 0.5,
            blendMode: 'add',
            anchorX: 0.5, anchorY: 0.5,
          });
        }
      }
    }

    // --- Draw cow (unless disappeared) ---
    const cowVisible = cycleTime < 10.5 || cycleTime >= 11;
    if (cowVisible) {
      let cowAlpha = 1.0;
      let cowScale = 1.0;
      if (cycleTime >= 9.5 && cycleTime < 10.5) {
        const disappearProgress = (cycleTime - 9.5);
        cowAlpha = Math.max(0.05, 1 - disappearProgress);
        cowScale = Math.max(0.1, 1 - disappearProgress * 0.8);
      }

      if (cowAlpha >= 0.05) {
        api.brush.pushMatrix();
        api.brush.translate(cowBaseX, cowCurrentY);
        api.brush.rotate(cowRotation);
        api.brush.scale(cowScale, cowScale);

        // Cow body
        api.brush.ellipse(0, -12, 36, 20, { fill: 0xffffff, alpha: cowAlpha * 0.95 });

        // Black spots on cow
        api.brush.circle(-8, -16, 7, { fill: 0x222222, alpha: cowAlpha * 0.85 });
        api.brush.circle(10, -10, 5, { fill: 0x222222, alpha: cowAlpha * 0.85 });
        api.brush.circle(-2, -6, 4, { fill: 0x222222, alpha: cowAlpha * 0.85 });

        // Cow head
        api.brush.circle(-22, -18, 10, { fill: 0xffffff, alpha: cowAlpha * 0.95 });
        // Snout
        api.brush.ellipse(-28, -16, 7, 5, { fill: 0xffccaa, alpha: cowAlpha * 0.9 });
        // Eye
        api.brush.circle(-24, -21, 2, { fill: 0x111111, alpha: cowAlpha });
        // Ear
        api.brush.ellipse(-17, -26, 5, 3, { fill: 0xffccaa, alpha: cowAlpha * 0.85 });

        // Horns
        api.brush.line(-20, -27, -22, -34, { color: 0xccaa77, width: 2.5, alpha: cowAlpha * 0.9 });
        api.brush.line(-16, -26, -14, -33, { color: 0xccaa77, width: 2.5, alpha: cowAlpha * 0.9 });

        // Legs (4 legs)
        const legKick = cycleTime >= 3 && cycleTime < 10 ? Math.sin(t * 8) * 0.2 : 0;
        api.brush.rect(-14, -2, 5, 16, { fill: 0xffffff, alpha: cowAlpha * 0.9 });
        api.brush.rect(-5, -2, 5, 14 + Math.sin(t * 8 + 1) * (legKick * 15), { fill: 0xffffff, alpha: cowAlpha * 0.9 });
        api.brush.rect(6, -2, 5, 16, { fill: 0xffffff, alpha: cowAlpha * 0.9 });
        api.brush.rect(15, -2, 5, 14 + Math.sin(t * 8 + 2) * (legKick * 15), { fill: 0xffffff, alpha: cowAlpha * 0.9 });

        // Hooves
        api.brush.rect(-15, 13, 7, 4, { fill: 0x333333, alpha: cowAlpha * 0.9 });
        api.brush.rect(5, 13, 7, 4, { fill: 0x333333, alpha: cowAlpha * 0.9 });

        // Tail
        const tailSwing = Math.sin(t * 4) * 0.4;
        api.brush.line(18, -14, 28 + Math.sin(t * 3) * 5, -20 + Math.cos(t * 4) * 4, {
          color: 0xffffff, width: 2.5, alpha: cowAlpha * 0.8,
        });
        // Tail tuft
        api.brush.circle(28 + Math.sin(t * 3) * 5, -20 + Math.cos(t * 4) * 4, 3, {
          fill: 0x222222, alpha: cowAlpha * 0.8,
        });

        // Udder
        api.brush.ellipse(2, 2, 6, 4, { fill: 0xffaaaa, alpha: cowAlpha * 0.8 });

        api.brush.popMatrix();
      }
    }

    // --- Draw UFO ---
    api.brush.pushMatrix();
    api.brush.translate(ufoX, ufoY);

    // UFO glow underneath
    api.brush.image(glowDataUrl, 0, 10, {
      width: 100, height: 50,
      tint: 0x44ff88,
      alpha: beamOn ? 0.5 : 0.2,
      blendMode: 'add',
      anchorX: 0.5, anchorY: 0.5,
    });

    // UFO body - main saucer
    api.brush.ellipse(0, 0, 50, 14, { fill: 0x888899, alpha: 0.95 });
    // Saucer rim highlight
    api.brush.ellipse(0, -3, 48, 8, { fill: 0xaaaabb, alpha: 0.7 });

    // Dome on top
    api.brush.ellipse(0, -12, 22, 14, {
      fill: {
        type: 'radial',
        cx: 0.5, cy: 0.3, radius: 0.5,
        stops: [
          { offset: 0, color: 0x99ddff },
          { offset: 0.7, color: 0x5588aa },
          { offset: 1, color: 0x446677 },
        ],
      },
      alpha: 0.9,
    });

    // Dome shine
    api.brush.ellipse(-5, -16, 6, 4, { fill: 0xffffff, alpha: 0.4 });

    // UFO bottom (where beam comes from)
    api.brush.ellipse(0, 8, 20, 6, { fill: 0x667788, alpha: 0.9 });

    // Rotating lights around the saucer rim
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const light = lights[i];
      const a = light.angle + t * 2;
      const lx = Math.cos(a) * 40;
      const ly = Math.sin(a) * 8;
      const brightness = (Math.sin(t * 4 + i * 1.2) + 1) * 0.5;
      const lightAlpha = 0.5 + brightness * 0.5;
      api.brush.circle(lx, ly, 3, { fill: light.color, alpha: lightAlpha, blendMode: 'add' });
    }

    api.brush.popMatrix();

    // --- Stars in sky (simple dots) ---
    for (let s = 0; s < 20; s++) {
      // Deterministic star positions based on index
      const sx = ((s * 137.5) % canvasW);
      const sy = ((s * 97.3 + 20) % (groundY * 0.7));
      const twinkle = 0.4 + Math.sin(t * 2 + s * 0.8) * 0.3;
      api.brush.circle(sx, sy, 1.5, { fill: 0xffffff, alpha: twinkle });
    }
  },

  async teardown(): Promise<void> {
    canvasW = 0;
    canvasH = 0;
    groundY = 0;
    cowCurrentY = 0;
    cowRotation = 0;
    beamOn = false;
    cycleTime = 0;
    lights.length = 0;
    glowDataUrl = '';
  },
};

registerActor(actor);
export default actor;
