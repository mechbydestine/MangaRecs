import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AMBIENCE_KEY = '@mangarecs/ambience';

const SOUND_ASSETS = {
  rain:   require('../assets/sounds/rain.mp3'),
  forest: require('../assets/sounds/forest.mp3'),
  ocean:  require('../assets/sounds/ocean.mp3'),
  night:  require('../assets/sounds/night.mp3'),
};

export const PRESETS = [
  { id: 'rain',   label: 'Rain',   icon: 'rainy-outline', iconActive: 'rainy', color: '#4A9BD9', asset: SOUND_ASSETS.rain   },
  { id: 'forest', label: 'Forest', icon: 'leaf-outline',  iconActive: 'leaf',  color: '#3BA55C', asset: SOUND_ASSETS.forest },
  { id: 'ocean',  label: 'Ocean',  icon: 'water-outline', iconActive: 'water', color: '#2BB3C0', asset: SOUND_ASSETS.ocean  },
  { id: 'night',  label: 'Night',  icon: 'moon-outline',  iconActive: 'moon',  color: '#8A7CFF', asset: SOUND_ASSETS.night  },
];

let _player    = null;
let _presetId  = null;
let _volume    = 0.30;
let _listeners = new Set();

function _notify() {
  const state = { presetId: _presetId, volume: _volume };
  _listeners.forEach((fn) => fn(state));
}

async function _persist() {
  try {
    await AsyncStorage.setItem(AMBIENCE_KEY, JSON.stringify({ presetId: _presetId, volume: _volume }));
  } catch (e) {
    console.warn('[ambience] persist failed', e);
  }
}

async function _configureAudio() {
  try {
    // expo-audio (v1.x) does NOT have shouldPlayInBackground — that was expo-av.
    // iOS background audio is handled via UIBackgroundModes:["audio"] in app.json.
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
    });
  } catch (e) {
    console.warn('[ambience] setAudioModeAsync failed', e);
  }
}

export function subscribe(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function getState() {
  return { presetId: _presetId, volume: _volume };
}

export async function play(presetId) {
  const preset = PRESETS.find((p) => p.id === presetId);
  if (!preset) return;

  await _configureAudio();

  if (_player) {
    try { _player.pause(); _player.remove(); } catch (e) { console.warn('[ambience] remove failed', e); }
    _player = null;
  }

  try {
    _player = createAudioPlayer(preset.asset);
    _player.loop   = true;
    _player.volume = _volume;
    _player.play();
    _presetId = presetId;
  } catch (e) {
    console.warn('[ambience] play failed', e);
    _player   = null;
    _presetId = null;
  }

  await _persist();
  _notify();
}

export async function stop() {
  if (_player) {
    try { _player.pause(); _player.remove(); } catch (e) { console.warn('[ambience] stop failed', e); }
    _player = null;
  }
  _presetId = null;
  await _persist();
  _notify();
}

// persist=false lets a drag gesture update the live volume every frame
// without hammering AsyncStorage — the release calls it once with persist=true
export async function setVolume(v, persist = true) {
  _volume = Math.max(0.05, Math.min(1, v));
  if (_player) {
    try { _player.volume = _volume; } catch (e) { console.warn('[ambience] setVolume failed', e); }
  }
  if (persist) await _persist();
  _notify();
}

export async function loadSaved() {
  try {
    const raw = await AsyncStorage.getItem(AMBIENCE_KEY);
    if (!raw) return;
    const { presetId, volume } = JSON.parse(raw);
    if (typeof volume === 'number') _volume = volume;
    if (presetId) {
      // Resume playback — only reaches here on force-quit recovery since
      // ambienceStop() is called on normal Reader unmount (saves presetId: null).
      await play(presetId);
      return; // play() already calls _notify()
    }
  } catch (e) {
    console.warn('[ambience] loadSaved failed', e);
  }
  _notify();
}
