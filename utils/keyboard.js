import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

// Returns the current soft-keyboard height (0 when hidden). Use it as extra
// paddingBottom on a ScrollView so focused inputs are never covered — works
// under both adjustPan (our app.json setting) and iOS, where
// KeyboardAvoidingView alone misbehaves inside centered ScrollViews.
export function useKeyboardPadding() {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => setHeight(e.endCoordinates?.height ?? 0));
    const hideSub = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  return height;
}
