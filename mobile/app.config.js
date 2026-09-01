/**
 * Dynamic Expo config — extends app.json, changes ONE thing.
 *
 * Android blocks plain-http ("cleartext") traffic by default on API 28+. The
 * `local` EAS profile talks to the dev API over http on the LAN
 * (http://192.168.1.24:4001), so that build — and ONLY that build — needs
 * cleartext allowed. eas.json sets `HV_CLEARTEXT=1` on the `local` profile; every
 * other profile (preview/production, which use https) leaves it unset, so this
 * resolves to false there.
 *
 * This lives in app.config.js rather than app.json because a per-profile toggle
 * needs to read an env var at build time, which static JSON cannot do. Everything
 * else — package, dark mode, icon, splash, plugins — stays in app.json, which
 * arrives here as `config`.
 */
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    usesCleartextTraffic: process.env.HV_CLEARTEXT === '1',
  },
});
