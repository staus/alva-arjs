/**
 * Main entry point for the AR application that combines AlvaAR and AR.js
 * This file demonstrates location-based AR using both AlvaAR for camera pose estimation
 * and AR.js for geographic positioning of 3D objects.
 */

//import * as THREE from 'https://threejsfundamentals.org/threejs/resources/threejs/r132/build/three.module.js';
import { AlvaAR } from "../alva/assets/alva_ar.js";
import { ARCamView } from "../alva/assets/view.js";
import { Camera, onFrame, resize2cover } from "../alva/assets/utils.js";
import * as THREE from "three";
import * as THREEx from "@ar-js-org/ar.js/three.js/build/ar-threex-location-only.js";
import { TrackerManager } from "./tracking/TrackerManager.js";
import { SceneManager } from "./scene/SceneManager.js";

// Performance monitoring constants
const TARGET_FPS = 60;
const MIN_FPS = 30;
const FRAME_TIME_THRESHOLD = 1000 / MIN_FPS;
const PERFORMANCE_SAMPLES = 10;

class ARApplication {
  constructor() {
    this.container = document.getElementById("ar-container");
    this.video = document.getElementById("ar-video");
    this.canvas = document.getElementById("ar-canvas");
    this.trackerManager = null;
    this.sceneManager = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the AR application
   */
  async initialize() {
    if (this.isInitialized) return;

    // Initialize scene manager
    this.sceneManager = new SceneManager(this.container);
    this.sceneManager.initialize();

    // Initialize tracker manager
    this.trackerManager = new TrackerManager(this.canvas, (pose) => {
      this.sceneManager.updateCameraPose(pose);
    });
    await this.trackerManager.initialize();

    // Setup video stream
    await this.setupVideo();

    // Add some example objects to the scene
    this.addExampleObjects();

    this.isInitialized = true;
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
    // Add a cube
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.set(0, 0, -5);
    this.sceneManager.addObject(cube);

    // Add a sphere
    const sphereGeometry = new THREE.SphereGeometry(1, 32, 32);
    const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.set(2, 0, -5);
    this.sceneManager.addObject(sphere);
  }

  /**
   * Start the AR application
   */
  start() {
    if (!this.isInitialized) {
      console.error("AR application not initialized");
      return;
    }

    this.sceneManager.start();
    this.trackerManager.start(this.video);
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
  updateConfig(config) {
    if (!this.isInitialized) return;
    this.trackerManager.updateConfig(config);
  }
}

// Create and initialize the AR application
const app = new ARApplication();
app
  .initialize()
  .then(() => {
    console.log("AR application initialized");
    app.start();
  })
  .catch((error) => {
    console.error("Error initializing AR application:", error);
  });
