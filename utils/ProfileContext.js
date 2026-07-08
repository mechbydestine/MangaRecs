import { createContext, useContext, useState, useEffect } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../supabase';
import { checkAndNotifyBadges } from './badgeEngine';

const ProfileContext = createContext(null);

// Stat columns are server-owned (RPCs/triggers only — see migration section 36).
// Any client update that still includes one would make the whole UPDATE fail
// under the column-level grants, so they are stripped here defensively.
const SERVER_OWNED_FIELDS = new Set([
  'hours_read', 'chapters_read', 'streak_count', 'daily_log', 'manga_count',
  'completed_count', 'night_reads', 'shares_count', 'comments_count',
  'likes_given', 'friends_count', 'ratings_count',
]);

export function ProfileProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newBadges, setNewBadges] = useState([]); // newly unlocked, awaiting ceremony

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserId(session.user.id);
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUserId(session.user.id);
        fetchProfile(session.user.id);
      } else {
        setUserId(null);
        setProfile(null);
        setLoading(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(uid) {
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle();
    setProfile(data || null);
    setLoading(false);
    // Stats now change server-side (RPCs/triggers), so every fresh profile
    // fetch is a badge-check point; unlocks queue up for the ceremony modal.
    if (data) {
      checkAndNotifyBadges(uid, data)
        .then((unlocked) => {
          if (unlocked?.length) setNewBadges((prev) => [...prev, ...unlocked]);
        })
        .catch(() => {});
    }
  }

  // Stat fields that, when changed, should trigger a badge check
  const BADGE_STAT_FIELDS = new Set([
    'chapters_read', 'hours_read', 'streak_count', 'series_count',
    'friends_count', 'comments_count', 'likes_given', 'completed_count',
    'night_reads', 'genres_count', 'shares_count', 'manga_count',
    'ratings_count', 'account_days', 'avatar_url',
  ]);

  async function updateProfile(changes) {
    if (!userId) return { error: new Error('Not signed in') };
    const safe = {};
    for (const [k, v] of Object.entries(changes)) {
      if (!SERVER_OWNED_FIELDS.has(k)) safe[k] = v;
    }
    if (Object.keys(safe).length === 0) return { error: null };
    const { data, error } = await supabase
      .from('profiles')
      .update(safe)
      .eq('id', userId)
      .select()
      .maybeSingle();
    if (!error && data) {
      setProfile(data);
      // Only run badge check when stat-relevant fields changed
      const hasStat = Object.keys(safe).some((k) => BADGE_STAT_FIELDS.has(k));
      if (hasStat) {
        checkAndNotifyBadges(userId, data)
          .then((unlocked) => {
            if (unlocked?.length) setNewBadges((prev) => [...prev, ...unlocked]);
          })
          .catch(() => {});
      }
    }
    return { error };
  }

  async function uploadAvatar(uri, type = 'avatar') {
    if (!userId) return { error: new Error('Not signed in') };
    try {
      const rawExt = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const ext = (rawExt === 'jpeg' || rawExt === 'heic' || rawExt === 'heif') ? 'jpg' : rawExt;
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
      const path = `${userId}/${type}.${ext}`;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { error: new Error('Not signed in') };

      // FileSystem.uploadAsync reads the local file URI natively — the only reliable
      // way in Expo RN. Uint8Array/ArrayBuffer bodies are silently emptied by the
      // RN fetch polyfill, producing 0-byte uploads.
      const uploadUrl = `https://jlzsnmwyyjefjekscvgs.supabase.co/storage/v1/object/avatars/${path}`;
      const result = await FileSystem.uploadAsync(uploadUrl, uri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': mimeType,
          'x-upsert': 'true',
        },
      });

      if (result.status < 200 || result.status >= 300) {
        return { error: new Error(`Upload failed (${result.status}): ${result.body}`) };
      }

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      // Path is constant per user, so bust caches on every change — otherwise
      // friends' devices keep showing the previously cached image forever.
      const versionedUrl = `${publicUrl}?v=${Date.now()}`;
      const field = type === 'avatar' ? 'avatar_url' : 'banner_url';
      await updateProfile({ [field]: versionedUrl });
      return { url: versionedUrl };
    } catch (e) {
      return { error: e };
    }
  }

  return (
    <ProfileContext.Provider value={{
      profile,
      userId,
      loading,
      updateProfile,
      uploadAvatar,
      refreshProfile: () => userId && fetchProfile(userId),
      newBadges,
      clearNewBadges: () => setNewBadges([]),
    }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}
