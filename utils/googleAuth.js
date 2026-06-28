import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '../supabase';

export async function signInWithGoogle() {
  const redirectTo = Linking.createURL('auth/callback');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;

  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success' || !res.url) {
    throw new Error('Google sign-in was cancelled');
  }

  const { queryParams } = Linking.parse(res.url);
  if (queryParams?.error) {
    throw new Error(queryParams.error_description || queryParams.error);
  }
  if (!queryParams?.code) {
    throw new Error('No authorization code returned from Google');
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(queryParams.code);
  if (exchangeError) throw exchangeError;
}
