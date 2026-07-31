module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
    // react-native-worklets/plugin must stay last — Reanimated 4 worklets are
    // compiled by it and it has to see the final AST.
    plugins: ['react-native-worklets/plugin'],
  };
};
