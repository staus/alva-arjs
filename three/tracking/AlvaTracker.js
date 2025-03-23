/**
 * AlvaTracker - Handles AlvaAR camera pose estimation
 * Manages its own frame processing loop and camera pose updates
 */
import { AlvaAR } from "../../alva/assets/alva_ar.js";

export class AlvaTracker {
  constructor(canvas, onPoseUpdate) {
    this.canvas = canvas; // Main canvas for Three.js rendering
    this.onPoseUpdate = onPoseUpdate;
    this.isRunning = false;
    this.alva = null;
    this.ctx = null;
    this.lastFrameTime = 0;
    this.frameTimes = [];
    this.currentFPS = 60;
    this.frameCount = 0;
    this.lastFPSUpdate = 0;
    this.processingBacklog = 0;
    this.maxBacklog = 3;
    this.debugMode = false;
    this.scaleFactor = 1.0;
    this.processedWidth = 0;
    this.processedHeight = 0;
    this.frameInterval = 1000 / 30; // Target 30 FPS
    this.frameNumber = 0; // For tracking frame sequence
    this.lastDebugTime = 0; // For throttling debug logs
    this.debugInterval = 1000; // Log debug info every second
    this.lastProcessedFrame = 0; // Track last successfully processed frame
    this.frameTimeout = null; // For fixed interval frame processing
    this.videoAspectRatio = 16 / 9; // Default aspect ratio
    this.baseWidth = 640; // Base width for processing
    this.baseHeight = 480; // Base height for processing

    // Get the dedicated AlvaAR processing canvas
    this.processingCanvas = document.getElementById("alva-canvas");
    if (!this.processingCanvas) {
      throw new Error(
        'AlvaAR processing canvas not found. Please add <canvas id="alva-canvas"></canvas> to your HTML.'
      );
    }
  }

  /**
   * Initialize the tracker
   * @returns {Promise<void>}
   */
  async initialize() {
    console.log("[AlvaTracker] Starting initialization...");

    // Determine optimal resolution based on device capabilities
    this.scaleFactor = this.determineOptimalScale();
    console.log(`[AlvaTracker] Initial scale factor: ${this.scaleFactor}`);

    // Set base dimensions
    this.baseWidth = 640;
    this.baseHeight = 480;

    // Initialize AlvaAR with base dimensions
    console.log("[AlvaTracker] Initializing AlvaAR...");
    this.alva = await AlvaAR.Initialize(this.baseWidth, this.baseHeight);
    console.log("[AlvaTracker] AlvaAR initialized successfully");
  }

  /**
   * Determine optimal scale factor based on device capabilities
   * @returns {number} Scale factor between 0.5 and 1.0
   */
  determineOptimalScale() {
    // Check if device is mobile
    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );

    // Check device memory
    const memory = navigator.deviceMemory || 4; // Default to 4GB if not available

    // Check if device has high DPI display
    const dpr = window.devicePixelRatio || 1;

    // Base scale on device capabilities
    let scale = 1.0;
    if (isMobile) {
      scale = Math.min(1.0, Math.max(0.5, memory / 4));
    }

    // Adjust for high DPI displays
    if (dpr > 1) {
      scale *= 0.75;
    }

