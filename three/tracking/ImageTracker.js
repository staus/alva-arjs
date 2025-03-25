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
  constructor(onPoseUpdate) {
    this.onPoseUpdate = onPoseUpdate;
    this.isRunning = false;
    this.arToolkitSource = null;
    this.arToolkitContext = null;
    this.markerControls = null;
    this.video = null;
    this.tempCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    this.frameInterval = 30; // 30ms interval for frame processing
    this._isMarkerVisible = false;

    // Default marker configuration
    this.markerControlsConfig = {
      type: "nft",
      descriptorsUrl: "data/markers/test3/pinball",
      changeMatrixMode: "cameraTransformMatrix",
      smoothCount: 5,
      smoothTolerance: 0.01,
      smoothThreshold: 2,
      size: 0.06,
    };
  }

  async initialize() {
    try {
      // Initialize AR.js source
      this.arToolkitSource = new ArToolkitSource({
        sourceType: "webcam",
        sourceWidth: 480,
        sourceHeight: 640,
      });

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

      this.arToolkitContext.init(() => {
        // copy projection matrix to camera
        this.tempCamera.projectionMatrix.copy(
          this.arToolkitContext.getProjectionMatrix()
        );
      });

      // Add marker detection event listeners
      window.addEventListener("markerFound", (e) => {
        if (e.detail.object3d === this.tempCamera) {
          console.log("Marker tracked");
          this._isMarkerVisible = true;
        }
      });

      window.addEventListener("markerLost", (e) => {
        if (e.detail.object3d === this.tempCamera) {
          console.log("Marker lost");
          this._isMarkerVisible = false;
          this.onPoseUpdate(null);
        }
      });

      // Initialize source and context
      await new Promise((resolve) => {
        this.arToolkitSource.init(() => {
          setTimeout(resolve, 1000);
        });
      });

      await new Promise((resolve) => {
        this.arToolkitContext.init(resolve);
      });

      // Initialize marker controls
      this.markerControls = new ArMarkerControls(
        this.arToolkitContext,
        this.tempCamera,
        this.markerControlsConfig
      );

      // Log marker configuration status
      console.log("[ImageTracker] Marker configuration:", {
        type: this.markerControlsConfig.type,
        descriptorsUrl: this.markerControlsConfig.descriptorsUrl,
        markerControlsReady: !!this.markerControls,
        contextReady: !!this.arToolkitContext.arController,
      });

      // Verify NFT marker files are accessible
      if (
        this.markerControlsConfig.type === "nft" &&
        this.markerControlsConfig.descriptorsUrl
      ) {
        const baseUrl = this.markerControlsConfig.descriptorsUrl;
        const filesToCheck = [".fset", ".fset3", ".iset"].map(
          (ext) => baseUrl + ext
        );

        console.log("[ImageTracker] Checking NFT marker files:", filesToCheck);

        try {
          await Promise.all(
            filesToCheck.map(async (url) => {
              const response = await fetch(url, { method: "HEAD" });
              if (!response.ok) throw new Error(`Failed to load ${url}`);
              console.log(
                `[ImageTracker] Successfully verified marker file: ${url}`
              );
            })
          );
        } catch (error) {
          console.error("[ImageTracker] Failed to verify marker files:", error);
        }
      }
    } catch (error) {
      console.error("[ImageTracker] Initialization failed:", error);
      this.dispose();
      throw error;
    }
  }

  async start(video) {
    if (this.isRunning) return;

    this.video = video;
    console.log("[ImageTracker] Starting with video:", {
      videoReady: video.readyState,
      width: video.videoWidth,
      height: video.videoHeight,
      playing: !video.paused,
    });

    this.isRunning = true;
    this.processFrame();
  }

  stop() {
    this.isRunning = false;
  }

  async processFrame() {
    if (!this.isRunning || !this.video || !this.arToolkitContext) return;

    try {
      this.arToolkitContext.update(this.video);

      // Update pose if marker is visible
      if (this._isMarkerVisible && this.tempCamera) {
        const matrix = this.tempCamera.matrix;
        const position = new THREE.Vector3();
        const rotation = new THREE.Euler();
        const scale = new THREE.Vector3();

        matrix.decompose(
          position,
          new THREE.Quaternion().setFromEuler(rotation),
          scale
        );

        this.onPoseUpdate({
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
        });
      }

      setTimeout(() => this.processFrame(), this.frameInterval);
    } catch (error) {
      console.error("[ImageTracker] Error processing frame:", error);
      setTimeout(() => this.processFrame(), this.frameInterval);
    }
  }

  updateConfig(config) {
    this.markerControlsConfig = { ...this.markerControlsConfig, ...config };
    if (this.markerControls) {
      Object.assign(this.markerControls.parameters, this.markerControlsConfig);
      console.log("[ImageTracker] Updated marker configuration:", {
        type: this.markerControlsConfig.type,
        descriptorsUrl: this.markerControlsConfig.descriptorsUrl,
      });
    }
  }

  setMarker(markerPath) {
    this.updateConfig({ descriptorsUrl: markerPath });
  }

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
  }
}
