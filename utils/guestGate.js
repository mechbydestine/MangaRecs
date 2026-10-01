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
// Non-hook translator: this is a util called from event handlers, not a
// component, so there's no useT() to reach for here.
import { t } from './i18n';

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
 * @param {string}   opts.whatKey   i18n key for what they were trying to do,
 *                                  e.g. 'gate.actionSave' — a key rather than a
 *                                  literal so the phrase is translated in the
 *                                  same language as the sentence it lands in
 * @param {Function} opts.onSignUp  navigate to signup
 * @param {Function} opts.action    the thing to run when they do have an account
 * @returns {Promise<boolean>} whether the action ran
 */
export async function requireAccount({ whatKey, onSignUp, action }) {
  if (!(await isGuest())) {
    await action?.();
    return true;
  }

  showAppAlert(
    t('gate.makeItYours'),
    t('gate.guestBody', { action: t(whatKey) }),
    [
      { text: t('gate.notNow'), style: 'cancel' },
      { text: t('gate.createAccount'), onPress: () => onSignUp?.() },
    ],
  );
  return false;
}
