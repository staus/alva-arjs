/**
 * ImageTracker - Handles AR.js image tracking
 * Manages marker detection and pose updates
 */
import * as THREE from "three";
import {
  ArToolkitSource,
  ArToolkitContext,
  ArMarkerControls,
} from "@ar-js-org/ar.js/three.js/build/ar-threex.js";

export class ImageTracker {
  constructor(canvas, onPoseUpdate) {
    this.canvas = canvas;
    this.onPoseUpdate = onPoseUpdate;
    this.isRunning = false;
    this.arToolkitSource = null;
    this.arToolkitContext = null;
    this.markerControls = null;
    this.video = null;
    this.lastPose = null;
    this.poseTimeout = null;
    this.poseTimeoutDuration = 5000; // 5 seconds timeout
    this.consecutiveLostFrames = 0;
    this.maxConsecutiveLostFrames = 5;
    this.frameTimeout = null;
    this.frameInterval = 30; // Fixed 30ms interval
    this.frameNumber = 0;
    this.isInitialized = false;

    // Default marker configuration
    this.markerConfig = {
      type: "nft",
      descriptorsUrl: "data/markers/test/watercolor", // Default path to marker files
      changeMatrixMode: "cameraTransformMatrix",
      smoothCount: 5, // Number of frames to smooth tracking
      smoothTolerance: 0.01, // Tolerance for smoothing
      smoothThreshold: 2, // Threshold for smoothing
    };
  }

