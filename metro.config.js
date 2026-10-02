// Metro with NativeWind's CSS pipeline, plus the workspace resolver that
// maps the shared packages' '.js' sibling imports to their TypeScript source.
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const { createWorkspaceResolver } = require('./config/resolveWorkspaceRequest');

const config = getDefaultConfig(__dirname);
config.resolver.resolveRequest = createWorkspaceResolver(__dirname);

module.exports = withNativeWind(config, { input: './global.css' });
