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
 *
 * expo-doctor flags this `watchFolders` entry (it warns when a project watches a
 * folder outside the project root). That warning is EXPECTED and intentional: the
 * monorepo genuinely needs `shared/` watched, so it is the one doctor warning we
 * accept and do not "fix".
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
/**
 * THE SERVER ROOT IS THIS PACKAGE, not the workspace.
 *
 * Metro takes its root to be the lowest common ancestor of `projectRoot` and every
 * `watchFolders` entry. Watching the workspace root above therefore drags the root
 * up with it, and every relative path is then computed from the wrong base: the
 * release bundle failed with `Unable to resolve module ./index.js from
 * D:\Haalving_Health_App_main/.`, looking for `..\index.js` — one level above the
 * repo, which cannot exist.
 *
 * Pinning it back to this package fixes the entry point without giving up the
 * watch: `watchFolders` still covers `shared/`, so the monorepo package is seen and
 * rebuilt, while paths resolve against the app that is actually being bundled.
 */
/*
 * ...EXCEPT ON WEB, where the pnpm store sits ABOVE this package.
 *
 * pnpm hoists every real package into `<workspace>/node_modules/.pnpm`, and Expo
 * web's generated HTML points its entry `<script>` straight at that store
 * (`/node_modules/.pnpm/expo-router@…/…/entry.bundle`). With the server root pinned
 * to this package, that path resolves relative to `mobile/.` — one level below the
 * store — and every web bundle 404s with "None of these files exist", so the page
 * renders blank. The pixel harness (web only) sets `PIXEL_SERVER_ROOT=workspace` to
 * lift the root back to the workspace so the store is inside it; native builds leave
 * it unset and keep the project root the release bundle needs.
 */
const serverRoot = process.env.PIXEL_SERVER_ROOT === 'workspace' ? workspaceRoot : projectRoot;
config.server = { ...config.server, unstable_serverRoot: serverRoot };

config.resolver.sourceExts = [...config.resolver.sourceExts, 'mjs', 'cjs'];

/**
 * ONE React in the bundle, and it is THIS package's 18.3.
 *
 * The monorepo root pins React 19 for the web console; under pnpm's hoisted store
 * that copy can leak into this bundle, and a second React means a null dispatcher
 * — the app crashes on its first render with
 * `TypeError: Cannot read property 'useContext' of null` (the same duplicate-React
 * bug the web build hit, here at renderApplication). react-native itself is on
 * 18.3, so every `react`/`react-dom` specifier is pinned to `mobile/node_modules`
 * and the root's 19 never enters. `react-native*` is deliberately NOT matched.
 */
const REACT_ONLY_PATHS = [path.resolve(projectRoot, 'node_modules')];
const originalResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (/^react(-dom)?(\/|$)/.test(moduleName)) {
    return context.resolveRequest({ ...context, nodeModulesPaths: REACT_ONLY_PATHS }, moduleName, platform);
  }
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
