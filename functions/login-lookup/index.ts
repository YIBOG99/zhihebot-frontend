// Username login proxy. The email lookup stays server-side: never return account emails
// from this unauthenticated endpoint. GoTrue still verifies credentials and issues the session.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, one-day-app-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json',
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function invalidCredentials(): Response {
  // Same response for unknown usernames, ambiguous usernames and wrong passwords.
  return json({ ok: false, message: '用户名或密码不正确' }, 401);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, message: '不支持的请求方式' }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
    console.error('[login-lookup] Required Supabase function secrets are missing');
    return json({ ok: false, message: '登录服务暂不可用，请使用邮箱登录或稍后重试' }, 503);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const raw = String((body as { username?: unknown }).username ?? '').trim();
    const password = String((body as { password?: unknown }).password ?? '');
    if (!raw || raw.length > 128 || password.length < 6 || password.length > 1024) {
      return invalidCredentials();
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const lower = raw.toLowerCase();
    const { data: exactRows, error: exactError } = await admin
      .from('profiles').select('email, username').eq('username', raw).limit(2);
    if (exactError) {
      console.error('[login-lookup] profile lookup failed:', exactError.code);
      return json({ ok: false, message: '登录服务暂不可用，请稍后重试' }, 503);
    }

    let candidates = (exactRows ?? []) as Array<{ email: string | null; username: string | null }>;
    if (candidates.length === 0) {
      // Legacy usernames may differ only by case. Reject ambiguity instead of choosing
      // an arbitrary account when the old case-sensitive unique constraint allows both.
      const { data: allRows, error: allError } = await admin.from('profiles').select('email, username');
      if (allError) {
        console.error('[login-lookup] case-insensitive lookup failed:', allError.code);
        return json({ ok: false, message: '登录服务暂不可用，请稍后重试' }, 503);
      }
      candidates = ((allRows ?? []) as Array<{ email: string | null; username: string | null }>)
        .filter((row) => (row.username ?? '').toLowerCase() === lower);
    }

    if (candidates.length !== 1) return invalidCredentials();

    const row = candidates[0];
    const profileEmail = String(row.email ?? '').trim().toLowerCase();
    // The fallback is for legacy records whose profile email is still null.
    const legacyEmail = `${raw.toLowerCase().replace(/@meoo\.local$/, '')}@meoo.local`;
    // A virtual address is only a fallback when there is no real profile email;
    // never try a second account after a known email/password pair failed.
    const loginEmails = profileEmail ? [profileEmail] : [legacyEmail];
    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let session: { access_token: string; refresh_token: string; expires_at?: number; token_type: string } | null = null;
    for (const email of loginEmails) {
      const { data, error } = await authClient.auth.signInWithPassword({ email, password });
      if (!error && data.session) {
        session = data.session;
        break;
      }
    }
    if (!session) return invalidCredentials();

    // Only deliver the bearer tokens required by supabase.auth.setSession. Do not send
    // the user's email or profile row to an unauthenticated caller.
    return json({
      ok: true,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      token_type: session.token_type,
    });
  } catch (error) {
    // Don't log the submitted username, password, email, or credentials.
    console.error('[login-lookup] unexpected error:', error instanceof Error ? error.name : 'unknown');
    return json({ ok: false, message: '登录服务暂不可用，请稍后重试' }, 503);
  }
});
