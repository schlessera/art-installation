/**
 * Brush Types
 *
 * Defines the drawing API for actors.
 */

import type { Point, Rectangle } from './canvas';

/**
 * Color value - can be hex string, rgb, named color, or numeric (0xRRGGBB).
 * Numeric colors are more performant as they avoid string allocation.
 */
export type Color = string | number;

/**
 * Blend modes for compositing.
 */
export type BlendMode =
  | 'normal'
  | 'add'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion';

/**
 * Line cap styles.
 */
export type LineCap = 'butt' | 'round' | 'square';

/**
 * Line join styles.
 */
export type LineJoin = 'miter' | 'round' | 'bevel';

/**
 * Gradient definition.
 *
 * IMPORTANT: All coordinates use RELATIVE values (0-1 range) relative to the
 * shape's bounding box. Using absolute pixel values will cause runtime errors:
 * "TypeError: Cannot read properties of null (reading 'style')"
 *
 * Coordinate system:
 * - 0 = left/top edge of shape
 * - 0.5 = center of shape
 * - 1 = right/bottom edge of shape
 *
 * @example
 * // Centered radial gradient
 * { type: 'radial', cx: 0.5, cy: 0.5, radius: 0.5, stops: [...] }
 *
 * @example
 * // Horizontal linear gradient (left to right)
 * { type: 'linear', x0: 0, y0: 0.5, x1: 1, y1: 0.5, stops: [...] }
 */
export interface Gradient {
  type: 'linear' | 'radial';
  stops: GradientStop[];

  /**
   * Linear gradient start X (0-1 range, 0=left, 1=right).
   * @default 0
   */
  x0?: number;
  /**
   * Linear gradient start Y (0-1 range, 0=top, 1=bottom).
   * @default 0
   */
  y0?: number;
  /**
   * Linear gradient end X (0-1 range, 0=left, 1=right).
   * @default 0
   */
  x1?: number;
  /**
   * Linear gradient end Y (0-1 range, 0=top, 1=bottom).
   * @default 1
   */
  y1?: number;

  /**
   * Radial gradient center X (0-1 range, 0.5=centered horizontally).
   * @default 0.5
   */
  cx?: number;
  /**
   * Radial gradient center Y (0-1 range, 0.5=centered vertically).
   * @default 0.5
   */
  cy?: number;
  /**
   * Radial gradient radius (0-1 range, 0.5=50% of shape size).
   * @default 0.5
   */
  radius?: number;
}

/**
 * Gradient color stop.
 */
export interface GradientStop {
  offset: number; // 0-1
  color: Color;
}

/**
 * Pattern fill definition.
 */
export interface Pattern {
  type: 'pattern';
  image: string; // Image URL or data URL
  repetition: 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat';
}

/**
 * Fill value - can be color, gradient, or pattern.
 */
export type Fill = Color | Gradient | Pattern;

/**
 * Style for filled shapes.
 */
export interface ShapeStyle {
  /** Fill color/gradient/pattern */
  fill?: Fill;

  /** Stroke color */
  stroke?: Color;

  /** Stroke width */
  strokeWidth?: number;

  /** Opacity (0-1) */
  alpha?: number;

  /** Blend mode */
  blendMode?: BlendMode;
}

/**
 * Style for lines.
 */
export interface LineStyle {
  /** Line color */
  color?: Color;

  /** Line width */
  width?: number;

  /** Opacity (0-1) */
  alpha?: number;

  /** Line cap style */
  cap?: LineCap;

  /** Line join style */
  join?: LineJoin;

  /** Dash pattern (e.g., [5, 3] for 5px dash, 3px gap) */
  dash?: number[];

  /** Blend mode */
  blendMode?: BlendMode;
}

/**
 * Style for brush strokes.
 */
export interface StrokeStyle extends LineStyle {
  /** Smooth the stroke using curve fitting */
  smooth?: boolean;

  /** Pressure sensitivity values (0-1 for each point) */
  pressure?: number[];

  /** Brush texture URL */
  texture?: string;

  /** Taper at start (0-1) */
  taperStart?: number;

  /** Taper at end (0-1) */
  taperEnd?: number;
}

/**
 * Style for text.
 */
export interface TextStyle {
  /** Font family */
  font?: string;

  /** Font size in pixels */
  fontSize?: number;

  /** Fill color */
  fill?: Fill;

  /** Stroke color */
  stroke?: Color;

  /** Stroke width */
  strokeWidth?: number;

  /** Text alignment */
  align?: 'left' | 'center' | 'right';

  /** Baseline alignment */
  baseline?: 'top' | 'middle' | 'bottom' | 'alphabetic';

