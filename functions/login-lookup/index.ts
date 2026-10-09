// 用户名登录辅助：把「用户名」解析为 auth.users 里的真实邮箱，供前端 signInWithPassword 使用。
// 背景：新注册账号的 auth 邮箱是真实邮箱（或历史 @meoo.local），但 profiles.username 保留短用户名；
// 前端仅靠拼域名无法命中这类账号。本函数只做「用户名 → 邮箱」映射查询，不接触任何密码。
// 安全：service role 只读 profiles；按 username 精确匹配（大小写不敏感）返回单个 email。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const raw = String((body as { username?: unknown }).username ?? '').trim();
    if (!raw) {
      return new Response(JSON.stringify({ ok: false, message: '缺少用户名' }), { status: 400, headers: corsHeaders });
    }

    // service role client 绕过 RLS，仅查询 username→email 映射
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const lower = raw.toLowerCase();

    // 先精确匹配，再退化为大小写不敏感匹配（少量数据，全表扫描可接受）
    let { data: exact } = await admin.from('profiles').select('email, username').eq('username', raw).limit(2);
    if (!exact || exact.length === 0) {
      const all = await admin.from('profiles').select('email, username');
      const rows = (all.data ?? []) as Array<{ email: string | null; username: string | null }>;
      const hit = rows.find((r) => (r.username ?? '').toLowerCase() === lower);
      exact = hit ? [hit as unknown as { email: string | null; username: string | null }] : [];
    }

    const row = (exact ?? [])[0] as Record<string, unknown> | undefined;
    const email = String(row?.email ?? '').trim();
    console.log('[login-lookup] username =', raw, '| matched email =', email || '(none)');
    if (!email) {
      return new Response(JSON.stringify({ ok: false, message: '用户不存在' }), { headers: corsHeaders });
    }
    return new Response(JSON.stringify({ ok: true, email }), { headers: corsHeaders });
  } catch (e) {
    console.error('[login-lookup] unexpected:', e);
    return new Response(JSON.stringify({ ok: false, message: '服务异常' }), { status: 500, headers: corsHeaders });
  }
});
