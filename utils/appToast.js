// Tiny app-wide toast bus. Screens call showAppToast() on failures the user
// would otherwise never see; ToastHost (mounted once in App.js) renders it.

let _listener = null;

export function setToastListener(fn) {
  _listener = fn;
  return () => { if (_listener === fn) _listener = null; };
}

export function showAppToast(message, type = 'error') {
  if (_listener) _listener(message, type);
}
