// Shared motion/interaction layer — paired with /assets/motion.css.
// Every init function feature-detects its own target elements, so this
// file is safe to load on every page (index, catalog, features, about,
// privacy, terms, 404) even though most pages only use a handful of these.
// The catalog page re-renders big chunks of #app via innerHTML on every
// route change, so anything that touches catalog markup uses event
// delegation or a MutationObserver instead of one-time querySelectorAll.

var REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

var MASCOT_SVG =
  '<svg viewBox="0 0 120 120" aria-hidden="true" style="width:100%;height:100%;">' +
    '<defs>' +
      '<radialGradient id="mascotBody" cx="35%" cy="30%" r="80%">' +
        '<stop offset="0%" stop-color="#B18CFF"/><stop offset="100%" stop-color="#6B46F0"/>' +
      '</radialGradient>' +
    '</defs>' +
    '<ellipse cx="60" cy="100" rx="30" ry="6" fill="#000" opacity="0.12"/>' +
    '<path d="M60 14c22 0 36 16 36 38 0 20-10 34-14 40-2 3-6 4-9 2-4-3-8-3-13-3s-9 0-13 3c-3 2-7 1-9-2-4-6-14-20-14-40 0-22 14-38 36-38z" fill="url(#mascotBody)"/>' +
    '<circle cx="46" cy="52" r="5.5" fill="#16121F"/><circle cx="74" cy="52" r="5.5" fill="#16121F"/>' +
    '<circle cx="44" cy="50" r="1.8" fill="#fff"/><circle cx="72" cy="50" r="1.8" fill="#fff"/>' +
    '<path d="M50 66c3 4 17 4 20 0" stroke="#16121F" stroke-width="3" fill="none" stroke-linecap="round"/>' +
    '<ellipse cx="38" cy="62" rx="6" ry="4" fill="#FF7ED4" opacity="0.55"/>' +
    '<ellipse cx="82" cy="62" rx="6" ry="4" fill="#FF7ED4" opacity="0.55"/>' +
    '<g transform="translate(60 92) rotate(-8)">' +
      '<rect x="-20" y="-7" width="40" height="14" rx="2" fill="#F6F3FB" stroke="#5B2FD6" stroke-width="1.5"/>' +
      '<line x1="0" y1="-7" x2="0" y2="7" stroke="#5B2FD6" stroke-width="1.5"/>' +
      '<line x1="-13" y1="-3" x2="-4" y2="-3" stroke="#C4A8FF" stroke-width="1.5"/>' +
      '<line x1="-13" y1="1" x2="-4" y2="1" stroke="#C4A8FF" stroke-width="1.5"/>' +
      '<line x1="4" y1="-3" x2="13" y2="-3" stroke="#C4A8FF" stroke-width="1.5"/>' +
      '<line x1="4" y1="1" x2="13" y2="1" stroke="#C4A8FF" stroke-width="1.5"/>' +
    '</g>' +
    '<path d="M96 30l2.4 6.4L104 39l-5.6 2.6L96 48l-2.4-6.4L88 39l5.6-2.6z" fill="#FFD34D"/>' +
  '</svg>';

// ── Ambient background (blobs + grain) — skipped on dense legal-text pages
function initAmbientFX() {
  if (document.querySelector('.legal')) return;
  var blobs = document.createElement('div');
  blobs.className = 'fx-blobs';
  blobs.setAttribute('aria-hidden', 'true');
  blobs.innerHTML = '<span></span><span></span><span></span>';
  var grain = document.createElement('div');
  grain.className = 'fx-grain';
  grain.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(grain, document.body.firstChild);
  document.body.insertBefore(blobs, document.body.firstChild);
}

// ── Hero: cursor spotlight + scroll parallax on the star mark ───────────
function initHeroFX() {
  var hero = document.querySelector('.hero');
  if (!hero) return;
  if (!REDUCED_MOTION) {
    var spot = document.createElement('div');
    spot.className = 'fx-spotlight';
    hero.appendChild(spot);
    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      spot.style.setProperty('--sx', (e.clientX - r.left) + 'px');
      spot.style.setProperty('--sy', (e.clientY - r.top) + 'px');
      spot.style.opacity = '1';
    });
    hero.addEventListener('pointerleave', function () { spot.style.opacity = '0'; });
  }
  var markWrap = document.querySelector('.hero-mark-wrap');
  if (markWrap && !REDUCED_MOTION) {
    window.addEventListener('scroll', function () {
      var y = window.scrollY || 0;
      markWrap.style.transform = 'translateY(' + Math.min(y * 0.12, 40) + 'px)';
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

document.addEventListener('DOMContentLoaded', function () {
  initAmbientFX();
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
});
