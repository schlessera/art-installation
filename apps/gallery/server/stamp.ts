/**
 * Sample Stamp Overlay
 *
 * Generates a "SAMPLE" rubber stamp watermark and composites it onto images.
 * The stamp has a stencil-like appearance with slight randomness in angle,
 * size, and translucency to mimic a real inked stamp.
 */

import sharp from 'sharp';

/**
 * Apply a "SAMPLE" stamp overlay to an image buffer.
 * The stamp has randomized angle, size, and inconsistent translucency.
 */
export async function applyStampOverlay(
  imageBuffer: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  const svg = generateStampSvg(width, height);

  return sharp(imageBuffer)
    .composite([{ input: Buffer.from(svg), gravity: 'centre' }])
    .png()
    .toBuffer();
}

/**
 * Generate an SVG stamp with randomized properties.
 */
function generateStampSvg(width: number, height: number): string {
  // Randomize angle between -18° and -32°
  const angle = -18 - Math.random() * 14;

  // Size the stamp to fit within ~70-80% of the image width
  // "SAMPLE" is 6 chars; approximate text width ≈ fontSize * 0.65 * 6 + letterSpacing * 5
  // Plus border padding. Solve for fontSize to fit within target width.
  const targetWidth = width * (0.70 + Math.random() * 0.10);
  // Approximate: totalWidth ≈ fontSize * (0.65 * 6 + 0.15 * 5) + fontSize * 0.8 (padding)
  // = fontSize * (3.9 + 0.75 + 0.8) = fontSize * 5.45
  const baseFontSize = targetWidth / 5.45;

  // Letter spacing for stencil feel
  const letterSpacing = baseFontSize * 0.15;

  // Stamp border padding
  const padX = baseFontSize * 0.4;
  const padY = baseFontSize * 0.25;

  // Stroke width scales with font
  const strokeWidth = Math.max(1.5, baseFontSize * 0.04);
  const borderStrokeWidth = Math.max(1.5, baseFontSize * 0.035);

  // Random seed for turbulence (gives each stamp unique distortion)
  const seed = Math.floor(Math.random() * 1000);

  // Overall base opacity (0.55 - 0.70)
  const baseOpacity = 0.55 + Math.random() * 0.15;

  // Turbulence params for the ink-inconsistency mask
  const turbFreq = 0.015 + Math.random() * 0.015;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <!-- Rough edge distortion -->
    <filter id="rough" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="turbulence" baseFrequency="0.04" numOctaves="4" seed="${seed}" result="noise"/>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="${baseFontSize * 0.06}" xChannelSelector="R" yChannelSelector="G"/>
    </filter>

    <!-- Inconsistent ink opacity mask -->
    <filter id="inkMask" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="${turbFreq}" numOctaves="3" seed="${seed + 42}" result="inkNoise"/>
      <feColorMatrix type="matrix" in="inkNoise" result="alpha"
        values="0 0 0 0 0
                0 0 0 0 0
                0 0 0 0 0
                0 0 0 1.8 -0.4"/>
      <feComposite in="SourceGraphic" in2="alpha" operator="in"/>
    </filter>
  </defs>

  <g opacity="${baseOpacity}" filter="url(#inkMask)">
    <g transform="translate(${width / 2}, ${height / 2}) rotate(${angle})" filter="url(#rough)">
      <!-- Stamp border -->
      <rect
        x="${-(baseFontSize * 2.3 + padX)}"
        y="${-(baseFontSize * 0.55 + padY)}"
        width="${(baseFontSize * 2.3 + padX) * 2}"
        height="${(baseFontSize * 0.55 + padY) * 2}"
        rx="${baseFontSize * 0.06}"
        ry="${baseFontSize * 0.06}"
        fill="none"
        stroke="#c8241e"
        stroke-width="${borderStrokeWidth}"
      />

      <!-- Inner border for double-line stamp effect -->
      <rect
        x="${-(baseFontSize * 2.3 + padX * 0.6)}"
        y="${-(baseFontSize * 0.55 + padY * 0.6)}"
        width="${(baseFontSize * 2.3 + padX * 0.6) * 2}"
        height="${(baseFontSize * 0.55 + padY * 0.6) * 2}"
        rx="${baseFontSize * 0.04}"
        ry="${baseFontSize * 0.04}"
        fill="none"
        stroke="#c8241e"
        stroke-width="${borderStrokeWidth * 0.6}"
      />

      <!-- SAMPLE text -->
      <text
        x="0"
        y="${baseFontSize * 0.35}"
        text-anchor="middle"
        font-family="'Arial Black', 'Impact', 'Helvetica Neue', sans-serif"
        font-weight="900"
        font-size="${baseFontSize}"
        letter-spacing="${letterSpacing}"
        fill="none"
        stroke="#c8241e"
        stroke-width="${strokeWidth}"
      >SAMPLE</text>
    </g>
  </g>
</svg>`;
}