    return Math.max(0.5, Math.min(1.0, scale));
  }

  /**
   * Update processing dimensions based on video aspect ratio and scale factor
   */
  updateProcessingDimensions() {
    // Calculate the actual display size of the canvas
    const displayWidth = this.processingCanvas.clientWidth;
    const displayHeight = this.processingCanvas.clientHeight;

    // If display dimensions are 0, use base dimensions
    const effectiveWidth = displayWidth || this.baseWidth;
    const effectiveHeight = displayHeight || this.baseHeight;

    // Calculate processing dimensions based on display size and scale factor
    this.processedWidth = Math.floor(effectiveWidth * this.scaleFactor);
    this.processedHeight = Math.floor(effectiveHeight * this.scaleFactor);

    // Ensure minimum dimensions
    this.processedWidth = Math.max(1, this.processedWidth);
    this.processedHeight = Math.max(1, this.processedHeight);

    // Update canvas dimensions for processing
    this.processingCanvas.width = this.processedWidth;
    this.processingCanvas.height = this.processedHeight;

    // Initialize or update context
    if (!this.ctx) {
      this.ctx = this.processingCanvas.getContext("2d", {
        alpha: false,
        desynchronized: true,
        willReadFrequently: true,
      });
    }

    console.log(`[AlvaTracker] Updated processing dimensions:`, {
      display: `${displayWidth}x${displayHeight}`,
      effective: `${effectiveWidth}x${effectiveHeight}`,
      processing: `${this.processedWidth}x${this.processedHeight}`,
      scale: this.scaleFactor,
    });
  }

  /**
   * Toggle debug mode
   * @param {boolean} enabled - Whether to enable debug mode
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
    if (enabled) {
      this.processingCanvas.style.display = "block";
      this.processingCanvas.style.position = "fixed";
      this.processingCanvas.style.top = "0";
      this.processingCanvas.style.left = "0";
      this.processingCanvas.style.zIndex = "1000";
    } else {
      this.processingCanvas.style.display = "none";
    }
  }

  /**
   * Update FPS based on recent frame times
   * @param {number} currentTime - Current timestamp
   */
  updateFPS(currentTime) {
    this.frameCount++;

    if (currentTime - this.lastFPSUpdate >= 1000) {
      this.currentFPS = this.frameCount;
      this.frameCount = 0;
      this.lastFPSUpdate = currentTime;

      // Adjust scale factor based on performance
      if (this.currentFPS < 30) {
        this.scaleFactor = Math.max(0.5, this.scaleFactor - 0.1);
        this.updateProcessingDimensions();
        console.log(
          `Reducing resolution to ${this.scaleFactor * 100}% due to low FPS`
        );
      } else if (this.currentFPS > 45 && this.scaleFactor < 1.0) {
        this.scaleFactor = Math.min(1.0, this.scaleFactor + 0.1);
        this.updateProcessingDimensions();
        console.log(
          `Increasing resolution to ${this.scaleFactor * 100}% due to good FPS`
        );
      }
    }
  }

  /**
   * Calculate dimensions to fit video in canvas while maintaining aspect ratio
   * @returns {Object} Dimensions for video drawing
   */
  calculateVideoDimensions() {
    const canvasAspectRatio = this.processedWidth / this.processedHeight;
    let drawWidth = this.processedWidth;
    let drawHeight = this.processedHeight;
    let offsetX = 0;
    let offsetY = 0;

    if (this.videoAspectRatio > canvasAspectRatio) {
      // Video is wider than canvas
      drawHeight = this.processedWidth / this.videoAspectRatio;
      offsetY = (this.processedHeight - drawHeight) / 2;
    } else {
      // Video is taller than canvas
      drawWidth = this.processedHeight * this.videoAspectRatio;
      offsetX = (this.processedWidth - drawWidth) / 2;
    }

    return {
      width: drawWidth,
      height: drawHeight,
      x: offsetX,
      y: offsetY,
    };
  }

  /**
   * Process a single frame
   * @param {number} timestamp - Current timestamp
   */
  async processFrame() {
    if (!this.isRunning || !this.ctx || !this.video) {
      console.log("[AlvaTracker] Frame processing stopped:", {
        isRunning: this.isRunning,
        hasContext: !!this.ctx,
        hasVideo: !!this.video,
      });
      return;
    }

    // Ensure we have valid dimensions
    if (this.processedWidth <= 0 || this.processedHeight <= 0) {
      console.log("[AlvaTracker] Invalid dimensions, updating...");
      this.updateProcessingDimensions();
    }

    const currentTime = performance.now();
    this.frameNumber++;

    // Debug frame timing
    if (currentTime - this.lastDebugTime > this.debugInterval) {
      console.log(`[AlvaTracker] Frame ${this.frameNumber} timing:`, {
        fps: this.currentFPS,
        backlog: this.processingBacklog,
        dimensions: `${this.processedWidth}x${this.processedHeight}`,
      });
      this.lastDebugTime = currentTime;
    }

    const frameStartTime = performance.now();

    try {
      // Check video state
      if (this.video.readyState !== 4) {
        console.log(
          `[AlvaTracker] Video not ready, state: ${this.video.readyState}`
        );
        this.scheduleNextFrame();
        return;
      }

      // Clear canvas
      this.ctx.clearRect(0, 0, this.processedWidth, this.processedHeight);

      // Draw video frame at full resolution
      this.ctx.drawImage(
        this.video,
        0,
        0,
        this.video.videoWidth,
        this.video.videoHeight,
        0,
        0,
        this.processedWidth,
        this.processedHeight
      );

      // Get frame data for pose estimation
      const frame = this.ctx.getImageData(
        0,
        0,
        this.processedWidth,
        this.processedHeight
      );

      // Process frame with AlvaAR
      const pose = this.alva.findCameraPose(frame);

      if (pose) {
        // Update camera pose if found
        this.onPoseUpdate(pose);
        this.lastProcessedFrame = this.frameNumber;
        if (this.frameNumber % 30 === 0) {
          console.log(`[AlvaTracker] Frame ${this.frameNumber}: Pose found`);
        }
      } else {
        // Handle lost camera tracking
        this.onPoseUpdate(null);
        if (this.frameNumber % 30 === 0) {
          console.log(`[AlvaTracker] Frame ${this.frameNumber}: Lost tracking`);
        }

        // Only draw feature points in debug mode
        if (this.debugMode) {
          const dots = this.alva.getFramePoints();
          for (const p of dots) {
            this.ctx.fillStyle = "white";
            this.ctx.fillRect(p.x, p.y, 2, 2);
          }
        }
      }

      // Record frame processing time
      const frameTime = performance.now() - frameStartTime;
      this.frameTimes.push(frameTime);
      if (this.frameTimes.length > 10) {
        this.frameTimes.shift();
      }

      // Update FPS counter
      this.updateFPS(currentTime);

      // Schedule next frame
      this.scheduleNextFrame();
    } catch (error) {
      console.error("[AlvaTracker] Error processing frame:", error);
      // Continue processing even if there's an error
      this.scheduleNextFrame();
    }
  }

  /**
   * Schedule the next frame processing
   */
  scheduleNextFrame() {
    if (this.frameTimeout) {
      clearTimeout(this.frameTimeout);
    }
    this.frameTimeout = setTimeout(() => {
      this.processFrame();
    }, this.frameInterval);
  }

  /**
   * Wait for video to have valid dimensions
   * @param {HTMLVideoElement} video - Video element to check
   * @returns {Promise<void>}
   */
  async waitForVideoDimensions(video) {
    return new Promise((resolve) => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        console.log("[AlvaTracker] Video dimensions already available:", {
          width: video.videoWidth,
          height: video.videoHeight,
        });
        resolve();
      } else {
        console.log("[AlvaTracker] Waiting for video dimensions...");
        const checkDimensions = () => {
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            console.log("[AlvaTracker] Video dimensions now available:", {
              width: video.videoWidth,
              height: video.videoHeight,
            });
            video.removeEventListener("loadedmetadata", checkDimensions);
            resolve();
          } else {
            console.log("[AlvaTracker] Still waiting for video dimensions...");
          }
        };
        video.addEventListener("loadedmetadata", checkDimensions);
      }
    });
  }

  /**
   * Start tracking
   * @param {HTMLVideoElement} video - Video element to track
   */
  async start(video) {
    if (this.isRunning) {
      console.log("[AlvaTracker] Already running, ignoring start request");
      return;
    }

    console.log("[AlvaTracker] Starting tracking...");
    this.video = video;

    try {
      // Wait for video to have valid dimensions
      await this.waitForVideoDimensions(video);

      // Calculate video aspect ratio
      this.videoAspectRatio = video.videoWidth / video.videoHeight;
      console.log(`[AlvaTracker] Video aspect ratio: ${this.videoAspectRatio}`);

      // Set the aspect ratio CSS property
      this.processingCanvas.style.aspectRatio = `${this.videoAspectRatio}`;
      console.log(
        `[AlvaTracker] Set canvas aspect ratio to: ${this.videoAspectRatio}`
      );

      // Update processing dimensions after aspect ratio is set
      this.updateProcessingDimensions();

      // Log video properties
      console.log(
        `[AlvaTracker] Video dimensions: ${video.videoWidth}x${video.videoHeight}`
      );
      console.log(`[AlvaTracker] Video readyState: ${video.readyState}`);

      // Initialize tracking state
      this.isRunning = true;
      this.lastFrameTime = performance.now();
      this.frameTimes = [];
      this.frameCount = 0;
      this.lastFPSUpdate = 0;
      this.processingBacklog = 0;
      this.frameNumber = 0;

      // Start frame processing loop with fixed interval
      this.processFrame();
      console.log("[AlvaTracker] Frame processing started");
    } catch (error) {
      console.error("[AlvaTracker] Error starting tracking:", error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop tracking
   */
  stop() {
    this.isRunning = false;
    if (this.frameTimeout) {
      clearTimeout(this.frameTimeout);
    }
  }
}
