/**
 * AlvaTracker - Handles AlvaAR camera pose estimation
 * Manages its own frame processing loop and camera pose updates
 */
import { AlvaAR } from "../../alva/assets/alva_ar.js";

export class AlvaTracker {
  constructor(canvas, onPoseUpdate) {
    this.canvas = canvas;
    this.onPoseUpdate = onPoseUpdate;
    this.isRunning = false;
    this.alva = null;
    this.ctx = null;
    this.lastFrameTime = 0;
    this.frameTimes = [];
    this.currentFPS = 60;
    this.frameCount = 0;
    this.lastFPSUpdate = 0;
  }

  /**
   * Initialize the tracker
   * @returns {Promise<void>}
   */
  async initialize() {
    this.ctx = this.canvas.getContext("2d", {
      alpha: false,
      desynchronized: true,
    });
    this.alva = await AlvaAR.Initialize(this.canvas.width, this.canvas.height);
  }

  /**
   * Start tracking
   * @param {HTMLVideoElement} video - Video element to track
   */
  start(video) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.video = video;
    this.lastFrameTime = 0;
    this.frameTimes = [];
    this.frameCount = 0;
    this.lastFPSUpdate = 0;
    this.processFrame();
  }

  /**
   * Stop tracking
   */
  stop() {
    this.isRunning = false;
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

      if (this.currentFPS < 30) {
        const avgFrameTime =
          this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
        if (avgFrameTime > 33.33) {
          // 30 FPS threshold
          console.log(
            `AlvaAR Performance warning: Current FPS ${this.currentFPS}`
          );
        }
      }
    }
  }

  /**
   * Process a single frame
   * @param {number} timestamp - Current timestamp
   */
  async processFrame(timestamp) {
    if (!this.isRunning) return;

    // Skip frame if too soon since last frame
    if (timestamp - this.lastFrameTime < 33.33) {
      // 30 FPS threshold
      requestAnimationFrame(this.processFrame.bind(this));
      return;
    }

    this.lastFrameTime = timestamp;
    const frameStartTime = performance.now();

    // Clear and draw video frame
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(
      this.video,
      0,
      0,
      this.video.videoWidth,
      this.video.videoHeight
    );

    // Get frame data for pose estimation
    const frame = this.ctx.getImageData(
      0,
      0,
      this.canvas.width,
      this.canvas.height
    );
    const pose = this.alva.findCameraPose(frame);

    if (pose) {
      // Update camera pose if found
      this.onPoseUpdate(pose);
    } else {
      // Handle lost camera tracking
      this.onPoseUpdate(null);
      // Draw feature points for debugging
      const dots = this.alva.getFramePoints();
      for (const p of dots) {
        this.ctx.fillStyle = "white";
        this.ctx.fillRect(p.x, p.y, 2, 2);
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
