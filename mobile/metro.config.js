const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

/**
 * Metro has to be told about the monorepo, twice.
 *
 * `watchFolders` lets it SEE @haalving/shared, which lives outside this
 * package; `nodeModulesPaths` lets it RESOLVE from the workspace root, where
 * pnpm hoists. Without both, the app builds against a package it cannot find
 * and fails at runtime rather than at build time.
 */
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

/**
 * The shared package writes ESM-correct specifiers (`./rbac.js`) so it also runs
 * under plain Node. Metro does not rewrite those to `.ts` on its own, so it is
 * told the same mapping webpack is given in web/next.config.ts — one package,
 * one convention, two bundlers taught the same thing.
 */
config.resolver.sourceExts = [...config.resolver.sourceExts, 'mjs', 'cjs'];
const originalResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    try {
      return context.resolveRequest(context, moduleName.replace(/\.js$/, ''), platform);
    } catch {
      /* a genuine .js file — fall through to the normal resolver */
    }
  }
  return (originalResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './src/theme/global.css' });
