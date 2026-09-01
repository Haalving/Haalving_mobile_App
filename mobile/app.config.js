/**
 * Dynamic Expo config — extends app.json, adds the Android build properties.
 *
 * TWO things live here because they must vary or target the native build:
 *
 *  1. Kotlin 1.9.25 — Expo SDK 52 pulls Compose Compiler 1.5.15, which REQUIRES
 *     Kotlin 1.9.25; the toolchain default (1.9.24) fails
 *     `expo-modules-core:compileReleaseKotlin` at the Gradle stage. Pinning it via
 *     expo-build-properties is the fix.
 *
 *  2. Cleartext http — Android blocks plain http on API 28+. The `local` EAS
 *     profile talks to the dev API over http on the LAN, so that build (and only
 *     that build) needs cleartext. eas.json sets `HV_CLEARTEXT=1` on the `local`
 *     profile; every other profile leaves it unset → false. NOTE: this belongs in
 *     expo-build-properties, NOT `android.usesCleartextTraffic` — that is not a
 *     valid app-config property (expo doctor flags it) and never reached the
 *     manifest, which is why the earlier local build served no cleartext.
 *
 * Everything else — package, dark mode, icon, splash, the router/secure-store/font
 * plugins — stays in app.json, which arrives here as `config`.
 */
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    [
      'expo-build-properties',
      {
        android: {
          kotlinVersion: '1.9.25',
          usesCleartextTraffic: process.env.HV_CLEARTEXT === '1',
        },
      },
    ],
  ],
});
