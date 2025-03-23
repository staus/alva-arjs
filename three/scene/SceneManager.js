/**
 * SceneManager - Manages Three.js scene, camera, and rendering
 * Handles scene setup, camera updates, and render loop
 */
import * as THREE from "three";

export class SceneManager {
  constructor(container) {
    this.container = container;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.isRunning = false;
    this.lastFrameTime = 0;
    this.frameTimes = [];
    this.currentFPS = 60;
    this.frameCount = 0;
    this.lastFPSUpdate = 0;
    this.spinningCube = null;
  }

  /**
   * Initialize the scene
   */
  initialize() {
    // Create scene
    this.scene = new THREE.Scene();

    // Create camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      1000
    );
    this.camera.position.z = 5;

    // Create renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(
      this.container.clientWidth,
      this.container.clientHeight
    );
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);

    // Create spinning cube
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshPhongMaterial({
      color: 0x00ff00,
      shininess: 100,
    });
    this.spinningCube = new THREE.Mesh(geometry, material);
    this.spinningCube.position.set(0, 0, -5);
    this.scene.add(this.spinningCube);

    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0x404040);
    this.scene.add(ambientLight);

    // Add directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 1, 1);
    this.scene.add(directionalLight);

    // Handle window resize
    window.addEventListener("resize", this.handleResize.bind(this));
  }

  /**
   * Start rendering
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastFrameTime = 0;
    this.frameTimes = [];
    this.frameCount = 0;
    this.lastFPSUpdate = 0;
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

    // Update camera orientation
    if (pose.orientation) {
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
    if (this.spinningCube) {
      // Rotate the cube
      this.spinningCube.rotation.x += deltaTime * 0.5;
      this.spinningCube.rotation.y += deltaTime * 0.7;
      this.spinningCube.rotation.z += deltaTime * 0.3;
    }
  }

  /**
   * Render a single frame
   * @param {number} timestamp - Current timestamp
   */
  render(timestamp) {
    if (!this.isRunning) return;

    // Skip frame if too soon since last frame
    if (timestamp - this.lastFrameTime < 33.33) {
      // 30 FPS threshold
      requestAnimationFrame(this.render.bind(this));
      return;
    }

    const deltaTime = (timestamp - this.lastFrameTime) / 1000; // Convert to seconds
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
   * Add an object to the scene
   * @param {THREE.Object3D} object - Three.js object to add
   */
  addObject(object) {
    this.scene.add(object);
  }

  /**
   * Remove an object from the scene
   * @param {THREE.Object3D} object - Three.js object to remove
   */
  removeObject(object) {
    this.scene.remove(object);
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
