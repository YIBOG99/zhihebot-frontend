import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Loader2, ShieldCheck, AlertCircle } from 'lucide-react';
import { supabase } from '@/supabase/client';
import { BrandLogo, useBrandName } from '@/components/BrandLogo';

/**
 * Dedicated Supabase Auth callback page.
 * Handles PKCE ?code= callbacks, token_hash links, and implicit-flow hash tokens.
 * Keep a visible error state instead of leaving users on an apparently blank page.
 */
export function AuthCallbackPage() {
  const navigate = useNavigate();
  const brandName = useBrandName();
  const [message, setMessage] = useState('正在确认邮箱并建立登录状态…');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;

    const finish = async () => {
      try {
        const url = new URL(window.location.href);
        const params = new URLSearchParams(url.search);
        const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));

        const authError = params.get('error_description') || params.get('error') ||
          hashParams.get('error_description') || hashParams.get('error');
        if (authError) {
          throw new Error(decodeURIComponent(authError.replace(/\+/g, ' ')));
        }

        const code = params.get('code');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          const tokenHash = params.get('token_hash');
          const type = params.get('type');
          if (tokenHash && (type === 'signup' || type === 'email')) {
            const { error } = await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: type === 'signup' ? 'signup' : 'email',
            });
            if (error) throw error;
          }
        }

        // getSession waits for Supabase's URL callback processing to finish.
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session?.user) {
          throw new Error('确认链接无效、已过期，或回跳地址未正确配置。请返回注册页重新发送确认邮件。');
        }

        const email = String(session.user.email ?? '').trim().toLowerCase();
        if (email) {
          const { error } = await supabase.from('profiles')
            .update({ email }).eq('id', session.user.id);
          if (error) console.warn('[AuthCallback] profile email sync failed:', error.message);
        }

        if (!alive) return;
        setMessage('邮箱确认成功，正在进入个人中心…');
        // Remove auth tokens from the address bar before navigating away.
        window.history.replaceState({}, document.title, window.location.pathname);
        await navigate({ to: '/account', replace: true });
      } catch (err: unknown) {
        if (!alive) return;
        setFailed(true);
        setMessage(err instanceof Error ? err.message : '邮箱确认失败，请重新发送邮件后再试。');
        console.error('[AuthCallback] confirmation failed:', err instanceof Error ? err.name : 'unknown');
      }
    };

    void finish();
    return () => { alive = false; };
  }, [navigate]);

  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-7 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center overflow-hidden">
          <BrandLogo size={48} rounded="full" />
        </div>
        {failed ? <AlertCircle size={28} className="mx-auto mb-3 text-destructive" /> :
          message.startsWith('邮箱确认成功') ? <ShieldCheck size={28} className="mx-auto mb-3 text-primary" /> :
          <Loader2 size={28} className="mx-auto mb-3 animate-spin text-primary" />}
        <h1 className="text-xl font-bold text-foreground">{failed ? '邮箱确认未完成' : '正在验证邮箱'}</h1>
        <p role="status" aria-live="polite" className="mt-3 break-words text-sm leading-6 text-muted-foreground">{message}</p>
        {failed && (
          <div className="mt-6 flex flex-col gap-3">
            <Link to="/register" className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">
              返回注册页
            </Link>
            <Link to="/login" className="text-sm text-primary hover:underline">已有账号？前往登录</Link>
          </div>
        )}
        <p className="mt-5 text-xs text-muted-foreground">{brandName}</p>
      </section>
    </main>
  );
}
