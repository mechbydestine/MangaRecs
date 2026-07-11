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

var _mrRecoveryListeners = [];
function onPasswordRecovery(cb) { _mrRecoveryListeners.push(cb); }

sb.auth.onAuthStateChange(function (event, session) {
  if (event === 'PASSWORD_RECOVERY') _mrRecoveryListeners.forEach(function (cb) { cb(); });
  _mrNotifyAuth(session ? session.user : null);
});
sb.auth.getSession().then(function (res) {
  _mrNotifyAuth(res.data.session ? res.data.session.user : null);
});

function getCurrentUser() { return _mrAuthUser; }

function siteReturnUrl() { return location.origin + location.pathname; }

function signUpWithPassword(email, password, username) {
  return sb.auth.signUp({
    email: email, password: password,
    options: { data: { username: username }, emailRedirectTo: siteReturnUrl() },
  });
}
function signInWithPassword(email, password) {
  return sb.auth.signInWithPassword({ email: email, password: password });
}
function signInWithGoogle() {
  return sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: siteReturnUrl() } });
}
function signOut() {
  return sb.auth.signOut();
}
function requestPasswordReset(email) {
  return sb.auth.resetPasswordForEmail(email, { redirectTo: siteReturnUrl() });
}
function updatePassword(newPassword) {
  return sb.auth.updateUser({ password: newPassword });
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

// ── Local + remote save state, shared by every "Save" button on the site ──
var LIB_KEY = 'mangarecs_web_library';
function getLibrary() { try { return JSON.parse(localStorage.getItem(LIB_KEY) || '{}'); } catch (e) { return {}; } }
function isSavedLocally(id) { return !!getLibrary()[id]; }
function toggleSavedLocally(id, title, cover) {
  var lib = getLibrary();
  if (lib[id]) delete lib[id]; else lib[id] = { id: id, title: title, cover: cover };
  localStorage.setItem(LIB_KEY, JSON.stringify(lib));
  return !!lib[id];
}
// Always toggles local state (instant, works logged-out); if signed in, also
// syncs to the real account. Resolves { saved, synced } — synced is false
// when a signed-in user's remote write failed, so the caller can flag it
// instead of silently claiming "Saved" when only the local copy landed.
function toggleSave(id, title, cover) {
  var next = toggleSavedLocally(id, title, cover);
  if (!getCurrentUser()) return Promise.resolve({ saved: next, synced: true });
  var remote = next ? bookmarkTitle(title) : unbookmarkTitle(title);
  return remote.then(function (ok) { return { saved: next, synced: ok }; });
}
