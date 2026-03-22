import { registerActor } from '@art/actor-sdk';
import type { Actor, ActorSetupAPI, ActorUpdateAPI, FrameContext, ActorMetadata } from '@art/types';

interface Point3D { x: number; y: number; z: number; projX?: number; projY?: number; scale?: number; }
interface Point { x: number; y: number; }

type RenderItemType = 'track-line' | 'tunnel-ring' | 'shuttle-hyper' | 'shuttle-launch' | 'pillar' | 'tower' | 'euro-sat' | 'firework' | 'tree' | 'particle' | 'ferris-spoke' | 'ferris-cart' | 'star-logo' | 'monolith';

interface RenderItem {
  type: RenderItemType;
  z: number;
  x1: number; y1: number; s1: number;
  x2: number; y2: number; s2: number;
  id1: number; id2: number;
  angle: number;
}

const metadata: ActorMetadata = {
  id: 'europa-park-ride',
  name: 'Europa Park Ride: Phase IX Transcendence',
  description: 'Welcome to the mathematical absolute. Featuring Phase IX: towering continuous Torus-knot roller coaster inversions, dynamic warp-speed focal tracking, and deeply shaded 3D mesh volumes.',
  author: { name: 'Antigravity AI Reality', github: 'artificial' },
  version: '16.0.0',
  tags: ['3d', 'coaster', 'theme-park', 'zenith', 'geometry', 'award-winning', 'epic', 'synthwave', 'odyssey'],
  createdAt: new Date(),
  preferredDuration: 300,
  requiredContexts: ['display'],
};

// --- SCENE CONFIGURATION ---
const NUM_TRACK_POINTS = 160;
const NUM_TRAINS = 3;
const CARS_PER_TRAIN = 5;
const NUM_TREES = 110;
const NUM_PARTICLES = 100;
const NUM_SPOKES = 18;
const NUM_FIREWORKS = 12;

// Buffers
const items: RenderItem[] = [];
let renderQueue: RenderItem[] = [];

// Environment Data
const gridP1: Point3D = { x: 0, y: 0, z: 0 };
const gridP2: Point3D = { x: 0, y: 0, z: 0 };
const tempP1: Point3D = { x: 0, y: 0, z: 0 };
const tempP2: Point3D = { x: 0, y: 0, z: 0 };

// Star Logo 3D Geometry
interface StarPoint { x: number; y: number; z: number; }
const starBasePoints: StarPoint[] = [];
const starProjPoints: Point[] = [];

interface Tree { x: number; z: number; h: number; }
const trees: Tree[] = [];
interface Particle { x: number; y: number; z: number; phase: number; speed: number; }
const particles: Particle[] = [];
interface Tower { x: number; z: number; h: number; r: number; }
const towers: Tower[] = [
  { x: 800, z: 800, h: 580, r: 90 },
  { x: -800, z: 800, h: 500, r: 80 },
  { x: 800, z: -800, h: 620, r: 90 },
  { x: -800, z: -800, h: 480, r: 80 },
  { x: 0, z: 0, h: 750, r: 120 },
];

