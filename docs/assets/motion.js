// Shared motion/interaction layer — paired with /assets/motion.css.
// Every init function feature-detects its own target elements, so this
// file is safe to load on every page (index, catalog, features, about,
// privacy, terms, 404) even though most pages only use a handful of these.
// The catalog page re-renders big chunks of #app via innerHTML on every
// route change, so anything that touches catalog markup uses event
// delegation or a MutationObserver instead of one-time querySelectorAll.

var REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Character mascot removed (wasn't landing) — a plain book stands in for
// now until a real one gets designed.
var MASCOT_SVG =
  '<svg viewBox="0 0 120 120" aria-hidden="true" style="width:100%;height:100%;">' +
    '<defs>' +
      '<linearGradient id="mascotPageL" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#EDE5FF"/><stop offset="100%" stop-color="#F6F3FB"/></linearGradient>' +
      '<linearGradient id="mascotPageR" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#F6F3FB"/><stop offset="100%" stop-color="#EDE5FF"/></linearGradient>' +
    '</defs>' +
    '<ellipse cx="60" cy="98" rx="34" ry="6" fill="#000" opacity="0.12"/>' +
    '<path d="M60 34c-14-8-32-9-42-4v54c10-5 28-4 42 4z" fill="url(#mascotPageL)" stroke="#5B2FD6" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<path d="M60 34c14-8 32-9 42-4v54c-10-5-28-4-42 4z" fill="url(#mascotPageR)" stroke="#5B2FD6" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<path d="M60 34v54" stroke="#5B2FD6" stroke-width="2.5" stroke-linecap="round"/>' +
    '<path d="M26 46l22 4M25 56l23 4M27 66l20 4" stroke="#B18CFF" stroke-width="2" stroke-linecap="round" opacity="0.8"/>' +
    '<path d="M94 46l-22 4M95 56l-23 4M93 66l-20 4" stroke="#B18CFF" stroke-width="2" stroke-linecap="round" opacity="0.8"/>' +
    '<path d="M60 34l3-20 5 3-6 19z" fill="#FF7ED4"/>' +
    '<path d="M96 26l1.6 4.6L102 32l-4.4 1.6L96 38l-1.6-4.4L90 32l4.4-1.4z" fill="#FFD34D"/>' +
  '</svg>';

// ── Ambient background (grain only) — skipped on dense legal-text pages
// The three blurred colour blobs that used to be injected here are gone:
// purple, pink and teal at blur(64px), fixed to the viewport, they cast a
// rainbow over both themes so neither read as itself. The background is flat
// now and the cursor glow below carries the colour instead.
function initAmbientFX() {
  if (document.querySelector('.legal')) return;
  var grain = document.createElement('div');
  grain.className = 'fx-grain';
  grain.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(grain, document.body.firstChild);
}

// ── Cursor glow — the only colour the background carries ────────────────
// Whole page, not just the hero. Sits at z-index:-1 so opaque sections
// occlude it and it shows in the gaps between them; it never washes over
// content, which is what keeps each theme looking like itself.
function initCursorGlow() {
  if (REDUCED_MOTION) return;
  // No cursor to follow on a touch screen, and a stuck glow at the last tap
  // position would just be a permanent tint.
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (document.querySelector('.fx-spotlight')) return;

  var spot = document.createElement('div');
  spot.className = 'fx-spotlight';
  spot.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(spot, document.body.firstChild);

  var tx = window.innerWidth / 2, ty = window.innerHeight / 2;
  var cx = tx, cy = ty, raf = null;

  // Eased toward the pointer rather than pinned to it: the drift is what
  // reads as reactive, and it costs one rAF that stops itself once caught up.
  function frame() {
    cx += (tx - cx) * 0.12;
    cy += (ty - cy) * 0.12;
    spot.style.setProperty('--sx', cx.toFixed(1) + 'px');
    spot.style.setProperty('--sy', cy.toFixed(1) + 'px');
    raf = (Math.abs(tx - cx) > 0.5 || Math.abs(ty - cy) > 0.5)
      ? requestAnimationFrame(frame)
      : null;
  }

  document.addEventListener('pointermove', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    tx = e.clientX;
    ty = e.clientY;
    spot.style.opacity = '1';
    if (!raf) raf = requestAnimationFrame(frame);
  }, { passive: true });

  // Fade out when the cursor leaves the window or the tab loses focus, so a
  // background tab is not left holding a glow.
  document.documentElement.addEventListener('pointerleave', function () {
    spot.style.opacity = '0';
  });
  window.addEventListener('blur', function () { spot.style.opacity = '0'; });
}

