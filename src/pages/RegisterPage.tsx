// 注册页：真实邮箱 + 密码 → signUp 触发确认邮件（数字验证码）→ verifyOtp 完成验证并建档
import { useState, useEffect } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Loader2, Mail, Lock, User, KeyRound, ArrowLeft, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, supabaseConfigured } from '@/supabase/client';
import { BrandLogo, useBrandName } from '@/components/BrandLogo';
import { captureReferralCode, readPendingReferralCode, bindPendingReferral } from '@/lib/referral';

/** GoTrue 英文错误 → 中文可读文案 */
function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('already registered') || m.includes('already exists')) return '该邮箱已注册，请直接登录';
  if (m.includes('invalid token') || m.includes('token has expired')) return '验证码不正确或已过期，请重新获取';
  if (m.includes('rate limit') || m.includes('too many')) return '尝试次数过多，请稍后再试';
  if (m.includes('password')) return '密码不符合要求（至少 6 位）';
  if (m.includes('email')) return '邮箱格式不正确，请检查后重试';
  return message || '操作失败，请重试';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** username 必须非空唯一：留空时由邮箱前缀清洗 + 短随机后缀派生 */
function resolveProfileUsername(input: string, email: string): string {
  const explicit = input.trim();
  if (explicit) return explicit;
  const prefix = email.split('@')[0]?.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
  return `${prefix || 'user'}_${Math.random().toString(36).slice(2, 8)}`;
}

export function RegisterPage() {
  const navigate = useNavigate();
  const brandName = useBrandName();
  /** 两阶段状态机：form 收集邮箱密码 → verify 输入邮件里的数字验证码 */
  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pendingUsername, setPendingUsername] = useState('');
  const [loading, setLoading] = useState(false);
  /** 好友分享链接带来的邀请码（?ref=XXX），注册成功后自动核销发奖 */
  const [refCode, setRefCode] = useState<string | null>(null);

  useEffect(() => {
    // 进入注册页即捕获一次 ?ref=，兼容用户先逛首页再点注册的路径
    captureReferralCode();
    setRefCode(readPendingReferralCode());
  }, []);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    const mail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(mail)) { toast.error('请输入正确的邮箱地址'); return; }
    if (password.length < 6) { toast.error('密码至少 6 位'); return; }
    if (!supabaseConfigured) { toast.error('注册服务尚未配置：请为网站部署设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY'); return; }
    setLoading(true);
    try {
      const profileUsername = resolveProfileUsername(username, mail);
      setPendingUsername(profileUsername);
      const { error } = await supabase.auth.signUp({
        email: mail, password,
        options: { data: { username: profileUsername } },
      });
      if (error) throw error;
      setStep('verify');
      toast.success('验证码已发送，请查收邮箱（含垃圾邮件箱）');
    } catch (err: unknown) {
      toast.error(friendlyError(err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim().length < 6) { toast.error('请输入 6 位验证码'); return; }
    setLoading(true);
    try {
      const mail = email.trim().toLowerCase();
      const { error } = await supabase.auth.verifyOtp({ email: mail, token: code.trim(), type: 'signup' });
      if (error) throw error;
      // session 同步后再建档，避免 RLS 下 auth.uid() 为空导致 403
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('登录状态尚未同步，请稍后重试');
      const { error: upErr } = await supabase.from('profiles').upsert(
        { id: user.id, username: pendingUsername, email: mail }, { onConflict: 'id' },
      );
      if (upErr) console.warn('[RegisterPage] 资料补写失败（不阻断注册）:', upErr.message);
      // 有推荐人则立即归因发奖（服务端校验：仅新注册账号、每人一次）
      const bindResult = await bindPendingReferral();
      if (bindResult.bound) toast.success(bindResult.message || '邀请码已生效，奖励券已到账');
      else if (bindResult.message) toast.info(bindResult.message);
      toast.success('验证成功，已自动登录');
      navigate({ to: '/account' });
    } catch (err: unknown) {
      toast.error(friendlyError(err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }

  const inputCls = 'w-full rounded-lg border border-border bg-input pl-9 pr-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';
  const labelCls = 'mb-1.5 block text-xs font-semibold text-muted-foreground';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center overflow-hidden">
            <BrandLogo size={48} rounded="full" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{step === 'form' ? '注册账号' : '验证你的邮箱'}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {step === 'form'
              ? <>注册{brandName}会员，订单与卡密永久可查</>
              : <>我们已向 <span className="font-mono text-foreground">{email.trim().toLowerCase()}</span> 发送 6 位验证码，5 分钟内有效。</>}
          </p>
        </div>

        {step === 'form' ? (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className={labelCls}>邮箱（用于接收验证码与找回账号）</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
                  autoComplete="email" className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>用户名（选填，展示在个人中心）</label>
              <div className="relative">
                <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="留空则自动生成"
                  autoComplete="nickname" className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>登录密码</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 6 位"
                  autoComplete="new-password" className={inputCls} />
              </div>
            </div>
            {refCode && (
              <p className="flex items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-[11px] leading-relaxed text-primary">
                <ShieldCheck size={13} className="shrink-0" />
                已识别好友邀请码 <span className="font-mono font-bold">{refCode}</span>，注册成功后你俩各得一张满减券。
              </p>
            )}
            <button type="submit" disabled={loading}
              className="btn-sheen w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary-hover active:scale-[0.99] disabled:opacity-60">
              {loading && <Loader2 size={15} className="animate-spin" />}
              注册并发送验证码
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label className={labelCls}>邮箱验证码</label>
              <div className="relative">
                <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input inputMode="numeric" pattern="[0-9]*" maxLength={8} value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="6 位数字"
                  autoFocus autoComplete="one-time-code" className={`${inputCls} tracking-[0.3em] font-mono`} />
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="btn-sheen w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary-hover active:scale-[0.99] disabled:opacity-60">
              {loading && <Loader2 size={15} className="animate-spin" />}
              提交验证并进入个人中心
            </button>
            <button type="button" onClick={() => { setStep('form'); setCode(''); }}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft size={12} /> 返回修改邮箱 / 重新发送
            </button>
            <p className="flex items-start gap-1.5 rounded-lg border border-border bg-surface-2 p-3 text-[11px] leading-relaxed text-muted-foreground">
              <ShieldCheck size={13} className="mt-0.5 shrink-0 text-primary" />
              收不到信？请先检查垃圾邮件箱；仍没有则点上方返回，重新提交注册会再发一封新验证码。
            </p>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          已有账号？<Link to="/login" className="text-primary hover:underline">直接登录</Link>
        </p>
      </div>
    </div>
  );
}
