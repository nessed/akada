import type { DataProvider } from './data-provider';
import { LocalAdapter } from './local-adapter';
import { SupabaseAdapter } from './supabase-adapter';

const hasSupabaseConfig = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

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