// ── Hero: cursor spotlight + scroll parallax on the star mark ───────────
function initHeroFX() {
  var hero = document.querySelector('.hero');
  if (!hero) return;
  // The cursor spotlight used to be created here and scoped to the hero.
  // initCursorGlow() now owns it for the whole page.
  var markWrap = document.querySelector('.hero-mark-wrap');
  if (markWrap && !REDUCED_MOTION) {
    window.addEventListener('scroll', function () {
      var y = Math.min(window.scrollY || 0, 340);
      var depth = y / 340;
      var ty = Math.min(y * 0.12, 40);
      var scale = 1 - depth * 0.08;
      var rotate = depth * 3;
      markWrap.style.transform = 'translateY(' + ty + 'px) scale(' + scale.toFixed(3) + ') rotate(' + rotate.toFixed(2) + 'deg)';
    }, { passive: true });
  }
}

// ── Poster 3D tilt — delegated so it works on posters rendered later ────
function initPosterTilt() {
  if (REDUCED_MOTION) return;
  var lastEl = null;
  document.addEventListener('pointermove', function (e) {
    var wrap = e.target && e.target.closest && e.target.closest('.poster-img-wrap');
    if (wrap) {
      var r = wrap.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      wrap.style.setProperty('--tiltX', (py * -10).toFixed(2) + 'deg');
      wrap.style.setProperty('--tiltY', (px * 10).toFixed(2) + 'deg');
      lastEl = wrap;
    } else if (lastEl) {
      lastEl.style.setProperty('--tiltX', '0deg');
      lastEl.style.setProperty('--tiltY', '0deg');
      lastEl = null;
    }
  }, { passive: true });
}

// ── Sliding tab underline for #navTabs / #libTabs / #formatPills ────────
// Two different update paths have to both be handled: catalog's #libTabs
// gets its innerHTML fully rebuilt by paintTabs() on every click (which
// would silently destroy a one-time-appended indicator), while #navTabs
// and #formatPills instead just classList.toggle('active', …) on children
// that never get removed. So each known container gets its own observer
// watching both childList (rebuilds) and class attribute changes (toggles),
// and a top-level body observer exists only to notice #libTabs the first
// time it's created (it doesn't exist in the static markup at all).
function initSlidingIndicators() {
  var SELECTORS = ['#navTabs', '#libTabs', '#formatPills'];
  var state = {};
  function moveFor(sel) {
    var container = document.querySelector(sel);
    var st = state[sel];
    if (!container || !st) return;
    var active = container.querySelector('.active');
    if (!active) { st.indicator.style.opacity = '0'; return; }
    st.indicator.style.opacity = '1';
    st.indicator.style.width = active.offsetWidth + 'px';
    st.indicator.style.left = active.offsetLeft + 'px';
  }
  function attach(sel) {
    var container = document.querySelector(sel);
    if (!container) return;
    var st = state[sel];
    if (!st || !container.contains(st.indicator)) {
      var indicator = document.createElement('span');
      indicator.className = 'tab-indicator';
      container.appendChild(indicator);
      state[sel] = { indicator: indicator };
    }
    if (!container._indicatorObserved) {
      container._indicatorObserved = true;
      new MutationObserver(function () { requestAnimationFrame(function () { attach(sel); }); })
        .observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }
    moveFor(sel);
  }
  function scan() { SELECTORS.forEach(attach); }
  scan();
  window.addEventListener('resize', scan);
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
}

// ── FAQ accordion: animate height instead of native <details> snap ──────
function initFaqAnimation() {
  var items = document.querySelectorAll('.faq-item');
  if (!items.length) return;
  items.forEach(function (item) {
    var summary = item.querySelector('summary');
    var content = item.querySelector('p');
    if (!summary || !content) return;
    content.style.overflow = 'hidden';
    content.style.transition = 'max-height 0.25s ease, opacity 0.25s ease';
    content.style.maxHeight = item.hasAttribute('open') ? content.scrollHeight + 'px' : '0px';
    content.style.opacity = item.hasAttribute('open') ? '1' : '0';
    summary.addEventListener('click', function (e) {
      e.preventDefault();
      var willOpen = !item.hasAttribute('open');
      if (willOpen) {
        item.setAttribute('open', '');
        requestAnimationFrame(function () {
          content.style.maxHeight = content.scrollHeight + 'px';
          content.style.opacity = '1';
        });
      } else {
        content.style.maxHeight = content.scrollHeight + 'px';
        requestAnimationFrame(function () {
          content.style.maxHeight = '0px';
          content.style.opacity = '0';
        });
        setTimeout(function () { item.removeAttribute('open'); }, 260);
      }
    });
  });
}

