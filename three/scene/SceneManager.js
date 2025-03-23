/**
 * SceneManager - Manages Three.js scene, camera, and rendering
 * Handles scene setup, camera updates, and render loop
 */
import * as THREE from "three";

export class SceneManager {
  constructor(container, canvas) {
    this.container = container;
    this.canvas = canvas;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.isRunning = false;
    this.lastFrameTime = 0;
    this.frameTimes = [];
    this.currentFPS = 60;
    this.frameCount = 0;
    this.lastFPSUpdate = 0;
    this.objectUpdates = new Map(); // Store update functions for each object
  }

  /**
   * Initialize the scene
   */
  initialize() {
    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = null; // Make scene background transparent

    // Create camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      1000
    );
    this.camera.position.z = 5;

    // Create renderer using existing canvas
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: true, // Enable transparency
    });
    this.renderer.setSize(
      this.container.clientWidth,
      this.container.clientHeight
    );
    this.renderer.setPixelRatio(window.devicePixelRatio);

    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0x404040, 1); // Increased intensity
    this.scene.add(ambientLight);

    // Add directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2); // Increased intensity
    directionalLight.position.set(1, 1, 1);
    this.scene.add(directionalLight);

    // Handle window resize
    window.addEventListener("resize", this.handleResize.bind(this));

    // Debug: Log scene contents
    console.log("Scene contents:", this.scene.children);
    console.log("Camera position:", this.camera.position);
  }

  /**
   * Start rendering
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.frameTimes = [];
    this.frameCount = 0;
    this.lastFPSUpdate = 0;

    // Initialize lastFrameTime with the current timestamp
    this.lastFrameTime = performance.now();

    this.render();
  }

  /**
   * Stop rendering
   */
  stop() {
    this.isRunning = false;
  }

  /**
   * Handle window resize
   */
  handleResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
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
            `Scene Performance warning: Current FPS ${this.currentFPS}`
          );
        }
      }
    }
  }

  /**
   * Update camera pose
   * @param {Object} pose - Camera pose data
   */
  updateCameraPose(pose) {
    if (!pose) return;

    // Update camera position
    if (pose.position) {
      this.camera.position.set(
        pose.position.x,
        pose.position.y,
        pose.position.z
      );
    }

    // Update camera orientation using quaternion if available
    if (pose.quaternion) {
      this.camera.quaternion.set(
        pose.quaternion.x,
        pose.quaternion.y,
        pose.quaternion.z,
        pose.quaternion.w
      );
    } else if (pose.orientation) {
      // Fallback to Euler angles if quaternion is not available
      this.camera.rotation.set(
        pose.orientation.x,
        pose.orientation.y,
        pose.orientation.z
      );
    }
  }

  /**
   * Update scene objects
   * @param {number} deltaTime - Time since last frame in seconds
   */
  updateScene(deltaTime) {
    // Update all registered objects
    this.objectUpdates.forEach((updateFunction, object) => {
      updateFunction(object, deltaTime);
    });
  }

  /**
   * Render a single frame
   * @param {number} timestamp - Current timestamp
   */
  render(timestamp) {
    if (!this.isRunning) return;

    const deltaTime = (timestamp - this.lastFrameTime) / 1000; // Convert to seconds

    // Skip frame if deltaTime is invalid
    if (isNaN(deltaTime) || deltaTime <= 0) {
      this.lastFrameTime = timestamp;
      requestAnimationFrame(this.render.bind(this));
      return;
    }

    this.lastFrameTime = timestamp;
    const frameStartTime = performance.now();

    // Update scene objects
    this.updateScene(deltaTime);

    // Render scene
    this.renderer.render(this.scene, this.camera);

    // Record frame processing time
    const frameTime = performance.now() - frameStartTime;
    this.frameTimes.push(frameTime);
    if (this.frameTimes.length > 10) {
      this.frameTimes.shift();
    }

    // Update FPS counter
    this.updateFPS(timestamp);

    // Continue rendering frames
    requestAnimationFrame(this.render.bind(this));
  }

  /**
   * Add an object to the scene with an optional update function
   * @param {THREE.Object3D} object - Three.js object to add
   * @param {Function} updateFunction - Optional function to update the object each frame
   */
  addObject(object, updateFunction = null) {
    this.scene.add(object);
    if (updateFunction) {
      this.objectUpdates.set(object, updateFunction);
    }
  }

  /**
   * Remove an object from the scene
   * @param {THREE.Object3D} object - Three.js object to remove
   */
  removeObject(object) {
    this.scene.remove(object);
    this.objectUpdates.delete(object); // Remove update function if it exists
  }

  /**
   * Get the scene
   * @returns {THREE.Scene}
   */
  getScene() {
    return this.scene;
  }

  /**
   * Get the camera
   * @returns {THREE.Camera}
   */
  getCamera() {
    return this.camera;
  }

  /**
   * Get the renderer
   * @returns {THREE.WebGLRenderer}
   */
  getRenderer() {
    return this.renderer;
  }
}
