import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorMetadata,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'rain-on-window',
  name: 'Rain On Window',
  description:
    'Realistic rain drops sliding down glass with lens refraction, wet trails, and condensation',
  author: {
    name: 'Alain Schlesser',
    github: 'schlessera',
  },
  version: '1.0.0',
  tags: ['filter', 'rain', 'window', 'glass', 'refraction', 'shader', 'weather'],
  createdAt: new Date(),
  role: 'filter',
  preferredDuration: 60,
  requiredContexts: ['display'],
};

// Rain-on-glass shader adapted from canvas-stamp refraction reference.
// Motion model: drops wait at spawn, then accelerate under gravity (pow easing).
// Trail drops are discrete circles left at fixed positions along the path.
// Lens refraction: zero at center, peaks at ~60% radius (real water-lens behavior).
const RAIN_SHADER = /* glsl */ `
  // uDarkMode auto-declared by runtime

  float hash(vec2 p) {
    p = fract(p * vec2(443.897, 441.423));
    p += dot(p, p.yx + 19.19);
    return fract(p.x * p.y);
  }

  // Lens refraction for one drop.
  // d: pixel-to-centre vector (cell-space), sz: radius, refrPx: max pixel offset
  vec3 dropRefract(vec2 d, float sz, float refrPx) {
    float dist = length(d);
    float nd = dist / sz;
    if (nd > 1.0) return vec3(0.0);

    float mask = smoothstep(1.0, 0.75, nd);
    vec2 normal = d / max(dist, 0.001);
    float depth = sqrt(1.0 - nd * nd);
    float strength = nd * (1.0 + depth * 1.5);

    float maxRefr = refrPx / min(uResolution.x, uResolution.y);
    vec2 refr = mask * normal * strength * maxRefr;

    // Specular highlight upper-left
    vec2 hlD = d / sz - vec2(0.12, -0.22);
    float hl = (1.0 - smoothstep(0.0, 0.32, length(hlD))) * mask;

    return vec3(refr, hl);
  }

  // Evaluate wobble X offset at a given Y position
  float wobbleX(float y, float baseX, float wF, float wA, float h0, float h2) {
    return baseX
          + sin(y * wF + h2 * 6.283) * wA
          + sin(y * wF * 2.3 + h0 * 4.5) * wA * 0.35;
  }

  // Sliding drops with gravity-like motion and trail drops.
  vec3 rainLayer(vec2 uv, float t, float gridSz, float baseSpeed, float dropSz, float refrPx) {
    float aspect = uResolution.x / uResolution.y;
    vec2 gv = vec2(uv.x * aspect, uv.y) * gridSz;
    vec2 id = floor(gv);
    vec2 st = fract(gv) - 0.5;

    vec3 acc = vec3(0.0);

    for (int yi = -1; yi <= 1; yi++) {
      for (int xi = -1; xi <= 1; xi++) {
        vec2 off = vec2(float(xi), float(yi));
        vec2 cid = id + off;
        vec2 cls = st - off;

        float h0 = hash(cid);
        float h1 = hash(cid + 127.1);
        float h2 = hash(cid + 253.3);
        float h3 = hash(cid + 379.5);
        float h4 = hash(cid + 505.7);

        // --- Physics-like motion: wait, then gravity-accelerate ---
        float spd = baseSpeed * (0.3 + h0 * 0.7);
        float rawPh = fract(t * spd + h1 * 10.0);

        // Each drop waits 10-40% of its cycle before starting to slide
        float wait = 0.1 + h4 * 0.3;
        float slidePh = clamp((rawPh - wait) / (1.0 - wait), 0.0, 1.0);

        // Gravity acceleration: slow start, accelerates downward
        float ph = pow(slidePh, 1.8);

        float dy = -0.5 + ph;
        float fade = smoothstep(0.0, 0.02, rawPh) * smoothstep(1.0, 0.92, rawPh);

        // --- Wobble ---
        float wF = 4.0 + h2 * 6.0;
        float wA = 0.04 + h0 * 0.06;
        float baseX = (h1 - 0.5) * 0.35;
        float dx = wobbleX(dy, baseX, wF, wA, h0, h2);

        // --- Main drop ---
        vec2 d = cls - vec2(dx, dy);
        d.x *= (1.0 - clamp(d.y, -0.3, 0.3) * 1.5) * 1.2;

        float sz = dropSz * (0.7 + h3 * 0.6);
        acc += dropRefract(d, sz, refrPx) * fade;

        // --- Trail drops: fixed positions, appear as main drop passes ---
        float trailFade = fade * smoothstep(0.0, 0.15, slidePh);

        // 5 trail drops per cell, hash-positioned, large enough to see
        float t0y = -0.5 + hash(cid + 500.0) * 0.9;
        float t1y = -0.5 + hash(cid + 507.3) * 0.9;
        float t2y = -0.5 + hash(cid + 514.6) * 0.9;
        float t3y = -0.5 + hash(cid + 521.9) * 0.9;
        float t4y = -0.5 + hash(cid + 529.2) * 0.9;

        // Trail 0
        float gap0 = dy - t0y;
        float v0 = step(0.0, gap0) * (1.0 - smoothstep(0.0, 0.55, gap0)) * trailFade;
        vec2 td0 = cls - vec2(wobbleX(t0y, baseX, wF, wA, h0, h2), t0y);
        acc += dropRefract(td0, sz * (0.3 + hash(cid + 600.0) * 0.2), refrPx * 0.35) * v0;

        // Trail 1
        float gap1 = dy - t1y;
        float v1 = step(0.0, gap1) * (1.0 - smoothstep(0.0, 0.55, gap1)) * trailFade * 0.9;
        vec2 td1 = cls - vec2(wobbleX(t1y, baseX, wF, wA, h0, h2), t1y);
        acc += dropRefract(td1, sz * (0.25 + hash(cid + 607.0) * 0.2), refrPx * 0.3) * v1;

        // Trail 2
        float gap2 = dy - t2y;
        float v2 = step(0.0, gap2) * (1.0 - smoothstep(0.0, 0.55, gap2)) * trailFade * 0.8;
        vec2 td2 = cls - vec2(wobbleX(t2y, baseX, wF, wA, h0, h2), t2y);
        acc += dropRefract(td2, sz * (0.2 + hash(cid + 614.0) * 0.18), refrPx * 0.25) * v2;

        // Trail 3
        float gap3 = dy - t3y;
        float v3 = step(0.0, gap3) * (1.0 - smoothstep(0.0, 0.55, gap3)) * trailFade * 0.7;
        vec2 td3 = cls - vec2(wobbleX(t3y, baseX, wF, wA, h0, h2), t3y);
        acc += dropRefract(td3, sz * (0.2 + hash(cid + 621.0) * 0.15), refrPx * 0.2) * v3;

        // Trail 4
        float gap4 = dy - t4y;
        float v4 = step(0.0, gap4) * (1.0 - smoothstep(0.0, 0.55, gap4)) * trailFade * 0.6;
        vec2 td4 = cls - vec2(wobbleX(t4y, baseX, wF, wA, h0, h2), t4y);
        acc += dropRefract(td4, sz * (0.15 + hash(cid + 628.0) * 0.15), refrPx * 0.18) * v4;
      }
    }
    return acc;
  }

  // Simpler sliding drops (no trails, for smaller layers).
  vec3 rainSimple(vec2 uv, float t, float gridSz, float baseSpeed, float dropSz, float refrPx) {
    float aspect = uResolution.x / uResolution.y;
    vec2 gv = vec2(uv.x * aspect, uv.y) * gridSz;
    vec2 id = floor(gv);
    vec2 st = fract(gv) - 0.5;

    vec3 acc = vec3(0.0);

    for (int yi = -1; yi <= 1; yi++) {
      for (int xi = -1; xi <= 1; xi++) {
        vec2 off = vec2(float(xi), float(yi));
        vec2 cid = id + off;
        vec2 cls = st - off;

        float h0 = hash(cid);
        float h1 = hash(cid + 127.1);
        float h2 = hash(cid + 253.3);
        float h3 = hash(cid + 379.5);

        float spd = baseSpeed * (0.3 + h0 * 0.7);
        float rawPh = fract(t * spd + h1 * 10.0);
        float wait = 0.05 + hash(cid + 505.7) * 0.2;
        float slidePh = clamp((rawPh - wait) / (1.0 - wait), 0.0, 1.0);
        float ph = pow(slidePh, 1.5);

        float dy = -0.5 + ph;
        float fade = smoothstep(0.0, 0.02, rawPh) * smoothstep(1.0, 0.92, rawPh);

        float wF = 5.0 + h2 * 5.0;
        float wA = 0.03 + h0 * 0.04;
        float dx = (h1 - 0.5) * 0.35 + sin(dy * wF + h2 * 6.283) * wA;

        vec2 d = cls - vec2(dx, dy);
        d.x *= 1.15;

        float sz = dropSz * (0.6 + h3 * 0.8);
        acc += dropRefract(d, sz, refrPx) * fade;
      }
    }
    return acc;
  }

  // Static condensation micro-droplets.
  vec3 mist(vec2 uv, float t, float gridSz, float dropSz, float refrPx) {
    float aspect = uResolution.x / uResolution.y;
    vec2 gv = vec2(uv.x * aspect, uv.y) * gridSz;
    vec2 id = floor(gv);
    vec2 st = fract(gv) - 0.5;

    vec3 acc = vec3(0.0);

    for (int yi = -1; yi <= 1; yi++) {
      for (int xi = -1; xi <= 1; xi++) {
        vec2 off = vec2(float(xi), float(yi));
        vec2 cid = id + off;
        vec2 cls = st - off;

        float h0 = hash(cid);
        float h1 = hash(cid + 50.0);

        vec2 pos = (vec2(h0, h1) - 0.5) * 0.6;
        vec2 d = cls - pos;
        float sz = dropSz * (0.5 + hash(cid + 99.0) * 1.0);
        float vis = smoothstep(-0.3, 0.5, sin(t * 0.12 + h0 * 6.283));

        acc += dropRefract(d, sz, refrPx) * vis;
      }
    }
    return acc;
  }

  void main() {
    vec2 uv = vTextureCoord;
    float t = uTime;

    // Hero drops: gravity-accelerated, with 5 trail drops each
    vec3 hero = rainLayer(uv, t, 4.0, 0.12, 0.144, 55.0);

    // Medium drops with trails
    vec3 med = rainLayer(uv + 0.37, t + 47.0, 7.0, 0.2, 0.096, 30.0);

    // Small fast drops (no trails)
    vec3 sm = rainSimple(uv + vec2(0.71, 0.23), t + 91.0, 13.0, 0.35, 0.06, 14.0);

    // Dense condensation layers
    vec3 micro = mist(uv, t, 22.0, 0.039, 6.0);
    vec3 micro2 = mist(uv + 0.53, t, 40.0, 0.024, 2.5);

    // Combine
    vec2 totalRefr = hero.xy + med.xy + sm.xy + micro.xy + micro2.xy;
    float totalHL = hero.z + med.z * 0.7 + sm.z * 0.4 + micro.z * 0.2 + micro2.z * 0.1;

    // Sample scene through wet glass
    vec4 color = texture(uTexture, clamp(uv + totalRefr, vec2(0.0), vec2(1.0)));

    // Wet glass dimming + cool tint
    color.rgb *= mix(0.95, 0.88, uDarkMode);
    color.rgb = mix(color.rgb, color.rgb * vec3(0.92, 0.95, 1.05), 0.15);

    // Specular highlights
    vec3 hlCol = mix(vec3(0.35, 0.35, 0.4), vec3(0.7, 0.75, 0.85), uDarkMode);
    color.rgb += hlCol * totalHL;

    // Vignette
    float vig = 1.0 - smoothstep(0.35, 1.0, length(uv - 0.5) * 1.3);
    color.rgb *= mix(mix(0.92, 1.0, vig), mix(0.82, 1.0, vig), uDarkMode);

    finalColor = color;
  }
`;

const actor: Actor = {
  metadata,

  update(api: ActorUpdateAPI, _frame: FrameContext): void {
    const isDark = api.context.display.isDarkMode();
    api.filter.customShader(RAIN_SHADER, { uDarkMode: isDark ? 1.0 : 0.0 });
  },
};

registerActor(actor);
export default actor;
