/**
 * Video Context Provider
 *
 * Provides video input from webcam with motion detection and color analysis.
 * Follows the AudioProvider pattern for resource cleanup.
 *
 * TODO(resilience): Add auto-reconnect for webcam device changes.
 * The webcam stream can drop when the device is physically disconnected,
 * USB resets, or the OS revokes camera access (e.g., another app claims it).
 * Currently the provider silently fails and returns stale motion/face data.
 * Implementation:
 * - Listen for navigator.mediaDevices 'devicechange' events
 * - Monitor video track health (track.onended / track.readyState === 'ended')
 * - Periodic health check: verify video frames are updating (compare consecutive
 *   getImageData or check video.currentTime is advancing)
 * - Re-acquire getUserMedia with exponential backoff on failure
 * - Reinitialize the analysis canvas and face detector after reconnect
 * - Consider: on device change, re-enumerate devices and prefer the same
 *   device ID if still available, otherwise fall back to default
 * Reference: the previous implementation had this in the hardening commit
 * (d5557f9) but was not merged because the VideoProvider was heavily
 * refactored on the remote branch (object pools, face detection, etc.).
 */

import type {
  VideoContext,
  MotionData,
  FaceData,
  FaceLandmarks,
  RGBA,
  Rectangle,
} from '@art/types';
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';

/**
 * Configuration for VideoProvider.
 */
export interface VideoProviderConfig {
  /** Target analysis resolution width (default: 160) - lower = faster */
  analysisWidth?: number;

  /** Target analysis resolution height (default: 120) - lower = faster */
  analysisHeight?: number;

  /** Minimum ms between frame analyses (default: 50 = 20 analyses/sec) */
  analysisInterval?: number;

  /** Motion detection sensitivity 0-1 (default: 0.15) */
  motionSensitivity?: number;

  /** Minimum motion change to register (default: 20 out of 255) */
  motionThreshold?: number;

  /** Number of dominant colors to track (default: 5) */
  dominantColorCount?: number;

  /** Maximum motion regions to detect (default: 5) */
  maxMotionRegions?: number;

  /** Preferred camera facing mode (default: 'user') */
  facingMode?: 'user' | 'environment';
}

/**
 * Provides video context data from webcam input.
 */
export class VideoProvider implements VideoContext {
  private config: Required<VideoProviderConfig>;

  // Media resources (require explicit cleanup)
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;

  // Canvas for pixel analysis (off-screen)
  private analysisCanvas: HTMLCanvasElement | null = null;
  private analysisContext: CanvasRenderingContext2D | null = null;

  // Frame data buffers (pre-allocated, reused)
  private currentFrame: ImageData | null = null;
  private previousFrame: Uint8ClampedArray | null = null;

  // Motion detection state (pre-allocated)
  private motionData: MotionData = {
    intensity: 0,
    direction: { x: 0, y: 0 },
    regions: [],
  };
  private motionRegionPool: Rectangle[] = [];
  private motionGrid: number[] = [];

  // Color analysis state (pre-allocated)
  private dominantColors: RGBA[] = [];
  private cachedBrightness: number = 0.5;

  // Throttling
  private lastAnalysisTime: number = 0;

  // State
  private available: boolean = false;
  private dimensions: { width: number; height: number } | null = null;

  // Temporal smoothing for motion intensity
  private smoothedIntensity: number = 0;

  // Target canvas dimensions for coordinate mapping
  private targetWidth: number = 0;
  private targetHeight: number = 0;

  // Face detection (MediaPipe)
  private faceDetector: FaceDetector | null = null;
  private faceDetectionReady: boolean = false;
  private detectedFaces: FaceData[] = [];
  private activeFaceCount: number = 0;
  private readonly MAX_FACES = 5;

