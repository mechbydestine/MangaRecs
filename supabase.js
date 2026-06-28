import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = 'https://jlzsnmwyyjefjekscvgs.supabase.co';
const supabaseAnonKey = 'sb_publishable_L47c82XgIO4CqOhQFbsxvQ_4D3Io0dL';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});