// ── Scroll reveal for [data-reveal] sections ─────────────────────────────
function initScrollReveal() {
  var els = document.querySelectorAll('[data-reveal]');
  if (!els.length) return;
  if (REDUCED_MOTION) { els.forEach(function (el) { el.classList.add('is-visible'); }); return; }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); io.unobserve(entry.target); }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
  els.forEach(function (el) { io.observe(el); });
}

// ── Chapter scrollspy dots, auto-built from .chapter[id] sections ───────
function initChapterDots() {
  var chapters = Array.prototype.slice.call(document.querySelectorAll('main .chapter[id]'));
  if (!chapters.length) return;
  var nav = document.createElement('nav');
  nav.className = 'chapterdots';
  nav.setAttribute('aria-label', 'Chapter navigation');
  nav.innerHTML = chapters.map(function (ch) {
    var label = ch.querySelector('.chapter-title');
    return '<a href="#' + ch.id + '" data-target="' + ch.id + '" aria-label="' + (label ? label.textContent : ch.id) + '"><span></span></a>';
  }).join('');
  document.body.appendChild(nav);
  var links = nav.querySelectorAll('a');
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var link = nav.querySelector('a[data-target="' + entry.target.id + '"]');
      if (!link || !entry.isIntersecting) return;
      links.forEach(function (l) { l.classList.remove('active'); });
      link.classList.add('active');
    });
  }, { rootMargin: '-45% 0px -45% 0px' });
  chapters.forEach(function (ch) { io.observe(ch); });
}

// ── Stat-pill count-up ───────────────────────────────────────────────────
function initCountUp() {
  var els = document.querySelectorAll('[data-countup]');
  if (!els.length) return;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      io.unobserve(entry.target);
      var target = parseInt(entry.target.getAttribute('data-countup'), 10) || 0;
      if (REDUCED_MOTION) { entry.target.textContent = target; return; }
      var start = performance.now(), dur = 900;
      function step(now) {
        var p = Math.min(1, (now - start) / dur);
        var eased = 1 - Math.pow(1 - p, 3);
        entry.target.textContent = Math.round(target * eased);
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }, { threshold: 0.6 });
  els.forEach(function (el) { io.observe(el); });
}

// ── Typewriter-cycle the Connect chapter's chat mockups ──────────────────
function typeText(el, text) {
  (function erase() {
    if (el.textContent.length > 0) {
      el.textContent = el.textContent.slice(0, -1);
      setTimeout(erase, 12);
    } else {
      var out = '';
      (function type() {
        if (out.length < text.length) {
          out += text[out.length];
          el.textContent = out;
          setTimeout(type, 22);
        }
      })();
    }
  })();
}
function initThreadTypewriter() {
  if (REDUCED_MOTION) return;
  var msgs = document.querySelectorAll('#connect .thread .msg');
  if (!msgs.length) return;
  var VARIANTS = [
    ['okay the ch 94 cliffhanger is unforgivable', 'who else screamed at that panel', 'ch 94 broke me a little ngl'],
    ['📚 sent a recommendation — Dandadan', '📚 sent a recommendation — Frieren', '📚 sent a recommendation — Vinland Saga'],
    ['[spoiler tagged] no because—', '[spoiler tagged] wait did you see that', '[spoiler tagged] I need to talk about this'],
  ];
  msgs.forEach(function (el, i) {
    var lines = VARIANTS[i];
    if (!lines) return;
    var idx = 0;
    setInterval(function () {
      idx = (idx + 1) % lines.length;
      typeText(el, lines[idx]);
    }, 4200 + i * 700);
  });
}

// ── Showcase screenshot shimmer while the image loads ────────────────────
function initShowcaseShimmer() {
  document.querySelectorAll('.shot-frame').forEach(function (frame) {
    var img = frame.querySelector('img');
    if (!img) return;
    if (img.complete) return;
    frame.classList.add('img-loading');
    img.addEventListener('load', function () { frame.classList.remove('img-loading'); }, { once: true });
    img.addEventListener('error', function () { frame.classList.remove('img-loading'); }, { once: true });
  });
}

