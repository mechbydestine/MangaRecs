import { supabase } from '../supabase';

export function insertActivity(userId, type, data = {}) {
  if (!userId) return;
  supabase.from('activity_feed').insert({ user_id: userId, type, data }).then(() => {});
}
