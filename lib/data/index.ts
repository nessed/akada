import type { DataProvider } from './data-provider';
import { LocalAdapter } from './local-adapter';
import { SupabaseAdapter } from './supabase-adapter';

export const db: DataProvider = process.env.NEXT_PUBLIC_SUPABASE_URL
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
