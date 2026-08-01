import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

let cached: SupabaseClient | null = null;

export function createSupabase(env: SupabaseEnv): SupabaseClient {
  if (cached) return cached;
  cached = createClient(env.url, env.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: { eventsPerSecond: 20 },
    },
  });
  return cached;
}
