/** 独立 Supabase 客户端；仅使用本项目自己的公开 URL 与 anon key。 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

declare global {
  interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL?: string;
    readonly VITE_SUPABASE_ANON_KEY?: string;
    readonly VITE_ONEDAY_APP_ID?: string;
    readonly VITE_SUPABASE_AUTH_STORAGE_KEY?: string;
    readonly VITE_PUBLIC_SNAPSHOT_MODE?: 'true' | 'false';
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

/**
 * 前台快照模式允许暂时没有 Supabase 环境变量。
 * 公开只读页面默认读取本地导出快照；真正需要后端的功能仍会在调用时失败，
 * 但不会因为模块初始化直接把整个商城变成空白页。
 */
export const supabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
);

export const projectUrlId = import.meta.env.VITE_ONEDAY_APP_ID || 'zhihe-preview';
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.invalid';
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'zhihe-public-preview';
const supabaseAuthStorageKey =
  import.meta.env.VITE_SUPABASE_AUTH_STORAGE_KEY;

export function getSupabaseUrl(): string {
  return supabaseUrl;
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    ...(supabaseAuthStorageKey
      ? { storageKey: supabaseAuthStorageKey }
      : {}),
  },
  global: {
    headers: { 'OneDay-App-Id': projectUrlId },
  },
});
