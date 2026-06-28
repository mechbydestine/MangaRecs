import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  Modal, Animated, ScrollView, TextInput, Dimensions, Alert, ActivityIndicator, Image, FlatList, Platform, Share,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { TOP_SITES, buildSearchUrl, getDefaultSite, getReadingSiteForLang } from '../utils/mangaSearch';
import { getFaviconUrl } from '../utils/mangaCovers';
import { clearResumeCache, buildDirectUrl, AUTO_NAV_SEARCH_JS, AUTO_NAV_CHAPTER_JS, HOMEPAGE_DETECT_JS, SEARCH_WATCHDOG_JS, MANGADEX_CHAPTER_NAV_JS } from '../utils/siteResolver';
import { searchMangaDex } from '../utils/mangaDexApi';
import { useProfile } from '../utils/ProfileContext';
import { supabase } from '../supabase';
import { updateDailyLog, setLastRead, incrementSharesCount } from '../utils/readerUtils';
import { PRESETS as AMBIENCE_PRESETS, play as ambiencePlay, stop as ambienceStop, setVolume as ambienceSetVolume, subscribe as ambienceSubscribe, getState as ambienceGetState } from '../utils/ambiencePlayer';
import { useTheme } from '../utils/ThemeContext';

const SAVED_SITES_KEY = '@panelr/savedSites';
const LAST_SITE_KEY   = '@panelr/lastSite';
const LIBRARY_KEY     = '@panelr_saved';
const RESUME_KEY_PFX  = '@panelr/resume/';
const READER_MODE_KEY = '@panelr/readerMode';
const PAGE_ANIM_KEY   = '@panelr/pageAnim';
const CHAPTERS_DIR    = FileSystem.documentDirectory + 'chapters/';
const { width: SCREEN_W } = Dimensions.get('window');
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
    <View style={[modeIconStyles.webtoonBox, { borderColor: active ? '#534AB7' : '#5C5B63' }]}>
      <Animated.View style={{ transform: [{ translateY: arrowY }] }}>
        <View style={[modeIconStyles.triangleDown, { borderTopColor: active ? '#534AB7' : '#5C5B63' }]} />
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
      <View style={[modeIconStyles.mangaBox, { borderColor: active ? '#534AB7' : '#5C5B63' }]} />
      <Animated.View style={{ transform: [{ translateX: arrowX }] }}>
        <View style={[modeIconStyles.triangleRight, { borderLeftColor: active ? '#534AB7' : '#5C5B63' }]} />
      </Animated.View>
    </View>
  );
}

