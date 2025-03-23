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
    this.frameTimes = [];
    this.currentFPS = 60;
    this.frameCount = 0;
    this.lastFPSUpdate = 0;
    this.processingBacklog = 0;
    this.maxBacklog = 3;
    this.debugMode = false;
    this.scaleFactor = 0.65; // Fixed scale factor for stability
    this.processedWidth = 416; // Fixed processing dimensions
    this.processedHeight = 234;
    this.frameInterval = 30; // Fixed 30ms interval
    this.frameNumber = 0;
    this.lastDebugTime = 0;
    this.debugInterval = 1000;
    this.lastProcessedFrame = 0;
    this.frameTimeout = null;
    this.videoAspectRatio = 16 / 9;
    this.baseWidth = 640;
    this.baseHeight = 360;
    this.lastPose = null;
    this.poseTimeout = null;
    this.poseTimeoutDuration = 1000; // 1 second timeout for pose updates
    this.consecutiveLostFrames = 0;
    this.maxConsecutiveLostFrames = 5;
    this.lastValidPose = null;
    this.poseStabilityThreshold = 0.1; // Threshold for pose stability check

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

    // Set fixed dimensions for processing
    this.processingCanvas.width = this.processedWidth;
    this.processingCanvas.height = this.processedHeight;

    // Initialize context
    this.ctx = this.processingCanvas.getContext("2d", {
      alpha: false,
      desynchronized: true,
      willReadFrequently: true,
    });

    // Initialize AlvaAR with fixed dimensions
    console.log("[AlvaTracker] Initializing AlvaAR...");
    this.alva = await AlvaAR.Initialize(
      this.processedWidth,
      this.processedHeight
    );
    console.log("[AlvaTracker] AlvaAR initialized successfully");
  }

  /**
   * Update processing dimensions based on video aspect ratio and scale factor
   */
  updateProcessingDimensions() {
    // Store current display state
    const wasVisible = this.processingCanvas.style.display === "block";

    // Temporarily make visible for dimension calculation
    this.processingCanvas.style.display = "block";
    this.processingCanvas.offsetHeight; // Force reflow

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

    // Restore original visibility state
    this.processingCanvas.style.display = wasVisible ? "block" : "none";

    // Reinitialize AlvaAR with new dimensions
    if (this.alva) {
      console.log("[AlvaTracker] Reinitializing AlvaAR with new dimensions...");
      AlvaAR.Initialize(this.processedWidth, this.processedHeight)
        .then((newAlva) => {
          this.alva = newAlva;
          console.log("[AlvaTracker] AlvaAR reinitialized successfully");
        })
        .catch((error) => {
          console.error("[AlvaTracker] Error reinitializing AlvaAR:", error);
        });
    }

    console.log(`[AlvaTracker] Updated processing dimensions:`, {
      display: `${displayWidth}x${displayHeight}`,
      effective: `${effectiveWidth}x${effectiveHeight}`,
      processing: `${this.processedWidth}x${this.processedHeight}`,
      scale: this.scaleFactor,
      canvasStyle: {
        display: this.processingCanvas.style.display,
        width: this.processingCanvas.style.width,
        height: this.processingCanvas.style.height,
      },
    });
  }

  /**
   * Toggle debug mode
   * @param {boolean} enabled - Whether to enable debug mode
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
    this.processingCanvas.style.display = enabled ? "block" : "none";
    if (enabled) {
      // Force a reflow to ensure we get the correct dimensions
      this.processingCanvas.offsetHeight;
      this.updateProcessingDimensions();
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

      // Only adjust scale factor if FPS is consistently low
      if (this.currentFPS < 20) {
        this.scaleFactor = Math.max(0.5, this.scaleFactor - 0.1);
        this.updateProcessingDimensions();
        console.log(
          `Reducing resolution to ${this.scaleFactor * 100}% due to low FPS`
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
   * Check if a pose is stable enough to use
   * @param {Object} pose - The pose to check
   * @returns {boolean} Whether the pose is stable
   */
  isPoseStable(pose) {
    if (!this.lastValidPose) return true;

    // Check translation stability
    const dx = Math.abs(pose[12] - this.lastValidPose[12]);
    const dy = Math.abs(pose[13] - this.lastValidPose[13]);
    const dz = Math.abs(pose[14] - this.lastValidPose[14]);

    // Check rotation stability (using quaternion difference)
    const r1 = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().fromArray(this.lastValidPose)
    );
    const r2 = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().fromArray(pose)
    );
    const qDiff = THREE.Quaternion.multiply(r1, r2.clone().invert());

    // Calculate rotation angle
    const angle = 2 * Math.acos(Math.abs(qDiff.w));

    return (
      dx < this.poseStabilityThreshold &&
      dy < this.poseStabilityThreshold &&
      dz < this.poseStabilityThreshold &&
      angle < this.poseStabilityThreshold
    );
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

    // Debug frame timing
    if (currentTime - this.lastDebugTime > this.debugInterval) {
      console.log(`[AlvaTracker] Frame ${this.frameNumber} timing:`, {
        fps: this.currentFPS,
        dimensions: `${this.processedWidth}x${this.processedHeight}`,
        videoDimensions: `${this.video.videoWidth}x${this.video.videoHeight}`,
        consecutiveLostFrames: this.consecutiveLostFrames,
      });
      this.lastDebugTime = currentTime;
    }

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

      // Draw video frame at full resolution first, then scale
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

      if (pose && this.isPoseStable(pose)) {
        // Update camera pose if found and stable
        const convertedPose = this.convertPoseToThreeJS(pose);
        this.onPoseUpdate(convertedPose);
        this.lastPose = convertedPose;
        this.lastValidPose = pose;
        this.lastProcessedFrame = this.frameNumber;
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
              this.lastValidPose = null;
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

        // Only draw feature points in debug mode
        if (this.debugMode) {
          const dots = this.alva.getFramePoints();
          for (const p of dots) {
            this.ctx.fillStyle = "white";
            this.ctx.fillRect(p.x, p.y, 2, 2);
          }
        }
      }

      // Update FPS counter
      this.updateFPS(currentTime);

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
      this.frameCount = 0;
      this.lastFPSUpdate = 0;
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
}
