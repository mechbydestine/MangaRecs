// Tiny app-wide bus for the Feed → MangaDetail cover morph, same pattern as
// appToast.js. A card measures its own cover on tap and publishes the source
// rect here; CoverMorphOverlay (mounted once in App.js) animates an overlay
// image from that rect to MangaDetailScreen's fixed hero-cover geometry while
// navigation pushes the real screen in underneath.

let _listener = null;

export function setCoverTransitionListener(fn) {
  _listener = fn;
  return () => { if (_listener === fn) _listener = null; };
}

export function startCoverTransition(payload) {
  if (_listener) _listener(payload);
}
