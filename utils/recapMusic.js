// Recap soundtrack.
//
// The recap used to borrow the reader's ambience loops — rain, forest, ocean,
// night. Those are *reading atmosphere*: seamless, eventless, deliberately
// unmemorable, because their job is to disappear behind a chapter. A recap is
// the opposite kind of thing. It's a 69-second cut with ten beats and a
// finale, and it needs music with an arc, not weather.
//
// ── Licensing ──────────────────────────────────────────────────────────────
// "No copyright music" is a marketing phrase, not a licence, and the trap it
// hides is that most royalty-free libraries licence *synchronisation into
// video*, not redistribution inside an app binary. Two specifics that matter:
//
//   • YouTube Audio Library's standard licence is YouTube-only. Its CC-BY
//     tracks are fine anywhere with credit; the rest are not usable here.
//   • Pixabay's Content Licence allows commercial use with no attribution and
//     explicitly permits incorporating content into a larger work. The only
//     bar is selling it "on a Standalone basis" — i.e. as music. Shipping it
//     as an app's soundtrack is squarely inside that.
//
// Every track named in assets/music/README.md is Pixabay-licensed for that
// reason. CC-BY sources (Kevin MacLeod et al.) are usable too but oblige us to
// carry attribution in-app forever, which is a product decision, not a free
// one — see the README.

// ── Drop-in point ──────────────────────────────────────────────────────────
// Metro resolves require() at bundle time, so these can only ever point at
// files that exist. Until the real tracks are downloaded into assets/music/,
// each mood falls back to the ambience loop it replaces — the recap keeps its
// audio and nothing breaks. Swapping one in is a single-line edit:
//
//     epic: require('../assets/music/epic.mp3'),
//
// assets/music/README.md prescribes the exact filenames so the swap stays
// mechanical.
const TRACK_FILES = {
  epic:  require('../assets/sounds/ocean.mp3'),  // → ../assets/music/epic.mp3
  warm:  require('../assets/sounds/forest.mp3'), // → ../assets/music/warm.mp3
  dark:  require('../assets/sounds/rain.mp3'),   // → ../assets/music/dark.mp3
  synth: require('../assets/sounds/night.mp3'),  // → ../assets/music/synth.mp3
};

// True once real music has replaced the placeholders. Only affects mixing:
// nature loops sit under everything at a whisper, music needs to be present
// enough to carry a beat without burying the slide it's under.
export const USING_REAL_MUSIC = false;

export const MUSIC_VOLUME = USING_REAL_MUSIC ? 0.34 : 0.18;

// Four moods, not eight. There are eight genre lanes, but a mood per lane
// means eight files in the bundle for a screen most people open twice a year —
// and "Action" vs "Sports" is not a distinction anyone hears in scoring.
const LANE_MOOD = {
  battle:  'epic',
  pitch:   'epic',
  quest:   'epic',
  occult:  'dark',
  dread:   'dark',
  heart:   'warm',
  calm:    'warm',
  circuit: 'synth',
};

// The reader's genre lane picks the music, full stop.
//
// This used to be decided by peak reading hour FIRST, with the lane only
// consulted if you didn't read late — so every night reader on the app got the
// identical track regardless of whether their year was horror or sports, which
// is the one thing a personalised recap should never do. Reading at 2am is a
// habit; the lane is the identity, and the identity is what the recap is about.
export function moodFor(data) {
  return LANE_MOOD[data?.identity?.lane] || 'warm';
}

export function trackFor(data) {
  return TRACK_FILES[moodFor(data)];
}

// ── Fades ──────────────────────────────────────────────────────────────────
// Music that hard-cuts in on slide one and hard-cuts out at the finale sounds
// broken even when it's the right track — the ambience loops got away with it
// only because they had no transient to cut. Short ramps, stepped manually
// because expo-audio has no native fade.
const FADE_STEP_MS = 60;

export function fadeIn(player, to = MUSIC_VOLUME, ms = 900) {
  if (!player) return null;
  const steps = Math.max(1, Math.round(ms / FADE_STEP_MS));
  let i = 0;
  try { player.volume = 0; } catch (_) { return null; }
  const id = setInterval(() => {
    i++;
    try { player.volume = to * (i / steps); } catch (_) {}
    if (i >= steps) clearInterval(id);
  }, FADE_STEP_MS);
  return id;
}

// Resolves once the track is silent so the caller can tear the player down
// without clipping the tail.
export function fadeOutAndStop(player, ms = 600) {
  return new Promise((resolve) => {
    if (!player) { resolve(); return; }
    let from;
    try { from = player.volume ?? MUSIC_VOLUME; } catch (_) { resolve(); return; }
    const steps = Math.max(1, Math.round(ms / FADE_STEP_MS));
    let i = 0;
    const id = setInterval(() => {
      i++;
      try { player.volume = Math.max(0, from * (1 - i / steps)); } catch (_) {}
      if (i >= steps) {
        clearInterval(id);
        try { player.pause(); player.remove(); } catch (_) {}
        resolve();
      }
    }, FADE_STEP_MS);
  });
}
