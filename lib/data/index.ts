import type { DataProvider } from './data-provider';
import { LocalAdapter } from './local-adapter';
import { SupabaseAdapter } from './supabase-adapter';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * Dev-only escape hatch: run the whole app against localStorage with no
 * backend. It has to be opted into by hand. An implicit fallback meant a
 * production deploy with missing env vars looked completely healthy while
 * writing every user's data into their own browser, where it was silently
 * lost the moment they switched device or cleared site data.
 */
const localFallbackEnabled =
  process.env.NODE_ENV !== 'production' &&
  process.env.NEXT_PUBLIC_USE_LOCAL_DATA === 'true';

export const MISSING_SUPABASE_CONFIG_MESSAGE =
  'Akada is not configured: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are both required. ' +
  'Copy .env.example to .env.local and fill them in. ' +
  'To run locally with no backend, set NEXT_PUBLIC_USE_LOCAL_DATA=true (development only).';

if (!hasSupabaseConfig && !localFallbackEnabled) {
  // Thrown at import time so `next build` fails loudly rather than shipping a
  // deploy that quietly persists every user's data to their own browser.
  throw new Error(MISSING_SUPABASE_CONFIG_MESSAGE);
}

export const db: DataProvider = hasSupabaseConfig
  ? new SupabaseAdapter()
  : new LocalAdapter();

export type { DataProvider } from './data-provider';
export type {
  Course,
  Session,
  Task,
  Semester,
  TaskPriority,
  SessionFilters,
  TaskFilters,
  UserSettings,
} from './types';
