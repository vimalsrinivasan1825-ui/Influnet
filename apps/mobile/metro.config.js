// Monorepo-aware Metro config.
//
// The default config only watches the app folder, so imports from
// packages/{core,api,types,tokens} would resolve to nothing. Two changes fix
// that: watch the repo root so edits in packages/ trigger a reload, and let
// Metro resolve modules from both the app's and the root's node_modules
// (npm workspaces hoists most deps to the root).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Without this, a package hoisted to the root and a copy nested in the app can
// both load — React and Reanimated in particular break badly when duplicated.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