let width = 0;
let height = 0;

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    width = size.width;
    height = size.height;

    items.length = 0;
    renderQueue.length = 0;
    trees.length = 0;
    particles.length = 0;
    starBasePoints.length = 0;
    starProjPoints.length = 0;

    // Track, Pillar, Ring
    for (let t = 1; t <= 2; t++) {
      for (let i = 0; i < NUM_TRACK_POINTS; i++) {
        items.push({ type: 'track-line', z: 0, x1: 0, y1: 0, s1: 0, x2: 0, y2: 0, s2: 0, id1: t, id2: i, angle: 0 });
        if (i % 5 === 0) {
          items.push({ type: 'pillar', z: 0, x1: 0, y1: 0, s1: 0, x2: 0, y2: 0, s2: 0, id1: t, id2: i, angle: 0 });
        }
        if (i % 12 === 0 && t === 2) {
          items.push({ type: 'tunnel-ring', z: 0, x1: 0, y1: 0, s1: 0, x2: 0, y2: 0, s2: 0, id1: t, id2: i, angle: 0 });
        }
      }
    }

    // Trains
    for (let tr = 0; tr < NUM_TRAINS; tr++) {
      for (let c = 0; c < CARS_PER_TRAIN; c++) {
        items.push({ type: 'shuttle-hyper', z: 0, x1: 0, y1: 0, s1: 0, x2: 0, y2: 0, s2: 0, id1: 1, id2: c, angle: tr });
      }
      for (let c = 0; c < CARS_PER_TRAIN; c++) {
        items.push({ type: 'shuttle-launch', z: 0, x1: 0, y1: 0, s1: 0, x2: 0, y2: 0, s2: 0, id1: 2, id2: c, angle: tr });
      }
    }

    // Towers
    for (let i = 0; i < towers.length; i++) {
      items.push({ type: 'tower', z: 0, x1: 0, y1: 0, s1: 0, x2: 0, y2: 0, s2: 0, id1: i, id2: 0, angle: 0 });
    }

    // Euro-Sat Dome
    items.push({ type: 'euro-sat', z: 0, x1: 0, y1: 0, s1: 0, x2: 0, y2: 0, s2: 0, id1: 0, id2: 0, angle: 0 });

    // Ferris Wheel
    for (let i = 0; i < NUM_SPOKES; i++) {
      items.push({ type: 'ferris-spoke', z: 0, x1: 0, y1: 0, s1: 0, x2: 0, y2: 0, s2: 0, id1: i, id2: 0, angle: 0 });
      items.push({ type: 'ferris-cart', z: 0, x1: 0, y1: 0, s1: 0, x2: 0, y2: 0, s2: 0, id1: i, id2: 0, angle: 0 });
    }

    // Trees
    for (let i = 0; i < NUM_TREES; i++) {
      trees.push({ x: (Math.random() - 0.5) * 6000, z: (Math.random() - 0.5) * 6000, h: 80 + Math.random() * 140 });
      items.push({ type: 'tree', z: 0, x1: 0, y1: 0, s1: 0, x2: 0, y2: 0, s2: 0, id1: i, id2: 0, angle: 0 });
    }

    // Particles
    for (let i = 0; i < NUM_PARTICLES; i++) {
      particles.push({ x: (Math.random() - 0.5) * 4000, y: (Math.random() - 0.5) * 2000 - 500, z: (Math.random() - 0.5) * 4000, phase: Math.random() * Math.PI * 2, speed: Math.random() * 2 + 0.5 });
      items.push({ type: 'particle', z: 0, x1: 0, y1: 0, s1: 0, x2: 0, y2: 0, s2: 0, id1: i, id2: 0, angle: 0 });
    }

    // Fireworks
    for (let i = 0; i < NUM_FIREWORKS; i++) {
      items.push({ type: 'firework', z: 0, x1: 0, y1: 0, s1: 0, x2: 0, y2: 0, s2: 0, id1: i, id2: Math.random(), angle: 0 });
    }

    // The Europa Star & Monoliths
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 400 : 150;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      starBasePoints.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, z: 0 });
      starProjPoints.push({ x: 0, y: 0 });
    }
    items.push({ type: 'star-logo', z: 0, x1: 0, y1: 0, s1: 0, x2: 0, y2: 0, s2: 0, id1: 0, id2: 0, angle: 0 });

    for (let i = 0; i < 4; i++) {
      items.push({ type: 'monolith', z: 0, x1: 0, y1: 0, s1: 0, x2: 0, y2: 0, s2: 0, id1: i, id2: 0, angle: 0 });
    }

    renderQueue = [...items];
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const time = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();

    api.brush.background(isDark ? 0x010103 : 0x050212);

    const skyH = isDark ? 0x020208 : 0x050110;
    const skyM = isDark ? 0x0a001a : 0x1a0033;
    const skyL = isDark ? 0x011122 : 0x331144;
    api.brush.rect(0, 0, width, height, {
      fill: {
        type: 'linear', x0: 0, y0: 0, x1: 0, y1: 1,
        stops: [{ offset: 0, color: skyH }, { offset: 0.6, color: skyM }, { offset: 1, color: skyL }]
      },
      alpha: 1.0
    });

    const sunY = height * 0.45;
    api.brush.circle(width / 2, sunY, width * 0.4, {
      fill: {
        type: 'radial', cx: 0.5, cy: 0.5, radius: 0.5,
        stops: [
          { offset: 0, color: 0xffffff },
          { offset: 0.1, color: 0xffeedd },
          { offset: 0.35, color: 0xff4411 },
          { offset: 1, color: 0x000000 }
        ]
      },
      blendMode: 'add', alpha: 0.8
    });

    const orbitAngle = time * 0.15;
    const ORBIT_R = 4500 + Math.sin(time * 0.1) * 2000;
    const camPosX = Math.sin(orbitAngle) * ORBIT_R;
    const camPosZ = Math.cos(orbitAngle) * ORBIT_R;
    const camPosY = Math.sin(time * 0.2) * 700 - 500; // Swoops elegantly from high sky to track level
    const camAngle = orbitAngle + Math.PI + Math.sin(time*1.2)*0.05; 
    const pitchAngle = Math.atan2(-camPosY, ORBIT_R); // Locks focus onto the ground zero origin physically!

    const droneVelocity = Math.abs(Math.cos(time * 0.1));
    const FOV_SCALE = 1600 + droneVelocity * 1000; // Dynamic cinematic warp-zoom!

    function applyCamera(p: Point3D) {
      p.x -= camPosX;
      p.y -= camPosY;
      p.z -= camPosZ;

      const sA = Math.sin(camAngle); const cA = Math.cos(camAngle);
      const tx = p.x * cA - p.z * sA;
      const tz = p.x * sA + p.z * cA;

      const sP = Math.sin(pitchAngle); const cP = Math.cos(pitchAngle);
      const ty = p.y * cP - tz * sP;
      const tzz = p.y * sP + tz * cP;

      p.x = tx; p.y = ty; p.z = tzz;

      const zDepth = p.z;
      if (zDepth <= 10) { p.scale = -1; return; }
      p.scale = FOV_SCALE / zDepth;

      p.projX = width / 2 + p.x * p.scale;
      p.projY = height * 0.55 + p.y * p.scale;
    }

    const floorY = 450;

    function getTrack1(norm: number, out: Point3D) {
      const t = norm * Math.PI * 2;
      const p = 3; const q = 4; const r = 650;
      // 3D Torus Knot (Massive intertwining loops)
      out.x = r * (2 + Math.cos(q * t)) * Math.cos(p * t);
      out.z = r * (2 + Math.cos(q * t)) * Math.sin(p * t);
      out.y = r * 1.8 * Math.sin(q * t) - 600; 
    }

    function getTrack2(norm: number, out: Point3D) {
      const t = norm * Math.PI * 2;
      const p = 5; const q = 2; const r = 550;
      // Penta-knot sweeping inside the main track
      out.x = r * (2 + Math.cos(q * t)) * Math.cos(p * t);
      out.z = r * (2 + Math.cos(q * t)) * Math.sin(p * t);
      out.y = r * 1.5 * Math.sin(q * t) - 400;
    }

    let itemIdx = 0;

    // Build Tracks & Pillars & Rings
    for (let t = 1; t <= 2; t++) {
      for (let i = 0; i < NUM_TRACK_POINTS; i++) {
        const getTrack = t === 1 ? getTrack1 : getTrack2;

        getTrack(i / NUM_TRACK_POINTS, tempP1);
        const origX = tempP1.x; const origY = tempP1.y; const origZ = tempP1.z;
        applyCamera(tempP1);

        getTrack((i + 1) / NUM_TRACK_POINTS, tempP2);
        applyCamera(tempP2);

        const item = items[itemIdx++];
        item.x1 = tempP1.projX!; item.y1 = tempP1.projY!; item.s1 = tempP1.scale!;
        item.x2 = tempP2.projX!; item.y2 = tempP2.projY!; item.s2 = tempP2.scale!;
        item.z = (tempP1.z + tempP2.z) / 2;
        item.angle = Math.atan2(item.y2 - item.y1, item.x2 - item.x1);

        if (i % 5 === 0) {
          const pitem = items[itemIdx++];
          pitem.x1 = tempP1.projX!; pitem.y1 = tempP1.projY!; pitem.s1 = tempP1.scale!; pitem.z = tempP1.z; pitem.angle = item.angle;

          tempP2.x = origX; tempP2.y = 2000; tempP2.z = origZ; // Plunge to ocean floor
          applyCamera(tempP2);
          pitem.x2 = tempP2.projX!; pitem.y2 = tempP2.projY!; pitem.s2 = tempP2.scale!;
        }
        if (i % 12 === 0 && t === 2) {
          const rItem = items[itemIdx++];
          rItem.x1 = item.x1; rItem.y1 = item.y1; rItem.s1 = item.s1; rItem.z = item.z; rItem.angle = item.angle;
        }
      }
    }

    // Build Trains
    for (let tr = 0; tr < NUM_TRAINS; tr++) {
      const gOffset = tr * 0.333;
      const tSpeed1 = time * 0.08 + gOffset;
      for (let c = 0; c < CARS_PER_TRAIN; c++) {
        const tt1 = (tSpeed1 - c * 0.012) % 1.0;
        const tt2 = (tSpeed1 - c * 0.012 + 0.005) % 1.0;
        getTrack1(tt1 < 0 ? tt1 + 1 : tt1, tempP1); applyCamera(tempP1);
        getTrack1(tt2 < 0 ? tt2 + 1 : tt2, tempP2); applyCamera(tempP2);
        const item = items[itemIdx++];
        item.x1 = tempP1.projX!; item.y1 = tempP1.projY!; item.s1 = tempP1.scale!; item.z = tempP1.z;
        item.angle = Math.atan2(tempP2.projY! - tempP1.projY!, tempP2.projX! - tempP1.projX!);
      }

      const tSpeed2 = time * 0.06 + gOffset;
      for (let c = 0; c < CARS_PER_TRAIN; c++) {
        const tt1 = (tSpeed2 - c * 0.014) % 1.0;
        const tt2 = (tSpeed2 - c * 0.014 + 0.005) % 1.0;
        getTrack2(tt1 < 0 ? tt1 + 1 : tt1, tempP1); applyCamera(tempP1);
        getTrack2(tt2 < 0 ? tt2 + 1 : tt2, tempP2); applyCamera(tempP2);
        const item = items[itemIdx++];
        item.x1 = tempP1.projX!; item.y1 = tempP1.projY!; item.s1 = tempP1.scale!; item.z = tempP1.z;
        item.angle = Math.atan2(tempP2.projY! - tempP1.projY!, tempP2.projX! - tempP1.projX!);
      }
    }

    // Euro-Mir Towers
    for (let i = 0; i < towers.length; i++) {
      const tObj = towers[i];
      tempP1.x = tObj.x; tempP1.y = floorY; tempP1.z = tObj.z;
      applyCamera(tempP1);
      const item = items[itemIdx++];
      item.x1 = tempP1.projX!; item.y1 = tempP1.projY!; item.s1 = tempP1.scale!; item.z = tempP1.z;
      
      tempP2.x = tObj.x; tempP2.y = floorY - tObj.h; tempP2.z = tObj.z;
      applyCamera(tempP2);
      item.x2 = tempP2.projX!; item.y2 = tempP2.projY!; item.s2 = tempP2.scale!;
    }

    // Euro-Sat Dome
    {
      const eSat = items[itemIdx++];
      tempP1.x = 1400; tempP1.y = floorY - 300; tempP1.z = 2000;
      applyCamera(tempP1);
      eSat.x1 = tempP1.projX!; eSat.y1 = tempP1.projY!; eSat.s1 = tempP1.scale!; eSat.z = tempP1.z;
    }

    // Ferris Wheel
    const wheelX = -1000;
    const wheelZ = 1600;
    const wheelY = -200;
    const wheelR = 600;
    const wheelRot = time * 0.3;
    for (let i = 0; i < NUM_SPOKES; i++) {
      const ang = wheelRot + (i / NUM_SPOKES) * Math.PI * 2;
      tempP1.x = wheelX; tempP1.y = wheelY; tempP1.z = wheelZ;
      applyCamera(tempP1);

      tempP2.x = wheelX + Math.cos(ang) * wheelR; tempP2.y = wheelY + Math.sin(ang) * wheelR; tempP2.z = wheelZ;
      applyCamera(tempP2);

      const sItem = items[itemIdx++];
      sItem.x1 = tempP1.projX!; sItem.y1 = tempP1.projY!; sItem.s1 = tempP1.scale!;
      sItem.x2 = tempP2.projX!; sItem.y2 = tempP2.projY!; sItem.s2 = tempP2.scale!;
      sItem.z = tempP1.z;

      const cItem = items[itemIdx++];
      cItem.x1 = tempP2.projX!; cItem.y1 = tempP2.projY!; cItem.s1 = tempP2.scale!; cItem.z = tempP2.z;
    }

    // Trees
    for (let i = 0; i < NUM_TREES; i++) {
      const tr = trees[i];
      tempP1.x = tr.x; tempP1.y = floorY; tempP1.z = tr.z;
      applyCamera(tempP1);
      const item = items[itemIdx++];
      item.x1 = tempP1.projX!; item.y1 = tempP1.projY!; item.s1 = tempP1.scale!; item.z = tempP1.z;
      
      tempP2.x = tr.x; tempP2.y = floorY - tr.h; tempP2.z = tr.z;
      applyCamera(tempP2);
      item.x2 = tempP2.projX!; item.y2 = tempP2.projY!; item.s2 = tempP2.scale!;
    }

    // Particles
    for (let i = 0; i < NUM_PARTICLES; i++) {
      const p = particles[i];
      tempP1.x = p.x; tempP1.y = p.y + Math.sin(time * p.speed + p.phase) * 150; tempP1.z = p.z;
      applyCamera(tempP1);
      const item = items[itemIdx++];
      item.x1 = tempP1.projX!; item.y1 = tempP1.projY!; item.s1 = tempP1.scale!; item.z = tempP1.z;
    }

    // Fireworks natively bound to global physical space
    for (let i = 0; i < NUM_FIREWORKS; i++) {
      const f = items[itemIdx++];
      const fCycle = (time * 0.35 + f.id2) % 1.0;
      const a = (i / NUM_FIREWORKS) * Math.PI * 2;
      const R = 8000;
      tempP1.x = Math.sin(a) * R;
      tempP1.y = floorY - fCycle * 3500;
      tempP1.z = Math.cos(a) * R;
      applyCamera(tempP1);
      if (tempP1.scale! > 0) {
        f.s1 = tempP1.scale!;
        f.x1 = tempP1.projX!;
        f.y1 = tempP1.projY!;
        f.z = tempP1.z;
      } else {
        f.s1 = -1;
      }
      f.angle = fCycle;
    }

    // Star Logo Centerpiece
    const sLogo = items[itemIdx++];
    tempP1.x = 0; tempP1.y = -800; tempP1.z = 1200;
    applyCamera(tempP1);
    sLogo.x1 = tempP1.projX!; sLogo.y1 = tempP1.projY!; sLogo.s1 = tempP1.scale!; sLogo.z = tempP1.z;

    // Levitation Monoliths
    for (let i = 0; i < 4; i++) {
      const m = items[itemIdx++];
      const th = i * Math.PI / 2 + time * 0.5;
      const mx = Math.cos(th) * 1800; const mz = Math.sin(th) * 1800;
      const my = -800 + Math.sin(time * 1.5 + i) * 200;
      tempP1.x = mx; tempP1.y = my; tempP1.z = mz;
      applyCamera(tempP1);
      m.x1 = tempP1.projX!; m.y1 = tempP1.projY!; m.s1 = tempP1.scale!; m.z = tempP1.z; m.angle = tempP1.x;
      
      tempP2.x = mx; tempP2.y = my + 250; tempP2.z = mz; // Base Volume Offset
      applyCamera(tempP2);
      m.x2 = tempP2.projX!; m.y2 = tempP2.projY!; m.s2 = tempP2.scale!;
    }

    // --- SORTING ---
    for (let i = 1; i < renderQueue.length; i++) {
      let current = renderQueue[i];
      let j = i - 1;
      while (j >= 0 && renderQueue[j].z < current.z) {
        renderQueue[j + 1] = renderQueue[j];
        j--;
      }
      renderQueue[j + 1] = current;
    }

    // --- DRAW CYBER LAKE & GRID ---
    tempP1.x = 0; tempP1.y = floorY; tempP1.z = 0;
    applyCamera(tempP1);
    if (tempP1.scale! > 0) {
      const lx = tempP1.projX!;
      const ly = tempP1.projY!;
      const ls = tempP1.scale!;
      const pitchSquash = Math.max(0.1, Math.abs(Math.sin(pitchAngle)));

      api.brush.ellipse(lx, ly, 6000 * ls, 6000 * ls * pitchSquash, {
        fill: {
          type: 'radial', cx: 0.5, cy: 0.5, radius: 0.5, stops: [
            { offset: 0, color: 0x0088cc }, { offset: 0.4, color: 0x0044bb }, { offset: 1, color: 0x000000 }
          ]
        },
        alpha: 0.25, blendMode: 'add'
      });
      for (let r = 1; r <= 4; r++) {
        const rippleR = ((time * 0.4 + r * 0.25) % 1.0);
        api.brush.ellipse(lx, ly, 5000 * ls * rippleR, 5000 * ls * pitchSquash * rippleR, {
          fill: 0x00ffff, alpha: 0.15 * (1 - rippleR), blendMode: 'add'
        });
      }
    }

    const gridSize = 2500;
    const gridStep = 400;
    const gridCol = isDark ? 0x223355 : 0xaa00aa;
    // Floor Grid
    for (let z = -gridSize; z <= gridSize; z += gridStep) {
      gridP1.x = -gridSize; gridP1.y = floorY; gridP1.z = z; gridP2.x = gridSize; gridP2.y = floorY; gridP2.z = z;
      applyCamera(gridP1); applyCamera(gridP2);
      if (gridP1.scale! > 0 && gridP2.scale! > 0) api.brush.line(gridP1.projX!, gridP1.projY!, gridP2.projX!, gridP2.projY!, { color: gridCol, width: Math.max(0.5, 3 * gridP1.scale!), alpha: 0.2 * Math.min(1, gridP1.scale!) });
    }
    // Sky Grid Tunnel
    for (let x = -gridSize; x <= gridSize; x += gridStep) {
      gridP1.x = x; gridP1.y = -floorY * 2; gridP1.z = -gridSize; gridP2.x = x; gridP2.y = -floorY * 2; gridP2.z = gridSize;
      applyCamera(gridP1); applyCamera(gridP2);
      if (gridP1.scale! > 0 && gridP2.scale! > 0) api.brush.line(gridP1.projX!, gridP1.projY!, gridP2.projX!, gridP2.projY!, { color: 0x00aaff, width: Math.max(0.5, 3 * gridP1.scale!), alpha: 0.1 * Math.min(1, gridP1.scale!), blendMode: 'add' });
    }

    // --- MAIN DRAWING LOOP --- //
    for (let i = 0; i < renderQueue.length; i++) {
      const item = renderQueue[i];

      if (item.s1 <= 0 || item.s1 > 15) continue;
      if ((item.type === 'track-line' || item.type === 'ferris-spoke') && (item.s2 === undefined || item.s2 <= 0 || item.s2 > 15)) continue;

      if (item.type === 'star-logo') {
        const sRot = time * 0.8;
        for (let k = 0; k < 10; k++) {
          const sp = starBasePoints[k];
          const rx = sp.x * Math.cos(sRot) - sp.z * Math.sin(sRot);
          const ry = sp.y;
          const rz = sp.x * Math.sin(sRot) + sp.z * Math.cos(sRot);

          tempP1.x = rx; tempP1.y = ry - 800; tempP1.z = rz + 1200;
          applyCamera(tempP1);
          starProjPoints[k].x = tempP1.projX!; starProjPoints[k].y = tempP1.projY!;
        }
        api.brush.polygon(starProjPoints, { fill: 0xffdd44, alpha: 0.85, blendMode: 'add' });
        api.brush.polygon(starProjPoints, { fill: 0xffffff, alpha: 0.6, blendMode: 'add' });
        // Star core glow
        api.brush.circle(item.x1, item.y1, 100 * item.s1, { fill: 0xff8800, alpha: 0.4, blendMode: 'add' });
      }
      else if (item.type === 'monolith') {
         if (item.s1 <= 0 || item.s2 <= 0) continue;
         const mRot = time + item.id1;
         const crW = 120 * item.s2 * Math.abs(Math.cos(mRot));
         
         const polyGrad = { type: 'linear' as const, x0: 0, y0: 0, x1: 1, y1: 0, stops: [
             {offset: 0, color: 0x330066},
             {offset: 0.5, color: 0xee55ff},
             {offset: 1, color: 0x330066}
         ]};
         
         api.brush.polygon([
            {x: item.x2, y: item.y2}, // True 3D base offset
            {x: item.x1 - crW, y: item.y1},
            {x: item.x1 + crW, y: item.y1}
         ], { fill: polyGrad, alpha: 0.85, blendMode: 'screen' });
         api.brush.circle(item.x1, item.y1, 40*item.s1, { fill: 0xffffff, alpha: Math.sin(time*5+item.id1)*0.5+0.5, blendMode: 'add' });
      }
      else if (item.type === 'euro-sat') {
        const rad = 450 * item.s1;
        api.brush.circle(item.x1, item.y1 + rad, rad, { fill: 0x112244, alpha: 0.35, blendMode: 'add' }); // Lake reflection
        api.brush.circle(item.x1, item.y1, rad, { fill: 0x99aacc });
        api.brush.circle(item.x1, item.y1, rad, { fill: { type: 'radial', cx: 0.3, cy: 0.3, radius: 0.65, stops: [{ offset: 0, color: 0xffffff }, { offset: 1, color: 0x444455 }] }, blendMode: 'screen' });
        const rs1 = rad;
        for (let lat = 1; lat <= 4; lat++) {
          const rLat = rad * (lat / 5);
          api.brush.ellipse(item.x1, item.y1, rs1, rLat, { fill: 0x334455, alpha: 0.7 });
          api.brush.ellipse(item.x1, item.y1, rLat, rs1, { fill: 0x334455, alpha: 0.7 });
        }
      }
      else if (item.type === 'track-line') {
        const thickness = 10 * item.s1;
        const color = isDark ? (item.id1 === 1 ? 0x662222 : 0x224466) : (item.id1 === 1 ? 0xffcccc : 0xccddee);
        api.brush.line(item.x1, item.y1, item.x2, item.y2, { color, width: thickness, alpha: 0.9, cap: 'round' });

        const glowC = item.id1 === 1 ? 0xff4444 : 0x44bbff;
        api.brush.line(item.x1, item.y1, item.x2, item.y2, { color: glowC, width: thickness * 0.25, alpha: 0.8, blendMode: 'add', cap: 'round' });

        if (item.id2 % 2 === 0) {
          const nx = -Math.sin(item.angle); const ny = Math.cos(item.angle);
          api.brush.line(item.x1 + nx * 16 * item.s1, item.y1 + ny * 16 * item.s1, item.x1 - nx * 16 * item.s1, item.y1 - ny * 16 * item.s1, { color: isDark ? 0x333344 : 0x888899, width: 3 * item.s1, alpha: 0.6 });
        }
      }
      else if (item.type === 'pillar') {
        if (item.s1 <= 0 || item.s2 <= 0) continue;
        const pw = 6 * item.s1; const dx = 15 * item.s1;
        api.brush.line(item.x1, item.y1, item.x2 - dx, item.y2, { color: isDark ? 0x22222a : 0xaabbcc, width: pw, alpha: 0.8 });
        api.brush.line(item.x1, item.y1, item.x2 + dx, item.y2, { color: isDark ? 0x22222a : 0xaabbcc, width: pw, alpha: 0.8 });

        if (item.y2 - item.y1 > 100 * item.s1) {
          const steps = Math.floor((item.y2 - item.y1) / (70 * item.s1));
          for (let k = 1; k <= steps; k++) {
            const ky = item.y1 + (item.y2 - item.y1) * (k / steps);
            api.brush.line(item.x1 - (k / steps) * dx, ky, item.x1 + (k / steps) * dx, ky, { color: isDark ? 0x333333 : 0xaaaaaa, width: 2 * item.s1 });
          }
        }
      }
      else if (item.type === 'tunnel-ring') {
        api.brush.pushMatrix();
        api.brush.translate(item.x1, item.y1);
        api.brush.rotate(item.angle + Math.PI / 2);
        api.brush.scale(item.s1, item.s1 * 0.4);
        const rs = 55;
        api.brush.ellipse(0, 0, rs, rs, { fill: 0x00aaff, alpha: 0.8, blendMode: 'add' });
        api.brush.ellipse(0, 0, rs * 0.9, rs * 0.9, { fill: 0xffffff, alpha: 0.6, blendMode: 'add' });
        api.brush.rect(-rs - 10, rs * 0.7, 10, 20, { fill: 0x111111 });
        api.brush.rect(rs, rs * 0.7, 10, 20, { fill: 0x111111 });
        api.brush.popMatrix();
      }
      else if (item.type === 'tower') {
        if (item.s1 <= 0 || item.s2 <= 0) continue;
        const tData = towers[item.id1];
        const bRad = tData.r * item.s1;
        const tRad = tData.r * item.s2;
        const pitchSquashBase = Math.max(0.1, Math.abs(Math.sin(pitchAngle)));
        const dxB = bRad; const dxT = tRad;

        // Water Reflection
        const dy = item.y1 - item.y2;
        api.brush.line(item.x1, item.y1, item.x1, item.y1 + dy * 0.8, { color: 0x445588, width: bRad * 2, alpha: 0.15, blendMode: 'add', cap: 'butt' });

        // Base ellipse FIRST for occlusion clipping
        api.brush.ellipse(item.x1, item.y1, bRad, bRad * pitchSquashBase, { fill: 0x051122 });

        const cylGrad = { type: 'linear' as const, x0: 0, y0: 0, x1: 1, y1: 0, stops: [
            {offset: 0, color: 0x111122},
            {offset: 0.2, color: 0x6699ff}, // specular sun reflection
            {offset: 0.6, color: 0x223355},
            {offset: 1, color: 0x050511}
        ]};

        // 3D Cylinder Body shaded fully volumetrically
        api.brush.polygon([
            {x: item.x1 - dxB, y: item.y1},
            {x: item.x2 - dxT, y: item.y2},
            {x: item.x2 + dxT, y: item.y2},
            {x: item.x1 + dxB, y: item.y1}
        ], { fill: cylGrad });

        // Top ellipse roof
        api.brush.ellipse(item.x2, item.y2, tRad, tRad * pitchSquashBase, { fill: 0x111122 });

        const avAlpha = (Math.sin(time * 5 + item.id1) * 0.5 + 0.5);
        api.brush.circle(item.x2, item.y2, 12 * item.s2, { fill: 0xff2222, blendMode: 'add', alpha: avAlpha });
        
        // Skytracker Lasers
        const beamAng = time * 0.5 + item.id1;
        const lx = item.x2 + Math.cos(beamAng) * 2000 * item.s2;
        const ly = item.y2 - 2000 * item.s2;
        api.brush.line(item.x2, item.y2, lx, ly, { color: 0x00ffcc, width: 3.5 * item.s2, alpha: 0.8, blendMode: 'screen' });
        api.brush.line(item.x2, item.y2, lx, ly, { color: 0xffffff, width: 1.5 * item.s2, alpha: 0.9, blendMode: 'add' });
      }
      else if (item.type === 'shuttle-hyper') {
        const cw = 44; const ch = 18;

        // Speed blur trail!
        for (let tr = 1; tr <= 3; tr++) {
          api.brush.pushMatrix();
          api.brush.translate(item.x1 - Math.cos(item.angle) * 10 * item.s1 * tr, item.y1 - Math.sin(item.angle) * 10 * item.s1 * tr);
          api.brush.rotate(item.angle);
          api.brush.scale(item.s1 * 0.9, item.s1 * 0.9);
          api.brush.roundRect(-cw / 2, -ch / 2, cw, ch, 6, { fill: 0xff2222, alpha: 0.15 / tr, blendMode: 'add' });
          api.brush.popMatrix();
        }

        api.brush.ellipse(item.x1, item.y1 + 10 * item.s1, 40 * item.s1, 15 * item.s1, { fill: 0x000000, alpha: 0.4 });

        api.brush.pushMatrix();
        api.brush.translate(item.x1, item.y1);
        api.brush.rotate(item.angle);
        api.brush.scale(item.s1, item.s1);

        api.brush.rect(-cw / 2 - 8, -2, 10, 4, { fill: 0x222222 });
        api.brush.roundRect(-cw / 2, -ch / 2, cw, ch, 6, { fill: 0x9999aa });
        api.brush.roundRect(-cw / 2 + 2, -ch / 2 + 2, cw - 4, ch - 4, 4, { fill: 0xee2222 });
        api.brush.roundRect(-cw / 2 + 12, -ch / 2 + 3, 6, ch - 6, 2, { fill: 0x111111 });
        api.brush.roundRect(-cw / 2 + 24, -ch / 2 + 3, 6, ch - 6, 2, { fill: 0x111111 });

        const wRot = time * 20;
        for (const wx of [-cw / 2 + 8, cw / 2 - 8]) {
          for (const wy of [-ch / 2 - 2, ch / 2 + 2]) {
            api.brush.circle(wx, wy, 4, { fill: 0x111111 });
            api.brush.line(wx, wy, wx + Math.cos(wRot) * 3, wy + Math.sin(wRot) * 3, { color: 0x888888, width: 1.5 });
          }
        }

        if (item.id2 === 0) {
          api.brush.polygon([{ x: cw / 2, y: -ch / 2 + 2 }, { x: cw / 2 + 12, y: 0 }, { x: cw / 2, y: ch / 2 - 2 }], { fill: 0xee2222 });
          api.brush.circle(cw / 2 + 2, -ch / 2 + 4, 2.5, { fill: 0xffffee, blendMode: 'add' });
          api.brush.circle(cw / 2 + 2, ch / 2 - 4, 2.5, { fill: 0xffffee, blendMode: 'add' });

          api.brush.polygon([{ x: cw / 2, y: -ch / 2 + 4 }, { x: cw / 2 + 200, y: -ch / 2 - 40 }, { x: cw / 2 + 200, y: ch / 2 + 40 }, { x: cw / 2, y: ch / 2 - 4 }], {
            fill: { type: 'linear', x0: 0, y0: 0.5, x1: 1, y1: 0.5, stops: [{ offset: 0, color: 0xffffff }, { offset: 1, color: 0x000000 }] },
            alpha: 0.2, blendMode: 'screen'
          });
        }
        api.brush.popMatrix();
      }
      else if (item.type === 'shuttle-launch') {
        const cw = 40; const ch = 22;

        // Hyper trails
        for (let tr = 1; tr <= 4; tr++) {
          api.brush.pushMatrix();
          api.brush.translate(item.x1 - Math.cos(item.angle) * 12 * item.s1 * tr, item.y1 - Math.sin(item.angle) * 12 * item.s1 * tr);
          api.brush.rotate(item.angle);
          api.brush.scale(item.s1 * 0.9, item.s1 * 0.9);
          api.brush.roundRect(-cw / 2, -ch / 2, cw, ch, 6, { fill: 0x00aaff, alpha: 0.2 / tr, blendMode: 'add' });
          api.brush.popMatrix();
        }

        api.brush.ellipse(item.x1, item.y1 + 10 * item.s1, 40 * item.s1, 15 * item.s1, { fill: 0x000000, alpha: 0.4 });

        api.brush.pushMatrix();
        api.brush.translate(item.x1, item.y1);
        api.brush.rotate(item.angle);
        api.brush.scale(item.s1, item.s1);

        api.brush.rect(-cw / 2 - 6, -1.5, 8, 3, { fill: 0x222222 });
        api.brush.roundRect(-cw / 2, -ch / 2, cw, ch, 4, { fill: 0x112244 });

        api.brush.rect(-cw / 2 + 4, -ch / 2 - 1, cw - 8, 3, { fill: 0x00aaff, blendMode: 'add' });
        api.brush.rect(-cw / 2 + 4, ch / 2 - 2, cw - 8, 3, { fill: 0x00aaff, blendMode: 'add' });

        api.brush.roundRect(-cw / 2 + 10, -ch / 2 + 4, 8, ch - 8, 3, { fill: 0x050505 });
        api.brush.roundRect(-cw / 2 + 24, -ch / 2 + 4, 8, ch - 8, 3, { fill: 0x050505 });

        const wRot = time * -18;
        for (const wx of [-cw / 2 + 8, cw / 2 - 8]) {
          for (const wy of [-ch / 2 - 2, ch / 2 + 2]) {
            api.brush.circle(wx, wy, 4, { fill: 0x111111 });
            api.brush.line(wx, wy, wx + Math.cos(wRot) * 3, wy + Math.sin(wRot) * 3, { color: 0x00aaff, width: 1.5 });
          }
        }

        if (item.id2 === 0) {
          api.brush.roundRect(cw / 2 - 2, -ch / 2 + 2, 8, ch - 4, 4, { fill: 0x112244 });
          api.brush.circle(cw / 2 + 2, -ch / 2 + 6, 3, { fill: 0x88ddff, blendMode: 'add' });
          api.brush.circle(cw / 2 + 2, ch / 2 - 6, 3, { fill: 0x88ddff, blendMode: 'add' });

          api.brush.polygon([{ x: cw / 2, y: -ch / 2 + 6 }, { x: cw / 2 + 180, y: -ch / 2 - 50 }, { x: cw / 2 + 180, y: ch / 2 + 50 }, { x: cw / 2, y: ch / 2 - 6 }], {
            fill: { type: 'linear', x0: 0, y0: 0.5, x1: 1, y1: 0.5, stops: [{ offset: 0, color: 0xffffff }, { offset: 1, color: 0x000000 }] },
            alpha: 0.15, blendMode: 'screen'
          });
        }
        api.brush.popMatrix();
      }
      else if (item.type === 'firework') {
        const fCycle = item.angle;
        if (fCycle < 0.45) {
          api.brush.circle(item.x1, item.y1, 2.5 * item.s1, { fill: 0xffeebb, blendMode: 'add' });
          api.brush.line(item.x1, item.y1, item.x1, item.y1 + 50 * item.s1, { color: 0xffaa44, alpha: 0.6, blendMode: 'add', width: 2 * item.s1 });
        } else if (fCycle >= 0.45 && fCycle < 0.9) {
          const expProg = (fCycle - 0.45) / 0.45;
          const expAlpha = 1.0 - expProg;
          const expRadius = expProg * 160 * item.s1;
          const hueCol = item.id1 % 2 === 0 ? 0xff4488 : 0x4488ff;
          for (let k = 0; k < 16; k++) {
            const ang = (k / 16) * Math.PI * 2 + expProg * 0.5;
            const sx = item.x1 + Math.cos(ang) * expRadius;
            const sy = item.y1 + Math.sin(ang) * expRadius;
            api.brush.circle(sx, sy, 2 * item.s1, { fill: hueCol, alpha: expAlpha, blendMode: 'add' });
            api.brush.line(sx, sy, item.x1 + Math.cos(ang) * expRadius * 0.7, item.y1 + Math.sin(ang) * expRadius * 0.7, { color: 0xffffff, alpha: expAlpha * 0.7, blendMode: 'add', width: 1.5 * item.s1 });
          }
        }
      }
      else if (item.type === 'ferris-spoke') {
        api.brush.line(item.x1, item.y1, item.x2, item.y2, { color: isDark ? 0x444466 : 0x9999aa, width: 5 * item.s1 });
      }
      else if (item.type === 'ferris-cart') {
        api.brush.rect(item.x1 - 15 * item.s1, item.y1, 30 * item.s1, 40 * item.s1, { fill: isDark ? 0xff3366 : 0xff4477, blendMode: 'add', alpha: 0.9 });
      }
      else if (item.type === 'tree') {
        if (item.s1 <= 0 || item.s2 <= 0) continue;
        const tw = (item.y1 - item.y2) * 0.35; 
        
        // Deep shading gradient
        const treeGrad = { type: 'linear' as const, x0: 0, y0: 0, x1: 1, y1: 0, stops: [
             {offset: 0, color: 0x021105},
             {offset: 0.4, color: isDark ? 0x0a3311 : Math.random() > 0.5 ? 0x22cc44 : 0x44ee22},
             {offset: 1, color: 0x021105}
        ]};
        
        const points: Point[] = [
          { x: item.x2, y: item.y2 }, // True 3D Top Vector!
          { x: item.x1 + tw, y: item.y1 },
          { x: item.x1 - tw, y: item.y1 }
        ];
        
        api.brush.ellipse(item.x1, item.y1, tw * 1.2, tw * Math.max(0.1, Math.abs(Math.sin(pitchAngle))), { fill: 0x000000, alpha: 0.4 });
        api.brush.polygon(points, { fill: treeGrad, alpha: Math.min(1, item.s1 * 0.9) });
      }
      else if (item.type === 'particle') {
        const p = particles[item.id1];
        const alpha = (Math.sin(time * 2 + p.phase) * 0.5 + 0.5) * Math.min(1, item.s1);
        if (alpha > 0.05) {
          const c = item.id1 % 3 === 0 ? 0xffffff : (item.id1 % 2 === 0 ? 0x44ffff : 0xffaa44);
          
          // Warp Speed Streaks!
          const dx = (item.x1 - width/2) * 0.08 * droneVelocity;
          const dy = (item.y1 - height/2) * 0.08 * droneVelocity;
          
          api.brush.line(item.x1, item.y1, item.x1 + dx, item.y1 + dy, { color: c, width: 3 * item.s1, alpha: alpha, blendMode: 'add', cap: 'round' });
          api.brush.circle(item.x1, item.y1, 6 * item.s1, { fill: c, alpha: alpha * 0.4, blendMode: 'add' });
        }
      }
    }
  },

  async teardown(): Promise<void> {
    items.length = 0;
    particles.length = 0;
    trees.length = 0;
    starBasePoints.length = 0;
    starProjPoints.length = 0;
    renderQueue.length = 0;
  },
};

registerActor(actor);
export default actor;
