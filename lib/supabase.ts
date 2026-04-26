import { createBrowserClient } from '@supabase/ssr';
import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';

/**
 * Browser client — used in 'use client' components and SupabaseAdapter.
 * Safe to call multiple times; the SDK deduplicates internally.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

/**
 * Server client — used in middleware and route handlers.
 * Requires a cookie store that implements getAll / setAll.
 */
export function createServerSupabaseClient(cookieStore: {
  getAll: () => { name: string; value: string }[];
  setAll: (cookies: { name: string; value: string; options: CookieOptions }[]) => void;
}) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookieStore.setAll(cookiesToSet);
        },
      },
    },
  );
}
