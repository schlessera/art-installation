import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'sunset-overdrive',
  name: 'Sunset Overdrive',
  description: 'Retro driving scene — steer the car with your head via camera, sun reacts to live weather',
  author: {
    name: 'Lucas Radke',
    github: 'lucasradke',
  },
  version: '1.0.0',
  tags: ['retro', 'driving', 'camera', 'weather', 'interactive'],
  createdAt: new Date(),
  preferredDuration: 60,
  requiredContexts: ['video', 'weather', 'display'],
};

// --- Constants ---
const ROAD_HORIZON_Y = 0.4;
const ROAD_VANISH_X = 0.5;
const CAR_WIDTH = 50;
const CAR_HEIGHT = 28;
const CAR_ROOF_HEIGHT = 18;
const WHEEL_R = 7;
const MAX_ROAD_MARKS = 12;

// --- Pre-allocated state ---
let canvasW = 0;
let canvasH = 0;
let horizonY = 0;

// Car
let carX = 0.5;
let carTargetX = 0.5;
let hasFace = false;

// Road marks — circular buffer
interface RoadMark { z: number; active: boolean }
let roadMarks: RoadMark[];
let markTimer = 0;
let markHead = 0;

// Sun state
let sunRadius = 0;
let sunBaseColor = 0;
let sunGlowAlpha = 0;

// Pre-allocated styles
const roadStyle = { fill: 0x333333 as number, alpha: 0.9 };
const markStyle = { fill: 0xffff66 as number, alpha: 0.8 };
const carBodyStyle = { fill: 0xcc2222 as number, alpha: 0.95 };
const carRoofStyle = { fill: 0xaa1818 as number, alpha: 0.95 };
const carWindowStyle = { fill: 0x334455 as number, alpha: 0.7 };
const wheelStyle = { fill: 0x222222 as number, alpha: 0.95 };
const sunStyle = { fill: 0xff6600 as number, alpha: 0.9 };

const ROAD_SPEED = 0.0008;

function roadXAtDepth(normalizedX: number, z: number): number {
  const vanishX = canvasW * ROAD_VANISH_X;
  const screenX = normalizedX * canvasW;
  return vanishX + (screenX - vanishX) * z;
}

function updateSunFromWeather(api: ActorUpdateAPI): void {
  const weather = api.context.weather;
  const condition = weather.condition();
  const clouds = weather.cloudCoverage();
  const temp = weather.temperature();

  const cloudFactor = 1 - (clouds / 100) * 0.6;
  sunRadius = 30 + cloudFactor * 20;

  if (condition === 'clear') {
    sunBaseColor = temp > 20 ? 0xff4400 : 0xff6622;
    sunGlowAlpha = 0.4;
  } else if (condition === 'clouds') {
    sunBaseColor = 0xffaa44;
    sunGlowAlpha = 0.2;
  } else if (condition === 'rain' || condition === 'drizzle') {
    sunBaseColor = 0xccaa66;
    sunGlowAlpha = 0.1;
    sunRadius *= 0.7;
  } else if (condition === 'thunderstorm') {
    sunBaseColor = 0x887766;
    sunGlowAlpha = 0.05;
    sunRadius *= 0.5;
  } else if (condition === 'snow') {
    sunBaseColor = 0xddddff;
    sunGlowAlpha = 0.15;
  } else {
    sunBaseColor = 0xddccaa;
    sunGlowAlpha = 0.1;
    sunRadius *= 0.8;
  }
}

function drawSun(api: ActorUpdateAPI, t: number): void {
  const sunX = canvasW * 0.5;
  const sunY = horizonY * 0.55;
  const pulse = 1 + Math.sin(t * 0.001) * 0.05;
  const r = sunRadius * pulse;

  // Glow
  api.brush.circle(sunX, sunY, r * 2.5, {
    fill: {
      type: 'radial',
      cx: 0.5, cy: 0.5, radius: 0.5,
      stops: [
        { offset: 0, color: sunBaseColor },
        { offset: 0.3, color: sunBaseColor },
        { offset: 1, color: 0x000000 },
      ],
    },
    alpha: sunGlowAlpha,
    blendMode: 'add',
  });

  // Sun disc
  sunStyle.fill = sunBaseColor;
  api.brush.circle(sunX, sunY, r, sunStyle);

  // Retro horizontal stripes
  const stripeCount = 5;
  for (let i = 0; i < stripeCount; i++) {
    const stripeFrac = (i + 1) / (stripeCount + 1);
    const stripeY = sunY - r + r * 2 * stripeFrac;
    const halfW = Math.sqrt(Math.max(0, r * r - (stripeY - sunY) * (stripeY - sunY)));
    if (halfW > 2) {
      const stripeH = 2 + i * 0.5;
      api.brush.rect(sunX - halfW, stripeY, halfW * 2, stripeH, {
        fill: 0x000000,
        alpha: 0.25 - i * 0.03,
      });
    }
  }
}

