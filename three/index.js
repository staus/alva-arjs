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

function main() {
  console.log("main()");

  // Configure video constraints for the camera
  const config = {
    video: {
      facingMode: "environment", // Use back camera
      aspectRatio: 16 / 9,
      width: { ideal: 1280 },
    },
    audio: false,
  };

  // Set up DOM elements
  const container = document.getElementById("container");
  const view = document.createElement("div");
  const canvas = document.createElement("canvas");
  const overlay = document.getElementById("overlay");

  // Initial GPS coordinates (example location)
  const origLon = -0.72,
    origLat = 51.05;

  // Global variables for AR components
  let alva, arjs, arCamView, ctx, video;
  let gotFirstGps = false;

  // Initialize camera and set up video stream
  Camera.Initialize(config)
    .then(async (media) => {
      video = media.el;
      // Resize video to cover container while maintaining aspect ratio
      const size = resize2cover(
        video.videoWidth,
        video.videoHeight,
        container.clientWidth,
        container.clientHeight
      );

      // Set up canvas dimensions
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      video.style.width = size.width + "px";
      video.style.height = size.height + "px";

      // Initialize canvas context with performance optimizations
      ctx = canvas.getContext("2d", {
        alpha: false,
        desynchronized: true,
      });

      // Add canvas and view to container
      container.appendChild(canvas);
      container.appendChild(view);

      // Initialize AR components in sequence
      initAlva().then(initArjs);
    })
    .catch((error) => alert(error));

  // Start button handler to begin frame processing
  document.getElementById("start").addEventListener("click", (e) => {
    setupFrameHandler();
  });

  /**
   * Initialize AlvaAR for camera pose estimation
   */
  async function initAlva() {
    alva = await AlvaAR.Initialize(canvas.width, canvas.height);
    arCamView = new ARCamView(view, canvas.width, canvas.height);
  }

  /**
   * Initialize AR.js for location-based AR
   * Sets up test objects at different GPS coordinates
   */
  function initArjs() {
    // Initialize AR.js with the scene and camera
    arjs = new THREEx.LocationBased(arCamView.scene, arCamView.camera, {
      initialPositionAsOrigin: true,
    });

    // Create test geometry (a box)
    const geom = new THREE.BoxGeometry(20, 20, 20);

    // Define test objects with different materials and positions
    const props = [
      {
        mtl: new THREE.MeshBasicMaterial({ color: 0xff0000 }),
        lonDis: -0.001, // Slightly west
        latDis: 0,
        yDis: 0,
      },
      {
        mtl: new THREE.MeshBasicMaterial({ color: 0xffff00 }),
        lonDis: 0.001, // Slightly east
        latDis: 0,
        yDis: 0,
      },
      {
        mtl: new THREE.MeshBasicMaterial({ color: 0x0000ff }),
        lonDis: 0,
        latDis: -0.001, // Slightly south
        yDis: 0,
      },
      {
        mtl: new THREE.MeshBasicMaterial({ color: 0x00ff00 }),
        lonDis: 0,
        latDis: 0.001, // Slightly north
        yDis: 0,
      },
      {
        mtl: new THREE.MeshBasicMaterial({ color: 0xffff80 }),
        lonDis: 0,
        latDis: 0,
        yDis: 100, // High up
      },
      {
        mtl: new THREE.MeshBasicMaterial({ color: 0xff80ff }),
        lonDis: 0,
        latDis: 0,
        yDis: -100, // Below ground
      },
    ];

    // Handle GPS updates
    arjs.on("gpsupdate", (pos) => {
      alert(`Got GPS position: ${pos.coords.longitude} ${pos.coords.latitude}`);
      console.log(`camera position now:`);
      console.log(arCamView.camera.position);

      // Place test objects on first GPS update
      if (!gotFirstGps) {
        for (let i = 0; i < props.length; i++) {
          const object = new THREE.Mesh(geom, props[i].mtl);
          object.visible = false;
          // Convert GPS coordinates to world coordinates
          const pos = arjs.lonLatToWorldCoords(
            origLon + props[i].lonDis,
            origLat + props[i].latDis
          );
          console.log(pos);
          arCamView.addObject(
            object,
            pos[0],
            arCamView.camera.position.y + props[i].yDis,
            pos[1]
          );
        }
        gotFirstGps = true;
      }
    });

    // For testing: Use fake GPS coordinates instead of real GPS
    arjs.fakeGps(-0.72, 51.05);
  }

  /**
   * Set up the main frame processing loop
   * Handles camera pose estimation and AR object rendering
   */
  function setupFrameHandler() {
    if (gotFirstGps) {
      onFrame(() => {
        // Clear and draw video frame
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

        // Get frame data for pose estimation
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pose = alva.findCameraPose(frame);

        if (pose) {
          // Update camera pose if found
          arCamView.updateCameraPose(pose);
        } else {
          // Handle lost camera tracking
          arCamView.lostCamera();
          // Draw feature points for debugging
          const dots = alva.getFramePoints();
          for (const p of dots) {
            ctx.fillStyle = "white";
            ctx.fillRect(p.x, p.y, 2, 2);
          }
        }
        return true;
      }, 30); // 30 FPS
    } else {
      alert("Cannot start frame processing as no GPS location yet");
    }
  }
}

main();
