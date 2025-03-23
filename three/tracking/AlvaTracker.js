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
    // Determine optimal resolution based on device capabilities
    this.scaleFactor = this.determineOptimalScale();

    // Set processed dimensions based on device capabilities
    // Use a fixed size that's good for processing, independent of display size
    this.processedWidth = 640; // Standard processing width
    this.processedHeight = 480; // Standard processing height

    // Set up processing canvas with optimal dimensions
    this.processingCanvas.width = this.processedWidth;
    this.processingCanvas.height = this.processedHeight;

    // Initialize processing context with performance optimizations
    this.ctx = this.processingCanvas.getContext("2d", {
      alpha: false,
      desynchronized: true,
      willReadFrequently: true,
    });

    // Initialize AlvaAR with scaled dimensions
    this.alva = await AlvaAR.Initialize(
      this.processedWidth,
      this.processedHeight
    );
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
   * Start tracking
   * @param {HTMLVideoElement} video - Video element to track
   */
  start(video) {
    if (this.isRunning) return;

    // Ensure processing context is initialized
    if (!this.ctx) {
      this.ctx = this.processingCanvas.getContext("2d", {
        alpha: false,
        desynchronized: true,
        willReadFrequently: true,
      });
    }

    this.isRunning = true;
    this.video = video;
    this.lastFrameTime = 0;
    this.frameTimes = [];
    this.frameCount = 0;
    this.lastFPSUpdate = 0;
    this.processingBacklog = 0;
    this.processFrame();
  }

  /**
   * Stop tracking
   */
  stop() {
    this.isRunning = false;
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
        this.processedWidth = Math.floor(640 * this.scaleFactor);
        this.processedHeight = Math.floor(480 * this.scaleFactor);
        this.processingCanvas.width = this.processedWidth;
        this.processingCanvas.height = this.processedHeight;
        console.log(
          `Reducing resolution to ${this.scaleFactor * 100}% due to low FPS`
        );
      } else if (this.currentFPS > 45 && this.scaleFactor < 1.0) {
        this.scaleFactor = Math.min(1.0, this.scaleFactor + 0.1);
        this.processedWidth = Math.floor(640 * this.scaleFactor);
        this.processedHeight = Math.floor(480 * this.scaleFactor);
        this.processingCanvas.width = this.processedWidth;
        this.processingCanvas.height = this.processedHeight;
        console.log(
          `Increasing resolution to ${this.scaleFactor * 100}% due to good FPS`
        );
      }
    }
  }

  /**
   * Process a single frame
   * @param {number} timestamp - Current timestamp
   */
  async processFrame(timestamp) {
    if (!this.isRunning || !this.ctx || !this.video) return;

    // Skip frame if too soon since last frame or if backlog is too high
    if (
      timestamp - this.lastFrameTime < 33.33 ||
      this.processingBacklog >= this.maxBacklog
    ) {
      this.processingBacklog++;
      requestAnimationFrame(this.processFrame.bind(this));
      return;
    }

    this.lastFrameTime = timestamp;
    this.processingBacklog = Math.max(0, this.processingBacklog - 1);
    const frameStartTime = performance.now();

    // Clear and draw video frame at processed resolution
    this.ctx.clearRect(0, 0, this.processedWidth, this.processedHeight);
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

    // Get frame data for pose estimation at processed resolution
    const frame = this.ctx.getImageData(
      0,
      0,
      this.processedWidth,
      this.processedHeight
    );
    const pose = this.alva.findCameraPose(frame);

    if (pose) {
      // Update camera pose if found
      this.onPoseUpdate(pose);
    } else {
      // Handle lost camera tracking
      this.onPoseUpdate(null);

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
    this.updateFPS(timestamp);

    // Continue processing frames
    requestAnimationFrame(this.processFrame.bind(this));
  }
}
