// App-wide branded alert bus — same pattern as appToast.js. Screens call
// showAppAlert() instead of the native Alert.alert() so confirm/error dialogs
// stay inside the app's visual language instead of dropping into a stock
// OS dialog. AlertHost (mounted once in App.js) renders it.

let _listener = null;

export function setAlertListener(fn) {
  _listener = fn;
  return () => { if (_listener === fn) _listener = null; };
}

// buttons: [{ text, style: 'default' | 'destructive' | 'cancel', onPress }]
// Mirrors Alert.alert(title, message, buttons) so call sites port over directly.
export function showAppAlert(title, message, buttons = [{ text: 'OK' }]) {
  if (_listener) _listener(title, message, buttons);
}
