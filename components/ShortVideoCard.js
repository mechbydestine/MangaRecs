import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { memo, useState, useEffect } from 'react';
import { useTheme } from '../utils/ThemeContext';
import { useT } from '../utils/LanguageContext';
import { light } from '../utils/haptics';

// A full-bleed video card that sits between manga entries in the feed.
//
// Tap-to-play, deliberately. The feed is a pagingEnabled FlatList with
// windowSize 5, so autoplay would mean up to five live WebViews — each one a
// full browser context — resident at once, which is both a memory problem and
// a scroll-jank problem on mid-range Android. Until the card is tapped it is
// an image and a play button, which costs nothing.
//
// It also unmounts the player the moment the card stops being the active one
// (`isActive` goes false), so audio can never follow you up the feed.

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

// YouTube's IFrame embed. `playsinline=1` keeps it in the card on iOS instead
// of throwing to the native fullscreen player; `rel=0` keeps the end screen
// from advertising unrelated channels.
function youtubeHtml(videoId) {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <style>
      html,body{margin:0;padding:0;height:100%;background:#000;overflow:hidden}
      iframe{border:0;width:100%;height:100%}
    </style>
  </head>
  <body>
    <iframe
      src="https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1&playsinline=1&rel=0&modestbranding=1"
      allow="autoplay; encrypted-media; picture-in-picture"
      allowfullscreen></iframe>
  </body>
</html>`;
}

function providerUrl(item) {
  if (item.provider === 'youtube') return `https://www.youtube.com/watch?v=${item.videoId}`;
  if (item.provider === 'tiktok') return `https://www.tiktok.com/video/${item.videoId}`;
  return null;
}

const ShortVideoCard = memo(function ShortVideoCard({ item, height, isActive, tabBarHeight = 0 }) {
  const { isDark } = useTheme();
  const t = useT();
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  // Scrolling away tears the player down. Without this a video keeps playing
  // (and keeps its WebView alive) several cards up the feed.
  useEffect(() => {
    if (!isActive && playing) setPlaying(false);
  }, [isActive, playing]);

  const duration = formatDuration(item.durationSecs);
  const url = providerUrl(item);

  // TikTok has no embed that behaves inside a paging feed — its player is a
  // blockquote plus a script and refuses to autoplay — so those cards open the
  // app/site rather than pretending to be inline.
  const canEmbed = item.provider === 'youtube' && !failed;

  function onPlay() {
    light();
    if (canEmbed) { setPlaying(true); return; }
    if (url) Linking.openURL(url).catch(() => {});
  }

  return (
    <View style={[styles.card, { height, backgroundColor: '#000' }]}>
      {playing && canEmbed ? (
        <WebView
          style={styles.fill}
          source={{ html: youtubeHtml(item.videoId) }}
          // The embed is the only thing this WebView should ever load; a tap
          // that tries to leave (channel link, end-screen card) goes to the
          // real browser instead of navigating inside the feed.
          onShouldStartLoadWithRequest={(req) => {
            if (req.url.startsWith('about:') || req.url.startsWith('data:')) return true;
            if (req.url.includes('youtube.com/embed/')) return true;
            if (req.navigationType === 'click') { Linking.openURL(req.url).catch(() => {}); return false; }
            return true;
          }}
          onError={() => { setFailed(true); setPlaying(false); }}
          onHttpError={() => { setFailed(true); setPlaying(false); }}
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
          onPress={onPlay}
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

          <View style={styles.playWrap} pointerEvents="none">
            <View style={styles.playCircle}>
              <Ionicons name="play" size={30} color="#fff" style={{ marginLeft: 4 }} />
            </View>
          </View>
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
        {playing && (
          <TouchableOpacity
            style={[styles.chip, styles.stopChip]}
            onPress={() => setPlaying(false)}
            accessibilityRole="button"
            accessibilityLabel={t('feed.video.stop')}>
            <Ionicons name="close" size={12} color="#fff" />
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
  stopChip: { marginLeft: 'auto', paddingHorizontal: 7 },
  chipText: { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },

  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18 },
  title: { color: '#fff', fontSize: 17, fontWeight: '700', lineHeight: 23 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  channel: { color: 'rgba(255,255,255,0.7)', fontSize: 12.5, flexShrink: 1 },
  openLink: { color: '#A09CE0', fontSize: 12.5, fontWeight: '600' },
  failedNote: { color: 'rgba(255,255,255,0.6)', fontSize: 11.5, marginTop: 6 },
});
