const { withAndroidManifest } = require('@expo/config-plugins');

// expo-audio's own AndroidManifest.xml unconditionally declares RECORD_AUDIO
// (it supports recording, which this app never uses — only playback for
// ambience/notification sounds). Removing it from app.json's permissions
// list alone doesn't work because manifest merging only adds permissions
// from linked native modules, never subtracts them — this explicitly
// overrides the merge so the built app doesn't request microphone access
// it has no use for.
module.exports = function withoutRecordAudio(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] || 'http://schemas.android.com/tools';
    manifest['uses-permission'] = manifest['uses-permission'] || [];
    manifest['uses-permission'].push({
      $: {
        'android:name': 'android.permission.RECORD_AUDIO',
        'tools:node': 'remove',
      },
    });
    return config;
  });
};
