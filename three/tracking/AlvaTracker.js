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
    this.videoAspectRatio = 16 / 9;
    this.lastPose = null;
    this.poseTimeout = null;
    this.poseTimeoutDuration = 1000; // 1 second timeout for pose updates
    this.consecutiveLostFrames = 0;
    this.maxConsecutiveLostFrames = 5;
    this.frameTimeout = null;

    // Fixed dimensions for both display and processing
    this.width = 640;
    this.height = 360;

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

    // Set canvas dimensions
    this.processingCanvas.width = this.width;
    this.processingCanvas.height = this.height;

    // Initialize context with optimized settings
    this.ctx = this.processingCanvas.getContext("2d", {
      alpha: false,
      desynchronized: true,
      willReadFrequently: true,
      imageSmoothingEnabled: false,
    });

    // Initialize AlvaAR
    console.log("[AlvaTracker] Initializing AlvaAR...");
    this.alva = await AlvaAR.Initialize(this.width, this.height);
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
      this.ctx.clearRect(0, 0, this.width, this.height);

      // Draw video frame
      this.ctx.imageSmoothingEnabled = false;
      this.ctx.drawImage(
        this.video,
        0,
        0,
        this.video.videoWidth,
        this.video.videoHeight,
        0,
        0,
        this.width,
        this.height
      );

      // Get frame data for pose estimation
      const frame = this.ctx.getImageData(0, 0, this.width, this.height);

      // Process frame with AlvaAR
      const pose = this.alva.findCameraPose(frame);

      if (pose) {
        // Update camera pose if found
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

      // Calculate video aspect ratio
      this.videoAspectRatio = video.videoWidth / video.videoHeight;
      console.log(`[AlvaTracker] Video aspect ratio: ${this.videoAspectRatio}`);

      // Set the aspect ratio CSS property
      this.processingCanvas.style.aspectRatio = `${this.videoAspectRatio}`;
      console.log(
        `[AlvaTracker] Set canvas aspect ratio to: ${this.videoAspectRatio}`
      );

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
   * @returns {Array} Converted pose matrix
   */
  convertPoseToThreeJS(pose) {
    // Create a copy of the pose matrix
    const convertedPose = [...pose];

    // Invert x and negate y,z for rotation
    convertedPose[0] = -pose[0]; // Invert x
    convertedPose[1] = pose[1]; // Keep y
    convertedPose[2] = -pose[2]; // Negate z

    // Invert y and z for translation
    convertedPose[13] = -pose[13]; // Invert y
    convertedPose[14] = -pose[14]; // Invert z

    return convertedPose;
  }
}