  constructor(config: VideoProviderConfig = {}) {
    this.config = {
      analysisWidth: config.analysisWidth ?? 160,
      analysisHeight: config.analysisHeight ?? 120,
      analysisInterval: config.analysisInterval ?? 50,
      motionSensitivity: config.motionSensitivity ?? 0.05, // Reduced from 0.15
      motionThreshold: config.motionThreshold ?? 30, // Increased from 20
      dominantColorCount: config.dominantColorCount ?? 5,
      maxMotionRegions: config.maxMotionRegions ?? 5,
      facingMode: config.facingMode ?? 'user',
    };
  }

  /**
   * Set the target canvas dimensions for coordinate mapping.
   * Motion regions will be mapped from video space to this target space.
   */
  setTargetDimensions(width: number, height: number): void {
    this.targetWidth = width;
    this.targetHeight = height;
  }

  /**
   * Initialize MediaPipe face detection (async, non-blocking).
   */
  private async initFaceDetection(): Promise<void> {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );
      this.faceDetector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.5,
      });
      this.faceDetectionReady = true;
      console.log('[VideoProvider] Face detection initialized (MediaPipe BlazeFace)');
    } catch (error) {
      console.warn('[VideoProvider] Face detection unavailable:', error);
      this.faceDetector = null;
      this.faceDetectionReady = false;
    }
  }

  /**
   * Pre-allocate face detection pool to avoid allocations in update loop.
   */
  private preallocateFacePool(): void {
    this.detectedFaces = new Array(this.MAX_FACES);
    for (let i = 0; i < this.MAX_FACES; i++) {
      this.detectedFaces[i] = {
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        confidence: 0,
        landmarks: {
          leftEye: { x: 0, y: 0 },
          rightEye: { x: 0, y: 0 },
          noseTip: { x: 0, y: 0 },
          mouth: { x: 0, y: 0 },
          leftEarTragion: { x: 0, y: 0 },
          rightEarTragion: { x: 0, y: 0 },
        },
      };
    }
  }

  /**
   * Initialize video input.
   */
  async start(): Promise<boolean> {
    try {
      // Request camera access
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: this.config.facingMode,
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });

      // Create video element (off-screen)
      this.video = document.createElement('video');
      this.video.srcObject = this.stream;
      this.video.muted = true;
      this.video.playsInline = true;

      // Wait for video to be ready
      await new Promise<void>((resolve, reject) => {
        if (!this.video) {
          reject(new Error('Video element not created'));
          return;
        }
        this.video.onloadedmetadata = () => resolve();
        this.video.onerror = () => reject(new Error('Video load error'));
      });

      await this.video.play();

      // Get actual video dimensions
      this.dimensions = {
        width: this.video.videoWidth,
        height: this.video.videoHeight,
      };

      // Create analysis canvas (downscaled for performance)
      this.analysisCanvas = document.createElement('canvas');
      this.analysisCanvas.width = this.config.analysisWidth;
      this.analysisCanvas.height = this.config.analysisHeight;
      this.analysisContext = this.analysisCanvas.getContext('2d', {
        willReadFrequently: true, // Optimize for frequent getImageData
      });

      if (!this.analysisContext) {
        throw new Error('Failed to create 2D context');
      }

      // Pre-allocate frame buffers
      const pixelCount = this.config.analysisWidth * this.config.analysisHeight;
      this.previousFrame = new Uint8ClampedArray(pixelCount * 4);

      // Pre-allocate motion grid (8x8 blocks)
      const blockSize = 8;
      const blocksX = Math.ceil(this.config.analysisWidth / blockSize);
      const blocksY = Math.ceil(this.config.analysisHeight / blockSize);
      this.motionGrid = new Array(blocksX * blocksY).fill(0);

      // Pre-allocate motion regions pool
      this.motionRegionPool = [];
      for (let i = 0; i < this.config.maxMotionRegions; i++) {
        this.motionRegionPool.push({ x: 0, y: 0, width: 0, height: 0 });
      }

      // Pre-allocate color arrays
      this.dominantColors = [];
      for (let i = 0; i < this.config.dominantColorCount; i++) {
        this.dominantColors.push({ r: 128, g: 128, b: 128, a: 1 });
      }

      // Pre-allocate face detection pool
      this.preallocateFacePool();

      // Initialize face detection asynchronously (don't block video start)
      this.initFaceDetection();

      // Set up error handlers for stream
      this.stream.getTracks().forEach((track) => {
        track.onended = () => {
          console.warn('[VideoProvider] Camera track ended');
          this.cleanup();
        };
      });

      this.video.onerror = () => {
        console.warn('[VideoProvider] Video stream error, cleaning up');
        this.cleanup();
      };

      this.available = true;
      console.log(
        `[VideoProvider] Video input initialized (${this.dimensions.width}x${this.dimensions.height})`
      );
      return true;
    } catch (error) {
      console.warn('[VideoProvider] Failed to initialize video:', error);
      this.cleanup();
      return false;
    }
  }

  /**
   * Stop video input and release all resources.
   */
  stop(): void {
    this.cleanup();
    console.log('[VideoProvider] Video input stopped');
  }

  /**
   * Internal cleanup - releases all resources.
   * Can be called from stop() or from error paths.
   */
  private cleanup(): void {
    // Stop all media stream tracks
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        track.onended = null; // Remove handler before stopping
        track.stop();
      });
      this.stream = null;
    }

    // Clean up video element
    if (this.video) {
      this.video.onerror = null;
      this.video.onloadedmetadata = null;
      this.video.pause();
      this.video.srcObject = null;
      this.video.src = '';
      this.video = null;
    }

    // Release canvas resources
    if (this.analysisCanvas) {
      this.analysisCanvas.width = 0; // Release memory
      this.analysisCanvas.height = 0;
      this.analysisCanvas = null;
    }
    this.analysisContext = null;

    // Clear frame buffers
    this.currentFrame = null;
    this.previousFrame = null;

    // Close face detector
    if (this.faceDetector) {
      this.faceDetector.close();
      this.faceDetector = null;
    }
    this.faceDetectionReady = false;
    this.activeFaceCount = 0;

    // Reset state
    this.available = false;
    this.dimensions = null;
  }

  /**
   * Update video analysis (call each frame from ContextManager).
   * Throttled internally to avoid excessive CPU usage.
   */
  update(): void {
    if (!this.available || !this.video || !this.analysisContext) return;

    // Throttle analysis
    const now = performance.now();
    if (now - this.lastAnalysisTime < this.config.analysisInterval) return;
    this.lastAnalysisTime = now;

    // Save context state
    this.analysisContext.save();

    // Flip horizontally (mirror) for natural interaction
    // When using front-facing camera, movements should appear mirrored like a mirror
    this.analysisContext.translate(this.config.analysisWidth, 0);
    this.analysisContext.scale(-1, 1);

    // Draw video frame to analysis canvas (downscaled)
    this.analysisContext.drawImage(
      this.video,
      0,
      0,
      this.config.analysisWidth,
      this.config.analysisHeight
    );

    // Restore context state
    this.analysisContext.restore();

    // Get pixel data
    this.currentFrame = this.analysisContext.getImageData(
      0,
      0,
      this.config.analysisWidth,
      this.config.analysisHeight
    );

    // Run analysis
    this.analyzeMotion();
    this.analyzeColors();
    this.detectFaces();

    // Store current frame for next comparison
    if (this.previousFrame && this.currentFrame) {
      this.previousFrame.set(this.currentFrame.data);
    }
  }

  /**
   * Motion detection using frame differencing.
   */
  private analyzeMotion(): void {
    if (!this.currentFrame || !this.previousFrame) {
      this.resetMotionData();
      return;
    }

    const data = this.currentFrame.data;
    const prev = this.previousFrame;
    const width = this.config.analysisWidth;
    const height = this.config.analysisHeight;
    const threshold = this.config.motionThreshold;

    let motionPixelCount = 0;
    let totalDiffX = 0;
    let totalDiffY = 0;
    let totalDiff = 0;

    // Block-based motion detection
    const blockSize = 8;
    const blocksX = Math.ceil(width / blockSize);
    const blocksY = Math.ceil(height / blockSize);

    // Reset motion grid
    this.motionGrid.fill(0);

    // Analyze each pixel
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;

        // Calculate luminance difference
        const currLum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        const prevLum = prev[i] * 0.299 + prev[i + 1] * 0.587 + prev[i + 2] * 0.114;
        const diff = Math.abs(currLum - prevLum);

        if (diff > threshold) {
          motionPixelCount++;
          totalDiff += diff;

          // Weight position by distance from center for direction
          const centerX = width / 2;
          const centerY = height / 2;
          totalDiffX += (x - centerX) * diff;
          totalDiffY += (y - centerY) * diff;

          // Mark block as having motion
          const blockX = Math.floor(x / blockSize);
          const blockY = Math.floor(y / blockSize);
          this.motionGrid[blockY * blocksX + blockX]++;
        }
      }
    }

    // Calculate raw intensity (0-1)
    const totalPixels = width * height;
    const rawIntensity = Math.min(
      1,
      motionPixelCount / (totalPixels * this.config.motionSensitivity)
    );

    // Apply temporal smoothing to prevent sudden spikes
    // Smoothing factor: 0.3 means 30% new value, 70% old value
    const smoothingFactor = 0.3;
    this.smoothedIntensity =
      this.smoothedIntensity * (1 - smoothingFactor) + rawIntensity * smoothingFactor;

    // Apply non-linear scaling to reduce sensitivity at low motion levels
    // This creates a "dead zone" for minor movements
    const scaledIntensity = Math.pow(this.smoothedIntensity, 1.5);

    this.motionData.intensity = scaledIntensity;

    // Calculate direction (normalized vector)
    if (totalDiff > 0) {
      const dirX = totalDiffX / totalDiff;
      const dirY = totalDiffY / totalDiff;
      const magnitude = Math.sqrt(dirX * dirX + dirY * dirY);
      if (magnitude > 0.001) {
        this.motionData.direction.x = dirX / magnitude;
        this.motionData.direction.y = dirY / magnitude;
      } else {
        this.motionData.direction.x = 0;
        this.motionData.direction.y = 0;
      }
    } else {
      this.motionData.direction.x = 0;
      this.motionData.direction.y = 0;
    }

    // Find motion regions from grid
    this.findMotionRegions(blocksX, blocksY, blockSize);
  }

  /**
   * Find motion regions using block-based column analysis.
   * Detects separate motion clusters by finding gaps between motion columns.
   * Maps coordinates from analysis space to target canvas space.
   */
  private findMotionRegions(blocksX: number, blocksY: number, blockSize: number): void {
    const minBlockMotion = 3; // Minimum pixels per block to count as motion
    const minGapBlocks = 2; // Minimum gap between columns to split into separate regions

    // Clear regions array (reuse capacity)
    this.motionData.regions.length = 0;

    // Find motion bounds per column
    const columnBounds: Array<{ minY: number; maxY: number; hasMotion: boolean }> = [];
    for (let bx = 0; bx < blocksX; bx++) {
      let colMinY = Infinity;
      let colMaxY = -Infinity;
      let hasMotion = false;

      for (let by = 0; by < blocksY; by++) {
        if (this.motionGrid[by * blocksX + bx] >= minBlockMotion) {
          hasMotion = true;
          colMinY = Math.min(colMinY, by);
          colMaxY = Math.max(colMaxY, by);
        }
      }

      columnBounds.push({ minY: colMinY, maxY: colMaxY, hasMotion });
    }

    // Find contiguous column groups (clusters)
    const targetWidth = this.targetWidth || this.config.analysisWidth;
    const targetHeight = this.targetHeight || this.config.analysisHeight;
    const scaleX = targetWidth / this.config.analysisWidth;
    const scaleY = targetHeight / this.config.analysisHeight;

    let regionIndex = 0;
    let clusterStart = -1;
    let clusterMinY = Infinity;
    let clusterMaxY = -Infinity;
    let gapCount = 0;

    const addRegion = (startX: number, endX: number, minY: number, maxY: number) => {
      if (regionIndex >= this.config.maxMotionRegions) return;

      const region = this.motionRegionPool[regionIndex];
      region.x = startX * blockSize * scaleX;
      region.y = minY * blockSize * scaleY;
      region.width = (endX - startX + 1) * blockSize * scaleX;
      region.height = (maxY - minY + 1) * blockSize * scaleY;

      this.motionData.regions.push(region);
      regionIndex++;
    };

    for (let bx = 0; bx < blocksX; bx++) {
      const col = columnBounds[bx];

      if (col.hasMotion) {
        if (clusterStart === -1) {
          // Start new cluster
          clusterStart = bx;
          clusterMinY = col.minY;
          clusterMaxY = col.maxY;
        } else {
          // Extend cluster
          clusterMinY = Math.min(clusterMinY, col.minY);
          clusterMaxY = Math.max(clusterMaxY, col.maxY);
        }
        gapCount = 0;
      } else if (clusterStart !== -1) {
        // In a gap
        gapCount++;
        if (gapCount >= minGapBlocks) {
          // End current cluster, start looking for new one
          addRegion(clusterStart, bx - gapCount, clusterMinY, clusterMaxY);
          clusterStart = -1;
          clusterMinY = Infinity;
          clusterMaxY = -Infinity;
          gapCount = 0;
        }
      }
    }

    // Don't forget the last cluster
    if (clusterStart !== -1) {
      addRegion(clusterStart, blocksX - 1 - gapCount, clusterMinY, clusterMaxY);
    }
  }

  /**
   * Reset motion data to defaults.
   */
  private resetMotionData(): void {
    this.motionData.intensity = 0;
    this.motionData.direction.x = 0;
    this.motionData.direction.y = 0;
    this.motionData.regions.length = 0;
  }

  /**
   * Analyze dominant colors from current frame.
   */
  private analyzeColors(): void {
    if (!this.currentFrame) return;

    const data = this.currentFrame.data;
    const pixelCount = data.length / 4;

    // Sample pixels (skip some for performance)
    const sampleStep = Math.max(1, Math.floor(pixelCount / 1000));
    let totalR = 0,
      totalG = 0,
      totalB = 0;
    let sampleCount = 0;

    for (let i = 0; i < data.length; i += sampleStep * 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      totalR += r;
      totalG += g;
      totalB += b;
      sampleCount++;
    }

    // Update primary dominant color (average)
    if (sampleCount > 0) {
      this.dominantColors[0].r = Math.round(totalR / sampleCount);
      this.dominantColors[0].g = Math.round(totalG / sampleCount);
      this.dominantColors[0].b = Math.round(totalB / sampleCount);
      this.dominantColors[0].a = 1;

      // Calculate brightness
      this.cachedBrightness = (totalR + totalG + totalB) / (sampleCount * 3 * 255);
    }
  }

  /**
   * Detect faces using MediaPipe BlazeFace.
   * Runs on the video element directly (not downscaled analysis canvas).
   */
  private detectFaces(): void {
    if (!this.faceDetector || !this.video || !this.faceDetectionReady || !this.dimensions) {
      this.activeFaceCount = 0;
      return;
    }

    try {
      const result = this.faceDetector.detectForVideo(this.video, performance.now());
      this.activeFaceCount = Math.min(result.detections.length, this.MAX_FACES);

      // Map target dimensions (use video dimensions if target not set)
      const targetW = this.targetWidth || this.dimensions.width;
      const targetH = this.targetHeight || this.dimensions.height;

      for (let i = 0; i < this.activeFaceCount; i++) {
        const detection = result.detections[i];
        const face = this.detectedFaces[i];
        const bbox = detection.boundingBox;

        if (bbox) {
          // Map bounding box to target canvas coordinates
          // Note: Video is mirrored horizontally for natural interaction
          const mirroredX = this.dimensions.width - bbox.originX - bbox.width;
          face.bounds.x = (mirroredX / this.dimensions.width) * targetW;
          face.bounds.y = (bbox.originY / this.dimensions.height) * targetH;
          face.bounds.width = (bbox.width / this.dimensions.width) * targetW;
          face.bounds.height = (bbox.height / this.dimensions.height) * targetH;
        }

        // Get confidence score
        face.confidence = detection.categories?.[0]?.score ?? 0;

        // Map keypoints (6 landmarks from BlazeFace)
        // Order: left eye, right eye, nose tip, mouth, left ear tragion, right ear tragion
        if (detection.keypoints && detection.keypoints.length >= 6 && face.landmarks) {
          const kp = detection.keypoints;
          // Mirror X coordinates for natural interaction
          face.landmarks.leftEye.x = (1 - kp[0].x) * targetW;
          face.landmarks.leftEye.y = kp[0].y * targetH;
          face.landmarks.rightEye.x = (1 - kp[1].x) * targetW;
          face.landmarks.rightEye.y = kp[1].y * targetH;
          face.landmarks.noseTip.x = (1 - kp[2].x) * targetW;
          face.landmarks.noseTip.y = kp[2].y * targetH;
          face.landmarks.mouth.x = (1 - kp[3].x) * targetW;
          face.landmarks.mouth.y = kp[3].y * targetH;
          face.landmarks.leftEarTragion.x = (1 - kp[4].x) * targetW;
          face.landmarks.leftEarTragion.y = kp[4].y * targetH;
          face.landmarks.rightEarTragion.x = (1 - kp[5].x) * targetW;
          face.landmarks.rightEarTragion.y = kp[5].y * targetH;
        }
      }
    } catch (error) {
      // Face detection can fail on some frames, silently continue
      this.activeFaceCount = 0;
    }
  }

  // ============ VideoContext Implementation ============

  isAvailable(): boolean {
    return this.available;
  }

  getFrame(): ImageData | null {
    return this.currentFrame;
  }

  getMotion(): MotionData {
    return this.motionData;
  }

  getDominantColor(): RGBA {
    return this.dominantColors[0] || { r: 128, g: 128, b: 128, a: 1 };
  }

  getDominantColors(count: number): RGBA[] {
    return this.dominantColors.slice(0, Math.min(count, this.dominantColors.length));
  }

  getBrightness(): number {
    return this.cachedBrightness;
  }

  getFaces(): FaceData[] {
    // Return only active detected faces (slice to avoid returning inactive pool entries)
    return this.detectedFaces.slice(0, this.activeFaceCount);
  }

  getDimensions(): { width: number; height: number } | null {
    return this.dimensions;
  }

  /**
   * Get the video element for debug overlay purposes.
   */
  getVideoElement(): HTMLVideoElement | null {
    return this.video;
  }

  getColorAt(x: number, y: number): RGBA | null {
    if (!this.currentFrame || !this.dimensions) return null;

    // Scale coordinates from video space to analysis space
    const scaleX = this.config.analysisWidth / this.dimensions.width;
    const scaleY = this.config.analysisHeight / this.dimensions.height;

    const ax = Math.floor(x * scaleX);
    const ay = Math.floor(y * scaleY);

    if (ax < 0 || ax >= this.config.analysisWidth || ay < 0 || ay >= this.config.analysisHeight) {
      return null;
    }

    const i = (ay * this.config.analysisWidth + ax) * 4;
    return {
      r: this.currentFrame.data[i],
      g: this.currentFrame.data[i + 1],
      b: this.currentFrame.data[i + 2],
      a: 1,
    };
  }
}
