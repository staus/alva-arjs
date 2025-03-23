/**
 * TrackerManager - Coordinates between different tracking systems
 * Manages AlvaAR and GPS tracking, providing a unified pose interface
 */
import { AlvaTracker } from "./AlvaTracker.js";
import { GPSTracker } from "./GPSTracker.js";

export class TrackerManager {
  constructor(canvas, onPoseUpdate) {
    this.canvas = canvas;
    this.onPoseUpdate = onPoseUpdate;
    this.trackers = {
      alva: null,
      gps: null,
    };
    this.config = {
      pose: {
        alva: true,
        gps: true,
      },
    };
    this.currentPose = null;
  }

  /**
   * Initialize all trackers
   * @returns {Promise<void>}
   */
  async initialize() {
    // Initialize AlvaAR tracker
    this.trackers.alva = new AlvaTracker(this.canvas, (pose) => {
      if (this.config.pose.alva) {
        this.handleAlvaPose(pose);
      }
    });
    await this.trackers.alva.initialize();

    // Initialize GPS tracker
    this.trackers.gps = new GPSTracker((pose) => {
      if (this.config.pose.gps) {
        this.handleGPSPose(pose);
      }
    });
  }

  /**
   * Start tracking with current configuration
   * @param {HTMLVideoElement} video - Video element for AlvaAR tracking
   */
  start(video) {
    if (this.config.pose.alva) {
      this.trackers.alva.start(video);
    }
    if (this.config.pose.gps) {
      this.trackers.gps.start();
    }
  }

  /**
   * Stop all tracking
   */
  stop() {
    if (this.trackers.alva) {
      this.trackers.alva.stop();
    }
    if (this.trackers.gps) {
      this.trackers.gps.stop();
    }
  }

  /**
   * Update tracking configuration
   * @param {Object} config - New configuration object
   */
  updateConfig(config) {
    this.config = { ...this.config, ...config };

    // Handle tracker state changes based on new config
    if (this.trackers.alva) {
      if (this.config.pose.alva) {
        this.trackers.alva.start(this.video);
      } else {
        this.trackers.alva.stop();
      }
    }

    if (this.trackers.gps) {
      if (this.config.pose.gps) {
        this.trackers.gps.start();
      } else {
        this.trackers.gps.stop();
      }
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
   * Get current pose
   * @returns {Object|null}
   */
  getCurrentPose() {
    return this.currentPose;
  }
}