const READER_MODES = [
  { id: 'webtoon', label: 'Webtoon', desc: 'Scroll down', Icon: WebtoonIcon },
  { id: 'manga',   label: 'Manga',   desc: 'Tap sides',   Icon: MangaIcon },
];


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
        // Full-screen dimmer / backdrop / interstitial (covers >55% of viewport)
        if (h > vh * 0.55 && w > vw * 0.55) { rm(el); return; }
        // Sticky banner strip (height < 140px, wide enough to be a banner)
        if (h > 0 && h < 140 && w > vw * 0.25) { rm(el); return; }
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
  window.alert   = function() {};
  window.confirm = function() { return false; };
  window.prompt  = function() { return null; };
  window.open = function(url) {
    if (!url) return null;
    var u = String(url);
    if (!u.startsWith('http') || isAd(u)) return null;
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'openWindow', url: u }));
    }
    return null;
  };

  true;
})();
`;

const TAP_TOGGLE_JS = `
(function() {
  var sx=0,sy=0,moved=false,lpTimer=null,lpImg=null;
  document.addEventListener('touchstart',function(e){
    if(!e.touches||!e.touches[0])return;
    sx=e.touches[0].clientX; sy=e.touches[0].clientY; moved=false;
    var t=e.target;
    var img=t.tagName==='IMG'?t:(t.closest?t.closest('img'):null);
    if(img&&img.src&&img.src.startsWith('http')){
      lpImg=img;
      lpTimer=setTimeout(function(){
        if(!moved&&window.ReactNativeWebView){
          window.ReactNativeWebView.postMessage(JSON.stringify({type:'saveImage',src:lpImg.src}));
        }
        lpTimer=null;
      },600);
    }
  },{passive:true});
  document.addEventListener('touchmove',function(e){
    if(!e.touches||!e.touches[0])return;
    if(Math.abs(e.touches[0].clientX-sx)>8||Math.abs(e.touches[0].clientY-sy)>8){
      moved=true;
      if(lpTimer){clearTimeout(lpTimer);lpTimer=null;}
    }
  },{passive:true});
  document.addEventListener('touchend',function(e){
    if(lpTimer){clearTimeout(lpTimer);lpTimer=null;}
    if(moved)return;
    var t=e.target;
    if(t.closest&&t.closest('a,button,input,textarea,select,[role="button"]'))return;
    if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage('toggleUI');
  },{passive:true});
  true;
})();
`;

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

const AUTO_SCROLL_START_JS = `(function(){if(window.__is)clearInterval(window.__is);window.__is=setInterval(function(){window.scrollBy(0,2);},30);true;})();`;
const AUTO_SCROLL_STOP_JS  = `(function(){if(window.__is){clearInterval(window.__is);window.__is=null;}true;})();`;

// Detects actual chapter/episode count on a manga detail/series page.
// Skips reader pages, search pages, and homepages so it never fires in wrong context.
const EXTRACT_CHAPTER_COUNT_JS = `
(function(){
  if (window.__panelrChCounted) return true;
  window.__panelrChCounted = true;
  var url = window.location.href;
  var path = window.location.pathname;
  if (!path || path === '/' || path === '') return true;
  if (/[?&](s|q|search|keyword|query|term|name|word)=|\\/search[/?#]|\\/filter[/?#]/.test(url)) return true;
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

  function tryCount() {
    var max = 0;
    for (var i = 0; i < SELS.length; i++) {
      var els = document.querySelectorAll(SELS[i]);
      if (els.length > max) max = els.length;
    }
    if (max >= 1 && window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'chapterCount', count: max }));
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

function extractChapterFromUrl(url) {
  if (!url) return null;
  const ep = /[?&]episode_no=(\d+)/.exec(url);
  if (ep) return parseInt(ep[1], 10);
  const ch = /\/chapter[-/](\d+(?:\.\d+)?)/i.exec(url);
  if (ch) return Math.ceil(parseFloat(ch[1]));
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

function PageImage({ uri, onLayout }) {
  const [height, setHeight] = useState(SCREEN_W * 1.5);
  useEffect(() => {
    Image.getSize(
      uri,
      (w, h) => {
        if (w > 0) {
          const next = (h / w) * SCREEN_W;
          setHeight(next);
          onLayout?.(next);
        }
      },
      () => {}
    );
  }, [uri]);
  return (
    <Image
      source={{ uri, cache: 'force-cache' }}
      style={{ width: SCREEN_W, height }}
      resizeMode="cover"
      fadeDuration={0}
    />
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
  cardActive: { borderColor: '#534AB7', backgroundColor: '#1A1633' },
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
    title: routeTitle = 'Reader',
    chapters = 0,
    searchQuery,
    lang: routeLang,
    mangaId: paramMangaId,
    resumeUrl: paramResumeUrl,
    resumeSite: paramResumeSite,
    downloadDir: paramDownloadDir,
    creatorSeriesId,
  } = route.params || {};

  const { profile, userId, updateProfile } = useProfile();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();

  // HUD palette — switches with the app theme
  const hudBg     = isDark ? 'rgba(13,13,15,0.92)'    : 'rgba(255,255,255,0.94)';
  const hudText   = isDark ? '#ffffff'                 : '#0D0D0F';
  const hudMuted  = isDark ? '#9B9AA3'                 : '#6E6E78';
  const hudBorder = isDark ? '#2A2A2F'                 : 'rgba(0,0,0,0.08)';
  const hudCard   = isDark ? '#1A1A1F'                 : 'rgba(0,0,0,0.06)';

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

  // dynamic header
  const [mangaTitle,         setMangaTitle]         = useState('');
  const [chapterLabel,       setChapterLabel]       = useState('');
  const [activeSite,         setActiveSite]         = useState(null);
  const titleFade = useRef(new Animated.Value(1)).current;

  // modals
  const [showAmbience,       setShowAmbience]       = useState(false);
  const [ambienceState,      setAmbienceState]      = useState(ambienceGetState);
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
  const hoursReadRef      = useRef(profile?.hours_read || 0);
  const bottomTimerRef    = useRef(null);
  const pendingStepsRef   = useRef(0);
  const pendingDirRef     = useRef(1);
  const pendingTargetRef  = useRef(1);
  const useSequentialRef  = useRef(false);

  const displayTitle   = mangaTitle || activeSite?.name || 'Reader';
  const displayChapter = chapterLabel || `Chapter ${currentChapter}`;
  const siteSuggestions = siteSearch.trim() ? searchSites(siteSearch) : null;
  const resumeKey = searchQuery ? RESUME_KEY_PFX + encodeURIComponent(searchQuery) : null;

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

          // Navigate directly to the manga — use known ID for MangaDex title page,
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
  useEffect(() => { webviewRef.current?.injectJavaScript(autoScroll ? AUTO_SCROLL_START_JS : AUTO_SCROLL_STOP_JS); }, [autoScroll]);

  useEffect(() => {
    if (bottomTimerRef.current) { clearTimeout(bottomTimerRef.current); bottomTimerRef.current = null; }
  }, [currentUrl, currentChapterIdx]);

  useEffect(() => { hoursReadRef.current = profile?.hours_read || 0; }, [profile?.hours_read]);

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
        updateProfile({ hours_read: hoursReadRef.current + hoursElapsed });
        updateDailyLog(hoursElapsed);
      }
    };
  }, []);

  useEffect(() => {
    if (!mangaTitle) return;
    updateProfile({ currently_reading: mangaTitle, current_chapter: currentChapter });
  }, [currentChapter, mangaTitle]);

  useEffect(() => {
    if (!mangaTitle || !userId) return;
    supabase.from('reading_progress').upsert(
      { user_id: userId, series_title: mangaTitle, current_chapter: currentChapter, status: 'reading', updated_at: new Date().toISOString() },
      { onConflict: 'user_id,series_title' }
    );
  }, [currentChapter, mangaTitle, userId]);

  useEffect(() => {
    // Record today as a reading day so ProfileScreen's calculateStreak() can compute streak correctly
    const today = new Date().toISOString().slice(0, 10);
    AsyncStorage.getItem('@panelr_last_read_date').then((stored) => {
      if (stored !== today) AsyncStorage.setItem('@panelr_last_read_date', today).catch(() => {});
    }).catch(() => {});
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
  }, [currentChapterIdx, readerMode]);

  // ── Resume save — WebView mode ────────────────────────────────────────────

  useEffect(() => {
    if (readerMode !== 'webview' || !currentUrl || !searchQuery) return;
    const path = currentUrl.replace(/^https?:\/\/[^/]+/, '').replace(/[?#].*$/, '');
    if (!path || path === '/' || path === '') return;
    if (/[?&](s|q|search|keyword|query|term|name|word)=|\/search[/?#]|\/filter[/?#]/.test(currentUrl)) return;
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
    });
  }, [currentUrl, currentChapter, readerMode]);

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

  function openSite(site) {
    setShowSitePicker(false);
    setSiteSearch('');
    setReaderMode('webview');
    setActiveSite(site);
    animateTitle('', '');
    setCurrentUrl(site.url);
    setFallbackChain([]);
    AsyncStorage.setItem(LAST_SITE_KEY, JSON.stringify(site)).catch(() => {});
    addSavedSite(site);
  }

  function submitSiteInput() {
    const q = siteSearch.trim();
    if (!q) return;
    const isUrl = q.startsWith('http') || q.includes('.');
    if (isUrl) {
      const siteUrl = q.startsWith('http') ? q : `https://${q}`;
      const matched = detectSiteFromUrl(siteUrl);
      const site = matched || { name: q, url: siteUrl, emoji: '🌐' };
      openSite(site);
    } else {
      const results = searchSites(q);
      if (results.length > 0) openSite(results[0]);
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
    const pageUrls = (ch.pages && ch.pages.length > 0) ? ch.pages : [];
    setPages(pageUrls);
    setPagesLoading(false);
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
          color: '#534AB7',
          bookmarked: true,
          savedAt: Date.now(),
        };
        const updated = [entry, ...saved.filter((s) => s.id !== entry.id)];
        await AsyncStorage.setItem(LIBRARY_KEY, JSON.stringify(updated));
      } catch (_) {}
      if (userId) {
        supabase.from('reading_progress').upsert({
          user_id: userId,
          series_title: seriesTitle,
          status: 'bookmarked',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,series_title', ignoreDuplicates: true }).then(() => {});
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
        supabase.from('reading_progress').delete()
          .eq('user_id', userId).eq('series_title', seriesTitle).eq('status', 'bookmarked').then(() => {});
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
    updateProfile({ chapters_read: (profile?.chapters_read || 0) + 1 });
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

  // ── Save single panel to device gallery ──────────────────────────────────

  async function saveImageToGallery(imgUrl) {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Gallery permission is required to save images.'); return; }
      const filename = `panel_${Date.now()}.jpg`;
      const localUri = FileSystem.cacheDirectory + filename;
      await FileSystem.downloadAsync(imgUrl, localUri);
      await MediaLibrary.saveToLibraryAsync(localUri);
      showToast('Panel saved to gallery');
    } catch (_) {
      Alert.alert('Error', 'Could not save the panel. The image may be protected.');
    }
  }

  // ── Download chapter pages ────────────────────────────────────────────────

  function requestChapterDownload() {
    setShowReaderSettings(false);
    if (readerMode === 'api' && pages.length > 0) {
      executeChapterDownload(pages);
      return;
    }
    pendingImagesRef.current = null;
    webviewRef.current?.injectJavaScript(COLLECT_IMAGES_JS);
  }

  async function executeChapterDownload(images) {
    if (!images || images.length === 0) {
      Alert.alert('No pages found', 'Could not detect manga pages on this page. Try scrolling to load them first.');
      return;
    }
    const label = mangaTitle || activeSite?.name || 'Chapter';
    const slug  = label.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const dir   = `${CHAPTERS_DIR}${slug}/ch${currentChapter}/`;
    let referer;
    try { referer = currentUrl ? new URL(currentUrl).origin + '/' : undefined; } catch (_) {}
    setDlLabel(`${label} — Ch. ${currentChapter}`);
    setDlTotal(images.length);
    setDlProgress(0);
    setDownloading(true);
    let saved = 0;
    try {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      for (let i = 0; i < images.length; i++) {
        const ext  = (images[i].split('?')[0].split('.').pop() || 'jpg').slice(0, 5);
        const dest = `${dir}page_${String(i + 1).padStart(3, '0')}.${ext}`;
        try {
          const dlOpts = referer ? { headers: { Referer: referer } } : undefined;
          await FileSystem.downloadAsync(images[i], dest, dlOpts);
          saved++;
        } catch (_) {}
        setDlProgress(i + 1);
      }
      if (saved > 0) {
        try {
          const existing = await AsyncStorage.getItem(LIBRARY_KEY);
          const lib = existing ? JSON.parse(existing) : [];
          const entry = {
            id: (readerMode === 'api' ? `md_${mangaId}` : currentUrl) + `_dl_ch${currentChapter}`,
            title: label,
            url: currentUrl,
            chapter: currentChapter,
            chapterLabel: displayChapter,
            siteName: activeSite?.name || 'MangaDex',
            siteEmoji: activeSite?.emoji || '📚',
            downloadDir: dir,
            pageCount: saved,
            color: '#1D9E75',
            downloaded: true,
            savedAt: Date.now(),
          };
          const updated = [entry, ...lib.filter((s) => s.id !== entry.id)];
          await AsyncStorage.setItem(LIBRARY_KEY, JSON.stringify(updated));
        } catch (_) {}
        showToast(`${saved} of ${images.length} pages saved`);
      } else {
        Alert.alert('Download failed', 'Pages could not be downloaded — the site may block external downloads.');
      }
    } catch (err) {
      Alert.alert('Download failed', 'Could not create download folder.');
    } finally {
      setDownloading(false);
    }
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
    // In WebView mode use the best known chapter count:
    // 1. Detected dynamically from the page (webChapterCount) — most accurate
    // 2. Passed explicitly from the calling screen (chapters) if it's a real value (< 999)
    // 3. Fallback: only show chapters up to currentChapter + 20 to avoid a misleading 999-item list
    const knownTotal = chapters < 999 ? chapters : 0;
    const total = Math.max(webChapterCount || knownTotal || currentChapter, currentChapter);
    const cap   = (webChapterCount === 0 && chapters >= 999) ? Math.max(currentChapter + 20, total) : total;
    return Array.from({ length: cap }, (_, i) => {
      const num = cap - i;
      return { shortLabel: `Ch. ${num}`, title: null, num, idx: -1, active: num === currentChapter, isRead: num < currentChapter };
    });
  }, [readerMode, apiChapters, currentChapterIdx, currentChapter, chapters, webChapterCount]);

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
                  <Ionicons name="globe-outline" size={15} color={readerMode === 'api' ? '#534AB7' : activeSite ? '#534AB7' : hudMuted} />
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
              <Ionicons name="headset-outline" size={18} color={ambienceState.presetId ? '#534AB7' : hudMuted} />
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
              <ActivityIndicator size="large" color="#534AB7" />
              <Text style={styles.pagesLoadingText}>Loading pages…</Text>
            </View>
          ) : (
            <>
              <FlatList
                ref={flatListRef}
                data={pages}
                keyExtractor={(uri) => uri}
                renderItem={({ item }) => <PageImage uri={item} />}
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
              webviewRef.current?.injectJavaScript(EXTRACT_PAGE_INFO_JS);
              if (searchQuery) {
                webviewRef.current?.injectJavaScript(`window.__panelrQuery = ${JSON.stringify(searchQuery)};`);
                webviewRef.current?.injectJavaScript(AUTO_NAV_SEARCH_JS);
                webviewRef.current?.injectJavaScript(AUTO_NAV_CHAPTER_JS);
                webviewRef.current?.injectJavaScript(MANGADEX_CHAPTER_NAV_JS);
                webviewRef.current?.injectJavaScript(HOMEPAGE_DETECT_JS);
                webviewRef.current?.injectJavaScript(SEARCH_WATCHDOG_JS);
                webviewRef.current?.injectJavaScript(EXTRACT_CHAPTER_COUNT_JS);
              }
              if (pendingImagesRef.current === 'requested') {
                pendingImagesRef.current = 'collecting';
                webviewRef.current?.injectJavaScript(COLLECT_IMAGES_JS);
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
                    if (msg.count > 0) setWebChapterCount((prev) => Math.max(prev, msg.count));
                  } else if (msg.type === 'imageList') {
                    pendingImagesRef.current = null;
                    executeChapterDownload(msg.images);
                  } else if (msg.type === 'saveImage') {
                    saveImageToGallery(msg.src);
                  } else if (msg.type === 'openWindow') {
                    // window.open() called in-page — navigate in-app (same as onOpenWindow)
                    const u = msg.url || '';
                    if (u.startsWith('http')) setCurrentUrl(u);
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
        </View>
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
              <Ionicons name={mode === 'webtoon' ? 'reader-outline' : 'albums-outline'} size={20} color={mode === 'manga' ? '#534AB7' : hudMuted} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.bottomIconBtn} onPress={handleBookmark}>
            <Ionicons name={bookmarked ? 'bookmark' : 'bookmark-outline'} size={20} color={bookmarked ? '#534AB7' : hudMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.bottomIconBtn} onPress={() => setShowUI((v) => !v)}>
            <Ionicons name={showUI ? 'eye-outline' : 'eye-off-outline'} size={20} color={showUI ? hudMuted : '#534AB7'} />
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
                  ? <Ionicons name="play" size={11} color="#534AB7" />
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
          <View style={styles.siteSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Reading Browser</Text>
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
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Ambience</Text>
              {ambienceState.presetId && (
                <View style={styles.playingBadge}><Text style={styles.playingText}>Playing</Text></View>
              )}
              <TouchableOpacity onPress={() => setShowAmbience(false)}>
                <Ionicons name="close" size={20} color="#9B9AA3" />
              </TouchableOpacity>
            </View>

            <View style={styles.ambienceOptions}>
              {AMBIENCE_PRESETS.map((p) => {
                const active = ambienceState.presetId === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.ambienceBtn, active && styles.ambienceBtnActive]}
                    onPress={() => active ? ambienceStop() : ambiencePlay(p.id)}
                    activeOpacity={0.75}>
                    <Ionicons name={p.icon} size={24} color={active ? '#534AB7' : '#9B9AA3'} />
                    <Text style={[styles.ambienceBtnLabel, active && styles.ambienceBtnLabelActive]}>{p.label}</Text>
                    <Text style={styles.ambienceBtnSub}>{active ? 'Tap to stop' : 'Tap to play'}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {ambienceState.presetId && (
              <View style={styles.ambienceVolRow}>
                <Ionicons name="volume-low-outline" size={14} color="#9B9AA3" />
                <TouchableOpacity style={styles.ambienceVolBtn} onPress={() => ambienceSetVolume(ambienceState.volume - 0.1)}>
                  <Ionicons name="remove" size={16} color="#9B9AA3" />
                </TouchableOpacity>
                <View style={styles.ambienceVolTrack}>
                  <View style={[styles.ambienceVolFill, { width: `${Math.round(ambienceState.volume * 100)}%` }]} />
                </View>
                <TouchableOpacity style={styles.ambienceVolBtn} onPress={() => ambienceSetVolume(ambienceState.volume + 0.1)}>
                  <Ionicons name="add" size={16} color="#9B9AA3" />
                </TouchableOpacity>
                <Ionicons name="volume-high-outline" size={14} color="#9B9AA3" />
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Reader settings ──────────────────────────────────────────────── */}
      <Modal visible={showReaderSettings} animationType="slide" transparent onRequestClose={() => setShowReaderSettings(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setShowReaderSettings(false)}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Reader Settings</Text>
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
            <TouchableOpacity style={styles.settingsRow} onPress={requestChapterDownload}>
              <Ionicons name="cloud-download-outline" size={18} color="#1D9E75" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.settingsRowText}>Download Chapter</Text>
                <Text style={styles.settingsRowSub}>Save pages to your Library for offline reading</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color="#9B9AA3" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.settingsRow} onPress={toggleReaderHidden}>
              <Ionicons name={readerHidden ? 'eye-off-outline' : 'eye-outline'} size={18} color="#9B9AA3" />
              <Text style={styles.settingsRowText}>{readerHidden ? 'Show reader UI' : 'Hide reader UI'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.settingsRow} onPress={handleClearCache}>
              <Ionicons name="reload-outline" size={18} color="#9B9AA3" />
              <Text style={styles.settingsRowText}>{readerMode === 'api' ? 'Reload chapter' : 'Clear cache & reload'}</Text>
            </TouchableOpacity>
            {searchQuery && (
              <TouchableOpacity style={styles.settingsRow} onPress={handleStartFromBeginning}>
                <Ionicons name="refresh-circle-outline" size={18} color="#E8527A" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.settingsRowText}>Start from beginning</Text>
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
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Share</Text>
              <TouchableOpacity onPress={() => setShowShare(false)}><Ionicons name="close" size={20} color="#9B9AA3" /></TouchableOpacity>
            </View>
            <View style={styles.sharePreview}>
              <Text style={styles.sharePreviewLogo}>Panelr</Text>
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
                const msg = `I'm reading "${displayTitle}" on Panelr!`;
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
                const msg = `Check out "${displayTitle}" on Panelr — the best manga reader app!`;
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
          <ActivityIndicator size="large" color="#534AB7" />
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
  progressFill:           { height: 3, backgroundColor: '#534AB7' },
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
  modeToggleActive:       { backgroundColor: 'rgba(83,74,183,0.15)', borderRadius: 20 },
  eyeBtn:                 { position: 'absolute', bottom: 24, right: 16, padding: 10, borderRadius: 24, backgroundColor: 'rgba(13,13,15,0.7)', borderWidth: 1, borderColor: '#2A2A2F', zIndex: 90 },
  // Chapter floating dropdown
  chapterDropdown:        { position: 'absolute', bottom: 90, left: 16, width: '50%', height: 300, backgroundColor: '#1A1A1F', borderRadius: 16, borderWidth: 1, borderColor: '#2A2A2F', overflow: 'hidden', zIndex: 95 },
  chapterDropdownLabel:   { color: '#5C5B63', fontSize: 10, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  chapterListRow:         { flexDirection: 'row', alignItems: 'center', height: CHAPTER_ROW_H, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#242428' },
  chapterListRowActive:   { backgroundColor: 'rgba(83,74,183,0.12)' },
  chapterListDotWrap:     { width: 14, alignItems: 'center', marginRight: 8 },
  chapterListActiveDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: '#534AB7' },
  chapterListNum:         { color: '#fff', fontSize: 12, fontWeight: '600' },
  chapterListNumActive:   { color: '#534AB7' },
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
  ambienceBtn:            { flex: 1, alignItems: 'center', padding: 14, borderRadius: 12, backgroundColor: '#0D0D0F', marginHorizontal: 4, borderWidth: 1, borderColor: '#2A2A2F' },
  ambienceBtnActive:      { borderColor: '#534AB7', backgroundColor: '#1A1633' },
  ambienceBtnLabel:       { color: '#9B9AA3', fontSize: 13, fontWeight: '600', marginTop: 8 },
  ambienceBtnLabelActive: { color: '#534AB7' },
  ambienceBtnSub:         { color: '#9B9AA3', fontSize: 10, marginTop: 4 },
  ambienceVolRow:         { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  ambienceVolBtn:         { padding: 6 },
  ambienceVolTrack:       { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#2A2A2F', overflow: 'hidden' },
  ambienceVolFill:        { height: 4, backgroundColor: '#534AB7', borderRadius: 2 },
  modeSectionLabel:       { color: '#9B9AA3', fontSize: 11, fontWeight: '600', marginBottom: 10 },
  readerRow:              { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  readerBtn:              { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12, backgroundColor: 'rgba(155,154,163,0.06)', marginHorizontal: 4, borderWidth: 1, borderColor: '#2A2A2F' },
  readerBtnActive:        { borderColor: '#534AB7', backgroundColor: 'rgba(83,74,183,0.15)' },
  readerBtnText:          { color: '#9B9AA3', fontSize: 12, fontWeight: '600', marginTop: 8 },
  readerBtnTextActive:    { color: '#534AB7' },
  readerBtnSub:           { color: 'rgba(155,154,163,0.5)', fontSize: 10, marginTop: 2 },
  settingsRow:            { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#2A2A2F' },
  settingsRowText:        { color: '#fff', fontSize: 14, marginLeft: 12 },
  settingsRowSub:         { color: '#9B9AA3', fontSize: 11, marginLeft: 12, marginTop: 2 },
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
  apiModeBanner:          { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(83,74,183,0.12)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(83,74,183,0.3)' },
  apiModeBannerText:      { color: '#534AB7', fontSize: 12, marginLeft: 6, flex: 1 },
  siteInputRow:           { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D0D0F', borderRadius: 12, borderWidth: 1, borderColor: '#2A2A2F', paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14 },
  siteInputField:         { flex: 1, color: '#fff', fontSize: 13, marginLeft: 8 },
  siteGoBtn:              { backgroundColor: '#534AB7', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
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
  openInBrowserBtn:       { marginTop: 16, backgroundColor: '#534AB7', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
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
