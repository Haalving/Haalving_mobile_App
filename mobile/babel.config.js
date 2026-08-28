module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      /*
       * `reanimated: false` turns OFF the preset's automatic plugin injection.
       *
       * babel-preset-expo does `require('react-native-reanimated/plugin')` from
       * its OWN directory in the pnpm store, where the version it finds is not
       * the one this app depends on — and a newer Reanimated's plugin delegates
       * to `react-native-worklets/plugin`, a package nothing here installs. The
       * result is "Cannot find module 'react-native-worklets/plugin'" for a
       * project whose Reanimated (3.16.7) has no such dependency.
       *
       * Resolving it ourselves below, from THIS file's directory, pins it to the
       * version mobile/package.json actually declares.
       */
      ['babel-preset-expo', { jsxImportSource: 'nativewind', reanimated: false }],
      'nativewind/babel',
    ],
    plugins: [
      /* must be LAST — it rewrites worklets, and any plugin after it sees code
         it does not expect */
      require.resolve('react-native-reanimated/plugin'),
    ],
  };
};
