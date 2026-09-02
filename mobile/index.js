/**
 * THE APP'S ENTRY POINT.
 *
 * `"main": "expo-router/entry"` is what Expo Router ships with, and it works fine
 * in a single-package app. In THIS pnpm monorepo it does not: the native release
 * build resolves that specifier from the workspace root and produces a path into
 * `node_modules/.pnpm/expo-router@…/node_modules/expo-router/entry.js` that climbs
 * one level too far — `..\..\node_modules\…` from the drive root, which cannot
 * exist. The bundler then fails with "Unable to resolve module".
 *
 * A concrete file inside this package sidesteps it: Metro resolves `index.js`
 * relative to the project it is actually bundling, and the bare specifier below is
 * resolved by Node's own algorithm from `mobile/`, where expo-router really is.
 * This is Expo's documented monorepo entry point.
 */
import 'expo-router/entry';
