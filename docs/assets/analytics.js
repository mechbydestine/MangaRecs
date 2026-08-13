/* First-party page counter.
 *
 * Deliberately not Google Analytics, Plausible, or anything else off-site:
 * this posts one row straight to our own Supabase table and stops. No
 * cookies, no localStorage, no device or user id, nothing that could
 * identify a person or follow them between visits — so there's nothing to
 * put behind a consent banner.
 *
 * What a row contains: the path, the referring host (never the full URL),
 * a coarse screen-width bucket, and the browser's language. That's it.
 *
 * Needs the site_events table from migration67_site_analytics.sql. Until
 * that's applied the insert 4xxs and is swallowed — the page never cares.
 */
(function () {
  'use strict';

  var URL_BASE = 'https://jlzsnmwyyjefjekscvgs.supabase.co';
  var ANON_KEY = 'sb_publishable_L47c82XgIO4CqOhQFbsxvQ_4D3Io0dL';

  // Honour the two standard "don't track me" signals, even though there is
  // nothing here to tie back to a person anyway.
  var nav = window.navigator || {};
  if (nav.doNotTrack === '1' || window.doNotTrack === '1' || nav.globalPrivacyControl === true) return;
  if (!window.fetch) return;

  function widthBucket(w) {
    if (w < 480) return 'xs';
    if (w < 768) return 'sm';
    if (w < 1100) return 'md';
    if (w < 1600) return 'lg';
    return 'xl';
  }

  function referrerHost() {
    if (!document.referrer) return null;
    try {
      var h = new URL(document.referrer).hostname;
      return h === location.hostname ? null : h; // internal navigation isn't a referrer
    } catch (e) {
      return null;
    }
  }

  function send() {
    var body = {
      path: location.pathname.slice(0, 300),
      referrer_host: referrerHost(),
      width_bucket: widthBucket(window.innerWidth || 0),
      lang: (nav.language || '').slice(0, 12) || null,
    };
    try {
      fetch(URL_BASE + '/rest/v1/site_events', {
        method: 'POST',
        headers: {
          'apikey': ANON_KEY,
          'Authorization': 'Bearer ' + ANON_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(body),
        keepalive: true,
        mode: 'cors',
      }).catch(function () {});
    } catch (e) {}
  }

  // One row per page view, after the page has settled so it never competes
  // with rendering or the AniList fetches.
  if (document.readyState === 'complete') setTimeout(send, 800);
  else window.addEventListener('load', function () { setTimeout(send, 800); });
})();
