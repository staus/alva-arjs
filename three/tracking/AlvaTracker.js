/**
 * AlvaTracker - Handles AlvaAR camera pose estimation
 * Manages its own frame processing loop and camera pose updates
 */
import { AlvaAR } from "../../alva/assets/alva_ar.js";
import * as THREE from "three";

export class AlvaTracker {
  constructor(canvas, onPoseUpdate) {
    this.canvas = canvas; // Main canvas for Three.js rendering
    this.onPoseUpdate = onPoseUpdate;
    this.isRunning = false;
    this.alva = null;
    this.ctx = null;
    this.lastFrameTime = 0;
    this.frameInterval = 30; // Fixed 30ms interval
    this.frameNumber = 0;
    this.debugMode = false;
    this.videoAspectRatio = null;
    this.lastPose = null;
    this.poseTimeout = null;
    this.poseTimeoutDuration = 5000; // 5 seconds timeout
    this.consecutiveLostFrames = 0;
    this.maxConsecutiveLostFrames = 5;
    this.frameTimeout = null;

    // Target dimensions for processing (will be adjusted based on aspect ratio)
    this.targetWidth = 640;
    this.targetHeight = 360;

    // Get the dedicated AlvaAR processing canvas
    this.processingCanvas = document.getElementById("alva-canvas");
    if (!this.processingCanvas) {
      throw new Error(
        'AlvaAR processing canvas not found. Please add <canvas id="alva-canvas"></canvas> to your HTML.'
      );
    }
  }

  /**
   * Calculate optimal dimensions while maintaining aspect ratio
   * @param {number} videoWidth - Original video width
   * @param {number} videoHeight - Original video height
   * @returns {Object} Calculated dimensions
   */
  calculateOptimalDimensions(videoWidth, videoHeight) {
    const videoAspectRatio = videoWidth / videoHeight;
    let width, height;

    if (videoAspectRatio > 1) {
      // Landscape
      width = this.targetWidth;
      height = Math.round(width / videoAspectRatio);
    } else {
      // Portrait
      height = this.targetHeight;
      width = Math.round(height * videoAspectRatio);
    }

    return { width, height };
  }

  /**
   * Initialize the tracker
   * @returns {Promise<void>}
   */
  async initialize() {
    console.log("[AlvaTracker] Starting initialization...");

    // Initialize context with optimized settings
    this.ctx = this.processingCanvas.getContext("2d", {
      alpha: false,
      desynchronized: true,
      willReadFrequently: true,
      imageSmoothingEnabled: false,
    });

    // Initialize AlvaAR with temporary dimensions
    // These will be updated when we get the actual video dimensions
    console.log("[AlvaTracker] Initializing AlvaAR...");
    this.alva = await AlvaAR.Initialize(this.targetWidth, this.targetHeight);
    console.log("[AlvaTracker] AlvaAR initialized successfully");
  }

  /**
   * Process a single frame
   * @param {number} timestamp - Current timestamp
   */
  async processFrame() {
    if (!this.isRunning || !this.ctx || !this.video || !this.alva) {
      console.log("[AlvaTracker] Frame processing stopped:", {
        isRunning: this.isRunning,
        hasContext: !!this.ctx,
        hasVideo: !!this.video,
        hasAlva: !!this.alva,
      });
      return;
    }

    const currentTime = performance.now();
    this.frameNumber++;

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
      this.ctx.clearRect(
        0,
        0,
        this.processingCanvas.width,
        this.processingCanvas.height
      );

      // Draw video frame maintaining aspect ratio
      const videoAspectRatio = this.video.videoWidth / this.video.videoHeight;
      const canvasAspectRatio =
        this.processingCanvas.width / this.processingCanvas.height;

      let sx = 0,
        sy = 0,
        sw = this.video.videoWidth,
        sh = this.video.videoHeight;

      if (videoAspectRatio > canvasAspectRatio) {
        // Video is wider than canvas
        sw = Math.round(this.video.videoHeight * canvasAspectRatio);
        sx = Math.round((this.video.videoWidth - sw) / 2);
      } else {
        // Video is taller than canvas
        sh = Math.round(this.video.videoWidth / canvasAspectRatio);
        sy = Math.round((this.video.videoHeight - sh) / 2);
      }

      this.ctx.drawImage(
        this.video,
        sx,
        sy,
        sw,
        sh,
        0,
        0,
        this.processingCanvas.width,
        this.processingCanvas.height
      );

      // Get frame data for pose estimation
      const frame = this.ctx.getImageData(
        0,
        0,
        this.processingCanvas.width,
        this.processingCanvas.height
      );

      // Process frame with AlvaAR
      const pose = this.alva.findCameraPose(frame);

      if (pose) {
        // Convert pose to Three.js format
        const convertedPose = this.convertPoseToThreeJS(pose);
        this.onPoseUpdate(convertedPose);
        this.lastPose = convertedPose;
        this.consecutiveLostFrames = 0;

        // Clear pose timeout
        if (this.poseTimeout) {
          clearTimeout(this.poseTimeout);
        }

        if (this.frameNumber % 30 === 0) {
          console.log(`[AlvaTracker] Frame ${this.frameNumber}: Pose found`);
        }
      } else {
        // Handle lost camera tracking
        this.consecutiveLostFrames++;

        if (
          this.lastPose &&
          this.consecutiveLostFrames < this.maxConsecutiveLostFrames
        ) {
          // If we have a last known pose and haven't lost too many frames, use it
          this.onPoseUpdate(this.lastPose);

          // Set timeout to clear last pose if tracking doesn't recover
          if (!this.poseTimeout) {
            this.poseTimeout = setTimeout(() => {
              this.lastPose = null;
              this.onPoseUpdate(null);
              if (this.frameNumber % 30 === 0) {
                console.log(
                  `[AlvaTracker] Frame ${this.frameNumber}: Lost tracking (timeout)`
                );
              }
            }, this.poseTimeoutDuration);
          }
        } else {
          this.onPoseUpdate(null);
          if (this.frameNumber % 30 === 0) {
            console.log(
              `[AlvaTracker] Frame ${this.frameNumber}: Lost tracking`
            );
          }
        }
      }

      // Always draw feature points for debugging
      const dots = this.alva.getFramePoints();
      for (const p of dots) {
        this.ctx.fillStyle = "white";
        this.ctx.fillRect(p.x, p.y, 4, 4); // Increased point size for better visibility
      }

      // Schedule next frame with fixed interval
      this.scheduleNextFrame();
    } catch (error) {
      console.error("[AlvaTracker] Error processing frame:", error);
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

      // Calculate optimal dimensions based on video aspect ratio
      const { width, height } = this.calculateOptimalDimensions(
        video.videoWidth,
        video.videoHeight
      );

      // Update processing canvas dimensions
      this.processingCanvas.width = width;
      this.processingCanvas.height = height;
      console.log("[AlvaTracker] Set processing canvas dimensions:", {
        width,
        height,
      });

      // Initialize tracking state
      this.isRunning = true;
      this.lastFrameTime = performance.now();
      this.frameNumber = 0;
      this.lastPose = null;
      if (this.poseTimeout) {
        clearTimeout(this.poseTimeout);
      }

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
    if (this.poseTimeout) {
      clearTimeout(this.poseTimeout);
    }
  }

