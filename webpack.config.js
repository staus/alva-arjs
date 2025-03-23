const path = require("path");
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
  mode: "development",
  entry: {
    three: path.resolve(__dirname, "three/index.js"),
  },
  output: {
    path: path.resolve(__dirname, "public"),
    filename: "index.js",
  },
  optimization: {
    minimize: false,
  },
  plugins: [
    new NodePolyfillPlugin(),
    new CopyPlugin({
      patterns: [
        {
          from: "three/index.html",
          to: "index.html",
        },
      ],
    }),
  ],
};
