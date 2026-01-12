/**
 * Actor Preview Harness
 *
 * Provides a local development environment for testing actors.
 */

import { Application, Graphics, Container } from 'pixi.js';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  BrushAPI,
  FilterAPI,
  CanvasReadAPI,
  ContextAPI,
  RGBA,
  Rectangle,
  Point,
  ShapeStyle,
  LineStyle,
  StrokeStyle,
  TextStyle,
  BlendMode,
} from '@art/types';

// Import the actor
import actor from '../src/index';

// ============================================================
// PREVIEW HARNESS
// ============================================================

class PreviewHarness {
  private app!: Application;
  private actorLayer!: Container;
  private graphics!: Graphics;
  private frameCount = 0;
  private lastFrameTime = 0;
  private fpsHistory: number[] = [];
  private brushCallLog: Array<{ method: string; time: number }> = [];
  private timeSpeed = 1;
  private weatherCondition = 'clear';
  private beatSimulated = false;

  async initialize(container: HTMLElement): Promise<void> {
    // Create Pixi application
    this.app = new Application();
    await this.app.init({
      width: 800,
      height: 600,
      backgroundColor: 0x1a1a2e,
      preserveDrawingBuffer: true,
      antialias: true,
    });

    container.appendChild(this.app.canvas);

    // Create layer for actor drawing
    this.actorLayer = new Container();
    this.app.stage.addChild(this.actorLayer);

    // Create graphics object for drawing
    this.graphics = new Graphics();
    this.actorLayer.addChild(this.graphics);

    // Hide loading indicator
    document.getElementById('loading')?.classList.add('hidden');

    // Setup controls
    this.setupControls();

    // Update actor info display
    this.updateActorInfo();
  }

  async loadActor(): Promise<void> {
    // Create setup API
    const setupAPI = this.createSetupAPI();

    // Call actor setup
    if (actor.setup) {
      await actor.setup(setupAPI);
    }

    // Start render loop
    this.app.ticker.add(() => this.onFrame());
  }

  private onFrame(): void {
    const now = performance.now();
    const deltaTime = now - this.lastFrameTime;
    this.lastFrameTime = now;

    // Clear previous frame drawing
    this.graphics.clear();

    // Create frame context
    const frame: FrameContext = {
      deltaTime,
      frameCount: this.frameCount,
      time: now * this.timeSpeed,
    };

    // Create update API
    const updateAPI = this.createUpdateAPI();

    // Call actor update
    try {
      actor.update(updateAPI, frame);
    } catch (error) {
      console.error('Actor update error:', error);
    }

    // Update stats
    this.frameCount++;
    this.updateStats(deltaTime);

    // Reset beat simulation
    this.beatSimulated = false;
  }

  private createSetupAPI(): ActorSetupAPI {
    return {
      canvas: this.createCanvasAPI(),
      context: this.createContextAPI(),
      loadAsset: async (url: string, type: 'image' | 'font') => {
        console.log(`Loading ${type}: ${url}`);
        return null;
      },
    };
  }

  private createUpdateAPI(): ActorUpdateAPI {
    return {
      canvas: this.createCanvasAPI(),
      brush: this.createBrushAPI(),
      filter: this.createFilterAPI(),
      context: this.createContextAPI(),
    };
  }

  private createCanvasAPI(): CanvasReadAPI {
    const width = this.app.screen.width;
    const height = this.app.screen.height;

    return {
      getSize: () => ({ width, height }),
      getPixel: (x: number, y: number): RGBA => ({ r: 0, g: 0, b: 0, a: 1 }),
      getRegionAverage: (rect: Rectangle): RGBA => ({ r: 128, g: 128, b: 128, a: 1 }),
      getHistogram: () => ({
        red: new Array(256).fill(0),
        green: new Array(256).fill(0),
        blue: new Array(256).fill(0),
        luminance: new Array(256).fill(0),
      }),
      getImageData: (region?: Rectangle) => new ImageData(1, 1),
      getComplexity: () => 0.5,
      getDominantColors: (count: number): RGBA[] => [],
      isEmpty: (x: number, y: number, threshold?: number) => true,
      findEmptyRegions: (minSize: number): Rectangle[] => [],
      getBrightness: (x: number, y: number) => 0.5,
      getAverageBrightness: () => 0.5,
    };
  }

