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

config.resolver.assetExts = [...config.resolver.assetExts, 'tflite', 'mp4'];

module.exports = config;