  /**
   * Convert AlvaAR pose to Three.js coordinate system
   * @param {Array} pose - AlvaAR pose matrix
   * @returns {Object} Converted pose with position and orientation
   */
  convertPoseToThreeJS(pose) {
    // Create a copy of the pose matrix
    const matrix = [...pose];

    // Invert x and negate y,z for rotation
    matrix[0] = -pose[0]; // Invert x
    matrix[1] = pose[1]; // Keep y
    matrix[2] = -pose[2]; // Negate z

    // Invert y and z for translation
    matrix[13] = -pose[13]; // Invert y
    matrix[14] = -pose[14]; // Invert z

    // Convert matrix to position and orientation
    const position = {
      x: matrix[12],
      y: matrix[13],
      z: matrix[14],
    };

    // Extract rotation using quaternion
    // This is more stable than Euler angles and avoids gimbal lock
    const trace = matrix[0] + matrix[5] + matrix[10];
    let qx, qy, qz, qw;

    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1.0);
      qw = 0.25 / s;
      qx = (matrix[6] - matrix[9]) * s;
      qy = (matrix[8] - matrix[2]) * s;
      qz = (matrix[1] - matrix[4]) * s;
    } else if (matrix[0] > matrix[5] && matrix[0] > matrix[10]) {
      const s = 2.0 * Math.sqrt(1.0 + matrix[0] - matrix[5] - matrix[10]);
      qw = (matrix[6] - matrix[9]) / s;
      qx = 0.25 * s;
      qy = (matrix[1] + matrix[4]) / s;
      qz = (matrix[8] + matrix[2]) / s;
    } else if (matrix[5] > matrix[10]) {
      const s = 2.0 * Math.sqrt(1.0 + matrix[5] - matrix[0] - matrix[10]);
      qw = (matrix[8] - matrix[2]) / s;
      qx = (matrix[1] + matrix[4]) / s;
      qy = 0.25 * s;
      qz = (matrix[6] + matrix[9]) / s;
    } else {
      const s = 2.0 * Math.sqrt(1.0 + matrix[10] - matrix[0] - matrix[5]);
      qw = (matrix[1] - matrix[4]) / s;
      qx = (matrix[8] + matrix[2]) / s;
      qy = (matrix[6] + matrix[9]) / s;
      qz = 0.25 * s;
    }

    // Convert quaternion to Euler angles (for compatibility with existing code)
    // This is only used for display purposes, the actual rotation is handled by quaternions
    const rotation = {
      x: Math.atan2(2 * (qw * qx + qy * qz), 1 - 2 * (qx * qx + qy * qy)),
      y: Math.asin(2 * (qw * qy - qz * qx)),
      z: Math.atan2(2 * (qw * qz + qx * qy), 1 - 2 * (qy * qy + qz * qz)),
    };

    return {
      position,
      orientation: rotation,
      quaternion: { x: qx, y: qy, z: qz, w: qw }, // Add quaternion for more stable rotation
    };
  }
}
