/** 独立 Supabase 客户端；仅使用本项目自己的公开 URL 与 publishable/anon key。 */

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
 * Cloudflare Pages 若暂时漏配构建环境变量，仍使用本商城已确认的公开 Supabase 配置。
 * 这里仅包含可公开的项目 URL 与 publishable key，绝不放 service_role/secret key。
 * 显式环境变量优先，方便预览环境或未来迁移项目时覆盖。
 */
const DEFAULT_SUPABASE_URL = 'https://aqoryvygjavngcgkmuom.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_xVXQUWepB1MQi-ycpIxsEg_G8eeh8cg';

export const supabaseUrl = (
  import.meta.env.VITE_SUPABASE_URL?.trim() || DEFAULT_SUPABASE_URL
).replace(/\/+$/, '');
export const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || DEFAULT_SUPABASE_PUBLISHABLE_KEY;
export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const projectUrlId = import.meta.env.VITE_ONEDAY_APP_ID || 'zhihe-preview';
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
