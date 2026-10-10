import { projectUrlId, supabase, supabaseAnonKey, supabaseUrl } from '@/supabase/client';

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
  // Send a real user JWT when signed in; guest checkout relies on the function's
  // explicit verify_jwt=false gateway setting plus server-side rate limiting.
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': supabaseAnonKey,
    'OneDay-App-Id': projectUrlId,
  };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/order-captcha`, {
      method: 'POST',
      headers,
      body: '{}',
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('验证码接口请求超时，请检查网络后重试');
    }
    throw new Error('验证码接口无法连接，请检查网络或服务配置后重试');
  } finally {
    clearTimeout(timeout);
  }
  const json = await res.json().catch(() => ({})) as { ok?: boolean; disabled?: boolean; id?: string; prompt?: string; message?: string };
  if (!res.ok) throw new Error(json.message ?? `出题接口异常 ${res.status}`);
  if (json.disabled === true) return null;
  if (!json.ok || !json.id || !json.prompt) throw new Error(json.message ?? '出题失败');
  return { id: json.id, prompt: json.prompt };
}