  private createBrushAPI(): BrushAPI {
    const g = this.graphics;
    const log = (method: string) => {
      this.brushCallLog.push({ method, time: performance.now() });
      if (this.brushCallLog.length > 50) this.brushCallLog.shift();
      this.updateBrushLog();
    };

    const parseColor = (color: string): number => {
      if (color.startsWith('#')) {
        return parseInt(color.slice(1), 16);
      }
      if (color.startsWith('hsl') || color.startsWith('rgb')) {
        // For HSL/RGB, create temp element to convert
        const temp = document.createElement('div');
        temp.style.color = color;
        document.body.appendChild(temp);
        const computed = getComputedStyle(temp).color;
        document.body.removeChild(temp);
        const match = computed.match(/\d+/g);
        if (match) {
          const [r, g, b] = match.map(Number);
          return (r << 16) | (g << 8) | b;
        }
      }
      return 0xffffff;
    };

    return {
      ellipse: (x, y, width, height, style?) => {
        log('ellipse');
        if (style?.fill) {
          g.ellipse(x, y, width / 2, height / 2);
          g.fill({ color: parseColor(style.fill as string), alpha: style.alpha ?? 1 });
        }
        if (style?.stroke) {
          g.ellipse(x, y, width / 2, height / 2);
          g.stroke({ color: parseColor(style.stroke), width: style.strokeWidth ?? 1 });
        }
      },

      circle: (x, y, radius, style?) => {
        log('circle');
        if (style?.fill) {
          g.circle(x, y, radius);
          g.fill({ color: parseColor(style.fill as string), alpha: style.alpha ?? 1 });
        }
        if (style?.stroke) {
          g.circle(x, y, radius);
          g.stroke({ color: parseColor(style.stroke), width: style.strokeWidth ?? 1 });
        }
      },

      rect: (x, y, width, height, style?) => {
        log('rect');
        if (style?.fill) {
          g.rect(x, y, width, height);
          g.fill({ color: parseColor(style.fill as string), alpha: style.alpha ?? 1 });
        }
      },

      roundRect: (x, y, width, height, radius, style?) => {
        log('roundRect');
        if (style?.fill) {
          g.roundRect(x, y, width, height, radius);
          g.fill({ color: parseColor(style.fill as string), alpha: style.alpha ?? 1 });
        }
      },

      polygon: (points, style?) => {
        log('polygon');
        if (points.length < 3) return;
        if (style?.fill) {
          g.poly(points.flatMap(p => [p.x, p.y]));
          g.fill({ color: parseColor(style.fill as string), alpha: style.alpha ?? 1 });
        }
      },

      regularPolygon: (x, y, radius, sides, style?) => {
        log('regularPolygon');
        const points: Point[] = [];
        for (let i = 0; i < sides; i++) {
          const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
          points.push({
            x: x + Math.cos(angle) * radius,
            y: y + Math.sin(angle) * radius,
          });
        }
        if (style?.fill) {
          g.poly(points.flatMap(p => [p.x, p.y]));
          g.fill({ color: parseColor(style.fill as string), alpha: style.alpha ?? 1 });
        }
      },

      star: (x, y, outerRadius, innerRadius, points, style?) => {
        log('star');
        // Star drawing implementation
      },

      line: (x1, y1, x2, y2, style?) => {
        log('line');
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.stroke({
          color: parseColor(style?.color ?? '#ffffff'),
          width: style?.width ?? 1,
          alpha: style?.alpha ?? 1,
        });
      },

      stroke: (points, style?) => {
        log('stroke');
        if (points.length < 2) return;
        g.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          g.lineTo(points[i].x, points[i].y);
        }
        g.stroke({
          color: parseColor(style?.color ?? '#ffffff'),
          width: style?.width ?? 1,
          alpha: style?.alpha ?? 1,
        });
      },

      bezier: (start, cp1, cp2, end, style?) => {
        log('bezier');
        g.moveTo(start.x, start.y);
        g.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
        g.stroke({
          color: parseColor(style?.color ?? '#ffffff'),
          width: style?.width ?? 1,
        });
      },

      quadratic: (start, control, end, style?) => {
        log('quadratic');
        g.moveTo(start.x, start.y);
        g.quadraticCurveTo(control.x, control.y, end.x, end.y);
        g.stroke({
          color: parseColor(style?.color ?? '#ffffff'),
          width: style?.width ?? 1,
        });
      },

      arc: (x, y, radius, startAngle, endAngle, style?) => {
        log('arc');
        g.arc(x, y, radius, startAngle, endAngle);
        g.stroke({
          color: parseColor(style?.color ?? '#ffffff'),
          width: style?.width ?? 1,
        });
      },

      text: (content, x, y, style?) => {
        log('text');
        // Text rendering would require Pixi Text object
      },

      image: (src, x, y, options?) => {
        log('image');
        // Image rendering would require Pixi Sprite
      },

      beginPath: () => {
        log('beginPath');
        return {
          moveTo: (x, y) => { g.moveTo(x, y); return this; },
          lineTo: (x, y) => { g.lineTo(x, y); return this; },
          quadraticCurveTo: (cpx, cpy, x, y) => { g.quadraticCurveTo(cpx, cpy, x, y); return this; },
          bezierCurveTo: (cp1x, cp1y, cp2x, cp2y, x, y) => { g.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y); return this; },
          arc: (x, y, radius, startAngle, endAngle, ccw?) => { g.arc(x, y, radius, startAngle, endAngle, ccw); return this; },
          closePath: () => { g.closePath(); return this; },
          fill: (style?) => { g.fill(style?.fill ? { color: parseColor(style.fill as string) } : undefined); },
          stroke: (style?) => { g.stroke({ color: parseColor(style?.color ?? '#ffffff') }); },
        } as any;
      },

