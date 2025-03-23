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
    this.recoveryMode = false; // Track if we're in recovery mode
    this.recoveryTimeout = null; // Timeout for recovery mode

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

    // Set processed dimensions based on device capabilities
    this.processedWidth = 640;
    this.processedHeight = 480;
    console.log(
      `[AlvaTracker] Processing dimensions: ${this.processedWidth}x${this.processedHeight}`
    );

    // Set up processing canvas with optimal dimensions
    this.processingCanvas.width = this.processedWidth;
    this.processingCanvas.height = this.processedHeight;

    // Initialize processing context with performance optimizations
    this.ctx = this.processingCanvas.getContext("2d", {
      alpha: false,
      desynchronized: true,
      willReadFrequently: true,
    });
    console.log("[AlvaTracker] Canvas context initialized");

    // Initialize AlvaAR with scaled dimensions
    console.log("[AlvaTracker] Initializing AlvaAR...");
    this.alva = await AlvaAR.Initialize(
      this.processedWidth,
      this.processedHeight
    );
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
   * Start tracking
   * @param {HTMLVideoElement} video - Video element to track
   */
  start(video) {
    if (this.isRunning) {
      console.log("[AlvaTracker] Already running, ignoring start request");
      return;
    }

    console.log("[AlvaTracker] Starting tracking...");
    this.isRunning = true;
    this.video = video;
    this.lastFrameTime = performance.now();
    this.frameTimes = [];
    this.frameCount = 0;
    this.lastFPSUpdate = 0;
    this.processingBacklog = 0;
    this.frameNumber = 0;

    // Log video properties
    console.log(
      `[AlvaTracker] Video dimensions: ${video.videoWidth}x${video.videoHeight}`
    );
    console.log(`[AlvaTracker] Video readyState: ${video.readyState}`);

    // Start frame processing loop
    this.processFrame();
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
    if (!this.isRunning || !this.ctx || !this.video) {
      console.log("[AlvaTracker] Frame processing stopped:", {
        isRunning: this.isRunning,
        hasContext: !!this.ctx,
        hasVideo: !!this.video,
      });
      return;
    }

    const currentTime = performance.now();
    const timeSinceLastFrame = currentTime - this.lastFrameTime;
    this.frameNumber++;

    // Debug frame timing
    if (currentTime - this.lastDebugTime > this.debugInterval) {
      console.log(`[AlvaTracker] Frame ${this.frameNumber} timing:`, {
        timeSinceLastFrame: timeSinceLastFrame.toFixed(2),
        frameInterval: this.frameInterval,
        backlog: this.processingBacklog,
        fps: this.currentFPS,
        recoveryMode: this.recoveryMode,
      });
      this.lastDebugTime = currentTime;
    }

    // Handle recovery mode
    if (this.recoveryMode) {
      if (this.recoveryTimeout) {
        clearTimeout(this.recoveryTimeout);
      }

      // If we've successfully processed frames, exit recovery mode
      if (this.frameNumber - this.lastProcessedFrame > 5) {
        console.log("[AlvaTracker] Exiting recovery mode");
        this.recoveryMode = false;
        this.processingBacklog = 0;
      }
    }

    // Skip frame if too soon since last frame
    if (timeSinceLastFrame < this.frameInterval) {
      this.processingBacklog++;
      if (this.processingBacklog % 10 === 0) {
        console.log(`[AlvaTracker] Skipping frame ${this.frameNumber}:`, {
          timeSinceLastFrame: timeSinceLastFrame.toFixed(2),
          backlog: this.processingBacklog,
        });
      }
      requestAnimationFrame(this.processFrame.bind(this));
      return;
    }

    // If backlog is too high, enter recovery mode
    if (this.processingBacklog >= this.maxBacklog && !this.recoveryMode) {
      console.log("[AlvaTracker] Entering recovery mode");
      this.recoveryMode = true;
      this.processingBacklog = 0;
      this.lastProcessedFrame = this.frameNumber;

      // Set a timeout to force recovery mode exit
      this.recoveryTimeout = setTimeout(() => {
        console.log("[AlvaTracker] Forcing recovery mode exit");
        this.recoveryMode = false;
        this.processingBacklog = 0;
      }, 2000); // Exit recovery mode after 2 seconds
    }

    this.lastFrameTime = currentTime;
    this.processingBacklog = Math.max(0, this.processingBacklog - 1);
    const frameStartTime = performance.now();

    try {
      // Check video state
      if (this.video.readyState !== 4) {
        console.log(
          `[AlvaTracker] Video not ready, state: ${this.video.readyState}`
        );
        requestAnimationFrame(this.processFrame.bind(this));
        return;
      }

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

      // Continue processing frames
      requestAnimationFrame(this.processFrame.bind(this));
    } catch (error) {
      console.error("[AlvaTracker] Error processing frame:", error);
      // Continue processing even if there's an error
      requestAnimationFrame(this.processFrame.bind(this));
    }
  }

  /**
   * Stop tracking
   */
  stop() {
    this.isRunning = false;
    if (this.recoveryTimeout) {
      clearTimeout(this.recoveryTimeout);
    }
  }
}
