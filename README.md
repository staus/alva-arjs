# AlvaAR and AR.js Experiments

## Introduction

The aim of this project is to explore [AlvaAR](https://github.com/alanross/AlvaAR) and integrate with location-based [AR.js](https://github.com/AR-js-org/AR.js), with an eventual aim to place geographic AR content realistically on the ground.

So far, just a proof-of-concept using what I believe is the minimal code for using AlvaAR, and integration with the AR.js location-based API. Nothing particularly exciting for now.

It's mostly about understanding what Alva can do.

### Update 2024-09-10

With the aim of better understanding the coordinate system that Alva gives, the `alva-basic` A-Frame component now displays icosahedra along the x and z axes without any AR.js or location-based input.

## Instructions

This now includes a **modified** version of code from the AlvaAR examples, specifically the contents of the `assets` directory which contains library-style code. 

Everything in the `alva` directory is taken from AlvaAR.

I have however removed the large `image.gif` and `video.mp4` files as these are not needed.


## Versions

This repository is currently very experimental and subject to change; I have experiments with both three.js and A-Frame. Currently, my aim is to try and re-use as much of the AlvaAR example code as possible.

### Build

Install with

`npm i`

Build with

`npm run build`

Then run a webserver in the `public` directory and request the index page you want (`three.html` or `aframe.html`) in your browser.

## Code breakdown of the Three.js implementation

The Three.js implementation combines AlvaAR for camera pose estimation with AR.js for location-based AR. Here's a technical breakdown of the key components:

### Core Components

1. **Camera and Video Setup**
   - Uses device back camera with 16:9 aspect ratio
   - Target resolution of 1280px width
   - Video feed is drawn to a canvas element for processing

2. **AR Components**
   - `AlvaAR`: Handles camera pose estimation from video frames
   - `ARCamView`: Manages Three.js scene and camera for AR rendering
   - `THREEx.LocationBased`: Handles GPS-based object positioning

3. **Coordinate Systems**
   - Camera coordinates from AlvaAR are transformed to Three.js world space
   - GPS coordinates are converted to world coordinates using AR.js utilities
   - Objects are positioned relative to initial GPS position

4. **Main Processing Loop**
   - Runs at 30 FPS
   - Processes video frames for camera pose estimation
   - Updates AR scene with current camera pose
   - Handles tracking loss with feature point visualization

### Technical Implementation

1. **Initialization Flow**
   ```javascript
   Camera.Initialize() -> initAlva() -> initArjs() -> setupFrameHandler()
   ```

2. **Object Placement**
   - Objects are placed on first GPS update
   - Uses relative GPS offsets from initial position
   - Supports vertical offset for height-based placement

3. **Tracking System**
   - Visual tracking via AlvaAR
   - GPS-based positioning via AR.js
   - Coordinate system transformations between tracking systems

4. **Performance Considerations**
   - Canvas context created with performance optimizations
   - Frame processing rate limited to 30 FPS
   - Feature point visualization for debugging

### Dependencies
- Three.js for 3D rendering
- AlvaAR for camera pose estimation
- AR.js for location-based AR
- Device camera and GPS capabilities

### Limitations
- Requires HTTPS for device sensor access
- Depends on device GPS accuracy
- Visual tracking may be affected by lighting conditions
- Object placement accuracy depends on GPS precision