      pushMatrix: () => { log('pushMatrix'); },
      popMatrix: () => { log('popMatrix'); },
      translate: (x, y) => { log('translate'); },
      rotate: (angle) => { log('rotate'); },
      scale: (sx, sy?) => { log('scale'); },
      setBlendMode: (mode) => { log('setBlendMode'); },
      setAlpha: (alpha) => { log('setAlpha'); },
      clear: (region?) => { log('clear'); this.graphics.clear(); },
      background: (color, alpha?) => {
        log('background');
        g.rect(0, 0, this.app.screen.width, this.app.screen.height);
        g.fill({ color: parseColor(color), alpha: alpha ?? 1 });
      },
    };
  }

  private createFilterAPI(): FilterAPI {
    // Simplified filter API for preview
    return {
      colorMatrix: () => {},
      brightness: () => {},
      contrast: () => {},
      saturate: () => {},
      hueRotate: () => {},
      grayscale: () => {},
      invert: () => {},
      sepia: () => {},
      blur: () => {},
      gaussianBlur: () => {},
      motionBlur: () => {},
      sharpen: () => {},
      noise: () => {},
      pixelate: () => {},
      vignette: () => {},
      glow: () => {},
      dropShadow: () => {},
      displace: () => {},
      bulge: () => {},
      twist: () => {},
      chromaticAberration: () => {},
      customShader: () => {},
      chain: () => {},
      clearFilters: () => {},
    };
  }

  private createContextAPI(): ContextAPI {
    const now = new Date();

    return {
      time: {
        now: () => now,
        elapsed: () => performance.now() * this.timeSpeed,
        dayProgress: () => (now.getHours() + now.getMinutes() / 60) / 24,
        isDaytime: () => now.getHours() >= 6 && now.getHours() < 18,
        moonPhase: () => 0.5,
        season: () => 'summer',
        hour: () => now.getHours(),
        minute: () => now.getMinutes(),
        dayOfWeek: () => now.getDay(),
      },
      weather: {
        temperature: () => 20,
        humidity: () => 50,
        condition: () => this.weatherCondition as any,
        windSpeed: () => 5,
        windDirection: () => 180,
        cloudCoverage: () => this.weatherCondition === 'clouds' ? 80 : 20,
        uvIndex: () => 5,
        isPrecipitating: () => ['rain', 'thunderstorm', 'snow'].includes(this.weatherCondition),
        precipitationRate: () => 0,
        pressure: () => 1013,
        visibility: () => 10000,
      },
      audio: {
        isAvailable: () => false,
        volume: () => 0,
        spectrum: () => new Float32Array(128),
        bass: () => this.beatSimulated ? 1 : 0,
        mid: () => this.beatSimulated ? 0.8 : 0,
        treble: () => this.beatSimulated ? 0.6 : 0,
        levels: () => ({
          bass: this.beatSimulated ? 1 : 0,
          mid: this.beatSimulated ? 0.8 : 0,
          treble: this.beatSimulated ? 0.6 : 0,
          overall: this.beatSimulated ? 0.9 : 0,
        }),
        isBeat: () => this.beatSimulated,
        bpm: () => 120,
        timeSinceBeat: () => 500,
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

  private setupControls(): void {
    // Time speed control
    document.getElementById('time-speed')?.addEventListener('input', (e) => {
      this.timeSpeed = parseFloat((e.target as HTMLInputElement).value);
    });

    // Weather preset
    document.getElementById('weather-preset')?.addEventListener('change', (e) => {
      this.weatherCondition = (e.target as HTMLSelectElement).value;
    });

    // Simulate beat
    document.getElementById('simulate-beat')?.addEventListener('click', () => {
      this.beatSimulated = true;
    });

    // Clear canvas
    document.getElementById('clear-canvas')?.addEventListener('click', () => {
      this.graphics.clear();
    });

    // Restart actor
    document.getElementById('restart-actor')?.addEventListener('click', async () => {
      if (actor.teardown) await actor.teardown();
      this.frameCount = 0;
      this.graphics.clear();
      await this.loadActor();
    });

    // Take snapshot
    document.getElementById('take-snapshot')?.addEventListener('click', () => {
      const dataUrl = this.app.canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `actor-snapshot-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    });
  }

  private updateStats(deltaTime: number): void {
    const fps = 1000 / deltaTime;
    this.fpsHistory.push(fps);
    if (this.fpsHistory.length > 60) this.fpsHistory.shift();

    const avgFps = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;

    // Update display
    const fpsEl = document.getElementById('fps');
    if (fpsEl) {
      fpsEl.textContent = avgFps.toFixed(1);
      fpsEl.className = 'stat-value' + (avgFps < 30 ? ' error' : avgFps < 55 ? ' warning' : '');
    }

    const frameTimeEl = document.getElementById('frame-time');
    if (frameTimeEl) {
      frameTimeEl.textContent = deltaTime.toFixed(2) + 'ms';
      frameTimeEl.className = 'stat-value' + (deltaTime > 33 ? ' error' : deltaTime > 16.67 ? ' warning' : '');
    }

    const memoryEl = document.getElementById('memory');
    if (memoryEl && (performance as any).memory) {
      const mb = (performance as any).memory.usedJSHeapSize / 1024 / 1024;
      memoryEl.textContent = mb.toFixed(1) + 'MB';
    }

    const frameCountEl = document.getElementById('frame-count');
    if (frameCountEl) {
      frameCountEl.textContent = this.frameCount.toString();
    }

    // Draw FPS graph
    this.drawFPSGraph();
  }

  private updateActorInfo(): void {
    const idEl = document.getElementById('actor-id');
    if (idEl) idEl.textContent = actor.metadata.id;

    const nameEl = document.getElementById('actor-name');
    if (nameEl) nameEl.textContent = actor.metadata.name;
  }

  private updateBrushLog(): void {
    const logEl = document.getElementById('brush-log');
    if (!logEl) return;

    logEl.innerHTML = this.brushCallLog
      .slice(-20)
      .map(call => `<div class="call-log-entry"><span class="method">${call.method}</span></div>`)
      .join('');
  }

  private drawFPSGraph(): void {
    const canvas = document.getElementById('fps-graph') as HTMLCanvasElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#1a1a3e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (this.fpsHistory.length < 2) return;

    const maxFps = 70;
    const minFps = 0;

    ctx.beginPath();
    ctx.strokeStyle = '#4fd1c5';
    ctx.lineWidth = 1;

    for (let i = 0; i < this.fpsHistory.length; i++) {
      const x = (i / this.fpsHistory.length) * canvas.width;
      const y = canvas.height - ((this.fpsHistory[i] - minFps) / (maxFps - minFps)) * canvas.height;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    // Draw 60 FPS line
    ctx.strokeStyle = '#4a5568';
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    const y60 = canvas.height - (60 / maxFps) * canvas.height;
    ctx.moveTo(0, y60);
    ctx.lineTo(canvas.width, y60);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// ============================================================
// BOOTSTRAP
// ============================================================

async function main() {
  const container = document.getElementById('canvas-container');
  if (!container) throw new Error('Canvas container not found');

  const harness = new PreviewHarness();
  await harness.initialize(container);
  await harness.loadActor();

  // Expose to window for debugging
  (window as any).__harness = harness;
  (window as any).__actor = actor;

  console.log('Actor preview ready. Access via window.__actor');
}

main().catch(console.error);

// Hot Module Replacement
if (import.meta.hot) {
  import.meta.hot.accept('../src/index', async (newModule) => {
    if (newModule) {
      console.log('Hot reloading actor...');
      location.reload(); // Simple reload for now
    }
  });
}
