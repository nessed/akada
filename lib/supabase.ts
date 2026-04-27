import { createBrowserClient } from '@supabase/ssr';
import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Supabase is not configured');
  }
  return { url, anonKey };
}

/**
 * Browser client — used in 'use client' components and SupabaseAdapter.
 * Safe to call multiple times; the SDK deduplicates internally.
 */
export function createClient() {
  const { url, anonKey } = getSupabaseConfig();
  return createBrowserClient(url, anonKey);
}

/**
 * Server client — used in proxy and route handlers.
 * Requires a cookie store that implements getAll / setAll.
 */
export function createServerSupabaseClient(cookieStore: {
  getAll: () => { name: string; value: string }[];
  setAll: (cookies: { name: string; value: string; options: CookieOptions }[]) => void;
}) {
  const { url, anonKey } = getSupabaseConfig();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookieStore.setAll(cookiesToSet);
      },
    },
  });
}
