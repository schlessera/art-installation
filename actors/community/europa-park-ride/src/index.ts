import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

interface Point {
  x: number;
  y: number;
}

const metadata: ActorMetadata = {
  id: 'europa-park-ride',
  name: 'Europa Park Ride',
  description: 'Minimalist 3D red sphere and blue cube coasters traversing a theme park track',
  author: {
    name: 'Antigravity Agent',
    github: 'artificial',
  },
  version: '1.0.0',
  tags: ['3d', 'coaster', 'theme-park', 'geometry'],
  createdAt: new Date(),
  preferredDuration: 30,
  requiredContexts: ['display'],
};

const NUM_TRACK_POINTS = 120;
let track1: Point[] = [];
let track2: Point[] = [];

// Pre-allocated geometries for the isometric blue cube
const s = 25; // cube size (half-diagonal)
const topFace: Point[] = [
  { x: 0, y: -s },
  { x: s, y: -s / 2 },
  { x: 0, y: 0 },
  { x: -s, y: -s / 2 },
];
const rightFace: Point[] = [
  { x: 0, y: 0 },
  { x: s, y: -s / 2 },
  { x: s, y: s / 2 },
  { x: 0, y: s },
];
const leftFace: Point[] = [
  { x: 0, y: 0 },
  { x: 0, y: s },
  { x: -s, y: s / 2 },
  { x: -s, y: -s / 2 },
];

let width = 0;
let height = 0;

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    width = size.width;
    height = size.height;

    // Pre-allocate tracks
    track1 = [];
    track2 = [];
    
    const cx = width / 2;
    const cy = height / 2;
    const rx = width * 0.35;
    const ry = height * 0.35;

    for (let i = 0; i <= NUM_TRACK_POINTS; i++) {
      const t = (i / NUM_TRACK_POINTS) * Math.PI * 2;
      
      // Figure-8 for track 1 (Red Sphere)
      track1.push({
        x: cx + rx * Math.sin(t),
        y: cy + ry * Math.sin(t) * Math.cos(t)
      });
      
      // Slanted elliptical orbit for track 2 (Blue Cube)
      track2.push({
        x: cx + rx * Math.cos(t),
        y: cy + ry * 0.6 * Math.sin(t) + 50 * Math.cos(t)
      });
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const time = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();

    // Theming colors
    const trackColor = isDark ? 0x666666 : 0xdddddd;
    const shadowColor = isDark ? 0x000000 : 0x000000;
    const shadowAlpha = isDark ? 0.6 : 0.2;
    const cubeTop = 0x4488ff;
    const cubeRight = 0x0044cc;
    const cubeLeft = 0x002288;
    const bgPulse = isDark ? 0x222233 : 0xf0f0f5;

    // Subtle background effect (Theme park energy)
    // We make a flashing center pulse occasionally
    const pulseAlpha = Math.max(0, Math.sin(time * Math.PI * 0.5)) * 0.1;
    if (pulseAlpha > 0.05) {
      api.brush.circle(width / 2, height / 2, Math.min(width, height) * 0.4, {
        fill: bgPulse,
        alpha: pulseAlpha,
      });
    }

    // Draw Tracks
    api.brush.stroke(track1, { color: trackColor, width: 4, alpha: 0.7 });
    api.brush.stroke(track2, { color: trackColor, width: 4, alpha: 0.7 });

    // Track 1 Coaster (Red Sphere)
    // Find Position
    const t1 = (time * 0.4) % (Math.PI * 2);
    const cx = width / 2;
    const cy = height / 2;
    const rx = width * 0.35;
    const ry = height * 0.35;
    const sphereX = cx + rx * Math.sin(t1);
    const sphereY = cy + ry * Math.sin(t1) * Math.cos(t1);

    // Sphere Shadow
    api.brush.ellipse(sphereX, sphereY + 40, 35, 12, { fill: shadowColor, alpha: shadowAlpha });
    
    // Sphere Body (3D gradient)
    api.brush.circle(sphereX, sphereY, 30, {
      fill: {
        type: 'radial',
        cx: 0.3,
        cy: 0.3,
        radius: 0.6,
        stops: [
          { offset: 0, color: 0xff6666 },
          { offset: 0.8, color: 0xd90000 },
          { offset: 1, color: 0x880000 },
        ],
      },
    });

    // Track 2 Coaster (Blue Cube)
    const t2 = (time * 0.3) % (Math.PI * 2);
    const cubeX = cx + rx * Math.cos(t2);
    const cubeY = cy + ry * 0.6 * Math.sin(t2) + 50 * Math.cos(t2);

    // Cube Shadow
    api.brush.ellipse(cubeX, cubeY + 45, 45, 16, { fill: shadowColor, alpha: shadowAlpha });

    // Draw Iso-Cube
    api.brush.pushMatrix();
    api.brush.translate(cubeX, cubeY);
    api.brush.polygon(topFace, { fill: cubeTop });
    api.brush.polygon(rightFace, { fill: cubeRight });
    api.brush.polygon(leftFace, { fill: cubeLeft });
    api.brush.popMatrix();
  },

  async teardown(): Promise<void> {
    track1 = [];
    track2 = [];
  },
};

registerActor(actor);
export default actor;
