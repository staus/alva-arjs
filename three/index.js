/**
 * Main entry point for the AR application that combines AlvaAR and AR.js
 * This file demonstrates location-based AR using both AlvaAR for camera pose estimation
 * and AR.js for geographic positioning of 3D objects.
 */
import * as THREE from "three";
import { TrackerManager } from "./tracking/TrackerManager.js";
import { SceneManager } from "./scene/SceneManager.js";

class ARApplication {
  constructor() {
    this.container = document.getElementById("ar-container");
    this.video = document.getElementById("ar-video");
    this.canvas = document.getElementById("ar-canvas");
    this.trackerManager = null;
    this.sceneManager = null;
    this.isInitialized = false;
    this.debugInfo = document.getElementById("debug-info");
    this.lastDebugUpdate = 0;
  }

  /**
   * Initialize the AR application
   */
  async initialize() {
    if (this.isInitialized) return;
    console.log("Starting AR application initialization...");

    // Initialize scene manager
    console.log("Creating SceneManager...");
    this.sceneManager = new SceneManager(this.container, this.canvas);
    console.log("Initializing SceneManager...");
    this.sceneManager.initialize();

    // Initialize tracker manager
    console.log("Creating TrackerManager...");
    this.trackerManager = new TrackerManager(this.canvas, (pose) => {
      this.sceneManager.updateCameraPose(pose);
    });
    console.log("Initializing TrackerManager...");
    await this.trackerManager.initialize();

    // Setup video stream
    console.log("Setting up video stream...");
    await this.setupVideo();

    // Add some example objects to the scene
    //console.log("Adding example objects...");
    this.addExampleObjects();

    this.isInitialized = true;
    console.log("AR application initialization complete");
  }

  /**
   * Setup video stream
   */
  async setupVideo() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      this.video.srcObject = stream;
      this.video.play();
    } catch (error) {
      console.error("Error accessing camera:", error);
    }
  }

  /**
   * Add example objects to the scene
   */
  addExampleObjects() {
    // Add a cube that rotates around X axis
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.set(0, 0, 0);
    cube.scale.set(0.5, 0.5, 0.5);

    // Define cube update function
    const cubeUpdate = (cube, deltaTime) => {
      cube.rotation.x += deltaTime * 1;
      cube.rotation.y += deltaTime * 0.8;
    };

    this.sceneManager.addObject(cube, cubeUpdate);
  }

  /**
   * Start the AR application
   */
  start() {
    if (!this.isInitialized) {
      console.error("AR application not initialized");
      return;
    }
    console.log("Starting AR application...");
    this.sceneManager.start();
    this.trackerManager.start(this.video);
    console.log("AR application started");
  }

  /**
   * Stop the AR application
   */
  stop() {
    if (!this.isInitialized) return;

    this.sceneManager.stop();
    this.trackerManager.stop();
  }

  /**
   * Update tracking configuration
   * @param {Object} config - New configuration object
   */
  async updateConfig(config) {
    if (!this.isInitialized) return;
    await this.trackerManager.updateConfig(config);
  }

  /**
   * Update debug information display
   */
  updateDebugInfo() {
    if (!this.trackerManager) return;

    const stats = this.trackerManager.getPerformanceStats();
    const currentTime = performance.now();

    // Update debug info every 500ms
    if (currentTime - this.lastDebugUpdate > 500) {
      this.debugInfo.innerHTML = `
        FPS: ${Math.round(stats.fps)}<br>
        Frame Time: ${Math.round(stats.frameTime)}ms<br>
        Backlog: ${stats.processingBacklog}<br>
        Scale: ${Math.round(stats.scaleFactor * 100)}%
      `;
      this.lastDebugUpdate = currentTime;
    }
  }

  /**
   * Start debug update loop
   */
  startDebugLoop() {
    const updateDebug = () => {
      this.updateDebugInfo();
      requestAnimationFrame(updateDebug);
    };
    updateDebug();
  }
}

// Create and initialize the AR application
console.log("Creating AR application...");
const app = new ARApplication();
app
  .initialize()
  .then(() => {
    console.log("AR application initialized successfully");
    app.start();
    app.startDebugLoop();

    // Add button click handlers
    document
      .getElementById("toggle-alva")
      .addEventListener("click", async (e) => {
        const button = e.currentTarget;
        const isActive = button.classList.contains("active");

        button.classList.toggle("active", !isActive);
        button.classList.toggle("inactive", isActive);
        button
          .querySelector(".status-indicator")
          .classList.toggle("active", !isActive);

        const config = {
          pose: {
            alva: !isActive,
            gps: app.trackerManager.config.pose.gps,
            image: app.trackerManager.config.pose.image,
          },
        };
        await app.updateConfig(config);
      });

    document
      .getElementById("toggle-gps")
      .addEventListener("click", async (e) => {
        const button = e.currentTarget;
        const isActive = button.classList.contains("active");

        button.classList.toggle("active", !isActive);
        button.classList.toggle("inactive", isActive);
        button
          .querySelector(".status-indicator")
          .classList.toggle("active", !isActive);

        const config = {
          pose: {
            gps: !isActive,
            alva: app.trackerManager.config.pose.alva,
            image: app.trackerManager.config.pose.image,
          },
        };
        await app.updateConfig(config);
      });

    document
      .getElementById("toggle-image")
      .addEventListener("click", async (e) => {
        const button = e.currentTarget;
        const isActive = button.classList.contains("active");

        button.classList.toggle("active", !isActive);
        button.classList.toggle("inactive", isActive);
        button
          .querySelector(".status-indicator")
          .classList.toggle("active", !isActive);

        const config = {
          pose: {
            image: !isActive,
            alva: app.trackerManager.config.pose.alva,
            gps: app.trackerManager.config.pose.gps,
          },
        };
        await app.updateConfig(config);
      });

    document.getElementById("toggle-debug").addEventListener("click", (e) => {
      const button = e.currentTarget;
      const isActive = button.classList.contains("active");

      button.classList.toggle("active", !isActive);
      button.classList.toggle("inactive", isActive);
      button
        .querySelector(".status-indicator")
        .classList.toggle("active", !isActive);

      // Toggle debug mode
      app.trackerManager.updateConfig({ debug: !isActive });

      // Toggle debug info display
      app.debugInfo.style.display = !isActive ? "block" : "none";
    });
  })
  .catch((error) => {
    console.error("Error initializing AR application:", error);
  });
