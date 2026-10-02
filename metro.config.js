// Metro with NativeWind's CSS pipeline. The shared workspace packages are
// NodeNext ESM source, whose relative imports carry a .js suffix that
// points at a .ts file; Metro resolves those to the TypeScript source.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);
const packagesDir = path.join(__dirname, 'packages');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const isRelativeJs = moduleName.startsWith('.') && moduleName.endsWith('.js');
  if (isRelativeJs && context.originModulePath.startsWith(packagesDir)) {
    return context.resolveRequest(context, moduleName.slice(0, -'.js'.length), platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
