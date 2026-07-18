import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from '../supabase';

export async function signInWithApple() {
  let credential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (err) {
    if (err.code === 'ERR_REQUEST_CANCELED') {
      throw new Error('Apple sign-in was cancelled');
    }
    throw err;
  }

  if (!credential.identityToken) {
    throw new Error('No identity token returned from Apple');
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;
}
