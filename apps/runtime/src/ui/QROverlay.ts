/**
 * QR Overlay
 *
 * Displays a QR code on the canvas linking to the gallery.
 * Uses the qrcode library for proper QR code generation.
 */

import QRCode from 'qrcode';

export interface QROverlayConfig {
  /** Gallery URL to encode */
  galleryUrl: string;

  /** QR code size in pixels */
  size?: number;

  /** Position on screen */
  position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

  /** Margin from edge in pixels */
  margin?: number;

  /** Background color (hex) */
  backgroundColor?: string;

  /** Foreground color (hex) */
  foregroundColor?: string;

  /** Opacity (0-1) */
  opacity?: number;

  /** Show/hide the QR code */
  visible?: boolean;

  /** Label text below QR code */
  label?: string;
}

const DEFAULT_CONFIG: Required<Omit<QROverlayConfig, 'galleryUrl'>> = {
  size: 120,
  position: 'bottom-right',
  margin: 20,
  backgroundColor: '#ffffff',
  foregroundColor: '#000000',
  opacity: 0.9,
  visible: true,
  label: 'Scan to vote',
};

/**
 * QR code overlay for the canvas display.
 */
export class QROverlay {
  private config: Required<QROverlayConfig>;
  private container: HTMLDivElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private label: HTMLDivElement | null = null;

  constructor(config: QROverlayConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as Required<QROverlayConfig>;
  }

  /**
   * Initialize the QR overlay and attach to DOM.
   */
  init(parentElement: HTMLElement): void {
    // Create container
    this.container = document.createElement('div');
    this.container.id = 'qr-overlay';
    this.container.style.cssText = this.getContainerStyles();

    // Create canvas for QR code
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.config.size;
    this.canvas.height = this.config.size;
    this.canvas.style.cssText = `
      display: block;
      border-radius: 8px;
    `;

    // Create label
    this.label = document.createElement('div');
    this.label.textContent = this.config.label;
    this.label.style.cssText = `
      margin-top: 8px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 12px;
      font-weight: 500;
      color: #ffffff;
      text-align: center;
      text-shadow: 0 1px 2px rgba(0,0,0,0.5);
    `;

    this.container.appendChild(this.canvas);
    this.container.appendChild(this.label);
    parentElement.appendChild(this.container);

    // Add click handler to open gallery in new tab
    this.container.style.cursor = 'pointer';
    this.container.addEventListener('click', () => {
      window.open(this.config.galleryUrl, '_blank');
    });
    this.container.addEventListener('mouseenter', () => {
      if (this.container) this.container.style.opacity = '1';
    });
    this.container.addEventListener('mouseleave', () => {
      if (this.container) this.container.style.opacity = String(this.config.opacity);
    });

    // Generate QR code
    this.generateQRCode();

    // Apply visibility
    this.setVisible(this.config.visible);
  }

  /**
   * Get CSS styles for container based on position.
   */
  private getContainerStyles(): string {
    const { position, margin, opacity } = this.config;

    let positionStyles = '';
    switch (position) {
      case 'bottom-left':
        positionStyles = `bottom: ${margin}px; left: ${margin}px;`;
        break;
      case 'bottom-right':
        positionStyles = `bottom: ${margin}px; right: ${margin}px;`;
        break;
      case 'top-left':
        positionStyles = `top: ${margin}px; left: ${margin}px;`;
        break;
      case 'top-right':
        positionStyles = `top: ${margin}px; right: ${margin}px;`;
        break;
    }

    return `
      position: fixed;
      ${positionStyles}
      z-index: 1000;
      padding: 12px;
      background: rgba(0, 0, 0, 0.7);
      border-radius: 12px;
      backdrop-filter: blur(8px);
      opacity: ${opacity};
      transition: opacity 0.3s ease;
    `;
  }

  /**
   * Generate QR code on canvas using the qrcode library.
   */
  private generateQRCode(): void {
    if (!this.canvas) return;

    const { size, backgroundColor, foregroundColor, galleryUrl } = this.config;

    // Use qrcode library to render directly to canvas
    QRCode.toCanvas(this.canvas, galleryUrl, {
      width: size,
      margin: 1,
      color: {
        dark: foregroundColor,
        light: backgroundColor,
      },
      errorCorrectionLevel: 'M',
    }).catch((err: Error) => {
      console.error('[QROverlay] Failed to generate QR code:', err);
    });
  }

  /**
   * Show or hide the QR overlay.
   */
  setVisible(visible: boolean): void {
    this.config.visible = visible;
    if (this.container) {
      this.container.style.display = visible ? 'block' : 'none';
    }
  }

  /**
   * Update the gallery URL and regenerate QR code.
   */
  setUrl(url: string): void {
    this.config.galleryUrl = url;
    this.generateQRCode();
  }

  /**
   * Update the label text.
   */
  setLabel(text: string): void {
    this.config.label = text;
    if (this.label) {
      this.label.textContent = text;
    }
  }

  /**
   * Update position.
   */
  setPosition(position: QROverlayConfig['position']): void {
    this.config.position = position!;
    if (this.container) {
      this.container.style.cssText = this.getContainerStyles();
    }
  }

  /**
   * Toggle visibility.
   */
  toggle(): void {
    this.setVisible(!this.config.visible);
  }

  /**
   * Destroy the overlay.
   */
  destroy(): void {
    if (this.container && this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
    this.container = null;
    this.canvas = null;
    this.label = null;
  }
}