function drawRoad(api: ActorUpdateAPI): void {
  // Road trapezoid only — no ground fill
  const roadTop = horizonY;
  const roadBot = canvasH;
  const topLeft = roadXAtDepth(0.3, 0.02);
  const topRight = roadXAtDepth(0.7, 0.02);
  const botLeft = roadXAtDepth(0.1, 1);
  const botRight = roadXAtDepth(0.9, 1);

  api.brush.polygon([
    { x: topLeft, y: roadTop },
    { x: topRight, y: roadTop },
    { x: botRight, y: roadBot },
    { x: botLeft, y: roadBot },
  ], roadStyle);

  // Road edge lines
  api.brush.line(topLeft, roadTop, botLeft, roadBot, { color: 0xffffff, width: 2.5, alpha: 0.5 });
  api.brush.line(topRight, roadTop, botRight, roadBot, { color: 0xffffff, width: 2.5, alpha: 0.5 });

  // Center dashed line marks
  for (let i = 0; i < MAX_ROAD_MARKS; i++) {
    const mark = roadMarks[i];
    if (!mark.active) continue;
    if (mark.z < 0 || mark.z > 1) { mark.active = false; continue; }

    const perspZ = mark.z * mark.z;
    const mx = roadXAtDepth(0.5, perspZ);
    const my = horizonY + (canvasH - horizonY) * perspZ;
    const mw = 3 * perspZ + 1;
    const mh = 12 * perspZ + 2;
    const alpha = 0.3 + perspZ * 0.5;
    if (alpha < 0.05) continue;
    markStyle.alpha = alpha;
    api.brush.rect(mx - mw * 0.5, my - mh * 0.5, mw, mh, markStyle);
  }
}

function drawCar(api: ActorUpdateAPI, t: number): void {
  const cx = carX * canvasW;
  const cy = canvasH - 50;
  const bounce = Math.sin(t * 0.008) * 1.5;

  // Shadow
  api.brush.ellipse(cx, cy + CAR_HEIGHT * 0.5 + 4, CAR_WIDTH * 0.55, 5, {
    fill: 0x000000, alpha: 0.3,
  });

  // Body
  api.brush.rect(cx - CAR_WIDTH * 0.5, cy - CAR_HEIGHT * 0.5 + bounce, CAR_WIDTH, CAR_HEIGHT, carBodyStyle);

  // Roof
  const roofW = CAR_WIDTH * 0.6;
  api.brush.rect(cx - roofW * 0.5, cy - CAR_HEIGHT * 0.5 - CAR_ROOF_HEIGHT + bounce, roofW, CAR_ROOF_HEIGHT, carRoofStyle);

  // Rear window (dark, viewed from behind)
  const winW = roofW * 0.8;
  const winH = CAR_ROOF_HEIGHT * 0.6;
  api.brush.rect(cx - winW * 0.5, cy - CAR_HEIGHT * 0.5 - CAR_ROOF_HEIGHT + 4 + bounce, winW, winH, carWindowStyle);

  // Taillights (prominent, viewed from behind)
  api.brush.rect(cx - CAR_WIDTH * 0.5, cy - CAR_HEIGHT * 0.3 + bounce, 5, 4, { fill: 0xff2222, alpha: 0.95 });
  api.brush.rect(cx + CAR_WIDTH * 0.5 - 5, cy - CAR_HEIGHT * 0.3 + bounce, 5, 4, { fill: 0xff2222, alpha: 0.95 });

  // Taillight glow
  api.brush.circle(cx - CAR_WIDTH * 0.48, cy - CAR_HEIGHT * 0.2 + bounce, 6, {
    fill: 0xff0000, alpha: 0.15, blendMode: 'add',
  });
  api.brush.circle(cx + CAR_WIDTH * 0.48, cy - CAR_HEIGHT * 0.2 + bounce, 6, {
    fill: 0xff0000, alpha: 0.15, blendMode: 'add',
  });

  // License plate area
  api.brush.rect(cx - 8, cy + CAR_HEIGHT * 0.15 + bounce, 16, 5, { fill: 0xddddcc, alpha: 0.8 });

  // Exhaust pipe
  api.brush.rect(cx + CAR_WIDTH * 0.2, cy + CAR_HEIGHT * 0.45 + bounce, 5, 3, { fill: 0x555555, alpha: 0.7 });

  // Wheels — viewed from behind, spinning forward (vertical rotation)
  const wheelSpin = t * 0.015; // forward spin speed
  for (let w = -1; w <= 1; w += 2) {
    const wx = cx + w * CAR_WIDTH * 0.35;
    const wy = cy + CAR_HEIGHT * 0.5 + bounce;

    // Tire
    api.brush.circle(wx, wy, WHEEL_R, wheelStyle);

    // Hub cap
    api.brush.circle(wx, wy, WHEEL_R * 0.35, { fill: 0x666666, alpha: 0.8 });

    // Spinning spoke marks (vertical rotation = spokes move up/down)
    const spokeR = WHEEL_R * 0.6;
    for (let s = 0; s < 3; s++) {
      const angle = wheelSpin + s * (Math.PI * 2 / 3);
      const sy = wy + Math.sin(angle) * spokeR;
      // Only draw spokes on the visible half (front-facing from behind)
      const depth = Math.cos(angle);
      if (depth > 0) {
        api.brush.circle(wx, sy, 1.2, { fill: 0x999999, alpha: 0.6 * depth });
      }
    }
  }
}

