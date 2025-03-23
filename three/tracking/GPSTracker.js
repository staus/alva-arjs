/**
 * GPSTracker - Handles GPS location tracking and updates
 * Manages its own location updates and provides pose data
 */
export class GPSTracker {
  constructor(onPoseUpdate) {
    this.onPoseUpdate = onPoseUpdate;
    this.isRunning = false;
    this.watchId = null;
    this.lastPosition = null;
    this.lastUpdateTime = 0;
    this.updateInterval = 1000; // Update every second
  }

  /**
   * Start tracking
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // Request high accuracy GPS updates
    this.watchId = navigator.geolocation.watchPosition(
      this.handlePositionUpdate.bind(this),
      this.handleError.bind(this),
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
      }
    );
  }

  /**
   * Stop tracking
   */
  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  /**
   * Handle position updates from GPS
   * @param {GeolocationPosition} position - GPS position data
   */
  handlePositionUpdate(position) {
    const currentTime = Date.now();

    // Skip if update is too soon
    if (currentTime - this.lastUpdateTime < this.updateInterval) {
      return;
    }

    this.lastUpdateTime = currentTime;
    this.lastPosition = position;

    // Convert GPS coordinates to pose data
    const pose = {
      position: {
        x: position.coords.longitude,
        y: position.coords.latitude,
        z: position.coords.altitude || 0,
      },
      orientation: {
        x: 0,
        y: 0,
        z: position.coords.heading || 0,
      },
      timestamp: position.timestamp,
    };

    this.onPoseUpdate(pose);
  }

  /**
   * Handle GPS errors
   * @param {GeolocationPositionError} error - GPS error data
   */
  handleError(error) {
    console.error("GPS Error:", error.message);
    this.onPoseUpdate(null);
  }

  /**
   * Get the last known position
   * @returns {GeolocationPosition|null}
   */
  getLastPosition() {
    return this.lastPosition;
  }
}
