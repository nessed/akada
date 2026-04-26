import type { DataProvider } from './data-provider';
import { LocalAdapter } from './local-adapter';
// import { SupabaseAdapter } from './supabase-adapter'; // uncomment when migrating

export const db: DataProvider = new LocalAdapter();
// export const db: DataProvider = new SupabaseAdapter(); // one-line swap

export type { DataProvider } from './data-provider';
export type {
  Course,
  Session,
  Task,
  Semester,
  TaskPriority,
  SessionFilters,
  TaskFilters,
} from './types';
