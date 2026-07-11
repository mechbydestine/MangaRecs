// Excludes app.json's "version" field from the native compatibility fingerprint
// used by runtimeVersion's "fingerprint" policy. Without this, every version
// bump (which we do on every push — see README's Versioning section) changed
// the fingerprint too, breaking OTA compatibility for every installed build
// on every single push — exactly the problem switching to fingerprint policy
// was supposed to prevent. Nothing else is skipped: icons, permissions, and
// config plugins still correctly trigger "this needs a new build."
/** @type {import('expo/fingerprint').Config} */
const config = {
  sourceSkips: ['ExpoConfigVersions'],
};
module.exports = config;
