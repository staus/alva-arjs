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
        alva: false,
        gps: false,
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

    // Smoothing parameters
    this.smoothingFactor = 0.3; // Lower values = smoother but more lag (0.1-0.5 range)
    this.smoothedPosition = { x: 0, y: 0, z: 0 };
    this.smoothedQuaternion = { x: 0, y: 0, z: 0, w: 1 };
    this.isFirstPose = true;
  }

  /**
   * Apply exponential moving average smoothing to a value
   * @param {number} current - Current value
   * @param {number} previous - Previous smoothed value
   * @returns {number} Smoothed value
   */
  smoothValue(current, previous) {
    return previous + this.smoothingFactor * (current - previous);
  }

  /**
   * Apply smoothing to a 3D vector
   * @param {Object} current - Current vector {x, y, z}
   * @param {Object} previous - Previous smoothed vector {x, y, z}
   * @returns {Object} Smoothed vector {x, y, z}
   */
  smoothVector(current, previous) {
    return {
      x: this.smoothValue(current.x, previous.x),
      y: this.smoothValue(current.y, previous.y),
      z: this.smoothValue(current.z, previous.z),
    };
  }

  /**
   * Apply smoothing to a quaternion
   * @param {Object} current - Current quaternion {x, y, z, w}
   * @param {Object} previous - Previous smoothed quaternion {x, y, z, w}
   * @returns {Object} Smoothed quaternion {x, y, z, w}
   */
  smoothQuaternion(current, previous) {
    // Ensure we're interpolating along the shortest path
    let dot =
      current.x * previous.x +
      current.y * previous.y +
      current.z * previous.z +
      current.w * previous.w;
    if (dot < 0) {
      current = {
        x: -current.x,
        y: -current.y,
        z: -current.z,
        w: -current.w,
      };
    }

    return {
      x: this.smoothValue(current.x, previous.x),
      y: this.smoothValue(current.y, previous.y),
      z: this.smoothValue(current.z, previous.z),
      w: this.smoothValue(current.w, previous.w),
    };
  }

  /**
   * Normalize a quaternion
   * @param {Object} q - Quaternion to normalize
   * @returns {Object} Normalized quaternion
   */
  normalizeQuaternion(q) {
    const length = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
    return {
      x: q.x / length,
      y: q.y / length,
      z: q.z / length,
      w: q.w / length,
    };
  }

  /**
   * Apply smoothing to a pose
   * @param {Object} pose - Current pose with position and orientation
   * @returns {Object} Smoothed pose
   */
  smoothPose(pose) {
    if (!pose) return null;

    if (this.isFirstPose) {
      // Initialize smoothed values on first pose
      this.smoothedPosition = { ...pose.position };
      this.smoothedQuaternion = { ...pose.quaternion };
      this.isFirstPose = false;
    } else {
      // Apply smoothing
      this.smoothedPosition = this.smoothVector(
        pose.position,
        this.smoothedPosition
      );
      this.smoothedQuaternion = this.smoothQuaternion(
        pose.quaternion,
        this.smoothedQuaternion
      );
      // Normalize the quaternion to ensure it remains valid
      this.smoothedQuaternion = this.normalizeQuaternion(
        this.smoothedQuaternion
      );
    }

    return {
      position: this.smoothedPosition,
      quaternion: this.smoothedQuaternion,
      orientation: pose.orientation, // Keep Euler angles for compatibility
    };
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
    this.video = video;
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
   * Clean up resources
   */
  dispose() {
    this.stop();
    if (this.trackers.alva) {
      this.trackers.alva.dispose();
      this.trackers.alva = null;
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
    if (!pose) {
      this.isFirstPose = true; // Reset smoothing on tracking loss
      this.onPoseUpdate(null);
      return;
    }

    const smoothedPose = this.smoothPose(pose);
    this.currentPose = {
      ...smoothedPose,
      source: "alva",
    };

    this.onPoseUpdate(this.currentPose);
  }

  /**
   * Handle pose updates from GPS
   * @param {Object} pose - GPS pose data
   */
  handleGPSPose(pose) {
    if (!pose) {
      this.isFirstPose = true; // Reset smoothing on tracking loss
      this.onPoseUpdate(null);
      return;
    }

    const smoothedPose = this.smoothPose(pose);
    this.currentPose = {
      ...smoothedPose,
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
