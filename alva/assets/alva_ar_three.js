/**
 * AlvaARConnectorTHREE - Connector class for integrating AlvaAR with Three.js
 *
 * This class provides functionality to convert AlvaAR camera poses into Three.js
 * camera transformations. It handles the conversion between AlvaAR's coordinate
 * system and Three.js's coordinate system.
 *
 * Example usage:
 *      import * as THREE from 'https://threejsfundamentals.org/threejs/resources/threejs/r132/build/three.module.js';
 *      import { AlvaAR } from 'alva_ar.js';
 *      import { AlvaARConnectorTHREE } from 'alva_ar_three.js';
 *
 *      const alva = await AlvaAR.Initialize( ... );
 *      const applyPose = AlvaARConnectorTHREE.Initialize( THREE )
 *      const renderer = new THREE.WebGLRenderer( ... );
 *      const camera = new THREE.PerspectiveCamera( ... );
 *      const scene = new THREE.Scene();
 *      ...
 *
 *      function loop()
 *      {
 *          const imageData = ctx.getImageData( ... );
 *          const pose = alva.findCameraPose( imageData );
 *
 *          if( pose ) applyPose( pose, camera.quaternion, camera.position );
 *
 *          renderer.render( this.scene, this.camera );
 *      }
 */

class AlvaARConnectorTHREE {
  /**
   * Initialize the connector and return a function to apply poses
   * @param {THREE} THREE - The Three.js library instance
   * @returns {Function} A function that converts AlvaAR poses to Three.js camera transformations
   */
  static Initialize(THREE) {
    return (pose, rotationQuaternion, translationVector) => {
      // Convert pose matrix to Three.js Matrix4
      const m = new THREE.Matrix4().fromArray(pose);

      // Extract rotation quaternion from matrix
      const r = new THREE.Quaternion().setFromRotationMatrix(m);

      // Extract translation vector from matrix
      const t = new THREE.Vector3(pose[12], pose[13], pose[14]);

      // Apply rotation if quaternion provided
      // Note: Invert x and negate y,z to match coordinate systems
      rotationQuaternion !== null &&
        rotationQuaternion.set(-r.x, r.y, r.z, r.w);

      // Apply translation if vector provided
      // Note: Invert y and z to match coordinate systems
      translationVector !== null && translationVector.set(t.x, -t.y, -t.z);
    };
  }
}

export { AlvaARConnectorTHREE };
