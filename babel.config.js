// Babel for Expo with NativeWind's JSX transform.
module.exports = function configureBabel(api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
