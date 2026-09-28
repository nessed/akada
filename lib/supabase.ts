import { createBrowserClient } from '@supabase/ssr';

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Supabase is not configured');
  }
  return { url, anonKey };
}

/**
 * Browser client, used in 'use client' components and SupabaseAdapter.
 * Safe to call multiple times; the SDK deduplicates internally.
 */
export function createClient() {
  const { url, anonKey } = getSupabaseConfig();
  return createBrowserClient(url, anonKey);
}
