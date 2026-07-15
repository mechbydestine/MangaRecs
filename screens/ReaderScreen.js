import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  Modal, Animated, ScrollView, TextInput, Dimensions, Alert, ActivityIndicator, Image, FlatList, Platform, Share, Pressable,
  useWindowDimensions, PanResponder,
} from 'react-native';
import { PinchGestureHandler, PanGestureHandler, State as GHState } from 'react-native-gesture-handler';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { TOP_SITES, buildSearchUrl, getDefaultSite, getReadingSiteForLang } from '../utils/mangaSearch';
import { getFaviconUrl } from '../utils/mangaCovers';
import { clearResumeCache, buildDirectUrl, AUTO_NAV_SEARCH_JS, AUTO_NAV_CHAPTER_JS, HOMEPAGE_DETECT_JS, SEARCH_WATCHDOG_JS, MANGADEX_CHAPTER_NAV_JS } from '../utils/siteResolver';
import { searchMangaDex, getMangaChaptersCached, getChapterPages } from '../utils/mangaDexApi';
import { useProfile } from '../utils/ProfileContext';
import { supabase } from '../supabase';
import { updateDailyLog, setLastRead, incrementSharesCount, localDateKey, syncLibraryWrite } from '../utils/readerUtils';
import { PRESETS as AMBIENCE_PRESETS, play as ambiencePlay, stop as ambienceStop, setVolume as ambienceSetVolume, subscribe as ambienceSubscribe, getState as ambienceGetState } from '../utils/ambiencePlayer';
import { useKeepAwake } from 'expo-keep-awake';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useTheme } from '../utils/ThemeContext';

const SAVED_SITES_KEY  = '@mangarecs/savedSites';
const LAST_SITE_KEY    = '@mangarecs/lastSite';
const LIBRARY_KEY      = '@mangarecs_saved';
const RESUME_KEY_PFX   = '@mangarecs/resume/';
const FORCE_DARK_KEY   = '@mangarecs/forceDark';
const DIMMER_KEY       = '@mangarecs/dimmer';
const SCROLL_SPEED_KEY = '@mangarecs/autoScrollSpeed';
const LANDSCAPE_KEY    = '@mangarecs/allowLandscape';
const READER_MODE_KEY  = '@mangarecs/readerMode'; // must match SettingsScreen
const PAGE_ANIM_KEY    = '@mangarecs/pageAnim';   // must match SettingsScreen
const CHAPTERS_DIR    = FileSystem.documentDirectory + 'chapters/';
const CHAPTER_ROW_H = 62;

// ── Site list ──────────────────────────────────────────────────────────────

const MANGA_SITES = [
  { name: 'MangaDex',         url: 'https://mangadex.org',                    emoji: '📚', featured: true },
  { name: 'MangaFire',        url: 'https://mangafire.to',                    emoji: '🔥', featured: true },
  { name: 'Asura Scans',      url: 'https://asurascans.com',                  emoji: '⚡', featured: true },
  { name: 'Webtoon',          url: 'https://www.webtoons.com',                emoji: '🎨', featured: true },
  { name: 'Weeb Central',     url: 'https://weebcentral.com',                 emoji: '⚡', featured: true },
  { name: 'Manga Plus',       url: 'https://mangaplus.shueisha.co.jp',        emoji: '⭐', featured: true },
  { name: 'INKR',             url: 'https://inkr.com',                        emoji: '🖊️' },
  { name: 'Pixiv Comics',     url: 'https://comic.pixiv.net',                 emoji: '🎨' },
  { name: 'K MANGA',          url: 'https://kmanga.kodansha.com',             emoji: '🅺' },
  { name: 'Bookwalker',       url: 'https://bookwalker.jp',                   emoji: '📚' },
  { name: 'Rakuten Kobo',     url: 'https://www.kobo.com',                    emoji: '📱' },
  { name: 'MangaPlaza',       url: 'https://mangaplaza.com',                  emoji: '🏰' },
  { name: 'Coolmic',          url: 'https://coolmic.me',                      emoji: '❄️' },
];

const FEATURED_SITES = MANGA_SITES.filter((s) => s.featured);

// ── Mode icons ────────────────────────────────────────────────────────────

function WebtoonIcon({ active }) {
  const arrowY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (active) {
      Animated.loop(Animated.sequence([
        Animated.timing(arrowY, { toValue: 3, duration: 600, useNativeDriver: true }),
        Animated.timing(arrowY, { toValue: 0, duration: 600, useNativeDriver: true }),
      ])).start();
    } else { arrowY.setValue(0); }
  }, [active]);
  return (
    <View style={[modeIconStyles.webtoonBox, { borderColor: active ? '#7B5CFF' : '#5C5B63' }]}>
      <Animated.View style={{ transform: [{ translateY: arrowY }] }}>
        <View style={[modeIconStyles.triangleDown, { borderTopColor: active ? '#7B5CFF' : '#5C5B63' }]} />
      </Animated.View>
    </View>
  );
}

function MangaIcon({ active }) {
  const arrowX = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (active) {
      Animated.loop(Animated.sequence([
        Animated.timing(arrowX, { toValue: 3, duration: 600, useNativeDriver: true }),
        Animated.timing(arrowX, { toValue: 0, duration: 600, useNativeDriver: true }),
      ])).start();
    } else { arrowX.setValue(0); }
  }, [active]);
  return (
    <View style={modeIconStyles.mangaRow}>
      <View style={[modeIconStyles.mangaBox, { borderColor: active ? '#7B5CFF' : '#5C5B63' }]} />
      <Animated.View style={{ transform: [{ translateX: arrowX }] }}>
        <View style={[modeIconStyles.triangleRight, { borderLeftColor: active ? '#7B5CFF' : '#5C5B63' }]} />
      </Animated.View>
    </View>
  );
}

const READER_MODES = [
  { id: 'webtoon', label: 'Webtoon', desc: 'Scroll down', Icon: WebtoonIcon },
  { id: 'manga',   label: 'Manga',   desc: 'Tap sides',   Icon: MangaIcon },
];

// ── Ambience preset button — springs on tap, icon pulses while playing ─────

