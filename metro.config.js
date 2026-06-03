const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.watchFolders = [__dirname];

config.resolver.blockList = [
  /\.cache\/.*/,
  /node_modules\/react-native\/ReactAndroid\/.*/,
  /\.local\/skills\/.*/,
  /\.local\/secondary_skills\/.*/,
  /\.local\/.*/,
];

config.resolver.assetExts = [...config.resolver.assetExts, "tflite", "mp4"];
config.resolver.sourceExts = [...config.resolver.sourceExts, "mjs", "cjs"];

// TensorFlow.js packages point "main" at Node builds (*.node.js). Use browser ESM for web.
const TFJS_BROWSER_ENTRIES = {
  "@tensorflow/tfjs": "dist/index.js",
  "@tensorflow/tfjs-core": "dist/index.js",
  "@tensorflow/tfjs-converter": "dist/index.js",
  "@tensorflow/tfjs-backend-wasm": "dist/index.js",
  "@tensorflow/tfjs-backend-webgl": "dist/index.js",
  "@tensorflow/tfjs-backend-cpu": "dist/index.js",
};

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const browserEntry = TFJS_BROWSER_ENTRIES[moduleName];
  if (browserEntry) {
    return {
      filePath: path.join(
        path.dirname(require.resolve(`${moduleName}/package.json`)),
        browserEntry,
      ),
      type: "sourceFile",
    };
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
