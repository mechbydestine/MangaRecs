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
// The topbar button and the drawer's Dark Mode switch are two controls over
// one setting, and either can be on screen while the other is. Route every
// change through setTheme() so both repaint from the same event instead of
// drifting out of sync.
var THEME_EVENT = 'mangarecs:themechange';
function setTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }));
}
function initThemeToggle(btnId) {
  var btn = document.getElementById(btnId);
  if (!btn) return;
  var icon = btn.querySelector('svg');
  function paint() { icon.innerHTML = effectiveTheme() === 'dark' ? SUN_PATH : MOON_PATH; }
  var saved = localStorage.getItem(THEME_KEY);
  if (saved) applyTheme(saved);
  paint();
  window.addEventListener(THEME_EVENT, paint);
  btn.addEventListener('click', function () {
    var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    icon.classList.add('icon-flip');
    setTimeout(function () { setTheme(next); }, 140);
    setTimeout(function () { icon.classList.remove('icon-flip'); }, 320);
  });
}

// ── Nav drawer ───────────────────────────────────────────────────────
// One sectioned menu behind the hamburger, on every page and at every
// width, so the top bar can stay short: brand, search, a couple of links,
// the utility icons. Everything else — the formats, badges, the app, the
// legal pages — lives here rather than crowding the bar or hiding in a
// footer. Built in JS because seven pages would otherwise carry seven
// copies of the same 60 lines of markup and drift apart within a month.

var DRAWER_ICONS = {
  catalog: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  library: '<path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  badges: '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
  features: '<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/>',
  about: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z"/>',
  app: '<rect x="5" y="2" width="14" height="20" rx="2.5"/><path d="M12 18h.01"/>',
  // One mark per format. Four identical rows read as filler; these say
  // something about each: a bound volume, a phone you scroll vertically,
  // an ink brush, a browser window.
  manga: '<path d="M12 6.5S9.5 4 6 4H3v14h3c3.5 0 6 2 6 2s2.5-2 6-2h3V4h-3c-3.5 0-6 2.5-6 2.5z"/><path d="M12 6.5V20"/>',
  manhwa: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M9.5 7h5M9.5 11h5M9.5 15h3"/>',
  manhua: '<path d="M4 20c2.5 0 4-1.2 4-3.2 0-1.4-1-2.4-2.3-2.4C4.3 14.4 3 15.6 3 17"/><path d="m8.6 15.4 9.6-9.6a2 2 0 0 0-2.8-2.8l-9.6 9.6"/>',
  webcomic: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 9h20"/><path d="M5.5 6.5h.01M8 6.5h.01"/>'
};

var DRAWER_SECTIONS = [
  {
    heading: 'Browse',
    links: [
      { label: 'Browse Catalog', href: '/catalog/', icon: 'catalog' },
      { label: 'My Library', href: '/catalog/#/library', icon: 'library', library: true },
      { label: 'Badges & Medals', href: '/badges/', icon: 'badges' }
    ]
  },
  {
    heading: 'By format',
    // The SPA browse route, not /catalog/<format>/. Those are standalone SEO
    // landing pages — a different, thinner view than the live browse grid the
    // in-app tabs reach, so sending menu traffic there dumped people on the
    // wrong page. #/browse/<id> is what the catalog's own tabs use, and the
    // router reads the hash on a cold load too, so it works from any page.
    links: [
      { label: 'Manga', href: '/catalog/#/browse/manga', icon: 'manga' },
      { label: 'Manhwa', href: '/catalog/#/browse/manhwa', icon: 'manhwa' },
      { label: 'Manhua', href: '/catalog/#/browse/manhua', icon: 'manhua' },
      { label: 'Webcomics', href: '/catalog/#/browse/webcomic', icon: 'webcomic' }
    ]
  },
  {
    heading: 'MangaRecs',
    links: [
      { label: 'Features', href: '/features/', icon: 'features' },
      { label: 'About', href: '/about/', icon: 'about' },
      { label: 'Get the App', href: '/#download', icon: 'app', tag: 'Soon' }
    ]
  }
];

function svgIcon(paths) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
}

