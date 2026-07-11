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

  function signedOutHtml() {
    return '' +
      '<div class="account-tabtitle" id="accTitle">Sign in</div>' +
      '<input type="email" id="accEmail" placeholder="Email" autocomplete="email" />' +
      '<input type="password" id="accPassword" placeholder="Password" autocomplete="current-password" />' +
      '<div class="account-error" id="accError"></div>' +
      '<div class="btn-row"><button class="btn-primary-sm" id="accSubmit" type="button">Sign in</button></div>' +
      '<button class="account-switch" id="accSwitch" type="button">Need an account? Sign up</button>' +
      '<div class="account-divider">or</div>' +
      '<button class="btn-ghost-sm" id="accGoogle" type="button">Continue with Google</button>';
  }
  function signedInHtml(user) {
    return '' +
      '<div class="account-email">' + (user.email || 'Signed in') + '</div>' +
      '<button class="btn-ghost-sm" id="accSignOut" type="button">Sign out</button>';
  }

  function wireSignedOut() {
    var title = document.getElementById('accTitle');
    var submit = document.getElementById('accSubmit');
    var switchBtn = document.getElementById('accSwitch');
    var googleBtn = document.getElementById('accGoogle');
    var errEl = document.getElementById('accError');

    function setMode(m) {
      mode = m;
      title.textContent = m === 'signin' ? 'Sign in' : 'Create account';
      submit.textContent = m === 'signin' ? 'Sign in' : 'Sign up';
      switchBtn.textContent = m === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in';
      errEl.textContent = '';
    }
    switchBtn.addEventListener('click', function () { setMode(mode === 'signin' ? 'signup' : 'signin'); });

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

  function render(user) {
    if (user) {
      panel.innerHTML = signedInHtml(user);
      document.getElementById('accSignOut').addEventListener('click', function () {
        signOut().then(function () { panel.classList.remove('open'); });
      });
    } else {
      panel.innerHTML = signedOutHtml();
      wireSignedOut();
    }
  }

  onAuthChange(function (user) {
    render(user);
    btn.classList.toggle('signed-in', !!user);
  });

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    panel.classList.toggle('open');
  });
  document.addEventListener('click', function (e) {
    if (!panel.contains(e.target) && e.target !== btn) panel.classList.remove('open');
  });
}
