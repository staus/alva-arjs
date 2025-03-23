import { deg2rad, getScreenOrientation, isIOS } from "./utils.js";

/**
 * Quaternion class for handling 3D rotations
 * Provides methods for creating quaternions from various representations
 * and performing quaternion operations
 */
class Quaternion {
  /**
   * Create a quaternion from an axis-angle representation
   * @param {number} axisX - X component of rotation axis
   * @param {number} axisY - Y component of rotation axis
   * @param {number} axisZ - Z component of rotation axis
   * @param {number} angle - Rotation angle in radians
   * @returns {Object} Quaternion object {x, y, z, w}
   */
  static fromAxisAngle(axisX = 0, axisY = 0, axisZ = 0, angle = 0) {
    const angle2 = angle / 2;
    const s = Math.sin(angle2);

    return {
      x: axisX * s,
      y: axisY * s,
      z: axisZ * s,
      w: Math.cos(angle2),
    };
  }

  /**
   * Create a quaternion from Euler angles
   * @param {number} x - X rotation in radians
   * @param {number} y - Y rotation in radians
   * @param {number} z - Z rotation in radians
   * @param {string} order - Rotation order (e.g., 'XYZ', 'ZYX')
   * @returns {Object} Quaternion object {x, y, z, w}
   */
  static fromEuler(x = 0, y = 0, z = 0, order = "XYZ") {
    const cos = Math.cos;
    const sin = Math.sin;

    // Calculate half angles
    const c1 = cos(x / 2);
    const c2 = cos(y / 2);
    const c3 = cos(z / 2);

    const s1 = sin(x / 2);
    const s2 = sin(y / 2);
    const s3 = sin(z / 2);

    const q = { x: 0, y: 0, z: 0, w: 1 };

    // Convert Euler angles to quaternion based on rotation order
    switch (order) {
      case "XYZ":
        q.x = s1 * c2 * c3 + c1 * s2 * s3;
        q.y = c1 * s2 * c3 - s1 * c2 * s3;
        q.z = c1 * c2 * s3 + s1 * s2 * c3;
        q.w = c1 * c2 * c3 - s1 * s2 * s3;
        break;

      case "YXZ":
        q.x = s1 * c2 * c3 + c1 * s2 * s3;
        q.y = c1 * s2 * c3 - s1 * c2 * s3;
        q.z = c1 * c2 * s3 - s1 * s2 * c3;
        q.w = c1 * c2 * c3 + s1 * s2 * s3;
        break;

      case "ZXY":
        q.x = s1 * c2 * c3 - c1 * s2 * s3;
        q.y = c1 * s2 * c3 + s1 * c2 * s3;
        q.z = c1 * c2 * s3 + s1 * s2 * c3;
        q.w = c1 * c2 * c3 - s1 * s2 * s3;
        break;

      case "ZYX":
        q.x = s1 * c2 * c3 - c1 * s2 * s3;
        q.y = c1 * s2 * c3 + s1 * c2 * s3;
        q.z = c1 * c2 * s3 - s1 * s2 * c3;
        q.w = c1 * c2 * c3 + s1 * s2 * s3;
        break;

      case "YZX":
        q.x = s1 * c2 * c3 + c1 * s2 * s3;
        q.y = c1 * s2 * c3 + s1 * c2 * s3;
        q.z = c1 * c2 * s3 - s1 * s2 * c3;
        q.w = c1 * c2 * c3 - s1 * s2 * s3;
        break;

      case "XZY":
        q.x = s1 * c2 * c3 - c1 * s2 * s3;
        q.y = c1 * s2 * c3 - s1 * c2 * s3;
        q.z = c1 * c2 * s3 + s1 * s2 * c3;
        q.w = c1 * c2 * c3 + s1 * s2 * s3;
        break;

      default:
        console.warn(
          "CreateFromEuler() encountered an unknown order: " + order
        );
    }

    return q;
  }

  /**
   * Multiply two quaternions
   * @param {Object} a - First quaternion
   * @param {Object} b - Second quaternion
   * @returns {Object} Resulting quaternion
   */
  static multiply(a, b) {
    const qax = a.x,
      qay = a.y,
      qaz = a.z,
      qaw = a.w;
    const qbx = b.x,
      qby = b.y,
      qbz = b.z,
      qbw = b.w;

    return {
      x: qax * qbw + qaw * qbx + qay * qbz - qaz * qby,
      y: qay * qbw + qaw * qby + qaz * qbx - qax * qbz,
      z: qaz * qbw + qaw * qbz + qax * qby - qay * qbx,
      w: qaw * qbw - qax * qbx - qay * qby - qaz * qbz,
    };
  }

