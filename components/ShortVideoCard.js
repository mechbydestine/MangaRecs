import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { memo, useState, useEffect, useRef } from 'react';
import { useTheme } from '../utils/ThemeContext';
import { useT } from '../utils/LanguageContext';
import { light } from '../utils/haptics';

// A full-bleed video card that sits between manga entries in the feed.
//
// Autoplays when it becomes the active card, muted, the way Shorts and Reels
// do. This used to be tap-to-play on the grounds that the feed's windowSize of
// 5 would keep five WebViews alive — but the card is handed
// `isActive={index === activeIndex}`, so gating the player on that means
// exactly one WebView exists at any moment no matter how wide the window is.
// The other four cards are a thumbnail and nothing else.
//
// Muted is not a preference, it is the only way autoplay starts at all: both
// WebKit and Chrome refuse sound-on autoplay without a user-engagement signal,
// which a WebView loading local HTML never has. So it starts muted with a
// visible control, and the first tap unmutes — the same bargain every silent-
// autoplay feed makes.

const TOPIC_LABEL = {
  manga: 'Manga',
  manhwa: 'Manhwa',
  anime: 'Anime',
};

function formatDuration(secs) {
  if (!secs || secs <= 0) return null;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// The origin the embed is served under. Loading `source={{ html }}` without a
// baseUrl leaves the document on `about:blank`, and YouTube's player rejects
// an embed with no valid origin — which is the "Video unavailable" black card.
// Setting it is the entire fix, and it has to be a youtube.com origin.
const YT_ORIGIN = 'https://www.youtube.com';

// YouTube's IFrame embed, driven through the IFrame API so the page can report
// back. `playsinline=1` keeps it in the card on iOS instead of throwing to the
// native fullscreen player; `rel=0` keeps the end screen from advertising
// unrelated channels; `mute` starts silent so autoplay is actually permitted.
//
// The API is loaded rather than using a bare <iframe src> because a plain
// iframe gives the app no way to know the video failed: onError/onHttpError
// only observe the outer document, which is this HTML and always succeeds. An
// embed-disabled or deleted video would sit there as a dead frame forever.
// onPlayerError posts the code out so the card can fall back to its thumbnail.
function youtubeHtml(videoId, muted) {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <style>
      html,body{margin:0;padding:0;height:100%;background:#000;overflow:hidden}
      #p{width:100%;height:100%}
    </style>
  </head>
  <body>
    <div id="p"></div>
    <script src="https://www.youtube.com/iframe_api"></script>
    <script>
      function post(m){ try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch(e){} }
      var player;
      function onYouTubeIframeAPIReady(){
        player = new YT.Player('p', {
          videoId: ${JSON.stringify(videoId)},
          playerVars: {
            autoplay: 1, mute: ${muted ? 1 : 0}, playsinline: 1,
            rel: 0, modestbranding: 1, controls: 0, loop: 1,
            playlist: ${JSON.stringify(videoId)},
            origin: ${JSON.stringify(YT_ORIGIN)}
          },
          events: {
            onReady: function(e){ e.target.playVideo(); post({t:'ready'}); },
            onError: function(e){ post({t:'error', code: e.data}); },
            onStateChange: function(e){ if (e.data === YT.PlayerState.ENDED) e.target.playVideo(); }
          }
        });
      }
      window.setMuted = function(m){ try { m ? player.mute() : player.unMute(); } catch(e){} };
      // The API script itself can fail to load (no network, blocked host).
      setTimeout(function(){ if (!player) post({t:'error', code:'noapi'}); }, 8000);
    </script>
  </body>
</html>`;
}

function providerUrl(item) {
  if (item.provider === 'youtube') return `https://www.youtube.com/watch?v=${item.videoId}`;
  if (item.provider === 'tiktok') return `https://www.tiktok.com/video/${item.videoId}`;
  return null;
}

// Sound is a session-wide choice, not a per-card one: unmuting one video and
// then having the next one start silent again is the one behaviour no
// short-form feed has. Module scope, so it survives cards unmounting.
let _mutedPreference = true;

const ShortVideoCard = memo(function ShortVideoCard({ item, height, isActive, tabBarHeight = 0 }) {
  const { isDark } = useTheme();
  const t = useT();
  const [failed, setFailed] = useState(false);
  const [muted, setMuted] = useState(_mutedPreference);
  const webRef = useRef(null);

  const duration = formatDuration(item.durationSecs);
  const url = providerUrl(item);

  // TikTok has no embed that behaves inside a paging feed — its player is a
  // blockquote plus a script and refuses to autoplay — so those cards open the
  // app/site rather than pretending to be inline.
  const canEmbed = item.provider === 'youtube' && !failed;
  // The player exists only while this is the card on screen. Everything else
  // in the render window is the thumbnail, so scrolling away both stops the
  // audio and frees the WebView, with no explicit teardown needed.
  const playing = isActive && canEmbed;

  // Re-arm the fallback when the card is recycled onto a different video —
  // one dead embed shouldn't condemn every later video on the same card.
  useEffect(() => { setFailed(false); }, [item.videoId]);

  // Pick up a mute choice made on an earlier card without remounting.
  useEffect(() => { if (isActive) setMuted(_mutedPreference); }, [isActive]);

  function toggleMute() {
    light();
    const next = !muted;
    _mutedPreference = next;
    setMuted(next);
    // Told to the live player directly. Re-rendering the HTML instead would
    // reload the iframe and restart the video from zero.
    webRef.current?.injectJavaScript(`window.setMuted && window.setMuted(${next}); true;`);
  }

  function onMessage(e) {
    let msg = null;
    try { msg = JSON.parse(e.nativeEvent.data); } catch (_) { return; }
    // Codes 100/101/150 are "deleted" and "embedding disabled" — nothing a
    // retry fixes, so the card reverts to a thumbnail that opens YouTube.
    if (msg?.t === 'error') setFailed(true);
  }

  function openExternal() {
    light();
    if (url) Linking.openURL(url).catch(() => {});
  }

  return (
    <View style={[styles.card, { height, backgroundColor: '#000' }]}>
      {playing ? (
        <WebView
          ref={webRef}
          style={styles.fill}
          // baseUrl is what makes the embed play at all — see YT_ORIGIN above.
          source={{ html: youtubeHtml(item.videoId, muted), baseUrl: YT_ORIGIN }}
          originWhitelist={['*']}
          onMessage={onMessage}
          // The embed is the only thing this WebView should ever load; a tap
          // that tries to leave (channel link, end-screen card) goes to the
          // real browser instead of navigating inside the feed.
          // A tap that tries to leave (channel link, end-screen card) opens the
          // real browser instead of navigating away inside the feed. Everything
          // the player itself needs — the IFrame API script, the embed frame,
          // thumbnails — is on a YouTube host and loads normally.
          onShouldStartLoadWithRequest={(req) => {
            if (req.navigationType === 'click') { Linking.openURL(req.url).catch(() => {}); return false; }
            return true;
          }}
          onError={() => setFailed(true)}
          onHttpError={() => setFailed(true)}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          renderLoading={() => (
            <View style={[styles.fill, styles.center, { backgroundColor: '#000' }]}>
              <ActivityIndicator size="small" color="#fff" />
            </View>
          )}
        />
      ) : (
        <TouchableOpacity
          style={styles.fill}
          activeOpacity={0.9}
          onPress={openExternal}
          accessibilityRole="button"
          accessibilityLabel={t('feed.video.play', { title: item.title })}>
          {item.thumbnailUrl ? (
            <ExpoImage
              source={{ uri: item.thumbnailUrl }}
              style={styles.fill}
              contentFit="cover"
              transition={180}
            />
          ) : (
            <View style={[styles.fill, { backgroundColor: isDark ? '#12111C' : '#20202A' }]} />
          )}

          {/* Scrim: the title and the platform chip sit on arbitrary artwork,
              so they need their own contrast rather than trusting the frame. */}
          <View style={styles.scrimTop} pointerEvents="none" />
          <View style={styles.scrimBottom} pointerEvents="none" />

          {/* Only shown when there is genuinely nothing to play inline — a
              TikTok card, or an embed the player rejected. An embeddable video
              that simply isn't the active card yet gets a clean thumbnail,
              because a play button on something about to autoplay is a lie. */}
          {!canEmbed && (
            <View style={styles.playWrap} pointerEvents="none">
              <View style={styles.playCircle}>
                <Ionicons name="play" size={30} color="#fff" style={{ marginLeft: 4 }} />
              </View>
            </View>
          )}
        </TouchableOpacity>
      )}

      {/* Chrome stays above the player so the card is still identifiable and
          escapable while a video is running. */}
      <View style={styles.topRow} pointerEvents="box-none">
        <View style={styles.chip}>
          <Ionicons
            name={item.provider === 'tiktok' ? 'musical-notes' : 'logo-youtube'}
            size={11}
            color="#fff"
          />
          <Text style={styles.chipText}>
            {item.provider === 'tiktok' ? 'TikTok' : 'Shorts'}
          </Text>
        </View>
        <View style={styles.chip}>
          <Text style={styles.chipText}>{TOPIC_LABEL[item.topic] || 'Anime'}</Text>
        </View>
        {duration && (
          <View style={styles.chip}>
            <Ionicons name="time-outline" size={11} color="#fff" />
            <Text style={styles.chipText}>{duration}</Text>
          </View>
        )}
        {/* Sound toggle, not a stop button. Stopping is what scrolling does,
            and it is the only control a silent-autoplay card actually owes the
            viewer: a way to hear it, and a way to see that it is silent. */}
        {playing && (
          <TouchableOpacity
            style={[styles.chip, styles.muteChip]}
            onPress={toggleMute}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityState={{ checked: !muted }}
            accessibilityLabel={t(muted ? 'feed.video.unmute' : 'feed.video.mute')}>
            <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={13} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {!playing && (
        <View style={[styles.bottom, { paddingBottom: tabBarHeight + 22 }]} pointerEvents="box-none">
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          <View style={styles.metaRow}>
            {!!item.channel && (
              <Text style={styles.channel} numberOfLines={1}>{item.channel}</Text>
            )}
            {!!url && (
              <TouchableOpacity
                onPress={() => Linking.openURL(url).catch(() => {})}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t('feed.video.openExternal')}>
                <Text style={styles.openLink}>{t('feed.video.openExternal')}</Text>
              </TouchableOpacity>
            )}
          </View>
          {failed && (
            <Text style={styles.failedNote}>{t('feed.video.embedFailed')}</Text>
          )}
        </View>
      )}
    </View>
  );
}, (prev, next) => (
  prev.item.feedKey === next.item.feedKey &&
  prev.isActive === next.isActive &&
  prev.height === next.height &&
  prev.tabBarHeight === next.tabBarHeight
));

export default ShortVideoCard;

const styles = StyleSheet.create({
  card: { width: '100%', overflow: 'hidden' },
  fill: { ...StyleSheet.absoluteFillObject },
  center: { alignItems: 'center', justifyContent: 'center' },

  scrimTop: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 130,
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  scrimBottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 260,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },

  playWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  playCircle: {
    width: 74, height: 74, borderRadius: 37,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center', justifyContent: 'center',
  },

  topRow: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingTop: 58, paddingHorizontal: 16,
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4,
  },
  muteChip: { marginLeft: 'auto', paddingHorizontal: 8 },
  chipText: { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },

  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18 },
  title: { color: '#fff', fontSize: 17, fontWeight: '700', lineHeight: 23 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  channel: { color: 'rgba(255,255,255,0.7)', fontSize: 12.5, flexShrink: 1 },
  openLink: { color: '#A09CE0', fontSize: 12.5, fontWeight: '600' },
  failedNote: { color: 'rgba(255,255,255,0.6)', fontSize: 11.5, marginTop: 6 },
});