// ── Notify-form success checkmark ────────────────────────────────────────
function initNotifyCheckmark() {
  var msg = document.getElementById('notifyMsg');
  if (!msg) return;
  new MutationObserver(function () {
    if (msg.classList.contains('ok') && msg.textContent && !msg.querySelector('.notify-check')) {
      msg.insertAdjacentHTML('afterbegin', '<svg class="notify-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>');
    }
  }).observe(msg, { attributes: true, attributeFilter: ['class'], childList: true });
}

// ── Stacking toast utility — used by the catalog's real notification bell,
// separate from index.html's inline notify-msg (which is a single fixed
// element, not a stack).
function showToast(message, opts) {
  opts = opts || {};
  var stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    stack.setAttribute('aria-live', 'polite');
    document.body.appendChild(stack);
  }
  var toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = (opts.icon || '') + '<span>' + message + '</span>';
  stack.appendChild(toast);
  requestAnimationFrame(function () { toast.classList.add('show'); });
  var dur = opts.duration || 4200;
  setTimeout(function () {
    toast.classList.remove('show');
    setTimeout(function () { toast.remove(); }, 300);
  }, dur);
  return toast;
}

// ── Skip-to-content link (inserted as the true first child, after the
// ambient blobs, so it's still the first *focusable* element on the page)
function initSkipLink() {
  if (document.querySelector('.skip-link')) return;
  var target = document.querySelector('main') || document.getElementById('app');
  if (!target) return;
  if (!target.id) target.id = 'main-content';
  var link = document.createElement('a');
  link.className = 'skip-link';
  link.href = '#' + target.id;
  link.textContent = 'Skip to content';
  document.body.insertBefore(link, document.body.firstChild);
}

// ── Hidden 2-5am easter egg, referencing the real "Sunrise Reader"/"Can't
// Sleep" hidden badges in badges.js rather than inventing a new mechanic
function initLateNightEasterEgg() {
  var hour = new Date().getHours();
  if (hour < 2 || hour >= 5) return;
  if (sessionStorage.getItem('mr_latenight_shown')) return;
  sessionStorage.setItem('mr_latenight_shown', '1');
  if (typeof showToast !== 'function') return;
  showToast('Burning the midnight oil? There’s a badge for that.', { icon: '🌙 ' });
}

// ── Static mascot slots (download section, 404 page) ─────────────────────
function initMascotSlots() {
  document.querySelectorAll('.mascot-slot').forEach(function (el) {
    if (el.dataset.mascotDone) return;
    el.dataset.mascotDone = '1';
    el.innerHTML = MASCOT_SVG;
  });
}

// ── Mascot for genuinely-empty states (not error states) ─────────────────
function initMascotEmptyStates() {
  var SKIP_WORDS = ["couldn't", 'failed', 'not found'];
  function decorate(el) {
    if (el.dataset.mascotDone) return;
    var text = (el.textContent || '').toLowerCase();
    if (SKIP_WORDS.some(function (w) { return text.indexOf(w) !== -1; })) return;
    el.dataset.mascotDone = '1';
    el.insertAdjacentHTML('afterbegin', '<div class="mascot-pop">' + MASCOT_SVG + '</div>');
  }
  document.querySelectorAll('.statemsg, .lib-signedout').forEach(decorate);
  var appEl = document.getElementById('app');
  if (appEl) {
    new MutationObserver(function () {
      appEl.querySelectorAll('.statemsg, .lib-signedout').forEach(decorate);
    }).observe(appEl, { childList: true, subtree: true });
  }
}

// ── Offline shell for the marketing site + catalog (see /sw.js) ─────────
function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  });
}

document.addEventListener('DOMContentLoaded', function () {
  initAmbientFX();
  initCursorGlow();
  initSkipLink();
  initLateNightEasterEgg();
  initHeroFX();
  initPosterTilt();
  initSlidingIndicators();
  initFaqAnimation();
  initScrollReveal();
  initChapterDots();
  initCountUp();
  initThreadTypewriter();
  initShowcaseShimmer();
  initNotifyCheckmark();
  initMascotSlots();
  initMascotEmptyStates();
  initServiceWorker();
});