function AmbienceButton({ preset, active, onPress }) {
  const { isDark } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  // Border always carries the preset's color so each sound is identifiable at
  // a glance — dimmed while idle, full-strength while playing
  const idleBg = isDark
    ? { backgroundColor: '#0D0D0F', borderColor: `${preset.color}55` }
    : { backgroundColor: 'rgba(0,0,0,0.04)', borderColor: `${preset.color}66` };

  // While the sound is playing the icon comes alive: it pulses, bobs and
  // gently sways so the active preset is unmistakable at a glance
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (active) {
      const pulseLoop = Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1.18, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0,  duration: 700, useNativeDriver: true }),
      ]));
      const bobLoop = Animated.loop(Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 850, useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 850, useNativeDriver: true }),
      ]));
      pulseLoop.start();
      bobLoop.start();
      return () => { pulseLoop.stop(); bobLoop.stop(); pulse.setValue(1); bob.setValue(0); };
    }
    pulse.setValue(1);
    bob.setValue(0);
  }, [active]);

  const bobY  = bob.interpolate({ inputRange: [0, 1], outputRange: [1.5, -2.5] });
  const sway  = bob.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-9deg', '0deg', '9deg'] });

  function handlePress() {
    Animated.sequence([
      Animated.spring(scale, { toValue: 0.88, useNativeDriver: true, speed: 80, bounciness: 0 }),
      Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 20, bounciness: 10 }),
    ]).start();
    onPress();
  }

  return (
    <Animated.View style={{ flex: 1, marginHorizontal: 4, transform: [{ scale }] }}>
      <TouchableOpacity
        style={[styles.ambienceBtn, idleBg, active && { borderColor: preset.color, backgroundColor: `${preset.color}22` }]}
        onPress={handlePress}
        activeOpacity={0.75}>
        <Animated.View style={{ transform: [{ scale: pulse }, { translateY: bobY }, { rotate: sway }] }}>
          <Ionicons
            name={active ? (preset.iconActive || preset.icon) : preset.icon}
            size={20}
            color={active ? preset.color : '#9B9AA3'}
          />
        </Animated.View>
        <Text style={[styles.ambienceBtnLabel, active && { color: preset.color }]}>{preset.label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}



// ── Ambience volume slider — tap anywhere or drag the thumb to scrub ────────
// Controls the app's ambience volume (relative to the phone's media volume —
// the hardware buttons still govern overall loudness).

function AmbienceVolumeSlider({ volume, color }) {
  const trackWRef  = useRef(0);
  const grabXRef   = useRef(0);
  const volRef     = useRef(volume);
  volRef.current = volume;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const w = trackWRef.current;
        if (w <= 0) return;
        grabXRef.current = e.nativeEvent.locationX;
        ambienceSetVolume(grabXRef.current / w, false);
      },
      onPanResponderMove: (_, g) => {
        const w = trackWRef.current;
        if (w <= 0) return;
        ambienceSetVolume((grabXRef.current + g.dx) / w, false);
      },
      onPanResponderRelease: () => { ambienceSetVolume(volRef.current); },
      onPanResponderTerminate: () => { ambienceSetVolume(volRef.current); },
    })
  ).current;

  const pct = Math.round(volume * 100);
  return (
    <View
      style={styles.ambienceVolSlider}
      onLayout={(e) => { trackWRef.current = e.nativeEvent.layout.width; }}
      {...pan.panHandlers}>
      <View style={styles.ambienceVolTrack}>
        <View style={[styles.ambienceVolFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <View style={[styles.ambienceVolThumb, { left: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

// ── Ad network patterns — used in both onShouldStartLoadWithRequest and onOpenWindow ──
const AD_NETWORK_PATTERNS = [
  'doubleclick','googlesyndication','googleadservices','pagead2','adnxs',
  'amazon-adsystem','rubiconproject','openx.net','pubmatic','criteo',
  'taboola','outbrain','popads','popcash','trafficjunky','exoclick',
  'juicyads','plugrush','ero-advertising','adsterra','hilltopads',
  'adcash','propellerads','adfly','adf.ly','shorte.st','yllix',
  'adspyglass','clickadu','richpush','pushground','monetag','mondiad',
  'evadav','galaksion','adskeeper','realsrv','go.ad2up','oclasrv',
  'bidgear','smartadserver','appnexus','yieldmanager','undertone',
  'adsrvr','scorecardresearch','quantserve','chartbeat',
  'setupad','33across','vidoomy','infolinks','mgid','revcontent',
  'ligatus','media.net','zedo','tribal','cdn.carbonads','advertising.com',
  'exosrv','magsrv','tsyndicate','trafficstars','exdynsrv','adtng',
  'nitropay','bidvertiser','deloplen','glersakr','onclicka','pemsrv',
  'venatusmedia','a-ads.com','coinzilla','cointraffic','adoperator',
  'creative-serving','betweendigital','tagcade','loopme','vlitag',
];

// ── Injected JS ───────────────────────────────────────────────────────────

const AD_BLOCK_JS = `
(function() {
  if (window.__inkAB) return true;
  window.__inkAB = true;

  // ── 1. Ad domain list (network + DOM) ────────────────────────────────────
  var AD = [
    'doubleclick','googlesyndication','googleadservices','pagead2','adnxs',
    'amazon-adsystem','rubiconproject','openx.net','pubmatic','criteo',
    'taboola','outbrain','popads','popcash','trafficjunky','exoclick',
    'juicyads','plugrush','ero-advertising','adsterra','hilltopads',
    'adcash','propellerads','adfly','adf.ly','shorte.st','yllix',
    'adspyglass','clickadu','richpush','pushground','monetag','mondiad',
    'evadav','galaksion','adskeeper','realsrv','go.ad2up','oclasrv',
    'bidgear','smartadserver','appnexus','yieldmanager','undertone',
    'adsrvr','scorecardresearch','quantserve','chartbeat',
    'setupad','33across','vidoomy','infolinks','mgid','revcontent',
    'ligatus','averdivertising','media.net','zedo','tribal',
    'exosrv','magsrv','tsyndicate','trafficstars','exdynsrv','adtng',
    'nitropay','bidvertiser','deloplen','glersakr','onclicka','pemsrv',
    'venatusmedia','a-ads.com','coinzilla','cointraffic','adoperator',
    'creative-serving','betweendigital','tagcade','loopme','vlitag',
  ];
  function isAd(u) {
    var s = (u || '').toLowerCase();
    return AD.some(function(d) { return s.indexOf(d) >= 0; });
  }

  // ── 2. CSS injection — prevents ads painting before JS removal runs ───────
  try {
    var CSS_RULES = [
      // Google / programmatic ads
      'ins.adsbygoogle,.adsbygoogle,[id^="google_ads"],[id*="div-gpt"],[class*="gpt-ad"]',
      // Generic ad id/class patterns
      '[id^="ad_"],[id^="ads_"],[id^="ad-"],[id^="ads-"]',
      '[class^="ad_"],[class^="ads_"],[class^="ad-"],[class^="ads-"]',
      // Popups / modals / overlays
      '[id*="popup"],[class*="popup-wrap"],[class*="popup-modal"],[class*="popup-overlay"]',
      '[class*="modal-overlay"],[class*="modal-backdrop"],[class*="modal-bg"]',
      '[id*="interstitial"],[class*="interstitial"]',
      '.pum-overlay,.pum-container,.mfp-bg,.mfp-wrap',
      '.fancybox-overlay,.fancybox-bg,.featherlight-overlay',
      // Cookie / consent / GDPR bars
      '[class*="cookie-notice"],[class*="cookie-bar"],[class*="cookie-banner"],[id*="cookie-"]',
      '[class*="gdpr"],[id*="gdpr"],[class*="consent-bar"],[class*="consent-popup"]',
      // Push notification prompts
      '[class*="push-notif"],[class*="push-prompt"],[id*="push-notif"],[class*="push-sub"]',
      // Email / newsletter popups
      '[class*="subscribe-popup"],[class*="newsletter-popup"],[class*="email-popup"]',
      '[class*="optinmonster"],[class*="sumo-popup"]',
      // Sticky / floating ad banners
      '[class*="sticky-ad"],[class*="ad-sticky"],[class*="floating-ad"],[class*="fixed-ad"]',
      '[class*="overlay-ad"],[class*="ad-overlay"],[class*="ad-float"],[class*="ad-fixed"]',
      // Common named ad containers
      '#ad-container,#ads-container,.adtop,.ad-banner,#carbonads,.carbon-ads',
      // Notification bars (commonly ad wrappers)
      '[class*="notification-bar"],[class*="notif-bar"],[class*="alert-bar"]',
    ].join(',');
    var st = document.createElement('style');
    st.id = '__inkABStyle';
    st.textContent =
      CSS_RULES + '{display:none!important;visibility:hidden!important;pointer-events:none!important;opacity:0!important;}' +
      // Ensure popups cannot lock page scroll
      'body,html{overflow:auto!important;}';
    (document.head || document.documentElement).appendChild(st);
  } catch(_) {}

  // ── 3. DOM nuker ─────────────────────────────────────────────────────────
  function rm(el) { try { el && el.parentNode && el.parentNode.removeChild(el); } catch(_) {} }

  var SEL = [
    'iframe[src*="ads"]','iframe[src*="doubleclick"]','iframe[src*="googlesyndication"]',
    'iframe[src*="popads"]','iframe[src*="exoclick"]','iframe[src*="adsterra"]',
    'iframe[src*="hilltopads"]','iframe[src*="trafficjunky"]','iframe[src*="popcash"]',
    '.adsbygoogle','ins.adsbygoogle',
    '[id*="popup"]','[class*="popup-wrap"]','[class*="popup-overlay"]',
    '[id*="interstitial"]','[class*="interstitial"]',
    '.pum-overlay','.mfp-bg','.mfp-wrap','.fancybox-overlay',
    '[class*="cookie-bar"],[class*="cookie-notice"],[id*="cookie-"]',
    '[class*="gdpr"],[id*="gdpr"]',
    '#ad-container','#ads-container','.adtop',
    '[class*="sticky-ad"],[class*="floating-ad"],[class*="ad-overlay"]',
    '[class*="push-notif"],[class*="push-prompt"]',
    '[class*="subscribe-popup"],[class*="newsletter-popup"]',
  ];

  // Removes fixed/sticky overlays using z-index + size heuristics.
  // Catches full-screen popups that don't have recognisable class names.
  function nukeOverlays() {
    try {
      var vw = window.innerWidth, vh = window.innerHeight;
      document.querySelectorAll('*').forEach(function(el) {
        if (!el || !el.parentNode) return;
        var cs; try { cs = window.getComputedStyle(el); } catch(_) { return; }
        var pos = cs.position;
        if (pos !== 'fixed' && pos !== 'absolute' && pos !== 'sticky') return;
        var zi = parseInt(cs.zIndex, 10) || 0;
        if (zi < 50) return;  // low z-index — likely normal page layout
        var h = el.offsetHeight, w = el.offsetWidth;
        var cls = ((el.className || '') + ' ' + (el.id || '')).toLowerCase();
        // Never touch app reader navigation / progress / chapter UI
        var isUI = /chapter|reader|page.?nav|topbar|toolbar|progress|controls|prev|next|volume/.test(cls);
        if (isUI) return;
        // Never touch the site's own header/nav — real headers use these tags/roles,
        // ad banners never do. Without this, a sticky top nav (menu, logo, search,
        // sign-in) matches the same fixed+short+wide shape as an ad strip below.
        var tag = el.tagName;
        var role = (el.getAttribute && el.getAttribute('role')) || '';
        if (tag === 'HEADER' || tag === 'NAV' || role === 'banner' || role === 'navigation') return;
        // Full-screen dimmer / backdrop / interstitial (covers >55% of viewport).
        // A real chapter-list / settings drawer built as a full-screen fixed panel
        // matches this same shape, so spare anything with enough interactive
        // content to be real UI rather than a single ad creative.
        if (h > vh * 0.55 && w > vw * 0.55) {
          var interactiveFull = el.querySelectorAll('a,button,input,select').length;
          if (interactiveFull >= 4) return;
          rm(el);
          return;
        }
        // Sticky banner strip (height < 140px, wide enough to be a banner)
        if (h > 0 && h < 140 && w > vw * 0.25) {
          // Real nav bars pack several links/buttons (menu, search, settings, sign-in);
          // ad banner strips are almost always a single creative with none of that,
          // so require it to be docked to the top or bottom edge and look like
          // navigation before sparing it.
          var rect = el.getBoundingClientRect();
          var interactive = el.querySelectorAll('a,button').length;
          var docked = rect.top <= 2 || rect.bottom >= vh - 2;
          if (docked && interactive >= 2) return;
          rm(el);
          return;
        }
      });
    } catch(_) {}
  }

  function nuke() {
    // Remove known-pattern elements
    SEL.forEach(function(s) { try { document.querySelectorAll(s).forEach(rm); } catch(_) {} });
    // Remove scripts / iframes loaded from ad networks
    document.querySelectorAll('script[src],iframe[src]').forEach(function(el) {
      if (isAd(el.src || el.getAttribute('src'))) rm(el);
    });
    nukeOverlays();
    // Unlock body scroll (popup libraries often set overflow:hidden)
    try {
      if (document.body) {
        var bs = document.body.style;
        if (bs.overflow === 'hidden') bs.overflow = '';
        if (bs.overflowY === 'hidden') bs.overflowY = '';
        document.body.classList.remove('overflow-hidden','noscroll','no-scroll','modal-open','popup-open');
      }
    } catch(_) {}
  }

  nuke();
  setInterval(nuke, 1500);

  // ── 4. MutationObserver — catch dynamically injected ads in real-time ─────
  try {
    var obs = new MutationObserver(function(muts) {
      for (var i = 0; i < muts.length; i++) {
        var nodes = muts[i].addedNodes;
        for (var j = 0; j < nodes.length; j++) {
          var node = nodes[j];
          if (node.nodeType !== 1) continue;
          var tag = (node.tagName || '').toLowerCase();
          if ((tag === 'script' || tag === 'iframe') && isAd(node.src || node.getAttribute('src'))) {
            rm(node); continue;
          }
          var c = ((node.className || '') + ' ' + (node.id || '')).toLowerCase();
          if (/popup|interstitial|pum-overlay|mfp-bg|fancybox-overlay|cookie-notice|gdpr|subscribe-popup|push-notif|push-prompt|modal-backdrop/.test(c)) {
            rm(node);
          }
        }
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  } catch(_) {}

  // ── 5. Block window.open / alert / confirm / prompt ───────────────────────
  // defineProperty(writable:false, configurable:false) — ad scripts commonly do
  // "delete window.open" to restore the native popup; a plain assignment loses.
  function lockFn(name, fn) {
    try {
      Object.defineProperty(window, name, { value: fn, writable: false, configurable: false });
    } catch (_) {
      try { window[name] = fn; } catch (_) {}
    }
  }
  lockFn('alert',   function() {});
  lockFn('confirm', function() { return false; });
  lockFn('prompt',  function() { return null; });
  lockFn('open', function(url) {
    if (!url) return null;
    var u = String(url);
    if (!u.startsWith('http') || isAd(u)) return null;
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'openWindow', url: u }));
    }
    return null;
  });

  true;
})();
`;

const TAP_TOGGLE_JS = `
(function() {
  var sx=0,sy=0,moved=false;
  document.addEventListener('touchstart',function(e){
    if(!e.touches||!e.touches[0])return;
    sx=e.touches[0].clientX; sy=e.touches[0].clientY; moved=false;
  },{passive:true});
  document.addEventListener('touchmove',function(e){
    if(!e.touches||!e.touches[0])return;
    if(Math.abs(e.touches[0].clientX-sx)>8||Math.abs(e.touches[0].clientY-sy)>8){
      moved=true;
    }
  },{passive:true});
  document.addEventListener('touchend',function(e){
    if(moved)return;
    var t=e.target;
    if(t.closest&&t.closest('a,button,input,textarea,select,[role="button"]'))return;
    if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage('toggleUI');
  },{passive:true});
  true;
})();
`;

// Force-dark for websites: inverts page colors but counter-inverts images/video
// so manga pages render normally. Skips pages that are already dark — inverting
// those would flash them white. Idempotent — safe to re-inject on every load.
function buildForceDarkJS(enable) {
  return `
(function(){
  var st = document.getElementById('__inkForceDark');
  function pageIsDark() {
    try {
      var el = document.body, bg = null;
      while (el) {
        var c = window.getComputedStyle(el).backgroundColor;
        if (c && c !== 'transparent' && c.indexOf('rgba(0, 0, 0, 0)') !== 0) { bg = c; break; }
        el = el.parentElement;
      }
      if (!bg) return false;
      var m = bg.match(/rgba?\\(([^)]+)\\)/);
      if (!m) return false;
      var p = m[1].split(',').map(parseFloat);
      if (p.length >= 4 && p[3] === 0) return false;
      var lum = 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
      return lum < 80;
    } catch (_) { return false; }
  }
  if (${enable ? 'true' : 'false'} && !pageIsDark()) {
    if (!st) {
      st = document.createElement('style');
      st.id = '__inkForceDark';
      // Pre-invert background must be LIGHT so it renders dark after inversion
      st.textContent =
        'html{filter:invert(1) hue-rotate(180deg)!important;background-color:#f2f2f2!important;}' +
        'img,video,canvas,picture,svg,[style*="background-image"]{filter:invert(1) hue-rotate(180deg)!important;}';
      (document.head || document.documentElement).appendChild(st);
    }
  } else if (st) {
    st.parentNode.removeChild(st);
  }
  true;
})();
`;
}

const EXTRACT_PAGE_INFO_JS = `
(function(){
  var t=document.title||'';
  var h=document.querySelector('h1,h2,.title,.series-title,.manga-title,[class*="series"],[class*="manga-name"]');
  if(window.ReactNativeWebView){
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'pageInfo',title:t,heading:h?h.innerText.trim():'',url:window.location.href}));
  }
  true;
})();
`;

const COLLECT_IMAGES_JS = `
(function(){
  var srcs=[];
  var SKIP=/logo|avatar|icon|banner|sprite|button|thumb|favicon|star|rating|ads?[\\/._]/i;
  document.querySelectorAll('img,image,[data-src],[data-lazy],[data-original]').forEach(function(img){
    if(img.tagName==='image')return; // SVG image element, skip
    var src=img.src||img.dataset.src||img.dataset.lazySrc||img.dataset.original||
            img.getAttribute('data-original')||img.getAttribute('data-lazy')||
            img.getAttribute('data-url')||img.getAttribute('data-bg')||'';
    if(!src||!src.startsWith('http')||SKIP.test(src))return;
    var w=img.naturalWidth||img.width||img.clientWidth||0;
    var h=img.naturalHeight||img.height||img.clientHeight||0;
    var hasLazy=img.hasAttribute('data-src')||img.hasAttribute('data-lazy')||
                img.hasAttribute('data-original')||img.hasAttribute('loading')||
                img.hasAttribute('data-url');
    if(hasLazy||(w>100&&h>150))srcs.push(src);
  });
  // Also pick up images inside known reader containers that may have been missed
  document.querySelectorAll('[class*="page"] img,[class*="reader"] img,[class*="chapter"] img,.images img,.reading-content img').forEach(function(img){
    var src=img.src||img.dataset.src||'';
    if(src&&src.startsWith('http')&&!SKIP.test(src)&&srcs.indexOf(src)===-1)srcs.push(src);
  });
  srcs=[...new Set(srcs)];
  if(window.ReactNativeWebView){
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'imageList',images:srcs}));
  }
  true;
})();
`;

const AUTO_SCROLL_SPEEDS = [
  { id: 'slow',   label: 'Slow',   px: 1 },
  { id: 'normal', label: 'Normal', px: 2 },
  { id: 'fast',   label: 'Fast',   px: 4 },
];
function buildAutoScrollJS(px) {
  return `(function(){if(window.__is)clearInterval(window.__is);window.__is=setInterval(function(){window.scrollBy(0,${px});},30);true;})();`;
}
const AUTO_SCROLL_STOP_JS  = `(function(){if(window.__is){clearInterval(window.__is);window.__is=null;}true;})();`;

// Detects actual chapter/episode count on a manga detail/series page.
// Skips reader pages, search pages, and homepages so it never fires in wrong context.
const EXTRACT_CHAPTER_COUNT_JS = `
(function(){
  if (window.__inkloreChCounted) return true;
  window.__inkloreChCounted = true;
  var url = window.location.href;
  var path = window.location.pathname;
  if (!path || path === '/' || path === '') return true;
  if (/[?&](s|q|search|keyword|query|term|name|word)=|\\/search[/?#]|\\/filter[/?#]|\\/browse[/?#]/.test(url)) return true;
  if (/\\/viewer[/?#]|\\/reader[/?#]|chapter[-\\/]\\d|episode[-\\/]\\d|ep[-\\/]\\d|\\/ch-\\d/i.test(url)) return true;
  if (/\\/chapter\\/[a-f0-9]{8}-/i.test(url)) return true; // MangaDex chapter UUID

  var SELS = [
    '.wp-manga-chapter', '.listing-chapters_wrap li', '.eplister li',
    '.row-content-chapter li', '.chapter-list .row', '.chapter-item',
    '.episode-item', '.chapter-list-item', '._episodeItem',
    '.detail_lst li', 'ul._listWrap li', '.chapters-list li',
    '.chapter-list a[href]', 'ul.chapters li', '.chapter-feed li',
    'li.chapter',
  ];

  // Pulls the real chapter number + link out of each matched list item so the
  // in-app picker can show the site's actual chapters (including decimals,
  // one-shots and gaps) instead of a guessed 1..N sequence.
  function numFromText(t) {
    t = (t || '').trim();
    var m = t.match(/(?:chapter|chap|ch\.?|episode|ep\.?)\s*#?\s*(\d+(?:\.\d+)?)/i);
    if (m) return parseFloat(m[1]);
    m = t.match(/(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : null;
  }
  function itemsFrom(els) {
    var items = [], seen = {};
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var a = el.tagName === 'A' ? el : el.querySelector('a[href]');
      var href = a ? a.href : null;
      if (!href) continue;
      var text = (a.textContent || el.textContent || '').trim().replace(/\s+/g, ' ');
      var num = numFromText(text);
      if (num === null || seen[num] !== undefined) continue;
      seen[num] = true;
      items.push({ num: num, href: href, label: text.slice(0, 60) });
    }
    return items;
  }

  function tryCount() {
    var max = 0, maxEls = null;
    for (var i = 0; i < SELS.length; i++) {
      var els = document.querySelectorAll(SELS[i]);
      if (els.length > max) { max = els.length; maxEls = els; }
    }
    if (max >= 1 && window.ReactNativeWebView) {
      var items = maxEls ? itemsFrom(maxEls) : [];
      items.sort(function(a, b) { return a.num - b.num; });
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'chapterCount', count: max, items: items }));
      return true;
    }
    return false;
  }

  if (tryCount()) return true;
  setTimeout(function() { tryCount(); }, 2500);
  true;
})();
`;
const MANGA_MODE_JS   = `(function(){document.documentElement.style.overflow='hidden';document.body.style.overflow='hidden';true;})();`;
const WEBTOON_MODE_JS = `(function(){document.documentElement.style.overflow='';document.body.style.overflow='';true;})();`;
const CLEAR_STORAGE_JS = `(function(){try{localStorage.clear();}catch(e){}try{sessionStorage.clear();}catch(e){}true;})();`;

// ── Chapter nav JS ────────────────────────────────────────────────────────

function buildChapterDirectJs(targetChapter) {
  return `
(function(){
  var ch='${targetChapter}',url=window.location.href,newUrl=null;
  var pats=[
    [/\\/chapter[-_]([\\d.]+)/i,'/chapter-'+ch],
    [/\\/chapter\\/([\\d.]+)/i,'/chapter/'+ch],
    [/\\/ch[-_]([\\d.]+)/i,'/ch-'+ch],
    [/-chapter([\\d.]+)($|\\/)/i,'-chapter'+ch+'$2'],
  ];
  for(var i=0;i<pats.length;i++){if(pats[i][0].test(url)){newUrl=url.replace(pats[i][0],pats[i][1]);break;}}
  if(newUrl&&newUrl!==url){window.location.href=newUrl;return;}
  var sels=document.querySelectorAll('select');
  for(var si=0;si<sels.length;si++){
    var opts=Array.from(sels[si].options);
    for(var oi=0;oi<opts.length;oi++){
      var txt=(opts[oi].text||'').trim().toLowerCase(),val=opts[oi].value||'';
      if(txt==='chapter '+ch||txt==='ch. '+ch||txt==='ch '+ch||txt===ch||
         val.endsWith('/'+ch)||val.endsWith('-'+ch)||val.endsWith('chapter-'+ch)){
        sels[si].value=val; sels[si].dispatchEvent(new Event('change',{bubbles:true})); return;
      }
    }
  }
  var re=new RegExp('(?:chapter|ch)[-_\\/]?'+ch.replace('.','\\\\.')+'(?:\\/|$|-|_|\\\\s)','i');
  var links=document.querySelectorAll('a[href]');
  for(var ai=0;ai<links.length;ai++){
    var href=links[ai].href||'',lt=(links[ai].textContent||'').trim().toLowerCase();
    if(re.test(href)||lt==='chapter '+ch||lt==='ch. '+ch||lt==='ch '+ch){links[ai].click();return;}
  }
  if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage('nav:useSequential');
  true;
})();
`;
}

function chapterNavScript(direction) {
  const sels = direction === 1
    ? ['a[rel="next"]','.next-chapter a','.next_chapter a','[class*="next-chap"] a','a.btn-next','[class*="next"] a','a[class*="next"]']
    : ['a[rel="prev"]','.prev-chapter a','.previous-chapter a','[class*="prev-chap"] a','a.btn-prev','[class*="prev"] a','a[class*="prev"]'];
  const words = direction === 1 ? ['next','next chapter'] : ['prev','previous','back','prev chapter'];
  return `
(function(){
  var sels=${JSON.stringify(sels)},words=${JSON.stringify(words)},found=null;
  for(var i=0;i<sels.length&&!found;i++){var el=document.querySelector(sels[i]);if(el&&(el.tagName==='A'||el.tagName==='BUTTON'))found=el;}
  if(!found){
    var links=document.querySelectorAll('a,button');
    for(var j=0;j<links.length;j++){
      var t=(links[j].textContent||'').trim().toLowerCase();
      for(var k=0;k<words.length;k++){if(t===words[k]||t.startsWith(words[k]+' ')){found=links[j];break;}}
      if(found)break;
    }
  }
  if(found)found.click();
  else if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage('nav:fail');
  true;
})();
`;
}

const NEXT_CHAPTER_JS = chapterNavScript(1);
const PREV_CHAPTER_JS = chapterNavScript(-1);

// ── Helpers ───────────────────────────────────────────────────────────────

// Root domain of a URL ("chapter.mangafire.to" → "mangafire.to")
function rootDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').split('.').slice(-2).join('.');
  } catch (_) {
    return null;
  }
}

// Popunder gate: a window.open / target=_blank is only followed when it stays
// on the current site or targets a known manga site. Ad popunders always jump
// to a fresh off-site domain — the ad blocklist can never keep up with those.
function isTrustedPopup(targetUrl, currentUrl) {
  const target = rootDomain(targetUrl);
  if (!target) return false;
  if (target === rootDomain(currentUrl)) return true;
  return !!detectSiteFromUrl(targetUrl);
}

function isLoginUrl(url) {
  if (!url) return false;
  // MangaDex uses Keycloak on its own auth subdomain
  if (url.includes('auth.mangadex.org')) return true;
  // OAuth / OpenID Connect authorization endpoints (all sites)
  if (/\/oauth(2)?\/authorize|\/openid-connect\/auth|\/protocol\/openid-connect/i.test(url)) return true;
  // Common login/register paths
  if (/\/(login|signin|sign-in|account\/login|user\/login|auth\/login|register|signup|sign-up)(\/|$|\?|#)/i.test(url)) return true;
  return false;
}

function detectSiteFromUrl(url) {
  if (!url || !url.startsWith('http')) return null;
  const lower = url.toLowerCase();
  return MANGA_SITES.find((s) => {
    const host = s.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    return lower.includes(host);
  }) || null;
}

// Shared "this is a listing/search page, not an actual chapter" test — used
// to stop a generic page heading (e.g. MangaFire's "Browse" page title) from
// ever being treated as a manga title, and to stop such pages from being
// saved as a reading session.
const NON_CHAPTER_URL_RE = /[?&](s|q|search|keyword|query|term|name|word)=|\/search[/?#]|\/filter[/?#]|\/browse[/?#]/;

function parseMangaInfo(rawTitle, heading) {
  let manga = '', chapter = '';
  const t = rawTitle || '';
  const m1 = t.match(/^(.+?)\s*[-–|]\s*[Cc]h(?:apter)?\.?\s*([\d.]+)/);
  if (m1) { manga = m1[1].trim(); chapter = `Chapter ${m1[2]}`; }
  if (!manga) {
    const m2 = t.match(/[Rr]ead\s+(.+?)\s+[Cc]h(?:apter)?\.?\s*([\d.]+)/);
    if (m2) { manga = m2[1].trim(); chapter = `Chapter ${m2[2]}`; }
  }
  if (!manga) {
    const m3 = t.match(/[Cc]h(?:apter)?\.?\s*([\d.]+)\s*[-–|]\s*(.+)/);
    if (m3) { manga = m3[2].trim(); chapter = `Chapter ${m3[1]}`; }
  }
  if (!manga && heading) manga = heading;
  manga = manga
    .replace(/\s*[-–|]\s*(mangadex|mangafire|webtoon|mangaplus|read.*manga|online|free).*$/i, '')
    .trim();
  return { manga, chapter };
}

// Some sites (e.g. MangaFire) put an opaque, globally-incrementing internal
// chapter ID in this URL slot instead of the manga's actual chapter number —
// those IDs run into the millions, so anything past a sane chapter ceiling
// is almost certainly an ID, not a chapter number. Reject it rather than
// showing "Chapter 9038022"; the real number gets reconciled separately from
// the scraped chapter list (see the webChapterList-vs-currentUrl effect).
const MAX_SANE_CHAPTER = 3000;

function extractChapterFromUrl(url) {
  if (!url) return null;
  const ep = /[?&]episode_no=(\d+)/.exec(url);
  if (ep) return parseInt(ep[1], 10);
  const ch = /\/chapter[-/](\d+(?:\.\d+)?)/i.exec(url);
  if (ch) {
    const num = Math.ceil(parseFloat(ch[1]));
    return num <= MAX_SANE_CHAPTER ? num : null;
  }
  return null;
}

function searchSites(query) {
  if (!query) return [];
  const q = query.toLowerCase().replace(/[\s.\-_]/g, '');
  return MANGA_SITES.filter((s) => {
    const name = s.name.toLowerCase().replace(/[\s.\-_]/g, '');
    const host = s.url.toLowerCase().replace(/[\s.\-_]/g, '');
    return name.startsWith(q) || name.includes(q) || host.includes(q);
  });
}

// ── PageImage — auto aspect ratio via Image.getSize ───────────────────────

function PageImage({ uri, onLayout, onSingleTap, onDoubleTap }) {
  const { width: winW } = useWindowDimensions();
  const [height, setHeight] = useState(winW * 1.5);
  const lastTapRef = useRef(0);
  const singleTimerRef = useRef(null);

  useEffect(() => {
    Image.getSize(
      uri,
      (w, h) => {
        if (w > 0) {
          const next = (h / w) * winW;
          setHeight(next);
          onLayout?.(next);
        }
      },
      () => {}
    );
  }, [uri, winW]);

  useEffect(() => () => { if (singleTimerRef.current) clearTimeout(singleTimerRef.current); }, []);

  function handlePress() {
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      lastTapRef.current = 0;
      if (singleTimerRef.current) { clearTimeout(singleTimerRef.current); singleTimerRef.current = null; }
      onDoubleTap?.(uri);
    } else {
      lastTapRef.current = now;
      singleTimerRef.current = setTimeout(() => {
        singleTimerRef.current = null;
        onSingleTap?.();
      }, 285);
    }
  }

  return (
    <Pressable onPress={handlePress}>
      <Image
        source={{ uri, cache: 'force-cache' }}
        style={{ width: winW, height }}
        resizeMode="cover"
        fadeDuration={0}
      />
    </Pressable>
  );
}

// ── Zoom viewer — full-screen pinch/pan/double-tap, isolated from the list ──

function ZoomViewer({ uri, onClose }) {
  const { width: winW, height: winH } = useWindowDimensions();
  const [imgH, setImgH] = useState(winH * 0.8);
  useEffect(() => {
    Image.getSize(uri, (w, h) => {
      if (w > 0) setImgH(Math.min((h / w) * winW, winH));
    }, () => {});
  }, [uri, winW, winH]);

  const pinchRef = useRef(null);
  const panRef   = useRef(null);
  const baseScale  = useRef(new Animated.Value(1)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const scale      = useRef(Animated.multiply(baseScale, pinchScale)).current;
  const lastScale  = useRef(1);
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const lastOffset = useRef({ x: 0, y: 0 });
  const lastTapRef = useRef(0);

  const onPinchEvent = Animated.event([{ nativeEvent: { scale: pinchScale } }], { useNativeDriver: true });
  const onPanEvent   = Animated.event(
    [{ nativeEvent: { translationX: translateX, translationY: translateY } }],
    { useNativeDriver: true }
  );

  function resetAll(animated = true) {
    lastScale.current = 1;
    lastOffset.current = { x: 0, y: 0 };
    translateX.setOffset(0);
    translateY.setOffset(0);
    if (animated) {
      Animated.parallel([
        Animated.spring(baseScale,  { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 4 }),
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, speed: 24, bounciness: 4 }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 24, bounciness: 4 }),
      ]).start();
    } else {
      baseScale.setValue(1);
      translateX.setValue(0);
      translateY.setValue(0);
    }
    pinchScale.setValue(1);
  }

  function onPinchStateChange(e) {
    if (e.nativeEvent.oldState === GHState.ACTIVE) {
      lastScale.current = Math.min(5, Math.max(1, lastScale.current * e.nativeEvent.scale));
      baseScale.setValue(lastScale.current);
      pinchScale.setValue(1);
      if (lastScale.current <= 1.02) resetAll();
    }
  }

  function onPanStateChange(e) {
    if (e.nativeEvent.oldState === GHState.ACTIVE) {
      lastOffset.current.x += e.nativeEvent.translationX;
      lastOffset.current.y += e.nativeEvent.translationY;
      translateX.setOffset(lastOffset.current.x);
      translateX.setValue(0);
      translateY.setOffset(lastOffset.current.y);
      translateY.setValue(0);
    }
  }

  function handleTap() {
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      lastTapRef.current = 0;
      if (lastScale.current > 1.02) {
        resetAll();
      } else {
        lastScale.current = 2.5;
        Animated.spring(baseScale, { toValue: 2.5, useNativeDriver: true, speed: 24, bounciness: 4 }).start();
      }
    } else {
      lastTapRef.current = now;
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.97)' }}>
      <PanGestureHandler
        ref={panRef}
        simultaneousHandlers={pinchRef}
        onGestureEvent={onPanEvent}
        onHandlerStateChange={onPanStateChange}
        minPointers={1}
        maxPointers={2}>
        <Animated.View style={{ flex: 1 }}>
          <PinchGestureHandler
            ref={pinchRef}
            simultaneousHandlers={panRef}
            onGestureEvent={onPinchEvent}
            onHandlerStateChange={onPinchStateChange}>
            <Animated.View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Pressable onPress={handleTap}>
                <Animated.Image
                  source={{ uri, cache: 'force-cache' }}
                  style={{
                    width: winW,
                    height: imgH,
                    transform: [{ translateX }, { translateY }, { scale }],
                  }}
                  resizeMode="contain"
                />
              </Pressable>
            </Animated.View>
          </PinchGestureHandler>
        </Animated.View>
      </PanGestureHandler>
      <TouchableOpacity
        style={{ position: 'absolute', top: 54, right: 18, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 20, padding: 9 }}
        onPress={onClose}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="close" size={20} color="#fff" />
      </TouchableOpacity>
      <Text style={{ position: 'absolute', bottom: 34, alignSelf: 'center', color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>
        Pinch to zoom · Double-tap to toggle
      </Text>
    </View>
  );
}

// ── Site card ─────────────────────────────────────────────────────────────

function SiteCard({ site, active, onPress, onRemove }) {
  const domain = site.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
  const faviconUri = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  return (
    <View style={siteCardStyles.wrap}>
      <TouchableOpacity
        style={[siteCardStyles.card, active && siteCardStyles.cardActive]}
        onPress={onPress}
        activeOpacity={0.75}>
        <Image source={{ uri: faviconUri }} style={siteCardStyles.favicon} defaultSource={null} />
        <View style={siteCardStyles.info}>
          <Text style={siteCardStyles.name} numberOfLines={1}>{site.name}</Text>
          <Text style={siteCardStyles.domain} numberOfLines={1}>{domain}</Text>
        </View>
        <Ionicons name="arrow-forward-outline" size={12} color="#5C5B63" style={{ marginLeft: 4 }} />
      </TouchableOpacity>
      {onRemove && (
        <TouchableOpacity
          style={siteCardStyles.removeBtn}
          onPress={onRemove}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <Ionicons name="close-circle" size={16} color="#5C5B63" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const siteCardStyles = StyleSheet.create({
  wrap:       { width: '48%', marginRight: '2%', marginBottom: 8, position: 'relative' },
  card:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1F', borderRadius: 12, borderWidth: 1, borderColor: '#2A2A2F', paddingVertical: 10, paddingHorizontal: 10 },
  cardActive: { borderColor: '#7B5CFF', backgroundColor: '#1A1633' },
  favicon:    { width: 32, height: 32, borderRadius: 8, backgroundColor: '#2A2A2F' },
  info:       { flex: 1, marginLeft: 10 },
  name:       { color: '#fff', fontSize: 12, fontWeight: '600' },
  domain:     { color: '#5C5B63', fontSize: 10, marginTop: 2 },
  removeBtn:  { position: 'absolute', top: -6, right: -4, zIndex: 5 },
});

// ── Main component ────────────────────────────────────────────────────────

export default function ReaderScreen({ route, navigation }) {
  const {
    url: paramUrl,
    searchQuery,
    // Deep links (mangarecs://series/<title>) only carry searchQuery — fall
    // back to it so the header shows the series name instead of "Reader"
    title: routeTitle = searchQuery || 'Reader',
    chapters = 0,
    lang: routeLang,
    mangaId: paramMangaId,
    resumeUrl: paramResumeUrl,
    resumeSite: paramResumeSite,
    downloadDir: paramDownloadDir,
    creatorSeriesId,
  } = route.params || {};

  const { profile, userId, updateProfile, refreshProfile } = useProfile();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  useKeepAwake(); // screen must not sleep mid-chapter

  // HUD palette — switches with the app theme
  const hudBg     = isDark ? 'rgba(13,13,15,0.92)'    : 'rgba(255,255,255,0.94)';
  const hudText   = isDark ? '#ffffff'                 : '#0D0D0F';
  const hudMuted  = isDark ? '#9B9AA3'                 : '#6E6E78';
  const hudBorder = isDark ? '#2A2A2F'                 : 'rgba(0,0,0,0.08)';
  const hudCard   = isDark ? '#1A1A1F'                 : 'rgba(0,0,0,0.06)';

  // Bottom-sheet palette — the sheets were hardcoded dark and unreadable in light mode
  const sheetC = {
    sheet:     { backgroundColor: isDark ? '#1A1A1F' : '#FFFFFF' },
    handle:    { backgroundColor: isDark ? '#2A2A2F' : 'rgba(0,0,0,0.14)' },
    title:     { color: hudText },
    rowBorder: { borderTopColor: hudBorder },
    rowText:   { color: hudText },
    itemBg:    { backgroundColor: isDark ? '#0D0D0F' : 'rgba(0,0,0,0.04)', borderColor: hudBorder },
  };

  // core
  const [mode,               setMode]               = useState('webtoon');
  const [currentChapter,     setCurrentChapter]     = useState(1);
  const [bookmarked,         setBookmarked]         = useState(false);
  const [showUI,             setShowUI]             = useState(true);
  const [currentUrl,         setCurrentUrl]         = useState(paramUrl || 'https://mangadex.org');
  const [scrollProgress,     setScrollProgress]     = useState(0);
  const [autoScroll,         setAutoScroll]         = useState(false);
  const [readerHidden,       setReaderHidden]       = useState(false);
  const [pageAnim,           setPageAnim]           = useState('slide');

  // API reader mode
  const [readerMode,         setReaderMode]         = useState(null); // null | 'api' | 'webview'
  const [mangaId,            setMangaId]            = useState(null);
  const [apiChapters,        setApiChapters]        = useState([]);
  const [pages,              setPages]              = useState([]);
  const [pagesLoading,       setPagesLoading]       = useState(false);
  const [currentChapterIdx,  setCurrentChapterIdx]  = useState(0);
  const flatListRef    = useRef(null);
  const chapterListRef = useRef(null);

  // ── WebView "Reader Mode" — extracts the page's images (same pipeline that
  // already powers offline downloads) and shows them through the app's own
  // clean PageImage/FlatList UI, laid over the still-live WebView, instead of
  // the site's own ad-cleaned-but-still-foreign layout. Falls back silently
  // to the raw WebView if extraction comes up short (site not supported).
  const [webReaderPages, setWebReaderPages] = useState([]);
  const imagePurposeRef = useRef(null); // 'read' | 'download' | null — which request an inbound imageList message belongs to
  const webReaderListRef = useRef(null);

  // dynamic header
  const [mangaTitle,         setMangaTitle]         = useState('');
  const [chapterLabel,       setChapterLabel]       = useState('');
  const [activeSite,         setActiveSite]         = useState(null);
  const titleFade = useRef(new Animated.Value(1)).current;

  // modals
  const [showAmbience,       setShowAmbience]       = useState(false);
  const [ambienceState,      setAmbienceState]      = useState(ambienceGetState);

  // reader comfort settings
  const [forceDarkSites,     setForceDarkSites]     = useState(false);
  const [dimmer,             setDimmer]             = useState(0); // 0–0.7 black overlay opacity
  const [autoScrollSpeed,    setAutoScrollSpeed]    = useState('normal');
  const [allowLandscape,     setAllowLandscape]     = useState(false);
  const [showChapterSelect,  setShowChapterSelect]  = useState(false);
  const [showShare,          setShowShare]          = useState(false);

  const [showReaderSettings, setShowReaderSettings] = useState(false);
  const [showSitePicker,     setShowSitePicker]     = useState(false);

  // fallback chain
  const [fallbackChain, setFallbackChain] = useState([]);
  const fallbackChainRef = useRef([]);

  // resolving overlay
  const [resolving,          setResolving]          = useState(!!searchQuery);
  const [resolvingSiteName,  setResolvingSiteName]  = useState('');
  const [resuming,           setResuming]           = useState(false);

  // site picker
  const [siteSearch,         setSiteSearch]         = useState('');
  const [savedSites,         setSavedSites]         = useState([]);

  // page counter (API mode)
  const [currentPage,        setCurrentPage]        = useState(1);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 });
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems?.length > 0) setCurrentPage(viewableItems[0].index + 1);
  });

  // dynamically detected chapter count from the manga's detail page (WebView mode)
  const [webChapterCount,    setWebChapterCount]    = useState(0);
  // real per-chapter {num,href,label} scraped from that same detail page —
  // lets the picker show the site's actual chapter list instead of a guessed
  // 1..N sequence, which breaks on decimal/special/gapped chapter numbering
  const [webChapterList,     setWebChapterList]     = useState([]);

  // webview browser history nav
  const [webCanGoBack,       setWebCanGoBack]       = useState(false);
  const [webCanGoForward,    setWebCanGoForward]    = useState(false);

  // offline mode
  const [isOffline,          setIsOffline]          = useState(false);

  // download
  const [downloading,        setDownloading]        = useState(false);
  const [dlProgress,         setDlProgress]         = useState(0);
  const [dlTotal,            setDlTotal]            = useState(0);
  const [dlLabel,            setDlLabel]            = useState('');
  const pendingImagesRef = useRef(null);

  // zoom viewer (API mode)
  const [zoomUri,            setZoomUri]            = useState(null);

  // next-chapter prefetch cache: chapterId → page URLs
  const prefetchedPagesRef = useRef({});

  // toast
  const [savedToast,         setSavedToast]         = useState(false);
  const [toastMessage,       setToastMessage]       = useState('');
  const toastOpacity = useRef(new Animated.Value(0)).current;

  // anim
  const uiOpacity         = useRef(new Animated.Value(1)).current;
  const uiTranslateTop    = useRef(new Animated.Value(0)).current;
  const uiTranslateBottom = useRef(new Animated.Value(0)).current;
  const prevChapterX      = useRef(new Animated.Value(0)).current;
  const nextChapterX      = useRef(new Animated.Value(0)).current;
  const chapterTransAnim  = useRef(new Animated.Value(1)).current;
  const webviewRef        = useRef(null);

  const sessionStartRef   = useRef(null);
  const bottomTimerRef    = useRef(null);
  const pendingStepsRef   = useRef(0);
  const pendingDirRef     = useRef(1);
  const pendingTargetRef  = useRef(1);
  const useSequentialRef  = useRef(false);

  const displayTitle   = mangaTitle || activeSite?.name || 'Reader';
  const displayChapter = chapterLabel || `Chapter ${currentChapter}`;
  const siteSuggestions = siteSearch.trim() ? searchSites(siteSearch) : null;
  const resumeKey = searchQuery ? RESUME_KEY_PFX + encodeURIComponent(searchQuery) : null;

  // Enters the native API reader with a fresh chapter list. Loads the start
  // chapter's pages directly (state isn't committed yet inside boot).
  async function enterApiMode(mdId, chapterList, startIdx, title) {
    const idx = Math.max(0, Math.min(startIdx || 0, chapterList.length - 1));
    const ch = chapterList[idx];
    setMangaId(mdId);
    setApiChapters(chapterList);
    setCurrentChapterIdx(idx);
    setCurrentChapter(Math.ceil(ch.chapter) || idx + 1);
    if (title) animateTitle(title, ch.title ? `Ch. ${ch.chapter}: ${ch.title}` : `Chapter ${ch.chapter}`);
    setReaderMode('api');
    setResolving(false);
    setPagesLoading(true);
    const urls = (Array.isArray(ch.pages) && ch.pages.length > 0) ? ch.pages : await getChapterPages(ch.id);
    setPages(urls);
    setPagesLoading(false);
    return urls.length > 0;
  }

  // ── Boot ────────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        // ── Offline reading: load pages from local filesystem ───────────────
        if (paramDownloadDir) {
          try {
            const files = await FileSystem.readDirectoryAsync(paramDownloadDir);
            const imgs = files
              .sort()
              .filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f))
              .map((f) => paramDownloadDir + f);
            if (imgs.length > 0) {
              setPages(imgs);
              setIsOffline(true);
              animateTitle(routeTitle, 'Downloaded Chapter');
              setReaderMode('api');
              setResolving(false);
              return;
            }
          } catch (_) {}
          // Folder missing or empty — show error and fall through to online
          setIsOffline(true);
          setReaderMode('api');
          setResolving(false);
          return;
        }

        // ── Creator series: load chapter pages from Supabase ───────────────
        if (creatorSeriesId) {
          try {
            const { data: chapRows } = await supabase
              .from('chapters')
              .select('id, chapter_number, title, pages')
              .eq('series_id', creatorSeriesId)
              .order('chapter_number', { ascending: true });

            if (chapRows && chapRows.length > 0) {
              const chapList = chapRows.map((ch) => ({
                id: ch.id,
                chapter: ch.chapter_number,
                title: ch.title || `Chapter ${ch.chapter_number}`,
                pages: Array.isArray(ch.pages) ? ch.pages : [],
              }));
              const firstCh = chapList[0];
              setApiChapters(chapList);
              setCurrentChapterIdx(0);
              setCurrentChapter(firstCh.chapter || 1);
              animateTitle(routeTitle, firstCh.title || `Chapter ${firstCh.chapter}`);
              setPages(firstCh.pages);
              supabase.rpc('increment_series_views', { p_series_id: creatorSeriesId }).catch(() => {});
            } else {
              animateTitle(routeTitle, 'No chapters yet');
              setPages([]);
            }
          } catch (_) {
            setPages([]);
          }
          setReaderMode('api');
          setResolving(false);
          return;
        }

        const savedRaw = await AsyncStorage.getItem(SAVED_SITES_KEY);
        if (savedRaw) setSavedSites(JSON.parse(savedRaw));

        const [savedMode, savedAnim] = await Promise.all([
          AsyncStorage.getItem(READER_MODE_KEY),
          AsyncStorage.getItem(PAGE_ANIM_KEY),
        ]);
        if (savedMode) setMode(savedMode);
        if (savedAnim) setPageAnim(savedAnim);

        if (searchQuery) {
          // Step 1: Check for saved resume
          try {
            const resumeRaw = await AsyncStorage.getItem(resumeKey);
            if (resumeRaw) {
              const resume = JSON.parse(resumeRaw);

              // API-mode resume — restore straight into the native reader at
              // the saved chapter. (Previously saved but never restored, which
              // silently sent every return visit back through the WebView.)
              if (resume?.mode === 'api' && resume?.mangaId) {
                setResolvingSiteName('MangaDex');
                const chapterList = await getMangaChaptersCached(resume.mangaId);
                if (chapterList?.length > 0) {
                  let idx = resume.chapterIdx ?? 0;
                  // Chapter list may have grown/shifted since save — re-find by id
                  const byId = chapterList.findIndex((c) => c.id === resume.chapterId);
                  if (byId >= 0) idx = byId;
                  const ok = await enterApiMode(resume.mangaId, chapterList, idx, resume.mangaTitle || routeTitle);
                  if (ok) return;
                }
                // MangaDex unreachable/empty — fall through to WebView paths
              }

              if (resume?.mode === 'webview' && resume?.url) {
                setResuming(true);
                setCurrentUrl(resume.url);
                if (resume.chapter) setCurrentChapter(resume.chapter);
                if (resume.mangaTitle) animateTitle(resume.mangaTitle, resume.chapterLabel || '');
                if (resume.site) setActiveSite(resume.site);
                // Build a basic fallback chain so a stale resume URL (404/403) can recover
                const resumeTitleWv = resume.mangaTitle || searchQuery;
                if (resumeTitleWv) {
                  const rfSite = getReadingSiteForLang(routeLang);
                  setFallbackChain([
                    buildSearchUrl(rfSite.url, resumeTitleWv),
                    `https://mangadex.org/search?q=${encodeURIComponent(resumeTitleWv)}`,
                  ]);
                }
                setReaderMode('webview');
                setResolving(false);
                return;
              }

              // Legacy resume (no mode field)
              if (resume?.url) {
                setResuming(true);
                setCurrentUrl(resume.url);
                if (resume.chapter) setCurrentChapter(resume.chapter);
                if (resume.mangaTitle) animateTitle(resume.mangaTitle, resume.chapterLabel || '');
                if (resume.site) setActiveSite(resume.site);
                const resumeTitleLeg = resume.mangaTitle || searchQuery;
                if (resumeTitleLeg) {
                  const rfSiteLeg = getReadingSiteForLang(routeLang);
                  setFallbackChain([
                    buildSearchUrl(rfSiteLeg.url, resumeTitleLeg),
                    `https://mangadex.org/search?q=${encodeURIComponent(resumeTitleLeg)}`,
                  ]);
                }
                setReaderMode('webview');
                setResolving(false);
                return;
              }
            }
          } catch (_) {}

          // Step 1b: No resume key but Library passed a direct URL — use it immediately
          if (paramResumeUrl) {
            setCurrentUrl(paramResumeUrl);
            if (paramResumeSite) setActiveSite(paramResumeSite);
            if (routeTitle && routeTitle !== 'Reader') animateTitle(routeTitle, '');
            setReaderMode('webview');
            setResolving(false);
            return;
          }

          // Step 2: Native API reader first — direct MangaDex images, no ads,
          // no site breakage. WebView only when MangaDex has no chapters.
          try {
            setResolvingSiteName('MangaDex');
            let mdId = paramMangaId;
            let mdTitle = (routeTitle && routeTitle !== 'Reader') ? routeTitle : searchQuery;
            if (!mdId) {
              const info = await searchMangaDex(searchQuery);
              if (info?.id) { mdId = info.id; mdTitle = info.title || mdTitle; }
            }
            if (mdId) {
              const chapterList = await getMangaChaptersCached(mdId);
              if (chapterList?.length > 0) {
                // Resume by chapter number if the route carried progress
                let startIdx = 0;
                if (currentChapter > 1) {
                  const found = chapterList.findIndex((c) => Math.ceil(c.chapter) >= currentChapter);
                  if (found >= 0) startIdx = found;
                }
                const ok = await enterApiMode(mdId, chapterList, startIdx, mdTitle);
                if (ok) return;
              }
            }
          } catch (_) {}

          // Step 3: Navigate directly to the manga — use known ID for MangaDex title page,
          // then build a rich fallback chain so dead-ends auto-advance to the next source.
          const defSite = getReadingSiteForLang(routeLang);
          setResolvingSiteName(defSite.name);
          const webTitle = (routeTitle && routeTitle !== 'Reader') ? routeTitle : searchQuery;

          let targetUrl;
          if (defSite.url.includes('mangadex.org')) {
            if (paramMangaId) {
              targetUrl = `https://mangadex.org/title/${paramMangaId}`;
            } else {
              const info = await searchMangaDex(searchQuery);
              targetUrl = info?.id
                ? `https://mangadex.org/title/${info.id}`
                : `https://mangadex.org/search?q=${encodeURIComponent(webTitle)}`;
            }
          } else {
            // Webtoon (English) or other official sites
            targetUrl = buildSearchUrl(defSite.url, webTitle);
          }

          // Rich fallback chain — each entry is tried automatically when the current
          // URL returns a 404/403, triggers searchFailed, or has no readable chapters.
          const chain = [];
          // Try MangaFire search first — broad Japanese + manhwa coverage
          chain.push(`https://mangafire.to/filter?keyword=${encodeURIComponent(webTitle)}`);
          // Asura Scans: try direct slug URL (instant, no search page) then search
          const asuraDirect = buildDirectUrl('https://asurascans.com', webTitle);
          if (asuraDirect) chain.push(asuraDirect);
          chain.push(`https://asurascans.com/?s=${encodeURIComponent(webTitle)}&post_type=wp-manga`);
          // Weeb Central: try direct slug
          const weebDirect = buildDirectUrl('https://weebcentral.com', webTitle);
          if (weebDirect) chain.push(weebDirect);
          // MangaDex search as last resort (catches anything not in the chain above)
          if (!targetUrl.includes('mangadex.org/search')) {
            chain.push(`https://mangadex.org/search?q=${encodeURIComponent(webTitle)}`);
          }

          setCurrentUrl(targetUrl);
          setFallbackChain(chain);
          setActiveSite(defSite);
          if (webTitle && webTitle !== 'Reader') animateTitle(webTitle, '');
          setReaderMode('webview');
          setResolving(false);

        } else {
          // No searchQuery — use direct resume URL if Library passed one, else restore last site
          if (paramResumeUrl) {
            setCurrentUrl(paramResumeUrl);
            if (paramResumeSite) setActiveSite(paramResumeSite);
            if (routeTitle && routeTitle !== 'Reader') animateTitle(routeTitle, '');
          } else {
            const [lastRaw, defSite] = await Promise.all([
              AsyncStorage.getItem(LAST_SITE_KEY),
              getDefaultSite(),
            ]);
            if (lastRaw) {
              const last = JSON.parse(lastRaw);
              if (last?.url) { setCurrentUrl(last.url); setActiveSite(last); }
            } else {
              setCurrentUrl(defSite.url);
              setActiveSite(defSite);
            }
          }
          setReaderMode('webview');
        }
      } catch (_) {
        setReaderMode('webview');
        setResolving(false);
      }
    })();
  }, []);

  // ── Animate title ────────────────────────────────────────────────────────

  function animateTitle(newManga, newChapter) {
    Animated.timing(titleFade, { toValue: 0, duration: 140, useNativeDriver: true }).start(() => {
      setMangaTitle(newManga);
      if (newChapter !== undefined) setChapterLabel(newChapter);
      Animated.timing(titleFade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    });
  }

  // ── UI visibility ────────────────────────────────────────────────────────

  useEffect(() => {
    Animated.parallel([
      Animated.timing(uiOpacity,         { toValue: showUI ? 1 : 0,    duration: 220, useNativeDriver: true }),
      Animated.timing(uiTranslateTop,    { toValue: showUI ? 0 : -100, duration: 220, useNativeDriver: true }),
      Animated.timing(uiTranslateBottom, { toValue: showUI ? 0 : 100,  duration: 220, useNativeDriver: true }),
    ]).start();
  }, [showUI]);

  useEffect(() => { webviewRef.current?.injectJavaScript(mode === 'manga' ? MANGA_MODE_JS : WEBTOON_MODE_JS); }, [mode]);
  useEffect(() => {
    const speed = AUTO_SCROLL_SPEEDS.find((s) => s.id === autoScrollSpeed) || AUTO_SCROLL_SPEEDS[1];
    webviewRef.current?.injectJavaScript(autoScroll ? buildAutoScrollJS(speed.px) : AUTO_SCROLL_STOP_JS);
  }, [autoScroll, autoScrollSpeed]);

  useEffect(() => {
    if (bottomTimerRef.current) { clearTimeout(bottomTimerRef.current); bottomTimerRef.current = null; }
  }, [currentUrl, currentChapterIdx]);


  // Load reader comfort prefs; force-dark defaults to following the app theme
  useEffect(() => {
    AsyncStorage.multiGet([FORCE_DARK_KEY, DIMMER_KEY, SCROLL_SPEED_KEY, LANDSCAPE_KEY]).then(([[, fdRaw], [, dimRaw], [, spdRaw], [, lsRaw]]) => {
      setForceDarkSites(fdRaw === null ? isDark : fdRaw === 'true');
      if (dimRaw !== null) {
        const v = parseFloat(dimRaw);
        if (!Number.isNaN(v)) setDimmer(Math.min(0.7, Math.max(0, v)));
      }
      if (spdRaw && AUTO_SCROLL_SPEEDS.some((s) => s.id === spdRaw)) setAutoScrollSpeed(spdRaw);
      setAllowLandscape(lsRaw === 'true');
    }).catch(() => {});
  }, []);

  // Re-apply force-dark to the live page whenever the toggle changes
  useEffect(() => {
    if (readerMode === 'webview') {
      webviewRef.current?.injectJavaScript(buildForceDarkJS(forceDarkSites));
    }
  }, [forceDarkSites]);

  function toggleForceDark() {
    setForceDarkSites((prev) => {
      const next = !prev;
      AsyncStorage.setItem(FORCE_DARK_KEY, String(next)).catch(() => {});
      return next;
    });
  }

  function adjustDimmer(delta) {
    setDimmer((prev) => {
      const next = Math.min(0.7, Math.max(0, Math.round((prev + delta) * 100) / 100));
      AsyncStorage.setItem(DIMMER_KEY, String(next)).catch(() => {});
      return next;
    });
  }

  function toggleLandscape() {
    setAllowLandscape((prev) => {
      const next = !prev;
      AsyncStorage.setItem(LANDSCAPE_KEY, String(next)).catch(() => {});
      return next;
    });
  }

  // Rotation is unlocked only while this screen is mounted AND the preference
  // is on; always restored to portrait on unmount so the rest of the app
  // (which was never designed for landscape) isn't affected.
  useEffect(() => {
    if (allowLandscape) {
      ScreenOrientation.unlockAsync().catch(() => {});
    } else {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    }
    return () => { ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {}); };
  }, [allowLandscape]);

  useEffect(() => {
    sessionStartRef.current = Date.now();
    const unsub = ambienceSubscribe(setAmbienceState);
    return () => {
      unsub();
      ambienceStop();
      // Clear any pending bottom-of-page timer so it doesn't fire after unmount
      if (bottomTimerRef.current) {
        clearTimeout(bottomTimerRef.current);
        bottomTimerRef.current = null;
      }
      const elapsed = Date.now() - sessionStartRef.current;
      if (elapsed >= 30000) {
        const hoursElapsed = elapsed / 3600000;
        // updateDailyLog syncs via merge_daily_log RPC, which recomputes
        // hours_read + streak server-side (direct column writes are revoked)
        updateDailyLog(hoursElapsed);
        setTimeout(() => refreshProfile?.(), 1500);
      }
    };
  }, []);

  useEffect(() => {
    if (!mangaTitle) return;
    updateProfile({ currently_reading: mangaTitle, current_chapter: currentChapter });
  }, [currentChapter, mangaTitle]);

  useEffect(() => {
    if (!mangaTitle || !userId) return;
    // Best real total we currently know — never send an unknown/lower value
    // over an already-good one, since this write only carries the columns
    // it includes (omitted keys leave the existing DB value untouched).
    const knownTotal = readerMode === 'api'
      ? (apiChapters.length || null)
      : (webChapterCount || (chapters < 999 ? chapters : null));
    syncLibraryWrite(() => supabase.from('reading_progress').upsert(
      {
        user_id: userId, series_title: mangaTitle, current_chapter: currentChapter, status: 'reading', updated_at: new Date().toISOString(),
        ...(knownTotal ? { total_chapters: knownTotal } : {}),
      },
      { onConflict: 'user_id,series_title' }
    ), 'update chapter progress');
  }, [currentChapter, mangaTitle, userId, readerMode, apiChapters.length, webChapterCount, chapters]);

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      try {
        const stored = await AsyncStorage.getItem('@mangarecs_last_read_date');
        if (stored === today) {
          // same day
        } else if (stored) {
          const diffDays = Math.round((new Date(today) - new Date(stored)) / 86400000);
          updateProfile({ streak_count: diffDays === 1 ? (profile?.streak_count || 0) + 1 : 1 });
          await AsyncStorage.setItem('@mangarecs_last_read_date', today);
        } else {
          updateProfile({ streak_count: 1 });
          await AsyncStorage.setItem('@mangarecs_last_read_date', today);
        }
      } catch (_) {}
    })();
  }, []);

  // ── Resume save — API mode ────────────────────────────────────────────────

  useEffect(() => {
    if (readerMode !== 'api' || !resumeKey || !apiChapters.length) return;
    const ch = apiChapters[currentChapterIdx];
    if (!ch) return;
    const chLabel = ch.title ? `Ch. ${ch.chapter}: ${ch.title}` : `Chapter ${ch.chapter}`;
    const chNum = Math.ceil(ch.chapter) || 1;
    AsyncStorage.setItem(resumeKey, JSON.stringify({
      mode: 'api',
      mangaId,
      chapterId: ch.id,
      chapterIdx: currentChapterIdx,
      chapter: chNum,
      chapterLabel: chLabel,
      mangaTitle: mangaTitle || routeTitle,
    })).catch(() => {});
    setLastRead({
      title: mangaTitle || routeTitle,
      searchKey: searchQuery || mangaTitle || routeTitle,
      chapter: chNum,
      chapterLabel: chLabel,
      color: '#1A1A2E',
      lang: 'ja',
      chapters: apiChapters.length,
    });
    // Register/update the chapter watch — the server cron uses this to send
    // "new chapter" pushes for series the user actually reads.
    if (userId && mangaId) {
      supabase.from('chapter_watch').upsert({
        user_id: userId,
        manga_id: mangaId,
        series_title: mangaTitle || routeTitle,
        last_seen_chapter: chNum,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,manga_id' }).then(() => {});
    }
  }, [currentChapterIdx, readerMode]);

  // ── Resume save — WebView mode ────────────────────────────────────────────

  // Reconcile the displayed chapter number against the site's own scraped
  // chapter list (webChapterList) as soon as it loads — some sites (MangaFire)
  // put an opaque, globally-incrementing internal ID in the chapter URL
  // instead of the manga's real chapter number, which MAX_SANE_CHAPTER can't
  // always catch (small IDs slip through). The scraped list's numbers come
  // straight from the site's own chapter-list text, so an href match here is
  // ground truth — this is what keeps the chapter-list picker's "active" item
  // in sync with the actual page instead of highlighting nothing.
  useEffect(() => {
    if (readerMode !== 'webview' || !webChapterList.length || !currentUrl) return;
    const norm = (u) => (u || '').replace(/\/$/, '').replace(/[?#].*$/, '');
    const match = webChapterList.find((c) => norm(c.href) === norm(currentUrl));
    if (match && match.num !== currentChapter) setCurrentChapter(match.num);
  }, [webChapterList, currentUrl, readerMode]);

  useEffect(() => {
    if (readerMode !== 'webview' || !currentUrl || !searchQuery) return;
    const path = currentUrl.replace(/^https?:\/\/[^/]+/, '').replace(/[?#].*$/, '');
    if (!path || path === '/' || path === '') return;
    if (NON_CHAPTER_URL_RE.test(currentUrl)) return;
    const title = mangaTitle || routeTitle;
    if (!title) return;
    const effectiveKey = resumeKey || (RESUME_KEY_PFX + encodeURIComponent(title));
    const chLabel = chapterLabel || `Chapter ${currentChapter}`;
    AsyncStorage.setItem(effectiveKey, JSON.stringify({
      mode: 'webview',
      url: currentUrl,
      chapter: currentChapter,
      chapterLabel: chLabel,
      mangaTitle: title,
      site: activeSite,
    })).catch(() => {});
    setLastRead({
      title,
      searchKey: searchQuery || title,
      chapter: currentChapter,
      chapterLabel: chLabel,
      color: '#1A1A2E',
      lang: 'ja',
      site: activeSite,
      url: currentUrl,
      // Real detected total when known, else fall back to whatever the calling
      // screen passed in — omitting this entirely defaulted every webview-mode
      // read to the "999 unknown" sentinel and the Library badge never recovered
      chapters: webChapterCount || (chapters < 999 ? chapters : undefined),
    });
  }, [currentUrl, currentChapter, readerMode, webChapterCount]);

  // ── Scroll progress (shared by FlatList and WebView) ─────────────────────

  function handleScrollProgress(e) {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const max     = contentSize.height - layoutMeasurement.height;
    const clamped = max > 0 ? Math.min(100, Math.max(0, (contentOffset.y / max) * 100)) : 0;
    setScrollProgress(clamped);
    if (bottomTimerRef.current && clamped < 99) {
      clearTimeout(bottomTimerRef.current); bottomTimerRef.current = null;
    }
  }

  // ── Keep fallbackChainRef in sync so HTTP-error/network-error callbacks are never stale ──

  useEffect(() => { fallbackChainRef.current = fallbackChain; }, [fallbackChain]);

  // ── Toast ────────────────────────────────────────────────────────────────

  function showToast(message) {
    setToastMessage(message);
    setSavedToast(true);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(toastOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setSavedToast(false));
  }

  // ── Pop the next fallback URL and navigate to it ─────────────────────────

  function popAndNavigateFallback(reason) {
    const chain = fallbackChainRef.current;
    if (chain.length === 0) return;
    const [nextUrl, ...rest] = chain;
    fallbackChainRef.current = rest;
    setFallbackChain(rest);
    setCurrentUrl(nextUrl);
    const siteName = nextUrl.includes('mangadex')     ? 'MangaDex'
                   : nextUrl.includes('mangafire')    ? 'MangaFire'
                   : nextUrl.includes('asurascans')   ? 'Asura Scans'
                   : nextUrl.includes('weebcentral')  ? 'Weeb Central'
                   : nextUrl.includes('webtoons')     ? 'Webtoon'
                   : nextUrl.includes('mangaplus')    ? 'Manga Plus'
                   : nextUrl.includes('inkr')         ? 'INKR'
                   : 'next source';
    showToast(reason ? `${reason} — trying ${siteName}` : `Trying ${siteName}…`);
  }

  // ── Login intercept — prompt user to pick a different site ──────────────

  function handleLoginIntercepted() {
    showToast('This site requires sign-in. Try another source.');
    setShowSitePicker(true);
  }

  // ── Site management ───────────────────────────────────────────────────────

  function addSavedSite(site) {
    setSavedSites((prev) => {
      const next = [site, ...prev.filter((s) => s.url !== site.url)].slice(0, 12);
      AsyncStorage.setItem(SAVED_SITES_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }

  function removeRecentSite(siteUrl) {
    setSavedSites((prev) => {
      const next = prev.filter((s) => s.url !== siteUrl);
      AsyncStorage.setItem(SAVED_SITES_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }

  function clearAllRecents() {
    setSavedSites([]);
    AsyncStorage.setItem(SAVED_SITES_KEY, JSON.stringify([])).catch(() => {});
  }

  // keepTitle: true when the user is picking a manga *source* (site-picker cards,
  // or typing a known manga site's name) — carries the current manga over as a
  // search instead of dumping them on the bare homepage. Must be false for anything
  // the user typed literally (a URL, or a plain-word query going to Google) so it
  // navigates exactly where they asked instead of being hijacked into a manga search.
  function openSite(site, { keepTitle = true } = {}) {
    setShowSitePicker(false);
    setSiteSearch('');
    setReaderMode('webview');
    setActiveSite(site);
    const knownTitle = keepTitle && (mangaTitle || (routeTitle !== 'Reader' ? routeTitle : ''));
    if (knownTitle) {
      animateTitle(knownTitle, '');
      setCurrentUrl(buildSearchUrl(site.url, knownTitle));
    } else {
      animateTitle('', '');
      setCurrentUrl(site.url);
    }
    setFallbackChain([]);
    AsyncStorage.setItem(LAST_SITE_KEY, JSON.stringify(site)).catch(() => {});
    addSavedSite(site);
  }

  function submitSiteInput() {
    const q = siteSearch.trim();
    if (!q) return;
    // Only treat it as a URL when it actually looks like a domain (no spaces, ends
    // in a TLD-shaped suffix before any path) — a plain query with a stray period
    // ("Vol. 3", "Mrs. Smith") should never get misrouted into a broken navigation.
    const isUrl = /^https?:\/\//i.test(q) || (!/\s/.test(q) && /\.[a-z]{2,}$/i.test(q.split('/')[0]));
    if (isUrl) {
      const siteUrl = q.startsWith('http') ? q : `https://${q}`;
      const matched = detectSiteFromUrl(siteUrl);
      const site = matched || { name: q, url: siteUrl, emoji: '🌐' };
      openSite(site, { keepTitle: false });
      return;
    }
    // Plain words — first check if it names one of our known manga sites
    // ("mangadex", "asura"), otherwise fall back to an actual Google search so
    // this doubles as a real search bar instead of silently doing nothing.
    const results = searchSites(q);
    if (results.length > 0) {
      openSite(results[0]);
    } else {
      openSite(
        { name: q, url: `https://www.google.com/search?q=${encodeURIComponent(q)}`, emoji: '🔎' },
        { keepTitle: false }
      );
    }
  }

  // ── API chapter loading ───────────────────────────────────────────────────

  async function loadApiChapter(idx) {
    const ch = apiChapters[idx];
    if (!ch) return;
    setCurrentChapterIdx(idx);
    setCurrentChapter(Math.ceil(ch.chapter) || idx + 1);
    setCurrentPage(1);
    animateTitle(mangaTitle, ch.title ? `Ch. ${ch.chapter}: ${ch.title}` : `Chapter ${ch.chapter}`);
    if (pageAnim !== 'none') {
      await new Promise((resolve) =>
        Animated.timing(chapterTransAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => resolve())
      );
    }
    setPagesLoading(true);
    setPages([]);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    // Creator chapters embed page URLs; MangaDex chapters carry a page COUNT —
    // their URLs come from the at-home server per chapter. The prefetch cache
    // (filled while reading the previous chapter) makes transitions instant.
    let pageUrls = (Array.isArray(ch.pages) && ch.pages.length > 0)
      ? ch.pages
      : (prefetchedPagesRef.current[ch.id] || []);
    if (pageUrls.length === 0 && ch.id && !creatorSeriesId) {
      pageUrls = await getChapterPages(ch.id);
    }
    setPages(pageUrls);
    setPagesLoading(false);

    // Background: prefetch the NEXT chapter's page list + warm its first images
    const nextCh = apiChapters[idx + 1];
    if (nextCh?.id && !creatorSeriesId && !Array.isArray(nextCh.pages) && !prefetchedPagesRef.current[nextCh.id]) {
      getChapterPages(nextCh.id).then((urls) => {
        if (!urls?.length) return;
        prefetchedPagesRef.current[nextCh.id] = urls;
        urls.slice(0, 3).forEach((u) => Image.prefetch(u).catch(() => {}));
      }).catch(() => {});
    }
    if (pageAnim !== 'none') {
      chapterTransAnim.setValue(0);
      Animated.timing(chapterTransAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    }
    if (pageUrls.length === 0) {
      showToast('Pages unavailable — tap the globe icon to switch to browser mode');
    }
  }

  // ── Bookmark → Library ────────────────────────────────────────────────────

  async function handleBookmark() {
    const next = !bookmarked;
    setBookmarked(next);
    const seriesTitle = mangaTitle || activeSite?.name || routeTitle;
    if (next) {
      showToast('Saved to Library');
      try {
        const existing = await AsyncStorage.getItem(LIBRARY_KEY);
        const saved = existing ? JSON.parse(existing) : [];
        const entry = {
          id: readerMode === 'api' ? `md_${mangaId}` : currentUrl,
          title: seriesTitle,
          searchKey: searchQuery || routeTitle,
          mangaId: readerMode === 'api' ? mangaId : undefined,
          url: currentUrl,
          chapter: currentChapter,
          chapterLabel: displayChapter,
          siteName: activeSite?.name || 'MangaDex',
          siteEmoji: activeSite?.emoji || '📚',
          rating: 'N/A',
          chapters,
          color: '#7B5CFF',
          bookmarked: true,
          savedAt: Date.now(),
        };
        const updated = [entry, ...saved.filter((s) => s.id !== entry.id)];
        await AsyncStorage.setItem(LIBRARY_KEY, JSON.stringify(updated));
      } catch (_) {}
      if (userId) {
        syncLibraryWrite(() => supabase.from('reading_progress').upsert({
          user_id: userId,
          series_title: seriesTitle,
          status: 'bookmarked',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,series_title', ignoreDuplicates: true }), 'add bookmark');
      }
    } else {
      showToast('Removed from Library');
      try {
        const existing = await AsyncStorage.getItem(LIBRARY_KEY);
        if (existing) {
          const id = readerMode === 'api' ? `md_${mangaId}` : currentUrl;
          const parsed = (() => { try { return JSON.parse(existing); } catch (_) { return []; } })();
          const saved = Array.isArray(parsed) ? parsed.filter((s) => s.id !== id) : [];
          await AsyncStorage.setItem(LIBRARY_KEY, JSON.stringify(saved));
        }
      } catch (_) {}
      if (userId) {
        syncLibraryWrite(() => supabase.from('reading_progress').delete()
          .eq('user_id', userId).eq('series_title', seriesTitle).eq('status', 'bookmarked'), 'remove bookmark');
      }
    }
  }

  // ── Chapter navigation ────────────────────────────────────────────────────

  function handleMangaTap(evt) {
    const x     = evt.nativeEvent.locationX;
    const width = Dimensions.get('window').width;
    if (x < width / 3) {
      webviewRef.current?.injectJavaScript('window.scrollBy(0,-window.innerHeight*0.9);true;');
    } else if (x > (width / 3) * 2) {
      webviewRef.current?.injectJavaScript('window.scrollBy(0,window.innerHeight*0.9);true;');
    } else {
      setShowUI((v) => !v);
    }
  }

  function goChapterDirect(targetChapter) {
    if (readerMode === 'api') {
      const idx = apiChapters.findIndex((c) => Math.ceil(c.chapter) === targetChapter);
      if (idx >= 0) loadApiChapter(idx);
      return;
    }
    useSequentialRef.current = false;
    pendingTargetRef.current = targetChapter;
    pendingStepsRef.current  = 0;
    webviewRef.current?.injectJavaScript(buildChapterDirectJs(targetChapter));
  }

  // Navigates straight to a chapter's real, scraped URL — used instead of
  // goChapterDirect's URL-pattern guessing whenever the picker has a genuine
  // href for the target chapter (see webChapterList), which is far more
  // reliable across sites with decimal/special/non-sequential numbering.
  function goToChapterHref(href, targetChapter) {
    useSequentialRef.current = false;
    pendingTargetRef.current = targetChapter;
    pendingStepsRef.current  = 0;
    setCurrentChapter(targetChapter);
    webviewRef.current?.injectJavaScript(`window.location.href=${JSON.stringify(href)};true;`);
  }

  function goChapterSteps(steps, direction, targetChapter) {
    if (steps <= 0) { setCurrentChapter(targetChapter); return; }
    pendingStepsRef.current  = steps;
    pendingDirRef.current    = direction;
    pendingTargetRef.current = targetChapter;
    webviewRef.current?.injectJavaScript(direction === 1 ? NEXT_CHAPTER_JS : PREV_CHAPTER_JS);
  }

  function goToPrevChapter() {
    if (readerMode === 'api') {
      if (currentChapterIdx > 0) loadApiChapter(currentChapterIdx - 1);
      return;
    }
    if (currentChapter <= 1) return;
    Animated.sequence([
      Animated.timing(prevChapterX, { toValue: -4, duration: 150, useNativeDriver: true }),
      Animated.timing(prevChapterX, { toValue:  0, duration: 150, useNativeDriver: true }),
    ]).start();
    goChapterSteps(1, -1, currentChapter - 1);
  }

  function goToNextChapter() {
    if (readerMode === 'api') {
      if (currentChapterIdx < apiChapters.length - 1) loadApiChapter(currentChapterIdx + 1);
      return;
    }
    Animated.sequence([
      Animated.timing(nextChapterX, { toValue: 4, duration: 150, useNativeDriver: true }),
      Animated.timing(nextChapterX, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start();
    goChapterSteps(1, 1, currentChapter + 1);
  }

  function handleNextChapter() {
    // Server-side capped increment (chapters_read is no longer client-writable)
    supabase.rpc('increment_chapters_read').then(() => refreshProfile?.());
    if (readerMode === 'api') {
      if (currentChapterIdx < apiChapters.length - 1) loadApiChapter(currentChapterIdx + 1);
      return;
    }
    goChapterSteps(1, 1, currentChapter + 1);
  }

  function handleRestartChapter() {
    if (readerMode === 'api') {
      loadApiChapter(currentChapterIdx);
      return;
    }
    webviewRef.current?.reload();
  }

  // ── Download chapter pages ────────────────────────────────────────────────

  function requestChapterDownload() {
    setShowReaderSettings(false);
    if (readerMode === 'api' && pages.length > 0) {
      executeChapterDownload(pages);
      return;
    }
    pendingImagesRef.current = null;
    imagePurposeRef.current = 'download';
    webviewRef.current?.injectJavaScript(COLLECT_IMAGES_JS);
  }

  // Requests a clean extracted view of the current WebView page for reading
  // (not downloading). Silently no-ops into "stay on raw WebView" if the
  // site doesn't yield enough images — never shows an error for this path.
  function requestWebReaderExtract() {
    if (readerMode !== 'webview') return;
    imagePurposeRef.current = 'read';
    webviewRef.current?.injectJavaScript(COLLECT_IMAGES_JS);
  }

  // Core: downloads one chapter's pages and records the library entry.
  // Returns pages saved (0 on failure). Caller owns the `downloading` state.
  async function downloadPagesCore(images, chNum, chLabelText) {
    const label = mangaTitle || activeSite?.name || routeTitle || 'Chapter';
    const slug  = label.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const dir   = `${CHAPTERS_DIR}${slug}/ch${chNum}/`;
    let referer;
    try { referer = currentUrl ? new URL(currentUrl).origin + '/' : undefined; } catch (_) {}
    setDlTotal(images.length);
    setDlProgress(0);
    let saved = 0;
    let totalBytes = 0;
    try {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      for (let i = 0; i < images.length; i++) {
        const ext  = (images[i].split('?')[0].split('.').pop() || 'jpg').slice(0, 5);
        const dest = `${dir}page_${String(i + 1).padStart(3, '0')}.${ext}`;
        try {
          const dlOpts = referer ? { headers: { Referer: referer } } : undefined;
          await FileSystem.downloadAsync(images[i], dest, dlOpts);
          saved++;
          const info = await FileSystem.getInfoAsync(dest).catch(() => null);
          if (info?.size) totalBytes += info.size;
        } catch (_) {}
        setDlProgress(i + 1);
      }
      if (saved > 0) {
        try {
          const existing = await AsyncStorage.getItem(LIBRARY_KEY);
          const lib = existing ? JSON.parse(existing) : [];
          const entry = {
            id: (readerMode === 'api' ? `md_${mangaId}` : currentUrl) + `_dl_ch${chNum}`,
            title: label,
            url: currentUrl,
            chapter: chNum,
            chapterLabel: chLabelText,
            siteName: activeSite?.name || 'MangaDex',
            siteEmoji: activeSite?.emoji || '📚',
            downloadDir: dir,
            pageCount: saved,
            bytes: totalBytes,
            color: '#1D9E75',
            downloaded: true,
            savedAt: Date.now(),
          };
          const updated = [entry, ...lib.filter((s) => s.id !== entry.id)];
          await AsyncStorage.setItem(LIBRARY_KEY, JSON.stringify(updated));
        } catch (_) {}
      }
    } catch (_) {}
    return saved;
  }

  async function executeChapterDownload(images) {
    if (!images || images.length === 0) {
      Alert.alert('No pages found', 'Could not detect manga pages on this page. Try scrolling to load them first.');
      return;
    }
    setDlLabel(`${mangaTitle || activeSite?.name || 'Chapter'} — Ch. ${currentChapter}`);
    setDownloading(true);
    const saved = await downloadPagesCore(images, currentChapter, displayChapter);
    setDownloading(false);
    if (saved > 0) {
      showToast(`${saved} of ${images.length} pages saved`);
    } else {
      Alert.alert('Download failed', 'Pages could not be downloaded — the site may block external downloads.');
    }
  }

  // Batch: download this chapter + the next (count-1) — API mode only
  async function downloadNextChapters(count = 5) {
    setShowReaderSettings(false);
    if (readerMode !== 'api' || apiChapters.length === 0 || downloading) return;
    setDownloading(true);
    let done = 0;
    for (let i = 0; i < count; i++) {
      const idx = currentChapterIdx + i;
      const ch = apiChapters[idx];
      if (!ch) break;
      const chNum = Math.ceil(ch.chapter) || idx + 1;
      setDlLabel(`${mangaTitle || routeTitle} — Ch. ${chNum} (${i + 1}/${Math.min(count, apiChapters.length - currentChapterIdx)})`);
      let chPages = (Array.isArray(ch.pages) && ch.pages.length > 0) ? ch.pages : [];
      if (chPages.length === 0 && ch.id && !creatorSeriesId) {
        chPages = await getChapterPages(ch.id);
      }
      if (chPages.length === 0) continue;
      const saved = await downloadPagesCore(
        chPages,
        chNum,
        ch.title ? `Ch. ${ch.chapter}: ${ch.title}` : `Chapter ${ch.chapter}`
      );
      if (saved > 0) done++;
    }
    setDownloading(false);
    showToast(done > 0 ? `${done} chapter${done === 1 ? '' : 's'} saved for offline` : 'Download failed');
  }

  // ── Misc settings ─────────────────────────────────────────────────────────

  function handleClearCache() {
    if (readerMode === 'api') {
      loadApiChapter(currentChapterIdx);
      setShowReaderSettings(false);
      showToast('Chapter reloaded');
      return;
    }
    webviewRef.current?.injectJavaScript(CLEAR_STORAGE_JS);
    webviewRef.current?.clearCache?.(true);
    webviewRef.current?.reload();
    setShowReaderSettings(false);
    showToast('Cache cleared');
  }

  async function handleStartFromBeginning() {
    setShowReaderSettings(false);
    if (!searchQuery) return;
    await AsyncStorage.removeItem(resumeKey).catch(() => {});
    clearResumeCache(searchQuery);
    setResuming(false);
    setCurrentChapter(1);

    if (readerMode === 'api' && apiChapters.length > 0) {
      loadApiChapter(0);
      return;
    }

    setResolving(true);
    setResolvingSiteName('');
    try {
      const defSite = getReadingSiteForLang(routeLang);
      setResolvingSiteName(defSite.name);
      let targetUrl;
      if (defSite.url.includes('mangadex.org')) {
        const info = await searchMangaDex(searchQuery);
        targetUrl = info?.id
          ? `https://mangadex.org/title/${info.id}`
          : `https://mangadex.org/search?q=${encodeURIComponent(searchQuery)}`;
      } else {
        targetUrl = buildSearchUrl(defSite.url, searchQuery);
      }
      const chain = [
        `https://mangafire.to/filter?keyword=${encodeURIComponent(searchQuery)}`,
      ];
      const asuraDirect = buildDirectUrl('https://asurascans.com', searchQuery);
      if (asuraDirect) chain.push(asuraDirect);
      chain.push(`https://asurascans.com/?s=${encodeURIComponent(searchQuery)}&post_type=wp-manga`);
      const weebDirect = buildDirectUrl('https://weebcentral.com', searchQuery);
      if (weebDirect) chain.push(weebDirect);
      if (!targetUrl.includes('mangadex.org/search')) {
        chain.push(`https://mangadex.org/search?q=${encodeURIComponent(searchQuery)}`);
      }
      setCurrentUrl(targetUrl);
      setFallbackChain(chain);
      setActiveSite(defSite);
      setReaderMode('webview');
    } catch (_) {}
    setResolving(false);
  }

  function toggleReaderHidden() {
    const next = !readerHidden;
    setReaderHidden(next);
    setShowUI(!next);
    setShowReaderSettings(false);
  }

  // ── Chapter list for picker — descending order (latest first) ─────────────

  const chapterListForPicker = useMemo(() => {
    if (readerMode === 'api' && apiChapters.length > 0) {
      return [...apiChapters].reverse().map((ch, revIdx) => {
        const realIdx = apiChapters.length - 1 - revIdx;
        return {
          shortLabel: `Ch. ${ch.chapter}`,
          title: ch.title || null,
          num: Math.ceil(ch.chapter) || realIdx + 1,
          idx: realIdx,
          active: realIdx === currentChapterIdx,
          isRead: realIdx < currentChapterIdx,
        };
      });
    }
    // In WebView mode use the best known chapter source:
    // 1. Real chapters scraped off the page (webChapterList) — actual numbers/links,
    //    handles decimals, specials and gaps instead of assuming a 1..N sequence
    // 2. Detected count only (webChapterCount) — accurate total, guessed numbering
    // 3. Passed explicitly from the calling screen (chapters) if it's a real value (< 999)
    // 4. Fallback: only show chapters up to currentChapter + 20 to avoid a misleading 999-item list
    if (webChapterList.length > 0) {
      return [...webChapterList].reverse().map((ch) => ({
        shortLabel: `Ch. ${ch.num}`,
        title: ch.label && ch.label !== `Ch. ${ch.num}` && ch.label !== `Chapter ${ch.num}` ? ch.label : null,
        num: ch.num,
        href: ch.href,
        idx: -1,
        active: ch.num === currentChapter,
        isRead: ch.num < currentChapter,
      }));
    }
    const knownTotal = chapters < 999 ? chapters : 0;
    const total = Math.max(webChapterCount || knownTotal || currentChapter, currentChapter);
    const cap   = (webChapterCount === 0 && chapters >= 999) ? Math.max(currentChapter + 20, total) : total;
    return Array.from({ length: cap }, (_, i) => {
      const num = cap - i;
      return { shortLabel: `Ch. ${num}`, title: null, num, idx: -1, active: num === currentChapter, isRead: num < currentChapter };
    });
  }, [readerMode, apiChapters, currentChapterIdx, currentChapter, chapters, webChapterCount, webChapterList]);

  const chapterListActiveIdx = useMemo(
    () => Math.max(chapterListForPicker.findIndex((c) => c.active), 0),
    [chapterListForPicker]
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      <Animated.View style={[styles.progressBar, { opacity: uiOpacity }]}>
        <View style={[styles.progressFill, { width: `${scrollProgress}%` }]} />
      </Animated.View>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <Animated.View
        style={[styles.topBar, { backgroundColor: hudBg, opacity: uiOpacity, transform: [{ translateY: uiTranslateTop }] }]}
        pointerEvents={showUI ? 'auto' : 'none'}>
        <View style={[styles.topRow, { paddingTop: insets.top + 6 }]}>
          <View style={styles.topBarLeft}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Ionicons name="home-outline" size={20} color={hudText} />
            </TouchableOpacity>
            {readerMode === 'webview' && (
              <TouchableOpacity
                style={[styles.backBtn, !webCanGoBack && { opacity: 0.3 }]}
                onPress={() => webviewRef.current?.goBack()}
                disabled={!webCanGoBack}>
                <Ionicons name="arrow-back-outline" size={19} color={hudText} />
              </TouchableOpacity>
            )}
            {readerMode === 'webview' && (
              <TouchableOpacity
                style={[styles.backBtn, !webCanGoForward && { opacity: 0.3 }]}
                onPress={() => webviewRef.current?.goForward()}
                disabled={!webCanGoForward}>
                <Ionicons name="arrow-forward-outline" size={19} color={hudText} />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.centerTitleWrap}>
            <View style={styles.centerTitleRow}>
              {isOffline ? (
                <View style={styles.offlineBadge}>
                  <Ionicons name="cloud-offline-outline" size={13} color="#1D9E75" />
                </View>
              ) : (
                <TouchableOpacity onPress={() => setShowSitePicker(true)} style={styles.reloadBtn}>
                  <Ionicons name="globe-outline" size={15} color={readerMode === 'api' ? '#7B5CFF' : activeSite ? '#7B5CFF' : hudMuted} />
                </TouchableOpacity>
              )}
              <Animated.View style={{ opacity: titleFade, alignItems: 'center' }}>
                <Text style={[styles.readerTitle, { color: hudText }]} numberOfLines={1}>{displayTitle}</Text>
                <Text style={[styles.chapterLabel, { color: hudMuted }]}>{isOffline ? 'Offline' : displayChapter}</Text>
              </Animated.View>
              {!isOffline && (
                <TouchableOpacity
                  onPress={() => readerMode === 'api' ? loadApiChapter(currentChapterIdx) : webviewRef.current?.reload()}
                  style={styles.reloadBtn}>
                  <Ionicons name="reload-outline" size={14} color={hudMuted} />
                </TouchableOpacity>
              )}
              {isOffline && <View style={styles.reloadBtn} />}
            </View>
          </View>
          <View style={styles.topRightIcons}>
            <TouchableOpacity onPress={() => setShowAmbience(true)} style={styles.topIconBtn}>
              <Ionicons name="headset-outline" size={18} color={ambienceState.presetId ? '#7B5CFF' : hudMuted} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowReaderSettings(true)} style={styles.topIconBtn}>
              <Ionicons name="settings-outline" size={18} color={hudMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      {/* ── API reader — FlatList of images ──────────────────────────────── */}
      {readerMode === 'api' && (
        <TouchableOpacity style={styles.webtoonWrapper} activeOpacity={1} onPress={() => setShowUI((v) => !v)}>
          <Animated.View style={[
            { flex: 1 },
            pageAnim === 'fade' ? { opacity: chapterTransAnim } : null,
            pageAnim === 'slide' ? { transform: [{ translateX: chapterTransAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] } : null,
          ]}>
          {pagesLoading ? (
            <View style={styles.pagesLoadingWrap}>
              <ActivityIndicator size="large" color="#7B5CFF" />
              <Text style={styles.pagesLoadingText}>Loading pages…</Text>
            </View>
          ) : (
            <>
              <FlatList
                ref={flatListRef}
                data={pages}
                keyExtractor={(uri) => uri}
                renderItem={({ item }) => (
                  <PageImage
                    uri={item}
                    onSingleTap={() => setShowUI((v) => !v)}
                    onDoubleTap={(u) => setZoomUri(u)}
                  />
                )}
                onScroll={handleScrollProgress}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
                removeClippedSubviews={false}
                initialNumToRender={4}
                maxToRenderPerBatch={5}
                windowSize={8}
                updateCellsBatchingPeriod={50}
                onViewableItemsChanged={onViewableItemsChanged.current}
                viewabilityConfig={viewabilityConfig.current}
                ListEmptyComponent={() => (
                  <View style={styles.noPages}>
                    <Ionicons name="book-outline" size={40} color="#5C5B63" />
                    <Text style={styles.noPagesText}>No pages found for this chapter</Text>
                    <TouchableOpacity style={styles.openInBrowserBtn} onPress={() => setShowSitePicker(true)}>
                      <Text style={styles.openInBrowserText}>Open in Browser</Text>
                    </TouchableOpacity>
                  </View>
                )}
              />
              {pages.length > 0 && !showUI && (
                <View style={styles.pageCounter} pointerEvents="none">
                  <Text style={styles.pageCounterText}>{currentPage} / {pages.length}</Text>
                </View>
              )}
            </>
          )}
          </Animated.View>
        </TouchableOpacity>
      )}

      {/* ── WebView reader ────────────────────────────────────────────────── */}
      {readerMode === 'webview' && (
        <View style={styles.webtoonWrapper}>
          <WebView
            ref={webviewRef}
            source={{ uri: currentUrl }}
            style={styles.webview}
            containerStyle={{ backgroundColor: '#0D0D0F' }}
            injectedJavaScript={AD_BLOCK_JS + TAP_TOGGLE_JS}
            injectedJavaScriptForMainFrameOnly={false}
            startInLoadingState
            domStorageEnabled
            javaScriptEnabled
            allowsInlineMediaPlayback
            userAgent={Platform.OS === 'ios'
              ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
              : 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Pro Build/UD1A.231105.004) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.210 Mobile Safari/537.36'}
            onNavigationStateChange={(navState) => {
              setWebCanGoBack(navState.canGoBack || false);
              setWebCanGoForward(navState.canGoForward || false);
              if (!navState.url) return;
              // Intercept any login/auth wall before saving the URL or showing the page
              if (isLoginUrl(navState.url)) {
                webviewRef.current?.stopLoading();
                handleLoginIntercepted();
                return;
              }
              if (navState.url !== currentUrl) {
                setCurrentUrl(navState.url);
                setWebReaderPages([]); // new page — stale extracted images would show the wrong chapter
                // Keep chapter counter in sync when the user follows in-page links
                const detectedCh = extractChapterFromUrl(navState.url);
                if (detectedCh !== null) setCurrentChapter(detectedCh);
                const detected = detectSiteFromUrl(navState.url);
                if (detected && detected.url !== activeSite?.url) {
                  setActiveSite(detected);
                  addSavedSite(detected);
                  AsyncStorage.setItem(LAST_SITE_KEY, JSON.stringify(detected)).catch(() => {});
                  const isHomepage = navState.url.replace(/^https?:\/\/(www\.)?/, '').split('/').length <= 2;
                  if (isHomepage) animateTitle('', '');
                }
              }
            }}
            onLoadEnd={() => {
              webviewRef.current?.injectJavaScript(mode === 'manga' ? MANGA_MODE_JS : WEBTOON_MODE_JS);
              webviewRef.current?.injectJavaScript(AD_BLOCK_JS);
              if (forceDarkSites) webviewRef.current?.injectJavaScript(buildForceDarkJS(true));
              webviewRef.current?.injectJavaScript(EXTRACT_PAGE_INFO_JS);
              if (searchQuery) {
                webviewRef.current?.injectJavaScript(`window.__mangarecsQuery = ${JSON.stringify(searchQuery)};`);
                webviewRef.current?.injectJavaScript(AUTO_NAV_SEARCH_JS);
                webviewRef.current?.injectJavaScript(AUTO_NAV_CHAPTER_JS);
                webviewRef.current?.injectJavaScript(MANGADEX_CHAPTER_NAV_JS);
                webviewRef.current?.injectJavaScript(HOMEPAGE_DETECT_JS);
                webviewRef.current?.injectJavaScript(SEARCH_WATCHDOG_JS);
              }
              // Runs on every page load, not just the initial search — resumed/direct
              // opens skip the search flow entirely and otherwise never got a real
              // chapter count. The script's own guards (window.__inkloreChCounted,
              // reader/search URL checks) keep it a no-op on irrelevant pages.
              webviewRef.current?.injectJavaScript(EXTRACT_CHAPTER_COUNT_JS);
              if (pendingImagesRef.current === 'requested') {
                pendingImagesRef.current = 'collecting';
                webviewRef.current?.injectJavaScript(COLLECT_IMAGES_JS);
              }
              // Auto-attempt the clean Reader Mode view once the page has
              // settled (not mid-search/auto-nav) — small delay lets
              // lazy-load attributes populate before extraction runs.
              if (!searchQuery) {
                setTimeout(() => requestWebReaderExtract(), 900);
              }
              if (useSequentialRef.current) {
                useSequentialRef.current = false;
                if (pendingStepsRef.current > 0) {
                  pendingStepsRef.current -= 1;
                  if (pendingStepsRef.current > 0) {
                    setTimeout(() => webviewRef.current?.injectJavaScript(pendingDirRef.current === 1 ? NEXT_CHAPTER_JS : PREV_CHAPTER_JS), 500);
                  } else {
                    setCurrentChapter(pendingTargetRef.current);
                  }
                }
              } else if (pendingStepsRef.current > 0) {
                pendingStepsRef.current -= 1;
                if (pendingStepsRef.current > 0) {
                  setTimeout(() => webviewRef.current?.injectJavaScript(pendingDirRef.current === 1 ? NEXT_CHAPTER_JS : PREV_CHAPTER_JS), 500);
                } else {
                  setCurrentChapter(pendingTargetRef.current);
                }
              }
            }}
            onMessage={(e) => {
              const data = e.nativeEvent.data;
              if (data === 'toggleUI') {
                setShowUI((v) => !v);
              } else if (data === 'nav:useSequential') {
                useSequentialRef.current = true;
                const delta = pendingTargetRef.current - currentChapter;
                const dir   = delta >= 0 ? 1 : -1;
                goChapterSteps(Math.abs(delta), dir, pendingTargetRef.current);
              } else if (data === 'nav:fail') {
                pendingStepsRef.current = 0;
                setCurrentChapter(pendingTargetRef.current);
                showToast("Couldn't find more chapters here");
              } else {
                try {
                  const msg = JSON.parse(data);
                  if (msg.type === 'siteHomepage' || msg.type === 'searchFailed') {
                    popAndNavigateFallback(null);
                  } else if (msg.type === 'pageInfo') {
                    if (NON_CHAPTER_URL_RE.test(msg.url || '')) return;
                    const { manga, chapter } = parseMangaInfo(msg.title, msg.heading);
                    if (manga && manga !== mangaTitle) {
                      animateTitle(manga, chapter);
                      setFallbackChain([]);
                    } else if (chapter && chapter !== chapterLabel) {
                      Animated.timing(titleFade, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
                        setChapterLabel(chapter);
                        Animated.timing(titleFade, { toValue: 1, duration: 160, useNativeDriver: true }).start();
                      });
                    }
                  } else if (msg.type === 'chapterCount') {
                    if (msg.count > 0) {
                      setWebChapterCount((prev) => Math.max(prev, msg.count));
                      if (msg.items?.length) {
                        setWebChapterList((prev) => (msg.items.length >= prev.length ? msg.items : prev));
                      }
                    }
                  } else if (msg.type === 'imageList') {
                    pendingImagesRef.current = null;
                    const purpose = imagePurposeRef.current;
                    imagePurposeRef.current = null;
                    if (purpose === 'read') {
                      // Fewer than 3 images usually means extraction caught nav
                      // icons/ads rather than real pages — stay on raw WebView.
                      setWebReaderPages(msg.images && msg.images.length >= 3 ? msg.images : []);
                    } else {
                      executeChapterDownload(msg.images);
                    }
                  } else if (msg.type === 'openWindow') {
                    // window.open() called in-page — follow only same-site /
                    // known-site targets; off-site opens are popunder ads
                    const u = msg.url || '';
                    if (u.startsWith('http') && isTrustedPopup(u, currentUrl)) setCurrentUrl(u);
                  }
                } catch (_) {}
              }
            }}
            onScroll={handleScrollProgress}
            scrollEventThrottle={32}
            onOpenWindow={(syntheticEvent) => {
              const targetUrl = syntheticEvent?.nativeEvent?.targetUrl;
              if (!targetUrl || !targetUrl.startsWith('http')) return;
              if (AD_NETWORK_PATTERNS.some((p) => targetUrl.toLowerCase().includes(p))) return;
              if (!isTrustedPopup(targetUrl, currentUrl)) return;
              setCurrentUrl(targetUrl);
            }}
            onShouldStartLoadWithRequest={(req) => {
              const url = (req.url || '').toLowerCase();
              if (AD_NETWORK_PATTERNS.some((b) => url.includes(b))) return false;
              if (isLoginUrl(req.url)) {
                setTimeout(() => handleLoginIntercepted(), 0);
                return false;
              }
              // Block non-http schemes that would open external apps (tel, mailto, intent, etc.)
              if (!req.url.startsWith('http') && !req.url.startsWith('about:') && !req.url.startsWith('data:') && !req.url.startsWith('blob:')) return false;
              return true;
            }}
            onHttpError={(syntheticEvent) => {
              if (!searchQuery) return;
              const { statusCode, url: errUrl } = syntheticEvent.nativeEvent;
              try {
                if (errUrl && currentUrl && new URL(errUrl).hostname !== new URL(currentUrl).hostname) return;
              } catch (_) { return; }
              if (statusCode === 403) {
                popAndNavigateFallback('Blocked (403)');
              } else if (statusCode === 404) {
                popAndNavigateFallback('Not found (404)');
              } else if (statusCode >= 500) {
                popAndNavigateFallback(`Server error (${statusCode})`);
              }
            }}
            onError={(syntheticEvent) => {
              if (!searchQuery || pendingStepsRef.current > 0) return;
              const { url: errUrl, code } = syntheticEvent.nativeEvent;
              // -999 = iOS cancelled load, -3 = Android ERR_ABORTED — both are benign
              if (code === -999 || code === -3) return;
              try {
                if (errUrl && currentUrl && new URL(errUrl).hostname !== new URL(currentUrl).hostname) return;
              } catch (_) { return; }
              popAndNavigateFallback('Failed to load');
            }}
          />
          {mode === 'manga' && (
            <TouchableOpacity style={styles.mangaTapOverlay} activeOpacity={1} onPress={handleMangaTap}>
              <View style={styles.mangaHintWrap} pointerEvents="none">
                <Text style={styles.mangaHintText}>← Tap left · Center to hide UI · Tap right →</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Clean extracted Reader Mode — overlays the still-live WebView
              (which keeps driving navigation/detection underneath) with the
              same native PageImage/FlatList UI the MangaDex path uses. */}
          {webReaderPages.length > 0 && (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0D0D0F' }]}>
              <FlatList
                ref={webReaderListRef}
                data={webReaderPages}
                keyExtractor={(uri) => uri}
                renderItem={({ item }) => (
                  <PageImage
                    uri={item}
                    onSingleTap={() => setShowUI((v) => !v)}
                    onDoubleTap={(u) => setZoomUri(u)}
                  />
                )}
                showsVerticalScrollIndicator={false}
                removeClippedSubviews={false}
                initialNumToRender={4}
                maxToRenderPerBatch={5}
                windowSize={8}
                updateCellsBatchingPeriod={50}
              />
            </View>
          )}
        </View>
      )}

      {/* ── Page zoom viewer ─────────────────────────────────────────────── */}
      <Modal visible={!!zoomUri} transparent animationType="fade" onRequestClose={() => setZoomUri(null)}>
        {zoomUri ? <ZoomViewer uri={zoomUri} onClose={() => setZoomUri(null)} /> : null}
      </Modal>

      {/* ── Screen dimmer — sits over content, under the HUD ─────────────── */}
      {dimmer > 0 && (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${dimmer})` }]}
        />
      )}

      {/* ── Bottom bar ───────────────────────────────────────────────────── */}
      <Animated.View
        style={[styles.bottomBar, { backgroundColor: hudBg, borderTopColor: hudBorder, paddingBottom: Math.max(insets.bottom + 10, 20), opacity: uiOpacity, transform: [{ translateY: uiTranslateBottom }] }]}
        pointerEvents={showUI ? 'auto' : 'none'}>
        <View style={styles.chapterNavGroup}>
          <Animated.View style={{ transform: [{ translateX: prevChapterX }] }}>
            <TouchableOpacity
              onPress={goToPrevChapter}
              disabled={readerMode === 'api' ? currentChapterIdx <= 0 : currentChapter <= 1}
              style={[styles.chapterArrowBtn, (readerMode === 'api' ? currentChapterIdx <= 0 : currentChapter <= 1) && styles.chapterArrowDisabled]}>
              <Ionicons name="chevron-back" size={18} color={hudText} />
            </TouchableOpacity>
          </Animated.View>
          <TouchableOpacity style={[styles.chapterSelectBtn, { backgroundColor: hudCard }]} onPress={() => setShowChapterSelect((v) => !v)}>
            <View style={{ alignItems: 'center' }}>
              <Text style={[styles.chapterSelectText, { color: hudText }]}>Ch. {currentChapter}</Text>
              {readerMode === 'api' && pages.length > 0 && (
                <Text style={styles.chapterSelectPage}>{currentPage} / {pages.length}</Text>
              )}
            </View>
            <Ionicons name="chevron-up" size={14} color={hudMuted} style={{ marginLeft: 4 }} />
          </TouchableOpacity>
          <Animated.View style={{ transform: [{ translateX: nextChapterX }] }}>
            <TouchableOpacity
              onPress={goToNextChapter}
              disabled={readerMode === 'api' && currentChapterIdx >= apiChapters.length - 1}
              style={[styles.chapterArrowBtn, readerMode === 'api' && currentChapterIdx >= apiChapters.length - 1 && styles.chapterArrowDisabled]}>
              <Ionicons name="chevron-forward" size={18} color={hudText} />
            </TouchableOpacity>
          </Animated.View>
        </View>
        <View style={styles.bottomActions}>
          {readerMode !== 'api' && mode === 'webtoon' && (
            <TouchableOpacity
              style={[styles.bottomIconBtn, autoScroll && styles.bottomIconBtnActive]}
              onPress={() => setAutoScroll((v) => !v)}>
              <Ionicons name={autoScroll ? 'pause' : 'play'} size={20} color={autoScroll ? '#1D9E75' : hudMuted} />
            </TouchableOpacity>
          )}
          {readerMode !== 'api' && (
            <TouchableOpacity
              style={[styles.bottomIconBtn, mode === 'manga' && styles.modeToggleActive]}
              onPress={() => setMode((m) => m === 'webtoon' ? 'manga' : 'webtoon')}>
              <Ionicons name={mode === 'webtoon' ? 'reader-outline' : 'albums-outline'} size={20} color={mode === 'manga' ? '#7B5CFF' : hudMuted} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.bottomIconBtn} onPress={handleBookmark}>
            <Ionicons name={bookmarked ? 'bookmark' : 'bookmark-outline'} size={20} color={bookmarked ? '#7B5CFF' : hudMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.bottomIconBtn} onPress={() => setShowUI((v) => !v)}>
            <Ionicons name={showUI ? 'eye-outline' : 'eye-off-outline'} size={20} color={showUI ? hudMuted : '#7B5CFF'} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {!showUI && (
        <TouchableOpacity style={[styles.eyeBtn, { backgroundColor: isDark ? 'rgba(13,13,15,0.7)' : 'rgba(255,255,255,0.85)', borderColor: hudBorder }]} onPress={() => { setShowUI(true); setReaderHidden(false); }}>
          <Ionicons name="eye-outline" size={18} color={hudMuted} />
        </TouchableOpacity>
      )}

      {/* ── Chapter picker — floating dropdown ──────────────────────────── */}
      {showChapterSelect && (
        <View style={styles.chapterDropdown}>
          <Text style={styles.chapterDropdownLabel}>
            {readerMode === 'api'
              ? `${chapterListForPicker.length} ch`
              : webChapterCount > 0
                ? `${webChapterCount} ch`
                : chapters < 999
                  ? `${chapters} ch`
                  : '? ch'
            } · current: {currentChapter}
          </Text>
          <FlatList
            ref={chapterListRef}
            data={chapterListForPicker}
            keyExtractor={(_, i) => String(i)}
            initialScrollIndex={Math.max(chapterListActiveIdx - 1, 0)}
            getItemLayout={(_, index) => ({ length: CHAPTER_ROW_H, offset: CHAPTER_ROW_H * index, index })}
            onScrollToIndexFailed={() => {
              setTimeout(() => {
                chapterListRef.current?.scrollToIndex({
                  index: chapterListActiveIdx,
                  animated: false,
                  viewPosition: 0.25,
                });
              }, 120);
            }}
            showsVerticalScrollIndicator={false}
            style={{ flex: 1 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.chapterListRow, item.active && styles.chapterListRowActive]}
                activeOpacity={0.65}
                onPress={() => {
                  setShowChapterSelect(false);
                  if (item.active) return;
                  if (readerMode === 'api') loadApiChapter(item.idx);
                  else if (item.href) goToChapterHref(item.href, item.num);
                  else goChapterDirect(item.num);
                }}>
                <View style={styles.chapterListDotWrap}>
                  {item.active && <View style={styles.chapterListActiveDot} />}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[
                    styles.chapterListNum,
                    item.active && styles.chapterListNumActive,
                    item.isRead && !item.active && styles.chapterListNumRead,
                  ]}>
                    {item.shortLabel}
                  </Text>
                  {item.title ? (
                    <Text
                      style={[styles.chapterListTitle, item.isRead && !item.active && { opacity: 0.45 }]}
                      numberOfLines={1}>
                      {item.title}
                    </Text>
                  ) : null}
                </View>
                {item.active
                  ? <Ionicons name="play" size={11} color="#7B5CFF" />
                  : item.isRead
                    ? <Ionicons name="checkmark" size={13} color="#1D9E75" />
                    : null}
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* ── Site picker modal ────────────────────────────────────────────── */}
      <Modal visible={showSitePicker} animationType="slide" transparent onRequestClose={() => { setShowSitePicker(false); setSiteSearch(''); }}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => { setShowSitePicker(false); setSiteSearch(''); }}>
          <View style={[styles.siteSheet, sheetC.sheet]}>
            <View style={[styles.sheetHandle, sheetC.handle]} />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, sheetC.title]}>Reading Browser</Text>
              <TouchableOpacity onPress={() => { setShowSitePicker(false); setSiteSearch(''); }}>
                <Ionicons name="close" size={20} color="#9B9AA3" />
              </TouchableOpacity>
            </View>

            <View style={styles.siteInputRow}>
              <Ionicons name="search-outline" size={14} color="#9B9AA3" />
              <TextInput
                value={siteSearch}
                onChangeText={setSiteSearch}
                onSubmitEditing={submitSiteInput}
                placeholder="Search sites or paste URL…"
                placeholderTextColor="rgba(155,154,163,0.5)"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.siteInputField}
              />
              {siteSearch ? (
                <TouchableOpacity onPress={submitSiteInput} style={styles.siteGoBtn}>
                  <Text style={styles.siteGoBtnText}>Go</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              {siteSuggestions ? (
                <>
                  <Text style={styles.siteSectionLabel}>
                    {siteSuggestions.length === 0 ? 'No results' : `${siteSuggestions.length} match${siteSuggestions.length !== 1 ? 'es' : ''}`}
                  </Text>
                  <View style={styles.sitesGrid}>
                    {siteSuggestions.slice(0, 18).map((site) => (
                      <SiteCard key={site.url} site={site} active={activeSite?.url === site.url} onPress={() => openSite(site)} />
                    ))}
                  </View>
                </>
              ) : (
                <>
                  {savedSites.length > 0 && (
                    <>
                      <View style={styles.siteSectionRow}>
                        <Text style={styles.siteSectionLabel}>Recent</Text>
                        <TouchableOpacity onPress={clearAllRecents} style={styles.clearAllBtn}>
                          <Text style={styles.clearAllText}>Clear All</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.sitesGrid}>
                        {savedSites.map((site) => (
                          <SiteCard
                            key={site.url}
                            site={site}
                            active={activeSite?.url === site.url}
                            onPress={() => openSite(site)}
                            onRemove={() => removeRecentSite(site.url)}
                          />
                        ))}
                      </View>
                    </>
                  )}
                  <Text style={styles.siteSectionLabel}>Quick Picks</Text>
                  <View style={styles.sitesGrid}>
                    {FEATURED_SITES.map((site) => (
                      <SiteCard key={site.url} site={site} active={activeSite?.url === site.url} onPress={() => openSite(site)} />
                    ))}
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Ambience ─────────────────────────────────────────────────────── */}
      <Modal visible={showAmbience} animationType="slide" transparent onRequestClose={() => setShowAmbience(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setShowAmbience(false)}>
          <View style={[styles.sheet, sheetC.sheet]}>
            <View style={[styles.sheetHandle, sheetC.handle]} />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, sheetC.title]}>Ambience</Text>
              {ambienceState.presetId && (
                <View style={styles.playingBadge}><Text style={styles.playingText}>Playing</Text></View>
              )}
              <TouchableOpacity onPress={() => setShowAmbience(false)}>
                <Ionicons name="close" size={20} color="#9B9AA3" />
              </TouchableOpacity>
            </View>

            <View style={styles.ambienceOptions}>
              {AMBIENCE_PRESETS.map((p) => (
                <AmbienceButton
                  key={p.id}
                  preset={p}
                  active={ambienceState.presetId === p.id}
                  onPress={() => ambienceState.presetId === p.id ? ambienceStop() : ambiencePlay(p.id)}
                />
              ))}
            </View>

            {ambienceState.presetId && (() => {
              const activeColor = AMBIENCE_PRESETS.find((p) => p.id === ambienceState.presetId)?.color || '#7B5CFF';
              return (
                <View style={styles.ambienceVolRow}>
                  <TouchableOpacity style={styles.ambienceVolBtn} onPress={() => ambienceSetVolume(ambienceState.volume - 0.1)}>
                    <Ionicons name="volume-low-outline" size={16} color="#9B9AA3" />
                  </TouchableOpacity>
                  <AmbienceVolumeSlider volume={ambienceState.volume} color={activeColor} />
                  <TouchableOpacity style={styles.ambienceVolBtn} onPress={() => ambienceSetVolume(ambienceState.volume + 0.1)}>
                    <Ionicons name="volume-high-outline" size={16} color="#9B9AA3" />
                  </TouchableOpacity>
                  <Text style={[styles.ambienceVolPct, { color: activeColor }]}>{Math.round(ambienceState.volume * 100)}%</Text>
                </View>
              );
            })()}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Reader settings ──────────────────────────────────────────────── */}
      <Modal visible={showReaderSettings} animationType="slide" transparent onRequestClose={() => setShowReaderSettings(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setShowReaderSettings(false)}>
          <View style={[styles.sheet, sheetC.sheet]}>
            <View style={[styles.sheetHandle, sheetC.handle]} />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, sheetC.title]}>Reader Settings</Text>
              <TouchableOpacity onPress={() => setShowReaderSettings(false)}><Ionicons name="close" size={20} color="#9B9AA3" /></TouchableOpacity>
            </View>
            {readerMode !== 'api' && (
              <>
                <Text style={styles.modeSectionLabel}>Reading mode</Text>
                <View style={styles.readerRow}>
                  {READER_MODES.map((m) => {
                    const active = mode === m.id;
                    return (
                      <TouchableOpacity
                        key={m.id}
                        style={[styles.readerBtn, active && styles.readerBtnActive]}
                        onPress={() => { setMode(m.id); AsyncStorage.setItem(READER_MODE_KEY, m.id); }}
                        activeOpacity={0.8}>
                        <m.Icon active={active} />
                        <Text style={[styles.readerBtnText, active && styles.readerBtnTextActive]}>{m.label}</Text>
                        <Text style={styles.readerBtnSub}>{m.desc}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
            {readerMode === 'webview' && mode === 'webtoon' && (
              <View style={[styles.settingsRow, sheetC.rowBorder]}>
                <Ionicons name="play-forward-outline" size={18} color="#9B9AA3" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.settingsRowText, sheetC.rowText]}>Auto-scroll speed</Text>
                </View>
                {AUTO_SCROLL_SPEEDS.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.speedChip, autoScrollSpeed === s.id && styles.speedChipActive]}
                    onPress={() => {
                      setAutoScrollSpeed(s.id);
                      AsyncStorage.setItem(SCROLL_SPEED_KEY, s.id).catch(() => {});
                    }}>
                    <Text style={[styles.speedChipText, autoScrollSpeed === s.id && styles.speedChipTextActive]}>{s.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {readerMode === 'webview' && (
              <TouchableOpacity style={[styles.settingsRow, sheetC.rowBorder]} onPress={toggleForceDark}>
                <Ionicons name={forceDarkSites ? 'moon' : 'moon-outline'} size={18} color={forceDarkSites ? '#7B5CFF' : '#9B9AA3'} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.settingsRowText, sheetC.rowText]}>Force dark on websites</Text>
                  <Text style={styles.settingsRowSub}>Inverts page colors — manga pages stay normal</Text>
                </View>
                <View style={[styles.settingsToggle, forceDarkSites && styles.settingsToggleOn]}>
                  <View style={[styles.settingsToggleDot, forceDarkSites && styles.settingsToggleDotOn]} />
                </View>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.settingsRow, sheetC.rowBorder]} onPress={toggleLandscape}>
              <Ionicons name={allowLandscape ? 'phone-landscape' : 'phone-portrait-outline'} size={18} color={allowLandscape ? '#7B5CFF' : '#9B9AA3'} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.settingsRowText, sheetC.rowText]}>Allow landscape</Text>
                <Text style={styles.settingsRowSub}>Rotate your device to read in landscape</Text>
              </View>
              <View style={[styles.settingsToggle, allowLandscape && styles.settingsToggleOn]}>
                <View style={[styles.settingsToggleDot, allowLandscape && styles.settingsToggleDotOn]} />
              </View>
            </TouchableOpacity>
            <View style={[styles.settingsRow, sheetC.rowBorder]}>
              <Ionicons name="sunny-outline" size={18} color="#EF9F27" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.settingsRowText, sheetC.rowText]}>Screen dimmer</Text>
                <Text style={styles.settingsRowSub}>{dimmer === 0 ? 'Off' : `${Math.round(dimmer / 0.7 * 100)}% dim`}</Text>
              </View>
              <TouchableOpacity style={styles.dimmerBtn} onPress={() => adjustDimmer(-0.1)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                <Ionicons name="remove" size={16} color="#9B9AA3" />
              </TouchableOpacity>
              <View style={styles.dimmerTrack}>
                <View style={[styles.dimmerFill, { width: `${Math.round(dimmer / 0.7 * 100)}%` }]} />
              </View>
              <TouchableOpacity style={styles.dimmerBtn} onPress={() => adjustDimmer(0.1)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                <Ionicons name="add" size={16} color="#9B9AA3" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={[styles.settingsRow, sheetC.rowBorder]} onPress={requestChapterDownload}>
              <Ionicons name="cloud-download-outline" size={18} color="#1D9E75" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.settingsRowText, sheetC.rowText]}>Download Chapter</Text>
                <Text style={styles.settingsRowSub}>Save pages to your Library for offline reading</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color="#9B9AA3" />
            </TouchableOpacity>
            {readerMode === 'api' && apiChapters.length > currentChapterIdx + 1 && (
              <TouchableOpacity style={[styles.settingsRow, sheetC.rowBorder]} onPress={() => downloadNextChapters(5)}>
                <Ionicons name="albums-outline" size={18} color="#1D9E75" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.settingsRowText, sheetC.rowText]}>Download next 5 chapters</Text>
                  <Text style={styles.settingsRowSub}>Batch-save from here for offline reading</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color="#9B9AA3" />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.settingsRow, sheetC.rowBorder]} onPress={toggleReaderHidden}>
              <Ionicons name={readerHidden ? 'eye-off-outline' : 'eye-outline'} size={18} color="#9B9AA3" />
              <Text style={[styles.settingsRowText, sheetC.rowText]}>{readerHidden ? 'Show reader UI' : 'Hide reader UI'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.settingsRow, sheetC.rowBorder]} onPress={handleClearCache}>
              <Ionicons name="reload-outline" size={18} color="#9B9AA3" />
              <Text style={[styles.settingsRowText, sheetC.rowText]}>{readerMode === 'api' ? 'Reload chapter' : 'Clear cache & reload'}</Text>
            </TouchableOpacity>
            {searchQuery && (
              <TouchableOpacity style={[styles.settingsRow, sheetC.rowBorder]} onPress={handleStartFromBeginning}>
                <Ionicons name="refresh-circle-outline" size={18} color="#E8527A" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.settingsRowText, sheetC.rowText]}>Start from beginning</Text>
                  <Text style={styles.settingsRowSub}>Clear resume and go to Chapter 1</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Share ─────────────────────────────────────────────────────────── */}
      <Modal visible={showShare} animationType="slide" transparent onRequestClose={() => setShowShare(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setShowShare(false)}>
          <View style={[styles.sheet, sheetC.sheet]}>
            <View style={[styles.sheetHandle, sheetC.handle]} />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, sheetC.title]}>Share</Text>
              <TouchableOpacity onPress={() => setShowShare(false)}><Ionicons name="close" size={20} color="#9B9AA3" /></TouchableOpacity>
            </View>
            <View style={styles.sharePreview}>
              <Text style={styles.sharePreviewLogo}>MangaRecs</Text>
              <View style={{ flex: 1 }} />
              <Text style={styles.sharePreviewLabel}>Currently reading</Text>
              <Text style={styles.sharePreviewTitle}>{displayTitle}</Text>
              <Text style={styles.sharePreviewChapter}>{displayChapter}</Text>
              <View style={styles.sharePreviewBar}>
                <View style={[styles.sharePreviewBarFill, { width: `${scrollProgress}%` }]} />
              </View>
            </View>
            <View style={styles.shareButtonsRow}>
              <TouchableOpacity style={styles.copyLinkBtn} onPress={() => {
                const msg = `I'm reading "${displayTitle}" on MangaRecs!\nmangarecs://series/${encodeURIComponent(displayTitle)}`;
                Share.share({ message: msg, title: displayTitle })
                  .then((result) => {
                    if (result.action === Share.sharedAction) {
                      if (userId) incrementSharesCount(userId);
                      setShowShare(false);
                    }
                  })
                  .catch(() => {});
              }}>
                <Ionicons name="copy-outline" size={16} color="#fff" />
                <Text style={styles.copyLinkText}>Copy Link</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareStoryBtn} onPress={() => {
                const msg = `Check out "${displayTitle}" on MangaRecs — the best manga reader app!\nmangarecs://series/${encodeURIComponent(displayTitle)}`;
                Share.share({ message: msg, title: displayTitle })
                  .then((result) => {
                    if (result.action === Share.sharedAction) {
                      if (userId) incrementSharesCount(userId);
                      setShowShare(false);
                    }
                  })
                  .catch(() => {});
              }}>
                <Ionicons name="logo-instagram" size={16} color="#fff" />
                <Text style={styles.shareStoryText}>Share Story</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Resolving overlay ───────────────────────────────────────────── */}
      {resolving && (
        <View style={styles.resolvingOverlay}>
          <TouchableOpacity style={styles.resolvingBackBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
          <ActivityIndicator size="large" color="#7B5CFF" />
          <Text style={styles.resolvingTitle} numberOfLines={2}>
            {routeTitle || searchQuery || 'Finding manga…'}
          </Text>
          <Text style={styles.resolvingSub}>
            {resuming
              ? 'Resuming where you left off…'
              : resolvingSiteName === 'MangaDex'
                ? 'Loading from MangaDex…'
                : resolvingSiteName
                  ? `Searching on ${resolvingSiteName}…`
                  : 'Finding the best source…'}
          </Text>
        </View>
      )}

      {/* ── Download progress overlay ────────────────────────────────────── */}
      <Modal visible={downloading} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.dlOverlay}>
          <View style={styles.dlCard}>
            <View style={styles.dlIconWrap}>
              <ActivityIndicator size="large" color="#1D9E75" />
            </View>
            <Text style={styles.dlTitle}>Downloading…</Text>
            <Text style={styles.dlSub} numberOfLines={1}>{dlLabel}</Text>
            <View style={styles.dlBarBg}>
              <View style={[styles.dlBarFill, { width: dlTotal > 0 ? `${(dlProgress / dlTotal) * 100}%` : '0%' }]} />
            </View>
            <Text style={styles.dlCount}>{dlProgress} / {dlTotal} pages</Text>
          </View>
        </View>
      </Modal>

      {savedToast && (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }]}>
          <Ionicons name="checkmark" size={14} color="#085041" />
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:              { flex: 1, backgroundColor: '#0D0D0F' },
  progressBar:            { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: '#2A2A2F', zIndex: 100 },
  progressFill:           { height: 3, backgroundColor: '#7B5CFF' },
  topBar:                 { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 90, backgroundColor: 'rgba(13,13,15,0.92)' },
  topRow:                 { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 10, minHeight: 56 },
  topBarLeft:             { minWidth: 80, flexDirection: 'row', alignItems: 'center' },
  backBtn:                { padding: 8 },
  centerTitleWrap:        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  centerTitleRow:         { flexDirection: 'row', alignItems: 'center' },
  readerTitle:            { color: '#fff', fontSize: 14, fontWeight: '600', maxWidth: 120, textAlign: 'center' },
  chapterLabel:           { color: '#9B9AA3', fontSize: 11, marginTop: 2, textAlign: 'center' },
  reloadBtn:              { padding: 6, marginHorizontal: 4 },
  offlineBadge:           { padding: 6, marginHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  topRightIcons:          { width: 80, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  topIconBtn:             { padding: 6, marginLeft: 2 },
  webtoonWrapper:         { flex: 1, position: 'relative' },
  webview:                { flex: 1, backgroundColor: '#0D0D0F' },
  mangaTapOverlay:        { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', alignItems: 'center' },
  mangaHintWrap:          { paddingBottom: 12 },
  mangaHintText:          { color: 'rgba(255,255,255,0.3)', fontSize: 10 },
  bottomBar:              { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 90, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(13,13,15,0.92)', borderTopWidth: 1, borderTopColor: '#2A2A2F', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28 },
  chapterNavGroup:        { flexDirection: 'row', alignItems: 'center' },
  chapterArrowBtn:        { padding: 7, borderRadius: 20 },
  chapterArrowDisabled:   { opacity: 0.3 },
  chapterSelectBtn:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1F', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginHorizontal: 2 },
  chapterSelectText:      { color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  chapterSelectPage:      { color: '#5C5B63', fontSize: 9, textAlign: 'center', marginTop: 1 },
  bottomActions:          { flexDirection: 'row', alignItems: 'center' },
  bottomIconBtn:          { padding: 8, marginLeft: 4 },
  bottomIconBtnActive:    { backgroundColor: 'rgba(29,158,117,0.15)', borderRadius: 20 },
  modeToggleActive:       { backgroundColor: 'rgba(123,92,255,0.15)', borderRadius: 20 },
  eyeBtn:                 { position: 'absolute', bottom: 24, right: 16, padding: 10, borderRadius: 24, backgroundColor: 'rgba(13,13,15,0.7)', borderWidth: 1, borderColor: '#2A2A2F', zIndex: 90 },
  // Chapter floating dropdown
  chapterDropdown:        { position: 'absolute', bottom: 90, left: 16, width: '50%', height: 300, backgroundColor: '#1A1A1F', borderRadius: 16, borderWidth: 1, borderColor: '#2A2A2F', overflow: 'hidden', zIndex: 95 },
  chapterDropdownLabel:   { color: '#5C5B63', fontSize: 10, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  chapterListRow:         { flexDirection: 'row', alignItems: 'center', height: CHAPTER_ROW_H, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#242428' },
  chapterListRowActive:   { backgroundColor: 'rgba(123,92,255,0.12)' },
  chapterListDotWrap:     { width: 14, alignItems: 'center', marginRight: 8 },
  chapterListActiveDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: '#7B5CFF' },
  chapterListNum:         { color: '#fff', fontSize: 12, fontWeight: '600' },
  chapterListNumActive:   { color: '#7B5CFF' },
  chapterListNumRead:     { color: '#5C5B63', fontWeight: '400' },
  chapterListTitle:       { color: '#9B9AA3', fontSize: 10, marginTop: 2 },
  sheetOverlay:           { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:                  { backgroundColor: '#1A1A1F', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  siteSheet:              { backgroundColor: '#1A1A1F', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '88%' },
  sheetHandle:            { width: 40, height: 4, backgroundColor: '#2A2A2F', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetHeader:            { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  sheetTitle:             { color: '#fff', fontSize: 18, fontWeight: 'bold', flex: 1 },
  playingBadge:           { backgroundColor: '#1D9E75', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, marginRight: 12 },
  playingText:            { color: '#fff', fontSize: 12, fontWeight: '600' },
  ambienceOptions:        { flexDirection: 'row', justifyContent: 'space-between' },
  // width (not flex) — the button sits inside an auto-height animated wrapper,
  // where flex:1 collapses the content to zero height (invisible icon/label)
  ambienceBtn:            { width: '100%', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 4, borderRadius: 11, backgroundColor: '#0D0D0F', borderWidth: 1.5, borderColor: '#2A2A2F' },
  ambienceBtnLabel:       { color: '#9B9AA3', fontSize: 11, fontWeight: '600', marginTop: 5 },

  ambienceVolRow:         { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 },
  ambienceVolBtn:         { padding: 6 },
  // Slider: generous touch height with the thin track centered inside it
  ambienceVolSlider:      { flex: 1, height: 28, justifyContent: 'center' },
  ambienceVolTrack:       { height: 4, borderRadius: 2, backgroundColor: '#2A2A2F', overflow: 'hidden' },
  ambienceVolFill:        { height: 4, backgroundColor: '#7B5CFF', borderRadius: 2 },
  ambienceVolThumb:       { position: 'absolute', width: 14, height: 14, borderRadius: 7, marginLeft: -7, top: 7, backgroundColor: '#7B5CFF', elevation: 2 },
  ambienceVolPct:         { fontSize: 11, fontWeight: '700', minWidth: 34, textAlign: 'right' },
  modeSectionLabel:       { color: '#9B9AA3', fontSize: 11, fontWeight: '600', marginBottom: 10 },
  readerRow:              { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  readerBtn:              { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12, backgroundColor: 'rgba(155,154,163,0.06)', marginHorizontal: 4, borderWidth: 1, borderColor: '#2A2A2F' },
  readerBtnActive:        { borderColor: '#7B5CFF', backgroundColor: 'rgba(123,92,255,0.15)' },
  readerBtnText:          { color: '#9B9AA3', fontSize: 12, fontWeight: '600', marginTop: 8 },
  readerBtnTextActive:    { color: '#7B5CFF' },
  readerBtnSub:           { color: 'rgba(155,154,163,0.5)', fontSize: 10, marginTop: 2 },
  settingsRow:            { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#2A2A2F' },
  settingsRowText:        { color: '#fff', fontSize: 14, marginLeft: 12 },
  settingsRowSub:         { color: '#9B9AA3', fontSize: 11, marginLeft: 12, marginTop: 2 },
  settingsToggle:         { width: 40, height: 22, borderRadius: 11, backgroundColor: '#2A2A2F', padding: 2, justifyContent: 'center' },
  settingsToggleOn:       { backgroundColor: 'rgba(123,92,255,0.45)' },
  settingsToggleDot:      { width: 18, height: 18, borderRadius: 9, backgroundColor: '#9B9AA3' },
  settingsToggleDotOn:    { backgroundColor: '#7B5CFF', alignSelf: 'flex-end' },
  speedChip:              { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(155,154,163,0.12)', marginLeft: 6 },
  speedChipActive:        { backgroundColor: 'rgba(123,92,255,0.25)' },
  speedChipText:          { color: '#9B9AA3', fontSize: 11, fontWeight: '600' },
  speedChipTextActive:    { color: '#7B5CFF' },
  dimmerBtn:              { padding: 4 },
  dimmerTrack:            { width: 72, height: 4, borderRadius: 2, backgroundColor: '#2A2A2F', overflow: 'hidden', marginHorizontal: 2 },
  dimmerFill:             { height: 4, backgroundColor: '#EF9F27', borderRadius: 2 },
  sharePreview:           { backgroundColor: '#2D1B69', borderRadius: 16, padding: 20, height: 200, marginBottom: 16 },
  sharePreviewLogo:       { color: '#fff', fontSize: 14, fontWeight: 'bold', backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  sharePreviewLabel:      { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  sharePreviewTitle:      { color: '#fff', fontSize: 20, fontWeight: 'bold', marginTop: 2 },
  sharePreviewChapter:    { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4, marginBottom: 8 },
  sharePreviewBar:        { height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2 },
  sharePreviewBarFill:    { height: 4, backgroundColor: '#fff', borderRadius: 2 },
  shareButtonsRow:        { flexDirection: 'row' },
  copyLinkBtn:            { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2A2A2F', paddingVertical: 14, borderRadius: 12, marginRight: 8 },
  copyLinkText:           { color: '#fff', fontSize: 13, fontWeight: '600', marginLeft: 6 },
  shareStoryBtn:          { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#D8336B', paddingVertical: 14, borderRadius: 12 },
  shareStoryText:         { color: '#fff', fontSize: 13, fontWeight: '600', marginLeft: 6 },

  // site picker
  apiModeBanner:          { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(123,92,255,0.12)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(123,92,255,0.3)' },
  apiModeBannerText:      { color: '#7B5CFF', fontSize: 12, marginLeft: 6, flex: 1 },
  siteInputRow:           { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D0D0F', borderRadius: 12, borderWidth: 1, borderColor: '#2A2A2F', paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14 },
  siteInputField:         { flex: 1, color: '#fff', fontSize: 13, marginLeft: 8 },
  siteGoBtn:              { backgroundColor: '#7B5CFF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  siteGoBtnText:          { color: '#fff', fontSize: 12, fontWeight: '600' },
  siteSectionRow:         { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  siteSectionLabel:       { color: '#9B9AA3', fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 },
  clearAllBtn:            { paddingVertical: 4, paddingHorizontal: 8 },
  clearAllText:           { color: '#FF3B30', fontSize: 11, fontWeight: '600' },
  sitesGrid:              { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  // api reader
  pagesLoadingWrap:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pagesLoadingText:       { color: '#9B9AA3', fontSize: 13, marginTop: 12 },
  noPages:                { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 120 },
  noPagesText:            { color: '#9B9AA3', fontSize: 14, marginTop: 12, textAlign: 'center' },
  openInBrowserBtn:       { marginTop: 16, backgroundColor: '#7B5CFF', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  openInBrowserText:      { color: '#fff', fontSize: 13, fontWeight: '600' },
  pageCounter:            { position: 'absolute', bottom: 78, right: 16, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  pageCounterText:        { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600' },
  // download overlay
  dlOverlay:              { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  dlCard:                 { backgroundColor: '#1A1A1F', borderRadius: 20, padding: 28, alignItems: 'center', width: '100%', borderWidth: 1, borderColor: '#2A2A2F' },
  dlIconWrap:             { marginBottom: 16 },
  dlTitle:                { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  dlSub:                  { color: '#9B9AA3', fontSize: 12, marginTop: 6, marginBottom: 16 },
  dlBarBg:                { width: '100%', height: 6, backgroundColor: '#2A2A2F', borderRadius: 3 },
  dlBarFill:              { height: 6, backgroundColor: '#1D9E75', borderRadius: 3 },
  dlCount:                { color: '#9B9AA3', fontSize: 12, marginTop: 8 },
  // resolving overlay
  resolvingOverlay:       { ...StyleSheet.absoluteFillObject, backgroundColor: '#0D0D0F', alignItems: 'center', justifyContent: 'center', zIndex: 150 },
  resolvingBackBtn:       { position: 'absolute', top: 50, left: 16, padding: 10 },
  resolvingTitle:         { color: '#fff', fontSize: 18, fontWeight: 'bold', marginTop: 20, textAlign: 'center', paddingHorizontal: 32 },
  resolvingSub:           { color: '#9B9AA3', fontSize: 13, marginTop: 8 },
  // toast
  toast:                  { position: 'absolute', top: 90, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', backgroundColor: '#9FE1CB', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, zIndex: 200 },
  toastText:              { color: '#085041', fontSize: 12, fontWeight: '600', marginLeft: 6 },
});

const modeIconStyles = StyleSheet.create({
  webtoonBox:   { width: 20, height: 28, borderRadius: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 4 },
  triangleDown: { width: 0, height: 0, borderLeftWidth: 4, borderRightWidth: 4, borderTopWidth: 5, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  mangaRow:     { flexDirection: 'row', alignItems: 'center' },
  mangaBox:     { width: 28, height: 20, borderRadius: 4, borderWidth: 2 },
  triangleRight:{ width: 0, height: 0, borderTopWidth: 4, borderBottomWidth: 4, borderLeftWidth: 5, borderTopColor: 'transparent', borderBottomColor: 'transparent', marginLeft: 2 },
});
