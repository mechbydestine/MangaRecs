// Guest → account upgrade prompt.
//
// The whole point of letting someone read without an account is that the wall
// moves to where it justifies itself. Reading is free; *keeping* something is
// what needs an account, because that's the first action whose value obviously
// depends on the data surviving this install.
//
// So: never block browsing or reading. Call requireAccount() only on actions
// that persist something the user would be upset to lose — saving to library,
// following a series, rating, posting, messaging.
import { supabase } from '../supabase';
import { showAppAlert } from './appAlert';

// Anonymous Supabase sessions are real users with real rows, so `session`
// existing is not proof of an account. is_anonymous is the actual signal.
export async function isGuest() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return !!session?.user?.is_anonymous;
  } catch (_) {
    return false; // fail open — never block a real user because auth hiccuped
  }
}

/**
 * Runs `action` for signed-up users. For guests, explains what an account buys
 * and offers to make one, without performing the action.
 *
 * @param {object}   opts
 * @param {string}   opts.what      what they were trying to do, lowercase — "save this series"
 * @param {Function} opts.onSignUp  navigate to signup
 * @param {Function} opts.action    the thing to run when they do have an account
 * @returns {Promise<boolean>} whether the action ran
 */
export async function requireAccount({ what, onSignUp, action }) {
  if (!(await isGuest())) {
    await action?.();
    return true;
  }

  showAppAlert(
    'Make it yours',
    `You're reading as a guest, so there's nowhere to ${what} yet. Create a free account and your library, progress, and streak follow you to any device.`,
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Create account', onPress: () => onSignUp?.() },
    ],
  );
  return false;
}
