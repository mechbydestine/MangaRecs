import { supabase } from '../supabase';

function generateGuestUsername() {
  // profiles.username is CHECK'd to ^[a-z0-9]{3,24}$ — base36 keeps this
  // lowercase-alnum by construction, matching that constraint for free.
  return `guest${Math.random().toString(36).slice(2, 8)}`;
}

// A real signup (AuthScreen.js) explicitly creates the profiles row itself —
// there's no DB trigger for it, and username is NOT NULL with no default. An
// anonymous session skips that path entirely, so without this a guest would
// reach GuidelinesScreen with no profiles row, its upsert would throw (caught
// and swallowed), and they'd enter the app with a permanently missing profile.
//
// Called from two places: OnboardingScreen.finishOnboarding() (the normal
// path, right after a first-time user finishes or skips onboarding) and
// App.js's init() as a self-healing fallback — if that first attempt ever
// failed silently (network blip, anonymous auth briefly unavailable), a user
// could otherwise be stranded on AuthScreen forever with onboarding already
// marked complete and no way back into this flow. App.js retries it on every
// cold start until a session actually exists, instead of giving up after one try.
export async function ensureGuestSession() {
  const { data } = await supabase.auth.getUser();
  if (data?.user) return data.user;

  const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
  if (anonError || !anonData?.user) return null;
  const user = anonData.user;

  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      username: generateGuestUsername(),
      display_name: 'Guest',
      streak_count: 0,
      chapters_read: 0,
      hours_read: 0,
      night_reads: 0,
      genres_count: 0,
      shares_count: 0,
      manga_count: 0,
      ratings_count: 0,
      accepted_guidelines: false,
      created_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (!error) break; // username collision (astronomically unlikely) — retry with a new one
  }
  return user;
}
