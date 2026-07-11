// Same Supabase project the app uses (supabase.js) — anon/publishable key,
// safe client-side, protected by RLS (auth.uid() = user_id on reading_progress).
var MR_SUPABASE_URL = 'https://jlzsnmwyyjefjekscvgs.supabase.co';
var MR_SUPABASE_ANON_KEY = 'sb_publishable_L47c82XgIO4CqOhQFbsxvQ_4D3Io0dL';
var sb = supabase.createClient(MR_SUPABASE_URL, MR_SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

var _mrAuthUser = null;
var _mrAuthReady = false;
var _mrAuthListeners = [];

function onAuthChange(cb) {
  _mrAuthListeners.push(cb);
  if (_mrAuthReady) cb(_mrAuthUser);
}
function _mrNotifyAuth(user) {
  _mrAuthUser = user;
  _mrAuthReady = true;
  _mrAuthListeners.forEach(function (cb) { cb(user); });
}

sb.auth.onAuthStateChange(function (_event, session) {
  _mrNotifyAuth(session ? session.user : null);
});
sb.auth.getSession().then(function (res) {
  _mrNotifyAuth(res.data.session ? res.data.session.user : null);
});

function getCurrentUser() { return _mrAuthUser; }

function signUpWithPassword(email, password, username) {
  return sb.auth.signUp({ email: email, password: password, options: { data: { username: username } } });
}
function signInWithPassword(email, password) {
  return sb.auth.signInWithPassword({ email: email, password: password });
}
function signInWithGoogle() {
  return sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href.split('#')[0] } });
}
function signOut() {
  return sb.auth.signOut();
}

// ── Bookmark sync — mirrors screens/LibraryScreen.js's handleAddToBookmarked
// and its delete counterpart exactly, so a web save shows up in the app's
// Library → Bookmarked tab and vice versa. Never touches an existing
// reading/completed row: upsert no-ops on conflict, delete is status-scoped. ──
function bookmarkTitle(seriesTitle) {
  if (!_mrAuthUser) return Promise.resolve(false);
  return sb.from('reading_progress').upsert({
    user_id: _mrAuthUser.id,
    series_title: seriesTitle,
    status: 'bookmarked',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,series_title', ignoreDuplicates: true }).then(function (res) {
    return !res.error;
  });
}
function unbookmarkTitle(seriesTitle) {
  if (!_mrAuthUser) return Promise.resolve(false);
  return sb.from('reading_progress').delete()
    .eq('user_id', _mrAuthUser.id).eq('series_title', seriesTitle).eq('status', 'bookmarked')
    .then(function (res) { return !res.error; });
}
// True if this title has ANY row (reading/completed/bookmarked) for the
// current user — used to reflect real in-app progress on the web Save button.
function isTitleInAccountLibrary(seriesTitle) {
  if (!_mrAuthUser) return Promise.resolve(false);
  return sb.from('reading_progress').select('series_title', { count: 'exact', head: true })
    .eq('user_id', _mrAuthUser.id).eq('series_title', seriesTitle)
    .then(function (res) { return !res.error && res.count > 0; });
}