  /**
   * Calculate dot product of two quaternions
   * @param {Object} a - First quaternion
   * @param {Object} b - Second quaternion
   * @returns {number} Dot product
   */
  static dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  }
}

/**
 * IMU (Inertial Measurement Unit) class for handling device orientation and motion
 * Provides access to device sensors and handles coordinate system transformations
 */
class IMU {
  /**
   * Initialize IMU and request necessary permissions
   * @returns {Promise} Resolves with IMU instance or rejects with error
   */
  static Initialize() {
    return new Promise((resolve, reject) => {
      const finalize = () => {
        // Check for secure context (HTTPS)
        if (window.isSecureContext === false) {
          reject(
            "DeviceOrientation is only available in secure contexts (https)."
          );
          return;
        }

        // Check for required APIs
        if (window.DeviceOrientationEvent === undefined) {
          reject("DeviceOrientation not supported.");
          return;
        }

        if (window.DeviceMotionEvent === undefined) {
          reject("DeviceMotion not supported.");
          return;
        }

        resolve(new IMU());
      };

      // Handle iOS permission request
      if (
        window.DeviceMotionEvent !== undefined &&
        typeof window.DeviceMotionEvent.requestPermission === "function"
      ) {
        window.DeviceMotionEvent.requestPermission().then(
          (state) => {
            if (state === "granted") {
              finalize();
            } else {
              reject("Permission denied by user.");
            }
          },
          (error) => {
            reject(error.toString());
          }
        );
      } else if (window.ondevicemotion !== undefined) {
        finalize();
      } else {
        reject("DeviceMotion is not supported.");
      }
    });
  }

  /**
   * Create new IMU instance
   * Sets up event listeners for device orientation and motion
   */
  constructor() {
    this.EPS = 0.000001; // Small epsilon for floating point comparisons

    this.screenOrientation = null;
    this.screenOrientationAngle = 0;

    this.motion = []; // Store motion data history

    // Initialize orientation quaternion
    this.orientation = { x: 1, y: 0, z: 0, w: 1 };

    // Set up world transform based on device type
    this.worldTransform = isIOS()
      ? Quaternion.fromAxisAngle(1, 0, 0, -Math.PI / 2) // iOS: -90 degrees on x-axis
      : Quaternion.fromAxisAngle(0, 1, 0, Math.PI / 2); // Android: 90 degrees on y-axis

    /**
     * Handle device orientation updates
     * Converts device orientation to quaternion
     */
    const handleDeviceOrientation = (event) => {
      // Convert device orientation angles to radians
      const x = event.beta * deg2rad; // X-axis (β) vertical tilt
      const y = event.gamma * deg2rad; // Y-axis (γ) horizontal tilt
      const z = event.alpha * deg2rad; // Z-axis (α) compass direction

      // Combine world transform with current orientation
      const orientation = Quaternion.multiply(
        this.worldTransform,
        Quaternion.fromEuler(x, y, z, "ZXY")
      );

      // Only update if change is significant
      if (8 * (1 - Quaternion.dot(this.orientation, orientation)) > this.EPS) {
        this.orientation = orientation;
      }
    };

    /**
     * Handle device motion updates
     * Stores motion data for analysis
     */
    const handleDeviceMotion = (event) => {
      // Convert rotation rates to radians per second
      const gx = event.rotationRate.beta * deg2rad; // X-axis (β)
      const gy = event.rotationRate.gamma * deg2rad; // Y-axis (γ)
      const gz = event.rotationRate.alpha * deg2rad; // Z-axis (α)

      // Get acceleration in m/s^2
      const ax = event.acceleration.x;
      const ay = event.acceleration.y;
      const az = event.acceleration.z;

      const timestamp = Date.now();

      // Store motion data
      this.motion.push({ timestamp, gx, gy, gz, ax, ay, az });
    };

    /**
     * Handle screen orientation changes
     * Updates screen orientation angle
     */
    const handleScreenOrientation = (event) => {
      this.screenOrientation = getScreenOrientation();

      // Update orientation angle based on screen orientation
      if (this.screenOrientation === "landscape_left") {
        this.screenOrientationAngle = 90;
      } else if (this.screenOrientation === "landscape_right") {
        this.screenOrientationAngle = 270;
      } else {
        this.screenOrientationAngle = 0;
      }
    };

    // Set up event listeners
    window.addEventListener(
      "devicemotion",
      handleDeviceMotion.bind(this),
      false
    );
    window.addEventListener(
      "deviceorientation",
      handleDeviceOrientation.bind(this),
      false
    );
    window.addEventListener(
      "orientationchange",
      handleScreenOrientation.bind(this),
      false
    );
  }

  /**
   * Clear stored motion data
   */
  clear() {
    this.motion.length = 0;
  }
}

export { IMU };
