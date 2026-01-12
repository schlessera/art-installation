/**
 * Actor Unit Tests
 *
 * Test your actor's behavior before submitting.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import actor from './index';
import type { ActorSetupAPI, ActorUpdateAPI, FrameContext } from '@art/types';

// Mock APIs for testing
function createMockSetupAPI(): ActorSetupAPI {
  return {
    canvas: {
      getSize: () => ({ width: 800, height: 600 }),
      getPixel: () => ({ r: 0, g: 0, b: 0, a: 1 }),
      getRegionAverage: () => ({ r: 0, g: 0, b: 0, a: 1 }),
      getHistogram: () => ({
        red: new Array(256).fill(0),
        green: new Array(256).fill(0),
        blue: new Array(256).fill(0),
        luminance: new Array(256).fill(0),
      }),
      getImageData: () => new ImageData(1, 1),
      getComplexity: () => 0.5,
      getDominantColors: () => [],
      isEmpty: () => true,
      findEmptyRegions: () => [],
      getBrightness: () => 0.5,
      getAverageBrightness: () => 0.5,
    },
    context: createMockContext(),
    loadAsset: vi.fn().mockResolvedValue(null),
  };
}

function createMockUpdateAPI(): ActorUpdateAPI {
  return {
    canvas: createMockSetupAPI().canvas,
    brush: {
      ellipse: vi.fn(),
      circle: vi.fn(),
      rect: vi.fn(),
      roundRect: vi.fn(),
      polygon: vi.fn(),
      regularPolygon: vi.fn(),
      star: vi.fn(),
      line: vi.fn(),
      stroke: vi.fn(),
      bezier: vi.fn(),
      quadratic: vi.fn(),
      arc: vi.fn(),
      text: vi.fn(),
      image: vi.fn(),
      beginPath: vi.fn().mockReturnValue({
        moveTo: vi.fn().mockReturnThis(),
        lineTo: vi.fn().mockReturnThis(),
        quadraticCurveTo: vi.fn().mockReturnThis(),
        bezierCurveTo: vi.fn().mockReturnThis(),
        arc: vi.fn().mockReturnThis(),
        closePath: vi.fn().mockReturnThis(),
        fill: vi.fn(),
        stroke: vi.fn(),
      }),
      pushMatrix: vi.fn(),
      popMatrix: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      setBlendMode: vi.fn(),
      setAlpha: vi.fn(),
      clear: vi.fn(),
      background: vi.fn(),
    },
    filter: {
      colorMatrix: vi.fn(),
      brightness: vi.fn(),
      contrast: vi.fn(),
      saturate: vi.fn(),
      hueRotate: vi.fn(),
      grayscale: vi.fn(),
      invert: vi.fn(),
      sepia: vi.fn(),
      blur: vi.fn(),
      gaussianBlur: vi.fn(),
      motionBlur: vi.fn(),
      sharpen: vi.fn(),
      noise: vi.fn(),
      pixelate: vi.fn(),
      vignette: vi.fn(),
      glow: vi.fn(),
      dropShadow: vi.fn(),
      displace: vi.fn(),
      bulge: vi.fn(),
      twist: vi.fn(),
      chromaticAberration: vi.fn(),
      customShader: vi.fn(),
      chain: vi.fn(),
      clearFilters: vi.fn(),
    },
    context: createMockContext(),
  };
}

function createMockContext() {
  return {
    time: {
      now: () => new Date(),
      elapsed: () => 1000,
      dayProgress: () => 0.5,
      isDaytime: () => true,
      moonPhase: () => 0.5,
      season: () => 'summer' as const,
      hour: () => 12,
      minute: () => 30,
      dayOfWeek: () => 3,
    },
    weather: {
      temperature: () => 20,
      humidity: () => 50,
      condition: () => 'clear' as const,
      windSpeed: () => 5,
      windDirection: () => 180,
      cloudCoverage: () => 20,
      uvIndex: () => 5,
      isPrecipitating: () => false,
      precipitationRate: () => 0,
      pressure: () => 1013,
      visibility: () => 10000,
    },
    audio: {
      isAvailable: () => false,
      volume: () => 0,
      spectrum: () => new Float32Array(128),
      bass: () => 0,
      mid: () => 0,
      treble: () => 0,
      levels: () => ({ bass: 0, mid: 0, treble: 0, overall: 0 }),
      isBeat: () => false,
      bpm: () => null,
      timeSinceBeat: () => 1000,
      energyInRange: () => 0,
    },
    video: {
      isAvailable: () => false,
      getFrame: () => null,
      getMotion: () => ({ intensity: 0, direction: { x: 0, y: 0 }, regions: [] }),
      getDominantColor: () => ({ r: 128, g: 128, b: 128, a: 1 }),
      getDominantColors: () => [],
      getBrightness: () => 0.5,
      getFaces: () => [],
      getDimensions: () => null,
      getColorAt: () => null,
    },
    social: {
      viewerCount: () => 10,
      getMentions: () => [],
      sentiment: () => 0.5,
      trendingKeywords: () => [],
      engagementLevel: () => 0.5,
      isViralMoment: () => false,
      mentionCount: () => 0,
    },
  };
}

function createFrameContext(frameCount: number = 0): FrameContext {
  return {
    deltaTime: 16.67,
    frameCount,
    time: frameCount * 16.67,
  };
}

describe('Actor', () => {
  describe('metadata', () => {
    it('has required metadata fields', () => {
      expect(actor.metadata.id).toBeDefined();
      expect(actor.metadata.name).toBeDefined();
      expect(actor.metadata.description).toBeDefined();
      expect(actor.metadata.author).toBeDefined();
      expect(actor.metadata.author.name).toBeDefined();
      expect(actor.metadata.version).toBeDefined();
      expect(actor.metadata.tags).toBeInstanceOf(Array);
    });

    it('has valid id format (kebab-case)', () => {
      expect(actor.metadata.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    });

    it('has valid semver version', () => {
      expect(actor.metadata.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('setup', () => {
    it('initializes without errors', async () => {
      const api = createMockSetupAPI();
      await expect(actor.setup?.(api)).resolves.not.toThrow();
    });
  });

  describe('update', () => {
    beforeEach(async () => {
      // Reset actor state
      if (actor.teardown) {
        await actor.teardown();
      }
      if (actor.setup) {
        await actor.setup(createMockSetupAPI());
      }
    });

    it('draws something on each frame', () => {
      const api = createMockUpdateAPI();
      const frame = createFrameContext(1);

      actor.update(api, frame);

      // Check that at least one drawing method was called
      const brushCalls = Object.values(api.brush).filter(
        (fn) => typeof fn === 'function' && (fn as any).mock?.calls?.length > 0
      );

      expect(brushCalls.length).toBeGreaterThan(0);
    });

    it('handles multiple consecutive frames', () => {
      const api = createMockUpdateAPI();

      // Run 60 frames (1 second at 60fps)
      for (let i = 0; i < 60; i++) {
        expect(() => actor.update(api, createFrameContext(i))).not.toThrow();
      }
    });

    it('completes frame within performance budget', () => {
      const api = createMockUpdateAPI();
      const iterations = 60;
      const maxAvgFrameTime = 10; // 10ms average (should be much less)

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        actor.update(api, createFrameContext(i));
      }
      const elapsed = performance.now() - start;
      const avgFrameTime = elapsed / iterations;

      expect(avgFrameTime).toBeLessThan(maxAvgFrameTime);
    });
  });

  describe('teardown', () => {
    it('cleans up without errors', async () => {
      // Setup first
      if (actor.setup) {
        await actor.setup(createMockSetupAPI());
      }

      // Then teardown
      await expect(actor.teardown?.()).resolves.not.toThrow();
    });
  });
});
