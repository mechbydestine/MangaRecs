/** @type {import('expo/fingerprint').Config} */
const config = {
  // 'ExpoConfigVersions' excludes app.json's "version" field from the hash.
  // Without it, every version bump (done on every push — see README's
  // Versioning section) changed the fingerprint too, breaking OTA
  // compatibility on every single push — the exact problem switching to
  // fingerprint policy was meant to prevent.
  //
  // 'PackageJsonAndroidAndIosScriptsIfNotContainRun' is @expo/fingerprint's
  // own DEFAULT skip (DEFAULT_SOURCE_SKIPS) — specifying sourceSkips at all
  // REPLACES the default rather than adding to it, so it has to be listed
  // explicitly here too. Without it, EAS Build's own rewrite of
  // package.json's android/ios scripts (`expo start --android` ->
  // `expo run:android`) during prebuild counted as a real diff, so the
  // build-time fingerprint never matched the one computed pre-upload.
  sourceSkips: ['ExpoConfigVersions', 'PackageJsonAndroidAndIosScriptsIfNotContainRun'],

  // EAS Build runs `expo prebuild` on the worker, generating real android/
  // and ios/ directories that don't exist in this repo (pure CNG project,
  // no native dirs committed). @expo/fingerprint treats a physically-present
  // android/ios dir as a `bareNativeDir` source — present after prebuild on
  // the worker, absent locally before it — so the two fingerprints always
  // disagreed. Ignoring these paths makes both sides compute over the same
  // source set; actual native changes are still caught via app.json config,
  // native module package.json versions, and config plugin output.
  ignorePaths: ['android', 'android/**/*', 'ios', 'ios/**/*'],
};
module.exports = config;