  /**
   * Initialize the tracker
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) {
      console.log("[ImageTracker] Already initialized");
      return;
    }

    console.log("[ImageTracker] Starting initialization...");
    console.log(
      "[ImageTracker] Initial marker configuration:",
      this.markerConfig
    );

    // Log the expected marker file paths
    const markerPath = this.markerConfig.descriptorsUrl;
    console.log("[ImageTracker] Expected marker files:", {
      fset: `${markerPath}.fset`,
      fset3: `${markerPath}.fset3`,
      iset: `${markerPath}.iset`,
    });

    try {
      // Initialize AR.js source
      this.arToolkitSource = new ArToolkitSource({
        sourceType: "webcam",
        sourceWidth: 480,
        sourceHeight: 640,
      });
      console.log("[ImageTracker] AR.js source created");

      // Initialize AR.js context
      this.arToolkitContext = new ArToolkitContext(
        {
          detectionMode: "mono",
          canvasWidth: 480,
          canvasHeight: 640,
        },
        {
          sourceWidth: 480,
          sourceHeight: 640,
        }
      );
      console.log("[ImageTracker] AR.js context created");

      // Initialize AR.js source first
      await new Promise((resolve, reject) => {
        this.arToolkitSource.init(() => {
          console.log("[ImageTracker] AR.js source initialized");
          setTimeout(resolve, 1000); // Wait for resize
        });
      });

      // Initialize AR.js context
      await new Promise((resolve, reject) => {
        this.arToolkitContext.init(() => {
          console.log("[ImageTracker] AR.js context initialized");
          resolve();
        });
      });

      // Initialize marker controls after context is ready
      console.log(
        "[ImageTracker] Creating marker controls with config:",
        this.markerConfig
      );
      this.markerControls = new ArMarkerControls(
        this.arToolkitContext,
        new THREE.Object3D(), // Use a dummy object instead of camera
        this.markerConfig
      );

      // Add event listeners for marker loading
      this.markerControls.addEventListener("markerFound", () => {
        console.log("[ImageTracker] Marker found event triggered");
      });
      this.markerControls.addEventListener("markerLost", () => {
        console.log("[ImageTracker] Marker lost event triggered");
      });

      console.log(
        "[ImageTracker] Marker controls created and event listeners added"
      );

      this.isInitialized = true;
      console.log("[ImageTracker] Initialization complete");
    } catch (error) {
      console.error("[ImageTracker] Initialization failed:", error);
      this.dispose();
      throw error;
    }
  }

  /**
   * Start tracking
   * @param {HTMLVideoElement} video - Video element to track
   */
  async start(video) {
    if (!this.isInitialized) {
      throw new Error("ImageTracker not initialized");
    }

    if (this.isRunning) {
      console.log("[ImageTracker] Already running, ignoring start request");
      return;
    }

    console.log("[ImageTracker] Starting tracking...");
    this.video = video;

    try {
      // Initialize tracking state
      this.isRunning = true;
      this.lastFrameTime = performance.now();
      this.frameNumber = 0;
      this.lastPose = null;
      if (this.poseTimeout) {
        clearTimeout(this.poseTimeout);
      }

      // Start frame processing loop
      this.processFrame();
      console.log("[ImageTracker] Frame processing started");
    } catch (error) {
      console.error("[ImageTracker] Error starting tracking:", error);
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
   * Process a single frame
   * @param {number} timestamp - Current timestamp
   */
  async processFrame() {
    if (!this.isRunning || !this.video || !this.arToolkitContext) {
      console.log("[ImageTracker] Frame processing stopped:", {
        isRunning: this.isRunning,
        hasVideo: !!this.video,
        hasContext: !!this.arToolkitContext,
      });
      return;
    }

    const currentTime = performance.now();
    this.frameNumber++;

    try {
      // Update AR.js context with video frame
      this.arToolkitContext.update(this.video);

      // Check if marker is visible
      const isMarkerVisible = this.markerControls.object3d.visible;

      if (isMarkerVisible) {
        // Get marker object's position and rotation
        const position = this.markerControls.object3d.position.clone();
        const rotation = this.markerControls.object3d.rotation.clone();

        // Convert to our pose format
        const pose = {
          position: {
            x: position.x,
            y: position.y,
            z: position.z,
          },
          orientation: {
            x: rotation.x,
            y: rotation.y,
            z: rotation.z,
          },
        };

        this.onPoseUpdate(pose);
        this.lastPose = pose;
        this.consecutiveLostFrames = 0;

        // Clear pose timeout
        if (this.poseTimeout) {
          clearTimeout(this.poseTimeout);
        }

        if (this.frameNumber % 30 === 0) {
          console.log(
            `[ImageTracker] Frame ${this.frameNumber}: Marker found at position:`,
            {
              x: position.x.toFixed(2),
              y: position.y.toFixed(2),
              z: position.z.toFixed(2),
              rotation: {
                x: ((rotation.x * 180) / Math.PI).toFixed(2),
                y: ((rotation.y * 180) / Math.PI).toFixed(2),
                z: ((rotation.z * 180) / Math.PI).toFixed(2),
              },
            }
          );
        }
      } else {
        // Handle lost marker tracking
        this.consecutiveLostFrames++;

        if (this.frameNumber % 30 === 0) {
          console.log(
            `[ImageTracker] Frame ${this.frameNumber}: Lost tracking (consecutive frames: ${this.consecutiveLostFrames})`
          );
          // Log additional debug info
          console.log("[ImageTracker] Debug info:", {
            markerPath: this.markerConfig.descriptorsUrl,
            hasMarkerControls: !!this.markerControls,
            markerPosition: this.markerControls.object3d.position
              .toArray()
              .map((v) => v.toFixed(2)),
            markerRotation: this.markerControls.object3d.rotation
              .toArray()
              .map((v) => ((v * 180) / Math.PI).toFixed(2)),
          });
        }

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
                  `[ImageTracker] Frame ${this.frameNumber}: Lost tracking (timeout)`
                );
              }
            }, this.poseTimeoutDuration);
          }
        } else {
          this.onPoseUpdate(null);
        }
      }

      // Schedule next frame
      this.scheduleNextFrame();
    } catch (error) {
      console.error("[ImageTracker] Error processing frame:", error);
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
   * Update marker configuration
   * @param {Object} config - New configuration object
   */
  updateConfig(config) {
    if (!this.isInitialized) {
      throw new Error("ImageTracker not initialized");
    }

    console.log("[ImageTracker] Updating marker configuration:", config);

    // Update marker configuration
    this.markerConfig = {
      ...this.markerConfig,
      ...config,
    };

    // Update marker controls if they exist
    if (this.markerControls) {
      console.log(
        "[ImageTracker] Updating marker controls with new config:",
        this.markerConfig
      );
      Object.assign(this.markerControls.parameters, this.markerConfig);
    } else {
      console.warn("[ImageTracker] Marker controls not initialized yet");
    }
  }

  /**
   * Set the marker to track
   * @param {string} markerPath - Path to the marker files (without extension)
   */
  setMarker(markerPath) {
    console.log("[ImageTracker] Setting marker path:", markerPath);
    this.updateConfig({
      descriptorsUrl: markerPath,
    });
  }

  /**
   * Clean up resources
   */
  dispose() {
    this.stop();
    if (this.markerControls) {
      this.markerControls.dispose();
      this.markerControls = null;
    }
    if (this.arToolkitContext) {
      this.arToolkitContext.dispose();
      this.arToolkitContext = null;
    }
    if (this.arToolkitSource) {
      this.arToolkitSource.dispose();
      this.arToolkitSource = null;
    }
    this.isInitialized = false;
  }
}
