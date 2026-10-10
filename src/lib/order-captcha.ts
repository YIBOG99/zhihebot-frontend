import { projectUrlId, supabaseAnonKey, supabaseUrl } from '@/supabase/client';

/** 一道待答的人机校验题（答案由服务端保管，前端只拿到题面与凭证） */
export interface CaptchaChallenge {
  id: string;
  prompt: string;
}

/**
 * 向 order-captcha Edge Function 申请一道新题。
 * - disabled=true 表示店主在后台关闭了人机校验，前台不展示题目；
 * - 失败时抛错，由调用方决定降级策略（结算页会提示「换一道题」）。
 */
export async function requestCaptcha(): Promise<CaptchaChallenge | null> {
  const res = await fetch(`${supabaseUrl}/functions/v1/order-captcha`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
      'OneDay-App-Id': projectUrlId,
    },
    body: '{}',
  });
  const json = await res.json().catch(() => ({})) as { ok?: boolean; disabled?: boolean; id?: string; prompt?: string; message?: string };
  if (!res.ok) throw new Error(json.message ?? `出题接口异常 ${res.status}`);
  if (json.disabled === true) return null;
  if (!json.ok || !json.id || !json.prompt) throw new Error(json.message ?? '出题失败');
  return { id: json.id, prompt: json.prompt };
}
