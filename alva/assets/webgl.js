/**
 * WebGL2 utility class for managing WebGL resources and operations
 * Provides methods for creating and managing shaders, programs, textures, and framebuffers
 */
class WebGL2 {
  /**
   * Create and compile a WebGL shader
   * @param {WebGL2RenderingContext} gl - WebGL context
   * @param {string} shaderSource - Source code for the shader
   * @param {number} shaderType - Type of shader (VERTEX_SHADER or FRAGMENT_SHADER)
   * @returns {WebGLShader} Compiled shader
   * @throws {Error} If shader compilation fails
   */
  static createShader(gl, shaderSource, shaderType) {
    const shader = gl.createShader(shaderType);

    gl.shaderSource(shader, shaderSource);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const errorLast = gl.getShaderInfoLog(shader);
      const errorInfo = shaderSource
        .split("\n")
        .map((l, i) => `${i + 1}: ${l}`)
        .join("\n");

      gl.deleteShader(shader);

      throw new Error(
        `Error compiling WebGL shaders: '${shader}': ${errorLast}\n ${errorInfo}`
      );
    }

    return shader;
  }

  /**
   * Create and link a WebGL program from vertex and fragment shaders
   * @param {WebGL2RenderingContext} gl - WebGL context
   * @param {string} vertShaderSource - Vertex shader source code
   * @param {string} fragShaderSource - Fragment shader source code
   * @returns {WebGLProgram} Linked program
   * @throws {Error} If program linking fails
   */
  static createProgram(gl, vertShaderSource, fragShaderSource) {
    const vertShader = WebGL2.createShader(
      gl,
      vertShaderSource,
      gl.VERTEX_SHADER
    );
    const fragShader = WebGL2.createShader(
      gl,
      fragShaderSource,
      gl.FRAGMENT_SHADER
    );

    const program = gl.createProgram();

    gl.attachShader(program, fragShader);
    gl.attachShader(program, vertShader);

    gl.linkProgram(program);
    gl.validateProgram(program); // for debugging

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      gl.deleteShader(fragShader);
      gl.deleteShader(vertShader);

      throw new Error(
        "Error linking WebGL program: " + gl.getProgramInfoLog(program)
      );
    }

    return program;
  }

  /**
   * Create a WebGL texture with specified parameters
   * @param {WebGL2RenderingContext} gl - WebGL context
   * @param {number} width - Texture width
   * @param {number} height - Texture height
   * @param {number} type - Texture type (e.g., UNSIGNED_BYTE, FLOAT)
   * @param {boolean} flipY - Whether to flip Y coordinates
   * @param {boolean} useNearest - Whether to use nearest neighbor filtering
   * @returns {WebGLTexture} Created texture
   */
  static createTexture(
    gl,
    width,
    height,
    type,
    flipY = false,
    useNearest = false
  ) {
    const texId = gl.createTexture();

    gl.bindTexture(gl.TEXTURE_2D, texId);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY);

    // Set texture parameters
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      useNearest ? gl.NEAREST : gl.LINEAR
    );
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MAG_FILTER,
      useNearest ? gl.NEAREST : gl.LINEAR
    );

    // Set texture format based on type
    const textureType = type || gl.UNSIGNED_BYTE;
    const internalFormat = textureType === gl.FLOAT ? gl.RGBA32F : gl.RGBA;

    // Allocate texture storage
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      internalFormat,
      width,
      height,
      0,
      gl.RGBA,
      type,
      null
    );

    return texId;
  }

  /**
   * Create a framebuffer with an attached texture
   * @param {WebGL2RenderingContext} gl - WebGL context
   * @param {number} width - Framebuffer width
   * @param {number} height - Framebuffer height
   * @param {number} textureType - Type of texture to attach
   * @param {boolean} textureFlipY - Whether to flip Y coordinates
   * @param {boolean} textureUseNearest - Whether to use nearest neighbor filtering
   * @returns {Object} Object containing texture and framebuffer
   * @throws {Error} If framebuffer creation fails
   */
  static createFrameBuffer(
    gl,
    width,
    height,
    textureType = undefined,
    textureFlipY = false,
    textureUseNearest = false
  ) {
    const tex = WebGL2.createTexture(
      gl,
      width,
      height,
      textureType,
      textureFlipY,
      textureUseNearest
    );
    const fbo = gl.createFramebuffer();

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      tex,
      0
    );

    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("Failed to bind FrameBuffer and attach texture.");
    }

    return {
      tex: tex,
      fbo: fbo,
    };
  }

  /**
   * Get WebGL context information and capabilities
   * @param {WebGL2RenderingContext} gl - WebGL context
   * @returns {Object} Object containing WebGL information
   */
  static getWebGLInfo(gl) {
    const info = {};

    // Get basic WebGL information
    info["WebGL renderer"] = gl.getParameter(gl.RENDERER);
    info["WebGL vendor"] = gl.getParameter(gl.VENDOR);
    info["WebGL version"] = gl.getParameter(gl.VERSION);
    info["Shading language version"] = gl.getParameter(
      gl.SHADING_LANGUAGE_VERSION
    );
    info["Unmasked renderer"] = "-";
    info["Unmasked vendor"] = "-";

    // Try to get additional debug information if available
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");

    if (debugInfo) {
      info["Unmasked renderer"] = gl.getParameter(
        debugInfo.UNMASKED_RENDERER_WEBGL
      );
      info["Unmasked vendor"] = gl.getParameter(
        debugInfo.UNMASKED_VENDOR_WEBGL
      );
    }

    return info;
  }

  /**
   * Load shader source code from a URL
   * @param {string} url - URL to load shader source from
   * @returns {Promise<string>} Shader source code
   */
  static async loadShaderSource(url) {
    const response = await fetch(url);
    return await response.text();
  }
}

export { WebGL2 };
