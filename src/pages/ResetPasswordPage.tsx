// 找回密码：两阶段。form 输入邮箱发找回邮件 → recovery（携带 token_hash 的回跳链接）设置新密码
import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Loader2, Mail, Lock, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/supabase/client';
import { BrandLogo, useBrandName } from '@/components/BrandLogo';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('rate limit') || m.includes('too many')) return '尝试次数过多，请稍后再试';
  if (m.includes('invalid') || m.includes('expired')) return '重置链接无效或已过期，请重新发送';
  return message || '操作失败，请重试';
}

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const brandName = useBrandName();
  /** recovery：Supabase 回跳时 session 事件为 PASSWORD_RECOVERY，此时可直接写新密码 */
  const [step, setStep] = useState<'form' | 'sent' | 'recovery'>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setStep('recovery');
    });
    // 页面以 hash 形式携带 recovery token 回跳时，client 会自动换取 session；此处同步一次已有状态
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && window.location.hash.includes('type=recovery')) setStep('recovery');
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const mail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(mail)) { toast.error('请输入正确的邮箱地址'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(mail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setStep('sent');
      toast.success('重置链接已发送，请查收邮箱');
    } catch (err: unknown) {
      toast.error(friendlyError(err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) { toast.error('密码至少 6 位'); return; }
    if (password !== confirm) { toast.error('两次输入的密码不一致'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success('密码已更新，请重新登录');
      await supabase.auth.signOut();
      navigate({ to: '/login' });
    } catch (err: unknown) {
      toast.error(friendlyError(err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }

  const inputCls = 'w-full rounded-lg border border-border bg-input pl-9 pr-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';
  const labelCls = 'mb-1.5 block text-xs font-semibold text-muted-foreground';
  const btnCls = 'w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground transition-all hover:bg-primary-hover active:scale-[0.99] disabled:opacity-60';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center overflow-hidden">
            <BrandLogo size={48} rounded="full" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {step === 'recovery' ? '设置新密码' : '找回密码'}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {step === 'form' && <>验证{brandName}注册时使用的邮箱，我们会发送重置链接。</>}
            {step === 'sent' && <>我们已向 <span className="font-mono text-foreground">{email.trim().toLowerCase()}</span> 发送重置链接，点击邮件内按钮即可设置新密码。</>}
            {step === 'recovery' && <>为你的账号设置一个新的登录密码。</>}
          </p>
        </div>

        {step === 'sent' ? (
          <div className="space-y-4">
            <p className="flex items-start gap-1.5 rounded-lg border border-border bg-surface-2 p-3 text-[11px] leading-relaxed text-muted-foreground">
              <ShieldCheck size={13} className="mt-0.5 shrink-0 text-primary" />
              收不到信？检查垃圾邮件箱，或返回重新发送一次。
            </p>
            <button onClick={() => setStep('form')} className="w-full rounded-xl border border-border py-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
              返回重新发送
            </button>
          </div>
        ) : step === 'recovery' ? (
          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <label className={labelCls}>新密码</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少 6 位" autoComplete="new-password" className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>确认新密码</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  placeholder="再输入一次" autoComplete="new-password" className={inputCls} />
              </div>
            </div>
            <button type="submit" disabled={loading} className={btnCls}>
              {loading && <Loader2 size={15} className="animate-spin" />}
              保存新密码
            </button>
          </form>
        ) : (
          <form onSubmit={handleSend} className="space-y-4">
            <div>
              <label className={labelCls}>注册邮箱</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com" autoComplete="email" className={inputCls} />
              </div>
            </div>
            <button type="submit" disabled={loading} className={btnCls}>
              {loading && <Loader2 size={15} className="animate-spin" />}
              发送重置链接
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          想起来了？<Link to="/login" className="text-primary hover:underline">返回登录</Link>
        </p>
      </div>
    </div>
  );
}
