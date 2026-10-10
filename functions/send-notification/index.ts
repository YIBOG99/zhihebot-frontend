import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'ZhiheBot <noreply@zhihebot.shop>';
const ALLOWED_ORIGINS = new Set([
  'https://zhihebot.shop',
  'https://www.zhihebot.shop',
  'http://localhost:3015',
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://zhihebot.shop';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
}

function json(body: Record<string, unknown>, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}

function validEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ ok: false, message: '来源不被允许' }, 403, origin);
  if (req.method !== 'POST') return json({ ok: false, message: '不支持的请求方式' }, 405, origin);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY) {
    console.error('[send-notification] Required server secrets are missing');
    return json({ ok: false, message: '邮件服务暂不可用' }, 503, origin);
  }

  const authorization = req.headers.get('authorization') ?? '';
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) return json({ ok: false, message: '请先登录管理员账号' }, 401, origin);

  try {
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser(tokenMatch[1]);
    if (userError || !userData.user) return json({ ok: false, message: '登录状态无效' }, 401, origin);

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: role, error: roleError } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .eq('role', 'admin')
      .maybeSingle();
    if (roleError) {
      console.error('[send-notification] Admin role check failed:', roleError.code);
      return json({ ok: false, message: '暂时无法验证管理员权限' }, 503, origin);
    }
    if (!role) return json({ ok: false, message: '没有发送通知邮件的权限' }, 403, origin);

    const body = await req.json().catch(() => ({})) as {
      to?: unknown; subject?: unknown; text?: unknown; html?: unknown;
    };
    const to = String(body.to ?? '').trim();
    const subject = String(body.subject ?? '').trim();
    const textBody = typeof body.text === 'string' ? body.text : '';
    const htmlBody = typeof body.html === 'string' ? body.html : '';
    if (!validEmail(to) || !subject || subject.length > 160 ||
        textBody.length > 10000 || htmlBody.length > 30000 ||
        (!textBody.trim() && !htmlBody.trim())) {
      return json({ ok: false, message: '邮件收件人、主题或正文格式不正确' }, 400, origin);
    }

    const emailPayload: Record<string, unknown> = {
      from: FROM_EMAIL,
      to: [to],
      subject,
      ...(textBody.trim() ? { text: textBody } : {}),
      ...(htmlBody.trim() ? { html: htmlBody } : {}),
    };
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
    });
    const resendResult = await resendResponse.json().catch(() => ({})) as { id?: string; message?: string };
    if (!resendResponse.ok || !resendResult.id) {
      console.error('[send-notification] Resend request failed with status:', resendResponse.status);
      return json({ ok: false, message: '邮件发送失败，请检查发信配置' }, 502, origin);
    }

    return json({ ok: true, id: resendResult.id }, 200, origin);
  } catch (error) {
    console.error('[send-notification] Unexpected error:', error instanceof Error ? error.name : 'unknown');
    return json({ ok: false, message: '邮件服务暂不可用' }, 503, origin);
  }
});
