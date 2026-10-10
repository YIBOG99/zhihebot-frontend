// 下单人机校验：服务端生成随机验证码 + 签发一次性凭证。
// 设计要点：
//  - 验证码明文只用于展示给顾客照抄，库里存 sha256(大写验证码)，脚本无法从数据库反查答案。
//  - 本函数只负责「出码」，不做任何校验；校验在 order_create RPC 事务内完成，避免二次往返被绕过。
//  - 每提交一次即作废该凭证（答错也作废），前端必须重新取码，脚本无法复用同一个码批量下单。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  // OneDay-App-Id is sent by the storefront for project scoping; it must be allowed
  // during the browser's CORS preflight or the request never reaches Deno.serve.
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, oneday-app-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
  'Content-Type': 'application/json',
};

/** FNV-1a + 简单混淆的轻量 sha256 替代？不行——必须真实 sha256，用 Web Crypto */
async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randInt(min: number, max: number): number {
  // Use Web Crypto rather than Math.random for challenge generation.
  const range = max - min + 1;
  const limit = Math.floor(0x1_0000_0000 / range) * range;
  const value = new Uint32Array(1);
  do { crypto.getRandomValues(value); } while (value[0] >= limit);
  return min + (value[0] % range);
}

// Best-effort per-isolate rate limit. Supabase gateway limits and monitoring should
// also be enabled in production; this only reduces accidental rapid challenge churn.
const attempts = new Map<string, { startedAt: number; count: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
function rateLimited(ip: string): boolean {
  if (!ip) return false;
  const now = Date.now();
  const current = attempts.get(ip);
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    attempts.set(ip, { startedAt: now, count: 1 });
  } else {
    current.count += 1;
    if (current.count > RATE_MAX) return true;
  }
  if (attempts.size > 2_000) {
    for (const [key, value] of attempts) {
      if (now - value.startedAt >= RATE_WINDOW_MS) attempts.delete(key);
    }
  }
  return false;
}

/**
 * 验证码字符集：去掉易混字符（0/O、1/I/L、2/Z、5/S、8/B），
 * 保证顾客在手机上照抄时不会认错。
 */
const CODE_CHARS = 'ACDEFGHJKMNPQRTUVWXY34679';

/** 生成 4 位随机验证码；题目就是验证码本身，顾客照着输入即可 */
function buildCode(): string {
  let out = '';
  for (let i = 0; i < 4; i++) out += CODE_CHARS[randInt(0, CODE_CHARS.length - 1)];
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, message: '不支持的请求方式' }), {
      status: 405,
      headers: { ...corsHeaders, 'Allow': 'POST, OPTIONS' },
    });
  }
  const ip = req.headers.get('cf-connecting-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? '';
  if (rateLimited(ip)) {
    return new Response(JSON.stringify({ ok: false, message: '请求过于频繁，请稍后重试' }), {
      status: 429,
      headers: { ...corsHeaders, 'Retry-After': '60' },
    });
  }
  try {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return new Response(JSON.stringify({ ok: false, message: '服务未配置' }), { status: 500, headers: corsHeaders });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // 开关由 site_settings.captcha.enabled 决定（缺省视为开启）
    const { data: cfgRow, error: cfgErr } = await admin.from('site_settings').select('value').eq('key', 'captcha').maybeSingle();
    if (cfgErr) {
      console.error('[order-captcha] config read failed:', cfgErr.message);
      return new Response(JSON.stringify({ ok: false, message: '读取验证码配置失败，请稍后重试' }), { status: 503, headers: corsHeaders });
    }
    const cfg = (cfgRow?.value ?? {}) as Record<string, unknown>;
    if (cfg.enabled === false) {
      return new Response(JSON.stringify({ ok: true, disabled: true }), { headers: corsHeaders });
    }

    const code = buildCode();
    const id = `${Date.now().toString(36)}${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
    // 答案就是验证码本身（统一转大写后取哈希），前端展示同一串字符让顾客照抄
    const answerHash = await sha256Hex(code.toUpperCase());
    const ttlMinutes = 10;

    const { error: insErr } = await admin.from('order_captcha_challenges').insert({
      id,
      answer_hash: answerHash,
      expires_at: new Date(Date.now() + ttlMinutes * 60_000).toISOString(),
    });
    if (insErr) {
      console.error('[order-captcha] insert failed:', insErr.message);
      return new Response(JSON.stringify({ ok: false, message: '生成验证码失败，请重试' }), { status: 500, headers: corsHeaders });
    }

    console.info(`[order-captcha] issued ${id.slice(0, 8)} ttl=${ttlMinutes}m`);
    // prompt 即展示的验证码；顾客原样输入即可，服务端只比对哈希
    return new Response(JSON.stringify({ ok: true, id, prompt: code }), { headers: corsHeaders });
  } catch (e) {
    console.error('[order-captcha] unexpected:', e);
    return new Response(JSON.stringify({ ok: false, message: '服务异常' }), { status: 500, headers: corsHeaders });
  }
});
