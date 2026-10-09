// 全局登录态 hook：基于 supabase auth session，供 SiteHeader/AccountPage 等消费
import { useEffect, useState } from 'react';
import { supabase } from '@/supabase/client';

export type AuthUser = { id: string; username: string; email: string | null };

/** session.user 上可能出现的验证时间字段：顶层是权威值，user_metadata 里的是历史快照副本 */
type SessionUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  confirmed_at?: string | null;
  email_confirmed_at?: string | null;
};

/** 从 session 提取会话态（供 useState 初值与回调复用，避免两处逻辑漂移） */
function fromSession(s: { user?: SessionUser | null } | null) {
  const u = s?.user;
  if (!u) return { user: null, emailConfirmedAt: null as string | null };
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  // 必须优先读顶层：GoTrue 在确认邮箱时只更新 auth.users.email_confirmed_at，
  // 不会回写 user_metadata 里的同名副本，先读 metadata 会永远拿到 null。
  const confirmed = u.email_confirmed_at ?? u.confirmed_at ?? (meta.email_confirmed_at as string | null) ?? null;
  console.log('[useAuthSession] uid =', u.id, '| email =', u.email, '| emailConfirmedAt =', confirmed);
  return {
    user: { id: u.id, username: String(meta.username ?? u.email?.split('@')[0] ?? '用户'), email: u.email ?? null },
    emailConfirmedAt: confirmed,
  };
}

export function useAuthSession() {
  const [user, setUser] = useState<AuthUser | null>(null);
  /** auth.users.email_confirmed_at：有值代表该邮箱已收到验证码并确认真实可达 */
  const [emailConfirmedAt, setEmailConfirmedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      const next = fromSession(session);
      setUser(next.user);
      setEmailConfirmedAt(next.emailConfirmedAt);
      setLoading(false);
    }
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const next = fromSession(session);
      setUser(next.user);
      setEmailConfirmedAt(next.emailConfirmedAt);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { user, emailConfirmedAt, loading };
}
