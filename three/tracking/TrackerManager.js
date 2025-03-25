/**
 * TrackerManager - Coordinates between different tracking systems
 * Manages AlvaAR, GPS, and Image tracking, providing a unified pose interface
 */
import { AlvaTracker } from "./AlvaTracker.js";
import { GPSTracker } from "./GPSTracker.js";
import { ImageTracker } from "./ImageTracker.js";

export class TrackerManager {
  constructor(canvas, onPoseUpdate) {
    this.canvas = canvas;
    this.onPoseUpdate = onPoseUpdate;
    this.trackers = {
      alva: null,
      gps: null,
      image: null,
    };
    this.config = {
      pose: {
        alva: false,
        gps: false,
        image: false,
      },
      debug: false,
      performance: {
        targetFPS: 60,
        minFPS: 30,
      },
    };
    this.currentPose = null;
    this.video = null;
    this.performanceStats = {
      fps: 0,
      frameTime: 0,
    };
  }

  /**
   * Initialize all trackers
   * @returns {Promise<void>}
   */
  async initialize() {
    // No initialization needed at startup
    console.log("TrackerManager initialized");
  }

  /**
   * Start tracking with current configuration
   * @param {HTMLVideoElement} video - Video element for tracking
   */
  start(video) {
    this.video = video;
    // No automatic start of trackers
    console.log("TrackerManager started with video");
  }

  /**
   * Stop all tracking
   */
  stop() {
    // Stop all initialized trackers
    Object.values(this.trackers).forEach((tracker) => {
      if (tracker) {
        tracker.stop();
      }
    });
  }

  /**
   * Clean up resources
   */
  dispose() {
    this.stop();
    // Dispose all initialized trackers
    Object.entries(this.trackers).forEach(([key, tracker]) => {
      if (tracker) {
        tracker.dispose();
        this.trackers[key] = null;
      }
    });
  }

  /**
   * Update tracking configuration
   * @param {Object} config - New configuration object
   */
  async updateConfig(config) {
    this.config = { ...this.config, ...config };

    // Handle tracker state changes based on new config
    if (this.config.pose.alva) {
      if (!this.trackers.alva) {
        // Initialize AlvaAR tracker if not already initialized
        this.trackers.alva = new AlvaTracker(this.canvas, (pose) => {
          if (this.config.pose.alva) {
            this.handleAlvaPose(pose);
          }
        });
        await this.trackers.alva.initialize();
      }
      this.trackers.alva.start(this.video);
    } else if (this.trackers.alva) {
      this.trackers.alva.stop();
    }

    if (this.config.pose.gps) {
      if (!this.trackers.gps) {
        // Initialize GPS tracker if not already initialized
        this.trackers.gps = new GPSTracker((pose) => {
          if (this.config.pose.gps) {
            this.handleGPSPose(pose);
          }
        });
      }
      this.trackers.gps.start();
    } else if (this.trackers.gps) {
      this.trackers.gps.stop();
    }

    if (this.config.pose.image) {
      if (!this.trackers.image) {
        // Initialize Image tracker if not already initialized
        this.trackers.image = new ImageTracker((pose) => {
          if (this.config.pose.image) {
            this.handleImagePose(pose);
          }
        });
        await this.trackers.image.initialize();
        // Set the marker path
        //this.trackers.image.setMarker("data/markers/qr/frame");
      }
      this.trackers.image.start(this.video);
      // Update image tracker specific config
      if (config.image) {
        this.trackers.image.updateConfig(config.image);
      }
    } else if (this.trackers.image) {
      this.trackers.image.stop();
    }
  }

  /**
   * Handle pose updates from AlvaAR
   * @param {Object} pose - AlvaAR pose data
   */
  handleAlvaPose(pose) {
    if (!pose) return;

    this.currentPose = {
      ...this.currentPose,
      ...pose,
      source: "alva",
    };

    this.onPoseUpdate(this.currentPose);
  }

  /**
   * Handle pose updates from GPS
   * @param {Object} pose - GPS pose data
   */
  handleGPSPose(pose) {
    if (!pose) return;

    this.currentPose = {
      ...this.currentPose,
      ...pose,
      source: "gps",
    };

    this.onPoseUpdate(this.currentPose);
  }

  /**
   * Handle pose updates from Image tracking
   * @param {Object} pose - Image tracking pose data
   */
  handleImagePose(pose) {
    if (!pose) return;

    this.currentPose = {
      ...this.currentPose,
      ...pose,
      source: "image",
    };

    this.onPoseUpdate(this.currentPose);
  }

  /**
   * Get current pose
   * @returns {Object|null}
   */
  getCurrentPose() {
    return this.currentPose;
  }

  /**
   * Get performance statistics
   * @returns {Object} Performance statistics
   */
  getPerformanceStats() {
    if (this.trackers.alva) {
      this.performanceStats = {
        fps: 30, // Fixed frame rate since we removed FPS tracking
        frameTime: 33.33, // Fixed frame time (1000ms / 30fps)
      };
    }
    return this.performanceStats;
  }
}
