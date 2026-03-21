import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'bike',
  name: 'Bike',
  description: 'A bicycle riding smoothly across the screen with spinning wheels and pedaling rider',
  author: { name: 'Jan', github: 'janw-ll' },
  version: '1.0.0',
  tags: ['bike', 'animation', 'vehicle'],
  createdAt: new Date(),
  preferredDuration: 30,
  requiredContexts: ['display'],
};

// Bike geometry (relative to center, will be scaled)
const WHEEL_RADIUS = 22;
const WHEEL_DIST = 70;
const SPOKE_COUNT = 8;
const FRAME_COLOR = 0x44aaff;
const WHEEL_COLOR = 0xcccccc;
const SPOKE_COLOR = 0x999999;
const RIDER_COLOR = 0xffaa44;
const SPEED = 60; // pixels per second

let bikeX = 0;
let bikeY = 0;
let canvasW = 0;
let canvasH = 0;
let direction = 1; // 1 = right, -1 = left
let wheelAngle = 0;
let pedalAngle = 0;
let bobOffset = 0;

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI) {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    direction = Math.random() > 0.5 ? 1 : -1;
    bikeX = direction === 1 ? -WHEEL_DIST : canvasW + WHEEL_DIST;
    bikeY = canvasH * 0.55 + Math.random() * canvasH * 0.2;
    wheelAngle = 0;
    pedalAngle = 0;
    bobOffset = 0;
  },

  update(api: ActorUpdateAPI, frame: FrameContext) {
    const dt = frame.deltaTime / 1000;
    const t = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();

    const frameCol = isDark ? FRAME_COLOR : 0x2277cc;
    const wheelCol = isDark ? WHEEL_COLOR : 0x666666;
    const spokeCol = isDark ? SPOKE_COLOR : 0x555555;
    const riderCol = isDark ? RIDER_COLOR : 0xdd7722;
    const tireCol = isDark ? 0xeeeeee : 0x333333;

    // Move bike
    bikeX += direction * SPEED * dt;

    // Wrap around
    const margin = WHEEL_DIST + WHEEL_RADIUS + 20;
    if (direction === 1 && bikeX > canvasW + margin) {
      bikeX = -margin;
      bikeY = canvasH * 0.55 + Math.random() * canvasH * 0.2;
    } else if (direction === -1 && bikeX < -margin) {
      bikeX = canvasW + margin;
      bikeY = canvasH * 0.55 + Math.random() * canvasH * 0.2;
    }

    // Wheel rotation based on distance traveled
    wheelAngle += (direction * SPEED * dt) / WHEEL_RADIUS;
    pedalAngle += direction * dt * 3.5;
    bobOffset = Math.sin(t * 4) * 1.5;

    const cx = bikeX;
    const cy = bikeY + bobOffset;
    const dir = direction;

    // Wheel positions
    const rearX = cx - dir * WHEEL_DIST * 0.5;
    const frontX = cx + dir * WHEEL_DIST * 0.5;
    const wheelY = cy;

    // Bottom bracket (pedal center) - between and slightly above wheels
    const bbX = cx - dir * 5;
    const bbY = cy - 5;

    // Seat position
    const seatX = bbX - dir * 16;
    const seatY = bbY - 28;

    // Handlebar position
    const handleX = frontX + dir * 4;
    const handleY = cy - 26;

    // Head tube top
    const headTopX = frontX + dir * 2;
    const headTopY = cy - 30;

    // --- Draw bike ---

    // Tires (outer circles)
    api.brush.circle(rearX, wheelY, WHEEL_RADIUS, {
      stroke: tireCol, strokeWidth: 4, alpha: 0.9,
    });
    api.brush.circle(frontX, wheelY, WHEEL_RADIUS, {
      stroke: tireCol, strokeWidth: 4, alpha: 0.9,
    });

    // Spokes
    for (let i = 0; i < SPOKE_COUNT; i++) {
      const angle = wheelAngle + (i * Math.PI * 2) / SPOKE_COUNT;
      const sx = Math.cos(angle) * (WHEEL_RADIUS - 3);
      const sy = Math.sin(angle) * (WHEEL_RADIUS - 3);
      api.brush.line(rearX, wheelY, rearX + sx, wheelY + sy, {
        color: spokeCol, width: 1.5, alpha: 0.6,
      });
      api.brush.line(frontX, wheelY, frontX + sx, wheelY + sy, {
        color: spokeCol, width: 1.5, alpha: 0.6,
      });
    }

    // Hub centers
    api.brush.circle(rearX, wheelY, 3, { fill: spokeCol, alpha: 0.8 });
    api.brush.circle(frontX, wheelY, 3, { fill: spokeCol, alpha: 0.8 });

    // Frame: seat tube (BB to seat)
    api.brush.line(bbX, bbY, seatX, seatY, {
      color: frameCol, width: 3, alpha: 0.9,
    });

    // Frame: down tube (BB to head tube bottom)
    api.brush.line(bbX, bbY, frontX, wheelY - 12, {
      color: frameCol, width: 3, alpha: 0.9,
    });

    // Frame: top tube (seat to head tube top)
    api.brush.line(seatX, seatY, headTopX, headTopY, {
      color: frameCol, width: 3, alpha: 0.9,
    });

    // Frame: head tube
    api.brush.line(frontX, wheelY - 12, headTopX, headTopY, {
      color: frameCol, width: 3, alpha: 0.9,
    });

    // Frame: chain stay (BB to rear axle)
    api.brush.line(bbX, bbY, rearX, wheelY, {
      color: frameCol, width: 2.5, alpha: 0.85,
    });

    // Frame: seat stay (seat to rear axle)
    api.brush.line(seatX, seatY, rearX, wheelY, {
      color: frameCol, width: 2.5, alpha: 0.8,
    });

    // Fork (head tube to front axle)
    api.brush.line(frontX, wheelY - 12, frontX, wheelY, {
      color: frameCol, width: 2.5, alpha: 0.85,
    });

    // Handlebar
    api.brush.line(headTopX, headTopY, handleX, handleY, {
      color: frameCol, width: 3, alpha: 0.9,
    });
    api.brush.line(handleX - dir * 2, handleY - 5, handleX + dir * 6, handleY - 2, {
      color: 0x888888, width: 3, alpha: 0.8,
    });

    // Seat
    api.brush.line(seatX - dir * 6, seatY - 1, seatX + dir * 4, seatY - 1, {
      color: 0x553322, width: 4, cap: 'round', alpha: 0.9,
    });

    // Pedals and cranks
    const crankLen = 12;
    const pedalLen = 6;
    for (let i = 0; i < 2; i++) {
      const pa = pedalAngle + i * Math.PI;
      const px = bbX + Math.cos(pa) * crankLen;
      const py = bbY + Math.sin(pa) * crankLen;
      // Crank arm
      api.brush.line(bbX, bbY, px, py, {
        color: 0x888888, width: 2.5, alpha: 0.8,
      });
      // Pedal
      api.brush.line(px - Math.cos(pa + Math.PI / 2) * pedalLen * 0.5, py - Math.sin(pa + Math.PI / 2) * pedalLen * 0.5,
        px + Math.cos(pa + Math.PI / 2) * pedalLen * 0.5, py + Math.sin(pa + Math.PI / 2) * pedalLen * 0.5, {
          color: 0xaaaaaa, width: 3, cap: 'round', alpha: 0.9,
        });
    }

    // Chainring
    api.brush.circle(bbX, bbY, 8, { stroke: 0x888888, strokeWidth: 1.5, alpha: 0.6 });

    // --- Draw rider ---
    // Pedal foot positions for leg animation
    const footAngle = pedalAngle;
    const footX = bbX + Math.cos(footAngle) * crankLen;
    const footY = bbY + Math.sin(footAngle) * crankLen;

    // Hip (on seat)
    const hipX = seatX;
    const hipY = seatY - 3;

    // Knee (halfway, offset outward for natural bend)
    const kneeX = (hipX + footX) * 0.5 + dir * 4;
    const kneeY = (hipY + footY) * 0.5 - 8;

    // Torso leans forward
    const shoulderX = hipX + dir * 14;
    const shoulderY = hipY - 18 + bobOffset * 0.5;

    // Hands on handlebar
    const handX = handleX;
    const handY = handleY - 2;

    // Elbow
    const elbowX = (shoulderX + handX) * 0.5;
    const elbowY = (shoulderY + handY) * 0.5 - 5;

    // Head
    const headX = shoulderX + dir * 4;
    const headY = shoulderY - 12;

    // Draw legs
    api.brush.line(hipX, hipY, kneeX, kneeY, { color: riderCol, width: 3, alpha: 0.85 });
    api.brush.line(kneeX, kneeY, footX, footY, { color: riderCol, width: 3, alpha: 0.85 });

    // Second leg (opposite pedal)
    const foot2X = bbX + Math.cos(footAngle + Math.PI) * crankLen;
    const foot2Y = bbY + Math.sin(footAngle + Math.PI) * crankLen;
    const knee2X = (hipX + foot2X) * 0.5 + dir * 2;
    const knee2Y = (hipY + foot2Y) * 0.5 - 6;
    api.brush.line(hipX, hipY, knee2X, knee2Y, { color: riderCol, width: 2.5, alpha: 0.7 });
    api.brush.line(knee2X, knee2Y, foot2X, foot2Y, { color: riderCol, width: 2.5, alpha: 0.7 });

    // Torso
    api.brush.line(hipX, hipY, shoulderX, shoulderY, { color: riderCol, width: 3.5, alpha: 0.9 });

    // Arms
    api.brush.line(shoulderX, shoulderY, elbowX, elbowY, { color: riderCol, width: 3, alpha: 0.85 });
    api.brush.line(elbowX, elbowY, handX, handY, { color: riderCol, width: 3, alpha: 0.85 });

    // Head
    api.brush.circle(headX, headY, 6, { fill: riderCol, alpha: 0.9 });
  },

  async teardown() {
    bikeX = 0;
    bikeY = 0;
    canvasW = 0;
    canvasH = 0;
    wheelAngle = 0;
    pedalAngle = 0;
    bobOffset = 0;
  },
};

registerActor(actor);
export default actor;