  /** Letter spacing */
  letterSpacing?: number;

  /** Line height */
  lineHeight?: number;

  /** Opacity (0-1) */
  alpha?: number;
}

/**
 * Options for drawing images.
 */
export interface ImageOptions {
  /** Width to draw (scales image) */
  width?: number;

  /** Height to draw (scales image) */
  height?: number;

  /** Rotation in radians */
  rotation?: number;

  /** Anchor point for rotation (0-1) */
  anchorX?: number;
  anchorY?: number;

  /** Opacity (0-1) */
  alpha?: number;

  /** Blend mode */
  blendMode?: BlendMode;

  /** Tint color */
  tint?: Color;
}

/**
 * Path builder for complex shapes.
 */
export interface PathBuilder {
  /** Move to position without drawing */
  moveTo(x: number, y: number): PathBuilder;

  /** Draw line to position */
  lineTo(x: number, y: number): PathBuilder;

  /** Draw quadratic bezier curve */
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): PathBuilder;

  /** Draw cubic bezier curve */
  bezierCurveTo(
    cp1x: number,
    cp1y: number,
    cp2x: number,
    cp2y: number,
    x: number,
    y: number
  ): PathBuilder;

  /** Draw arc */
  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean
  ): PathBuilder;

  /** Close the path */
  closePath(): PathBuilder;

  /** Fill the path */
  fill(style?: ShapeStyle): void;

  /** Stroke the path */
  stroke(style?: LineStyle): void;
}

/**
 * Brush API for drawing on the canvas.
 */
export interface BrushAPI {
  // ============ Basic Shapes ============

  /**
   * Draw an ellipse/circle.
   */
  ellipse(
    x: number,
    y: number,
    width: number,
    height: number,
    style?: ShapeStyle
  ): void;

  /**
   * Draw a circle (convenience method).
   */
  circle(x: number, y: number, radius: number, style?: ShapeStyle): void;

  /**
   * Draw a rectangle.
   */
  rect(
    x: number,
    y: number,
    width: number,
    height: number,
    style?: ShapeStyle
  ): void;

  /**
   * Draw a rounded rectangle.
   */
  roundRect(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    style?: ShapeStyle
  ): void;

  /**
   * Draw a polygon.
   */
  polygon(points: Point[], style?: ShapeStyle): void;

  /**
   * Draw a regular polygon (e.g., triangle, pentagon).
   */
  regularPolygon(
    x: number,
    y: number,
    radius: number,
    sides: number,
    style?: ShapeStyle
  ): void;

  /**
   * Draw a star.
   */
  star(
    x: number,
    y: number,
    outerRadius: number,
    innerRadius: number,
    points: number,
    style?: ShapeStyle
  ): void;

  // ============ Lines & Curves ============

  /**
   * Draw a line between two points.
   */
  line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    style?: LineStyle
  ): void;

  /**
   * Draw a smooth stroke through multiple points.
   */
  stroke(points: Point[], style?: StrokeStyle): void;

  /**
   * Draw a bezier curve.
   */
  bezier(
    start: Point,
    cp1: Point,
    cp2: Point,
    end: Point,
    style?: LineStyle
  ): void;

  /**
   * Draw a quadratic curve.
   */
  quadratic(
    start: Point,
    control: Point,
    end: Point,
    style?: LineStyle
  ): void;

  /**
   * Draw an arc.
   */
  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    style?: LineStyle
  ): void;

  // ============ Text ============

  /**
   * Draw text.
   */
  text(content: string, x: number, y: number, style?: TextStyle): void;

  // ============ Images ============

  /**
   * Draw an image/texture.
   */
  image(
    src: string | ImageData,
    x: number,
    y: number,
    options?: ImageOptions
  ): void;

  // ============ Path Building ============

  /**
   * Begin a complex path.
   */
  beginPath(): PathBuilder;

  // ============ Transform ============

  /**
   * Push current transform state.
   */
  pushMatrix(): void;

  /**
   * Pop transform state.
   */
  popMatrix(): void;

  /**
   * Translate origin.
   */
  translate(x: number, y: number): void;

  /**
   * Rotate around origin.
   */
  rotate(angle: number): void;

  /**
   * Scale from origin.
   */
  scale(sx: number, sy?: number): void;

  // ============ Global State ============

  /**
   * Set global blend mode.
   */
  setBlendMode(mode: BlendMode): void;

  /**
   * Set global alpha.
   */
  setAlpha(alpha: number): void;

  /**
   * Clear a region of the canvas.
   */
  clear(region?: Rectangle): void;

  /**
   * Fill entire canvas with color.
   */
  background(color: Color, alpha?: number): void;
}
