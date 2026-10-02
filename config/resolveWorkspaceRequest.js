// Metro resolver for the shared workspace packages: their NodeNext ESM
// source imports siblings as './name.js' while the file on disk is
// './name.ts', so a relative '.js' import from inside packages/ is
// resolved without its suffix. Everything else resolves unchanged.
const path = require('node:path');

function createWorkspaceResolver(projectRoot) {
  const packagesPrefix = path.join(projectRoot, 'packages') + path.sep;
  return function resolveWorkspaceRequest(context, moduleName, platform) {
    const isRelativeJs = moduleName.startsWith('.') && moduleName.endsWith('.js') && moduleName.length > '.js'.length + 1;
    if (isRelativeJs && context.originModulePath.startsWith(packagesPrefix)) {
      return context.resolveRequest(context, moduleName.slice(0, -'.js'.length), platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = { createWorkspaceResolver };