function drawerMarkup() {
  var here = location.pathname.replace(/\/+$/, '') || '/';
  var html = '' +
    '<div class="nav-drawer-head">' +
      '<div class="nav-drawer-title" id="navDrawerTitle">' +
        svgIcon('<path d="M4 7h16M4 12h16M4 17h16"/>') + 'Menu' +
      '</div>' +
      '<button class="nav-drawer-close" id="navDrawerClose" type="button" aria-label="Close menu">' +
        svgIcon('<path d="M18 6 6 18M6 6l12 12"/>') +
      '</button>' +
    '</div>' +
    '<div class="nav-drawer-body">' +
      '<button class="nav-theme-row" id="navThemeRow" type="button" aria-pressed="false">' +
        '<span>Dark Mode</span>' +
        '<span class="nav-switch" aria-hidden="true">' + svgIcon(MOON_PATH) + '</span>' +
      '</button>';

  for (var i = 0; i < DRAWER_SECTIONS.length; i++) {
    var section = DRAWER_SECTIONS[i];
    html += '<div class="nav-drawer-section"><div class="nav-drawer-heading">' + section.heading + '</div>';
    for (var j = 0; j < section.links.length; j++) {
      var link = section.links[j];
      var path = link.href.split('#')[0].replace(/\/+$/, '') || '/';
      // Only a plain path marks the current page; /#download and
      // /catalog/#/library are routes within a page, not the page itself.
      var current = link.href.indexOf('#') === -1 && path === here;
      html += '<a class="nav-drawer-link" href="' + link.href + '"' +
        (link.library ? ' data-library-link style="display:none;"' : '') +
        (current ? ' aria-current="page"' : '') + '>' +
        '<span class="nav-drawer-ico">' + svgIcon(DRAWER_ICONS[link.icon]) + '</span>' +
        '<span>' + link.label + '</span>' +
        (link.tag ? '<span class="nav-tag">' + link.tag + '</span>' : '') +
        '</a>';
    }
    html += '</div>';
  }

  return html +
    '</div>' +
    '<div class="nav-drawer-foot">' +
      '<a href="/privacy/">Privacy</a> · <a href="/terms/">Terms</a> · ' +
      '<a href="mailto:hello@mangarecs.net">Contact</a><br />' +
      'Built by readers, for readers.' +
    '</div>';
}