function drawRain(api: ActorUpdateAPI, t: number, rate: number): void {
  const count = Math.min(Math.floor(rate * 15), 30);
  for (let i = 0; i < count; i++) {
    const seed = i * 7919 + Math.floor(t * 0.05) * 13;
    const rx = ((seed * 31) % 1000) / 1000 * canvasW;
    const ry = ((seed * 47) % 1000) / 1000 * canvasH;
    api.brush.line(rx, ry, rx - 2, ry + 12, { color: 0xaabbcc, width: 1, alpha: 0.3 });
  }
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    horizonY = canvasH * ROAD_HORIZON_Y;

    carX = 0.5;
    carTargetX = 0.5;
    hasFace = false;
    markTimer = 0;
    markHead = 0;

    roadMarks = new Array(MAX_ROAD_MARKS);
    for (let i = 0; i < MAX_ROAD_MARKS; i++) {
      roadMarks[i] = { z: 0, active: false };
    }

    sunRadius = 40;
    sunBaseColor = 0xff6600;
    sunGlowAlpha = 0.4;
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time;
    const dt = frame.deltaTime;

    // --- Face tracking for car steering ---
    const faces = api.context.video.getFaces();
    if (faces.length > 0) {
      const face = faces[0];
      const vidDims = api.context.video.getDimensions();
      let fx = face.bounds.x + face.bounds.width * 0.5;
      if (vidDims) {
        fx = fx / vidDims.width;
      }
      fx = 1 - fx; // mirror
      carTargetX = 0.2 + fx * 0.6;
      hasFace = true;
    } else {
      hasFace = false;
      carTargetX = 0.5 + Math.sin(t * 0.0005) * 0.08;
    }

    carX += (carTargetX - carX) * 0.08;

    // --- Weather-driven sun ---
    updateSunFromWeather(api);

    // --- Spawn road marks ---
    markTimer += dt;
    if (markTimer > 150) {
      markTimer = 0;
      const mark = roadMarks[markHead];
      mark.z = 0;
      mark.active = true;
      markHead = (markHead + 1) % MAX_ROAD_MARKS;
    }

    for (let i = 0; i < MAX_ROAD_MARKS; i++) {
      if (!roadMarks[i].active) continue;
      roadMarks[i].z += ROAD_SPEED * dt;
      if (roadMarks[i].z > 1.2) roadMarks[i].active = false;
    }

    // --- Draw (transparent background — only road, sun, car, weather) ---
    drawSun(api, t);
    drawRoad(api);
    drawCar(api, t);

    if (api.context.weather.isPrecipitating()) {
      drawRain(api, t, api.context.weather.precipitationRate());
    }
  },

  async teardown(): Promise<void> {
    carX = 0.5;
    hasFace = false;
    for (let i = 0; i < MAX_ROAD_MARKS; i++) roadMarks[i].active = false;
  },
};

registerActor(actor);
export default actor;
