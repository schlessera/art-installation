/**
 * Actor Validator
 *
 * Validates actors for security, API compliance, and performance.
 */

import type { Actor, ActorMetadata } from '@art/types';

// ============================================================
// TYPES
// ============================================================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  stats: ValidationStats;
}

export interface ValidationError {
  type: 'security' | 'interface' | 'metadata' | 'size' | 'performance';
  message: string;
  location?: string;
  line?: number;
}

export interface ValidationWarning {
  type: 'best-practice' | 'performance' | 'compatibility';
  message: string;
  suggestion?: string;
}

export interface ValidationStats {
  codeSize: number;
  hasSetup: boolean;
  hasTeardown: boolean;
  hasContextChange: boolean;
  requiredContexts: string[];
}

// ============================================================
// FORBIDDEN PATTERNS
// ============================================================

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  // Network access
  { pattern: /\bfetch\s*\(/, message: 'fetch() is not allowed - actors cannot make network requests' },
  { pattern: /\bXMLHttpRequest\b/, message: 'XMLHttpRequest is not allowed' },
  { pattern: /\bWebSocket\b/, message: 'WebSocket is not allowed' },
  { pattern: /\bnew\s+EventSource\b/, message: 'EventSource is not allowed' },
  { pattern: /\bnavigator\.sendBeacon\b/, message: 'sendBeacon is not allowed' },

  // Storage access
  { pattern: /\blocalStorage\b/, message: 'localStorage is not allowed' },
  { pattern: /\bsessionStorage\b/, message: 'sessionStorage is not allowed' },
  { pattern: /\bindexedDB\b/, message: 'indexedDB is not allowed' },
  { pattern: /\bcaches\b\./, message: 'Cache API is not allowed' },

  // DOM access (allow document.createElement('canvas') for texture generation)
  { pattern: /\bdocument\.(?!createElement\s*\(\s*['"]canvas['"]\))/, message: 'document access is not allowed (except createElement("canvas") for textures)' },
  { pattern: /\bwindow\b\.(?!crypto)/, message: 'window access is not allowed (except crypto)' },
  { pattern: /\bglobalThis\b\./, message: 'globalThis access is not allowed' },

  // Dynamic code execution
  { pattern: /\beval\s*\(/, message: 'eval() is not allowed' },
  { pattern: /\bnew\s+Function\s*\(/, message: 'new Function() is not allowed' },
  { pattern: /\bimport\s*\(/, message: 'Dynamic imports are not allowed' },

  // Module system
  { pattern: /\brequire\s*\(/, message: 'require() is not allowed' },

  // Dangerous APIs
  { pattern: /\bsetInterval\s*\(/, message: 'setInterval is discouraged - use frame timing instead' },
  { pattern: /\bsetTimeout\s*\((?!.*teardown)/, message: 'setTimeout is discouraged outside teardown' },
];

// ============================================================
// VALIDATOR
// ============================================================

export class ActorValidator {
  private maxCodeSize = 100 * 1024; // 100 KB

  /**
   * Validate an actor's source code.
   */
  async validateSource(code: string): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const stats: ValidationStats = {
      codeSize: code.length,
      hasSetup: false,
      hasTeardown: false,
      hasContextChange: false,
      requiredContexts: [],
    };

    // Check code size
    if (code.length > this.maxCodeSize) {
      errors.push({
        type: 'size',
        message: `Code size (${code.length} bytes) exceeds maximum (${this.maxCodeSize} bytes)`,
      });
    }

    // Check for forbidden patterns
    for (const { pattern, message } of FORBIDDEN_PATTERNS) {
      const match = code.match(pattern);
      if (match) {
        const lines = code.substring(0, match.index).split('\n');
        errors.push({
          type: 'security',
          message,
          line: lines.length,
        });
      }
    }

    // Check for lifecycle methods
    stats.hasSetup = /\bsetup\s*\(/.test(code) || /setup\s*:/.test(code);
    stats.hasTeardown = /\bteardown\s*\(/.test(code) || /teardown\s*:/.test(code);
    stats.hasContextChange = /\bonContextChange\s*\(/.test(code) || /onContextChange\s*:/.test(code);

    // Check for required context usage
    if (code.includes('context.time')) stats.requiredContexts.push('time');
    if (code.includes('context.weather')) stats.requiredContexts.push('weather');
    if (code.includes('context.audio')) stats.requiredContexts.push('audio');
    if (code.includes('context.video')) stats.requiredContexts.push('video');
    if (code.includes('context.social')) stats.requiredContexts.push('social');

    // Best practice warnings
    if (!stats.hasTeardown) {
      warnings.push({
        type: 'best-practice',
        message: 'No teardown method found',
        suggestion: 'Implement teardown() to clean up state when actor is deactivated',
      });
    }

    if (code.includes('console.log')) {
      warnings.push({
        type: 'best-practice',
        message: 'console.log found in code',
        suggestion: 'Remove console.log statements before submission',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      stats,
    };
  }

  /**
   * Validate an actor instance.
   */
  validateActor(actor: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const stats: ValidationStats = {
      codeSize: 0,
      hasSetup: false,
      hasTeardown: false,
      hasContextChange: false,
      requiredContexts: [],
    };

    // Check that actor is an object
    if (typeof actor !== 'object' || actor === null) {
      errors.push({
        type: 'interface',
        message: 'Actor must be an object',
      });
      return { valid: false, errors, warnings, stats };
    }

    const a = actor as Record<string, unknown>;

    // Check for metadata
    if (!a.metadata || typeof a.metadata !== 'object') {
      errors.push({
        type: 'interface',
        message: 'Actor must have metadata property',
      });
    } else {
      const metadataErrors = this.validateMetadata(a.metadata as ActorMetadata);
      errors.push(...metadataErrors);
    }

    // Check for update method
    if (typeof a.update !== 'function') {
      errors.push({
        type: 'interface',
        message: 'Actor must have update method',
      });
    }

    // Check optional methods
    stats.hasSetup = typeof a.setup === 'function';
    stats.hasTeardown = typeof a.teardown === 'function';
    stats.hasContextChange = typeof a.onContextChange === 'function';

    if (!stats.hasTeardown) {
      warnings.push({
        type: 'best-practice',
        message: 'No teardown method',
        suggestion: 'Implement teardown() to clean up state',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      stats,
    };
  }

  /**
   * Validate actor metadata.
   */
  validateMetadata(metadata: ActorMetadata): ValidationError[] {
    const errors: ValidationError[] = [];

    // Required fields
    if (!metadata.id || typeof metadata.id !== 'string') {
      errors.push({ type: 'metadata', message: 'metadata.id is required' });
    } else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(metadata.id)) {
      errors.push({
        type: 'metadata',
        message: 'metadata.id must be kebab-case (e.g., "my-actor")',
      });
    }

    if (!metadata.name || typeof metadata.name !== 'string') {
      errors.push({ type: 'metadata', message: 'metadata.name is required' });
    }

    if (!metadata.description || typeof metadata.description !== 'string') {
      errors.push({ type: 'metadata', message: 'metadata.description is required' });
    }

    if (!metadata.author || typeof metadata.author !== 'object') {
      errors.push({ type: 'metadata', message: 'metadata.author is required' });
    } else if (!metadata.author.name) {
      errors.push({ type: 'metadata', message: 'metadata.author.name is required' });
    }

    if (!metadata.version || typeof metadata.version !== 'string') {
      errors.push({ type: 'metadata', message: 'metadata.version is required' });
    } else if (!/^\d+\.\d+\.\d+$/.test(metadata.version)) {
      errors.push({
        type: 'metadata',
        message: 'metadata.version must be semver (e.g., "1.0.0")',
      });
    }

    if (!metadata.tags || !Array.isArray(metadata.tags)) {
      errors.push({ type: 'metadata', message: 'metadata.tags must be an array' });
    }

    return errors;
  }

  /**
   * Run performance test on an actor.
   */
  async testPerformance(
    actor: Actor,
    duration: number = 5000
  ): Promise<{ passed: boolean; avgFPS: number; minFPS: number; errors: ValidationError[] }> {
    const errors: ValidationError[] = [];
    const frameTimes: number[] = [];
    const startTime = performance.now();

    // Create mock APIs
    const mockCanvas = {
      getSize: () => ({ width: 800, height: 600 }),
      getPixel: () => ({ r: 0, g: 0, b: 0, a: 1 }),
      getRegionAverage: () => ({ r: 0, g: 0, b: 0, a: 1 }),
      getHistogram: () => ({
        red: [], green: [], blue: [], luminance: []
      }),
      getImageData: () => new ImageData(1, 1),
      getComplexity: () => 0.5,
      getDominantColors: () => [],
      isEmpty: () => true,
      findEmptyRegions: () => [],
      getBrightness: () => 0.5,
      getAverageBrightness: () => 0.5,
    };

    const mockBrush = new Proxy({} as any, {
      get: () => () => {},
    });

    const mockFilter = new Proxy({} as any, {
      get: () => () => {},
    });

    const mockContext = {
      time: { now: () => new Date(), elapsed: () => 0, dayProgress: () => 0.5, isDaytime: () => true, moonPhase: () => 0.5, season: () => 'summer' as const, hour: () => 12, minute: () => 0, dayOfWeek: () => 3 },
      weather: { temperature: () => 20, humidity: () => 50, condition: () => 'clear' as const, windSpeed: () => 5, windDirection: () => 180, cloudCoverage: () => 20, uvIndex: () => 5, isPrecipitating: () => false, precipitationRate: () => 0, pressure: () => 1013, visibility: () => 10000 },
      audio: { isAvailable: () => false, volume: () => 0, spectrum: () => new Float32Array(128), bass: () => 0, mid: () => 0, treble: () => 0, levels: () => ({ bass: 0, mid: 0, treble: 0, overall: 0 }), isBeat: () => false, bpm: () => null, timeSinceBeat: () => 1000, energyInRange: () => 0 },
      video: { isAvailable: () => false, getFrame: () => null, getMotion: () => ({ intensity: 0, direction: { x: 0, y: 0 }, regions: [] }), getDominantColor: () => ({ r: 128, g: 128, b: 128, a: 1 }), getDominantColors: () => [], getBrightness: () => 0.5, getFaces: () => [], getDimensions: () => null, getColorAt: () => null },
      social: { viewerCount: () => 10, getMentions: () => [], sentiment: () => 0.5, trendingKeywords: () => [], engagementLevel: () => 0.5, isViralMoment: () => false, mentionCount: () => 0 },
    };

    const mockUpdateAPI = {
      canvas: mockCanvas,
      brush: mockBrush,
      filter: mockFilter,
      context: mockContext,
    };

    // Run frames
    let frameCount = 0;
    let lastTime = startTime;

    while (performance.now() - startTime < duration) {
      const frameStart = performance.now();

      try {
        actor.update(mockUpdateAPI as any, {
          deltaTime: frameStart - lastTime,
          frameCount,
          time: frameStart,
        });
      } catch (error) {
        errors.push({
          type: 'performance',
          message: `Actor threw error during update: ${error}`,
        });
        break;
      }

      const frameEnd = performance.now();
      frameTimes.push(frameEnd - frameStart);

      lastTime = frameStart;
      frameCount++;

      // Yield to event loop
      await new Promise((r) => setTimeout(r, 0));
    }

    // Calculate stats
    const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    const maxFrameTime = Math.max(...frameTimes);
    const avgFPS = 1000 / avgFrameTime;
    const minFPS = 1000 / maxFrameTime;

    if (avgFPS < 55) {
      errors.push({
        type: 'performance',
        message: `Average FPS (${avgFPS.toFixed(1)}) is below minimum (55)`,
      });
    }

    if (minFPS < 30) {
      errors.push({
        type: 'performance',
        message: `Minimum FPS (${minFPS.toFixed(1)}) dropped below 30`,
      });
    }

    return {
      passed: errors.length === 0,
      avgFPS,
      minFPS,
      errors,
    };
  }
}

export default ActorValidator;