// Safe to call on any page — it no-ops when the trigger button is absent.
function initNavDrawer(btnId) {
  var btn = document.getElementById(btnId || 'menuBtn');
  if (!btn || document.getElementById('navDrawer')) return;

  var scrim = document.createElement('div');
  scrim.className = 'nav-scrim';
  scrim.id = 'navScrim';

  var drawer = document.createElement('aside');
  drawer.className = 'nav-drawer';
  drawer.id = 'navDrawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'true');
  drawer.setAttribute('aria-labelledby', 'navDrawerTitle');
  drawer.setAttribute('aria-hidden', 'true');
  drawer.innerHTML = drawerMarkup();

  document.body.appendChild(scrim);
  document.body.appendChild(drawer);

  var themeRow = drawer.querySelector('#navThemeRow');
  function paintTheme() { themeRow.setAttribute('aria-pressed', effectiveTheme() === 'dark' ? 'true' : 'false'); }
  paintTheme();
  window.addEventListener(THEME_EVENT, paintTheme);
  themeRow.addEventListener('click', function () {
    setTheme(effectiveTheme() === 'dark' ? 'light' : 'dark');
  });

  var isOpen = false;
  function focusables() {
    return Array.prototype.filter.call(
      drawer.querySelectorAll('a[href], button:not([disabled])'),
      function (el) { return el.offsetParent !== null; }
    );
  }
  function setOpen(open) {
    isOpen = open;
    drawer.classList.toggle('open', open);
    scrim.classList.toggle('open', open);
    drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.documentElement.classList.toggle('nav-drawer-open', open);
    if (open) drawer.querySelector('#navDrawerClose').focus();
    else btn.focus();
  }

  btn.addEventListener('click', function (e) { e.stopPropagation(); setOpen(!isOpen); });
  scrim.addEventListener('click', function () { setOpen(false); });
  drawer.querySelector('#navDrawerClose').addEventListener('click', function () { setOpen(false); });
  // A tap on a link navigates; close so the drawer isn't left hanging open
  // over an in-page anchor jump or a catalog hash route.
  drawer.addEventListener('click', function (e) {
    if (e.target.closest('a[href]')) setOpen(false);
  });
  document.addEventListener('keydown', function (e) {
    if (!isOpen) return;
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key !== 'Tab') return;
    var items = focusables();
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}

// ── Account panel ────────────────────────────────────────────────────
function initAccountPanel(btnId, panelId) {
  var btn = document.getElementById(btnId);
  var panel = document.getElementById(panelId);
  if (!btn || !panel) return;
  var mode = 'signin';

  // The nav drawer sitting next to this had aria-expanded, Escape and a focus
  // trap; this panel had none of the three, so a keyboard user could tab
  // straight out of an open sign-in form into the page behind it and screen
  // readers were never told the control expanded anything.
  //
  // Every open/close goes through here — the auth callbacks used to poke
  // classList directly, which is exactly how the state and the ARIA drift.
  panel.setAttribute('aria-hidden', 'true');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-haspopup', 'dialog');

  function panelFocusables() {
    return Array.prototype.filter.call(
      panel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea'),
      function (el) { return el.offsetParent !== null; }
    );
  }

  function isPanelOpen() { return panel.classList.contains('open'); }

  function setPanelOpen(open, opts) {
    var wasOpen = isPanelOpen();
    panel.classList.toggle('open', open);
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      // Focus the first real control so the form is immediately usable, but
      // not on a re-render of an already-open panel — that would yank the
      // caret out of whatever the visitor is typing in.
      if (!wasOpen) {
        var items = panelFocusables();
        if (items.length) items[0].focus();
      }
    } else if (wasOpen && !(opts && opts.silent)) {
      btn.focus();
    }
  }

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
  // Escapes text bound for innerHTML. The email comes back from Supabase and
  // is shape-constrained, so this is belt-and-braces rather than a live hole —
  // but an address is user-supplied data and has no business being concatenated
  // into markup unescaped.
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function signedInHtml(user) {
    return '' +
      '<div class="account-email">' + esc(user.email || 'Signed in') + '</div>' +
      '<a class="btn-ghost-sm" href="/catalog/#/profile" style="display:block;box-sizing:border-box;text-decoration:none;margin-bottom:8px;">My Profile</a>' +
      '<button class="btn-ghost-sm" id="accSignOut" type="button">Sign out</button>';
  }

  // Enter submits, from any input in the panel. The panel builds its markup as
  // loose <input>s rather than a <form>, so nothing gave the Enter key meaning
  // and typing a password then pressing Enter did nothing at all — which reads
  // as the site being broken, because every other sign-in box on the web
  // submits. Bound per-render because the panel replaces its own innerHTML.
  function submitOnEnter() {
    var inputs = panel.querySelectorAll('input');
    Array.prototype.forEach.call(inputs, function (el) {
      el.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var btn = document.getElementById('accSubmit');
        if (btn && !btn.disabled) btn.click();
      });
    });
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
        setPanelOpen(false, { silent: true });
      }).catch(function () { submit.disabled = false; errEl.textContent = 'Something went wrong. Try again.'; });
    });

    googleBtn.addEventListener('click', function () { signInWithGoogle(); });
    submitOnEnter();
  }

  function wireForgot() {
    var submit = document.getElementById('accSubmit');
    var switchBtn = document.getElementById('accSwitch');
    var errEl = document.getElementById('accError');
    switchBtn.addEventListener('click', function () { setMode('signin'); });
    submit.addEventListener('click', function () {
      var email = document.getElementById('accEmail').value.trim();
      errEl.style.color = '';
      errEl.textContent = '';
      if (!email) { errEl.textContent = 'Enter your email.'; return; }
      submit.disabled = true;
      requestPasswordReset(email).then(function (res) {
        submit.disabled = false;
        errEl.textContent = res.error ? res.error.message : '';
        if (!res.error) { errEl.style.color = 'var(--accent)'; errEl.textContent = 'Check your email for a reset link.'; }
      });
    });
    submitOnEnter();
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
        setPanelOpen(false, { silent: true });
        setMode('signin');
      });
    });
    submitOnEnter();
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
        signOut().then(function () { mode = 'signin'; setPanelOpen(false, { silent: true }); });
      });
    } else {
      setMode('signin');
    }
  }

  onAuthChange(function (user) {
    render(user);
    btn.classList.toggle('signed-in', !!user);
    // Two copies of the Library link exist on pages with a mobile menu (the
    // inline nav one and the one inside the menu panel), so toggle every
    // marked link rather than the single id — otherwise the menu copy stays
    // hidden for signed-in visitors on a phone.
    var libLinks = document.querySelectorAll('[data-library-link], #libraryNavLink');
    Array.prototype.forEach.call(libLinks, function (el) {
      el.style.display = user ? '' : 'none';
    });
  });
  onPasswordRecovery(function () {
    setMode('recovery');
    setPanelOpen(true);
  });

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    setPanelOpen(!isPanelOpen());
  });
  document.addEventListener('click', function (e) {
    // A click outside dismisses, but must not steal focus back to the button —
    // the visitor is already on their way somewhere else.
    if (!panel.contains(e.target) && e.target !== btn) setPanelOpen(false, { silent: true });
  });
  document.addEventListener('keydown', function (e) {
    if (!isPanelOpen()) return;
    if (e.key === 'Escape') { setPanelOpen(false); return; }
    if (e.key !== 'Tab') return;
    var items = panelFocusables();
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}
