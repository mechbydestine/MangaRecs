// Shared nav UI for both pages: manual theme toggle (on top of the
// prefers-color-scheme default already in each page's CSS) and the
// sign-in/sign-up/account panel wired to assets/auth.js.

var SUN_PATH = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>';
var MOON_PATH = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
var THEME_KEY = 'mangarecs_theme';

function effectiveTheme() {
  var saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function applyTheme(theme) {
  if (theme) document.documentElement.setAttribute('data-theme', theme);
  else document.documentElement.removeAttribute('data-theme');
}
function initThemeToggle(btnId) {
  var btn = document.getElementById(btnId);
  if (!btn) return;
  var icon = btn.querySelector('svg');
  function paint() { icon.innerHTML = effectiveTheme() === 'dark' ? SUN_PATH : MOON_PATH; }
  var saved = localStorage.getItem(THEME_KEY);
  if (saved) applyTheme(saved);
  paint();
  btn.addEventListener('click', function () {
    var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
    paint();
  });
}

// ── Account panel ────────────────────────────────────────────────────
function initAccountPanel(btnId, panelId) {
  var btn = document.getElementById(btnId);
  var panel = document.getElementById(panelId);
  if (!btn || !panel) return;
  var mode = 'signin';

  function credentialsHtml() {
    return '' +
      '<div class="account-tabtitle" id="accTitle">Sign in</div>' +
      '<input type="email" id="accEmail" placeholder="Email" autocomplete="email" />' +
      '<input type="password" id="accPassword" placeholder="Password" autocomplete="current-password" />' +
      '<div class="account-error" id="accError"></div>' +
      '<div class="btn-row"><button class="btn-primary-sm" id="accSubmit" type="button">Sign in</button></div>' +
      '<button class="account-switch" id="accForgot" type="button">Forgot password?</button>' +
      '<button class="account-switch" id="accSwitch" type="button">Need an account? Sign up</button>' +
      '<div class="account-divider">or</div>' +
      '<button class="btn-ghost-sm" id="accGoogle" type="button">Continue with Google</button>';
  }
  function forgotHtml() {
    return '' +
      '<div class="account-tabtitle">Reset password</div>' +
      '<p class="account-hint">We\'ll email you a link to set a new password.</p>' +
      '<input type="email" id="accEmail" placeholder="Email" autocomplete="email" />' +
      '<div class="account-error" id="accError"></div>' +
      '<div class="btn-row"><button class="btn-primary-sm" id="accSubmit" type="button">Send reset link</button></div>' +
      '<button class="account-switch" id="accSwitch" type="button">Back to sign in</button>';
  }
  function recoveryHtml() {
    return '' +
      '<div class="account-tabtitle">Set a new password</div>' +
      '<input type="password" id="accNewPassword" placeholder="New password" autocomplete="new-password" />' +
      '<div class="account-error" id="accError"></div>' +
      '<div class="btn-row"><button class="btn-primary-sm" id="accSubmit" type="button">Save password</button></div>';
  }
  function signedInHtml(user) {
    return '' +
      '<div class="account-email">' + (user.email || 'Signed in') + '</div>' +
      '<a class="btn-ghost-sm" href="/catalog/#/library" style="display:block;box-sizing:border-box;text-decoration:none;margin-bottom:8px;">My Library</a>' +
      '<button class="btn-ghost-sm" id="accSignOut" type="button">Sign out</button>';
  }

  function wireCredentials() {
    var title = document.getElementById('accTitle');
    var submit = document.getElementById('accSubmit');
    var switchBtn = document.getElementById('accSwitch');
    var forgotBtn = document.getElementById('accForgot');
    var googleBtn = document.getElementById('accGoogle');
    var errEl = document.getElementById('accError');

    function relabel() {
      title.textContent = mode === 'signin' ? 'Sign in' : 'Create account';
      submit.textContent = mode === 'signin' ? 'Sign in' : 'Sign up';
      switchBtn.textContent = mode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in';
    }
    switchBtn.addEventListener('click', function () { mode = mode === 'signin' ? 'signup' : 'signin'; relabel(); errEl.textContent = ''; });
    forgotBtn.addEventListener('click', function () { setMode('forgot'); });

    submit.addEventListener('click', function () {
      var email = document.getElementById('accEmail').value.trim();
      var password = document.getElementById('accPassword').value;
      errEl.textContent = '';
      if (!email || !password) { errEl.textContent = 'Enter an email and password.'; return; }
      submit.disabled = true;
      var action = mode === 'signin'
        ? signInWithPassword(email, password)
        : signUpWithPassword(email, password, email.split('@')[0]);
      action.then(function (res) {
        submit.disabled = false;
        if (res.error) { errEl.textContent = res.error.message; return; }
        if (mode === 'signup' && !res.data.session) { errEl.textContent = 'Check your email to confirm your account.'; return; }
        panel.classList.remove('open');
      }).catch(function () { submit.disabled = false; errEl.textContent = 'Something went wrong. Try again.'; });
    });

    googleBtn.addEventListener('click', function () { signInWithGoogle(); });
  }

  function wireForgot() {
    var submit = document.getElementById('accSubmit');
    var switchBtn = document.getElementById('accSwitch');
    var errEl = document.getElementById('accError');
    switchBtn.addEventListener('click', function () { setMode('signin'); });
    submit.addEventListener('click', function () {
      var email = document.getElementById('accEmail').value.trim();
      errEl.textContent = '';
      if (!email) { errEl.textContent = 'Enter your email.'; return; }
      submit.disabled = true;
      requestPasswordReset(email).then(function (res) {
        submit.disabled = false;
        errEl.textContent = res.error ? res.error.message : '';
        if (!res.error) { errEl.style.color = 'var(--accent)'; errEl.textContent = 'Check your email for a reset link.'; }
      });
    });
  }

  function wireRecovery() {
    var submit = document.getElementById('accSubmit');
    var errEl = document.getElementById('accError');
    submit.addEventListener('click', function () {
      var pw = document.getElementById('accNewPassword').value;
      errEl.textContent = '';
      if (!pw || pw.length < 6) { errEl.textContent = 'Use at least 6 characters.'; return; }
      submit.disabled = true;
      updatePassword(pw).then(function (res) {
        submit.disabled = false;
        if (res.error) { errEl.textContent = res.error.message; return; }
        panel.classList.remove('open');
        setMode('signin');
      });
    });
  }

  function setMode(m) {
    mode = m;
    if (getCurrentUser() && m !== 'recovery') { render(getCurrentUser()); return; }
    if (m === 'forgot') { panel.innerHTML = forgotHtml(); wireForgot(); return; }
    if (m === 'recovery') { panel.innerHTML = recoveryHtml(); wireRecovery(); return; }
    panel.innerHTML = credentialsHtml();
    wireCredentials();
    document.getElementById('accTitle').textContent = m === 'signin' ? 'Sign in' : 'Create account';
    document.getElementById('accSubmit').textContent = m === 'signin' ? 'Sign in' : 'Sign up';
    document.getElementById('accSwitch').textContent = m === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in';
  }

  function render(user) {
    if (mode === 'recovery') { panel.innerHTML = recoveryHtml(); wireRecovery(); return; }
    if (user) {
      panel.innerHTML = signedInHtml(user);
      document.getElementById('accSignOut').addEventListener('click', function () {
        signOut().then(function () { mode = 'signin'; panel.classList.remove('open'); });
      });
    } else {
      setMode('signin');
    }
  }

  onAuthChange(function (user) {
    render(user);
    btn.classList.toggle('signed-in', !!user);
  });
  onPasswordRecovery(function () {
    setMode('recovery');
    panel.classList.add('open');
  });

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    panel.classList.toggle('open');
  });
  document.addEventListener('click', function (e) {
    if (!panel.contains(e.target) && e.target !== btn) panel.classList.remove('open');
  });
}
