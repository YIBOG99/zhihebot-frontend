import { useState } from 'react';
import { useNavigate, Link } from '@tanstack/react-router';
import { Loader2, User, Lock, Mail, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, supabaseUrl, supabaseAnonKey, projectUrlId, supabaseConfigured } from '@/supabase/client';
import { BrandLogo, useBrandName } from '@/components/BrandLogo';

type LoginMode = 'password' | 'email-code';

/** 真实邮箱走 Supabase Auth；用户名登录由服务端校验凭据，并只返回会话令牌。 */
async function signInWithUsername(username: string, password: string) {
  const res = await fetch(`${supabaseUrl}/functions/v1/login-lookup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      'OneDay-App-Id': projectUrlId,
    },
    body: JSON.stringify({ username, password }),
  });
  const result = (await res.json().catch(() => ({}))) as {
    ok?: boolean; message?: string; access_token?: string; refresh_token?: string;
  };
  if (!res.ok || !result.ok || !result.access_token || !result.refresh_token) {
    throw new Error(result.message || '用户名或密码不正确');
  }
  const { data, error } = await supabase.auth.setSession({
    access_token: result.access_token,
    refresh_token: result.refresh_token,
  });
  if (error) throw error;
  if (!data.session || !data.user) throw new Error('登录状态未能建立，请重试');
  return data;
}

/** GoTrue 英文错误 → 中文可读文案 */
function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return '用户名或密码不正确';
  if (m.includes('email not confirmed')) return '账号邮箱尚未确认，请重新注册或联系管理员';
  if (m.includes('rate limit') || m.includes('too many')) return '尝试次数过多，请稍后再试';
  if (m.includes('already registered') || m.includes('already exists')) return '该账号已存在，请直接登录';
  if (m.includes('password')) return '密码不符合要求（至少 6 位）';
  if (m.includes('otp') || m.includes('token')) return '验证码不正确或已过期，请重新获取';
  return message || '操作失败，请重试';
}

const EMAIL_RE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;

export function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [mode, setMode] = useState<LoginMode>('password');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const brandName = useBrandName();

  async function sendEmailCode(email: string) {
    // shouldCreateUser=false prevents passwordless login from silently registering new accounts.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (error) throw error;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const identifier = username.trim();
    if (!identifier) { toast.error(mode === 'email-code' ? '请输入邮箱地址' : '请输入用户名或邮箱'); return; }
    if (!supabaseConfigured) { toast.error('网站后端环境变量缺失，登录请求尚未发送。请在 Cloudflare Pages 项目设置 → Variables and Secrets 中配置 VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY，然后重新部署。'); return; }
    if (mode === 'password' && password.length < 6) { toast.error('密码至少 6 位'); return; }
    if (mode === 'email-code' && !EMAIL_RE.test(identifier.toLowerCase())) { toast.error('请输入正确的邮箱地址'); return; }
    if (mode === 'email-code' && otpSent && emailCode.trim().length < 6) { toast.error('请输入邮件中的 6 位验证码'); return; }

    setLoading(true);
    try {
      let uid = '';
      if (mode === 'email-code') {
        const email = identifier.toLowerCase();
        if (!otpSent) {
          await sendEmailCode(email);
          setOtpSent(true);
          toast.success('如果该邮箱已注册，验证码将发送到邮箱，请查收收件箱和垃圾邮件箱');
          return;
        }
        const { data, error } = await supabase.auth.verifyOtp({
          email,
          token: emailCode.trim(),
          type: 'email',
        });
        if (error) throw error;
        uid = data.user?.id ?? '';
        if (!uid) throw new Error('登录状态未能建立，请重新获取验证码');
      } else if (identifier.includes('@') && !identifier.toLowerCase().endsWith('@meoo.local')) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: identifier.toLowerCase(),
          password,
        });
        if (error) throw error;
        uid = data.user?.id ?? '';
      } else {
        const loginUsername = identifier.replace(/@meoo\\.local$/i, '');
        const result = await signInWithUsername(loginUsername, password);
        if (!result.user) throw new Error('用户名或密码错误');
        uid = result.user.id;
      }

      toast.success('登录成功');
      // 管理员直接进后台，普通用户进个人中心
      let isAdmin = false;
      try {
        const { data, error: roleErr } = await supabase.rpc('has_role', { _user_id: uid, _role: 'admin' });
        if (roleErr) console.warn('[LoginPage] has_role 查询失败，按普通用户跳转:', roleErr.message);
        isAdmin = !roleErr && Boolean(data);
      } catch (e) {
        console.warn('[LoginPage] has_role 异常，按普通用户跳转:', e);
      }
      navigate({ to: isAdmin ? '/admin' : '/account' });
    } catch (err: unknown) {
      toast.error(friendlyError(err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }

  async function handleResendCode() {
    const email = username.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { toast.error('请输入正确的邮箱地址'); return; }
    setLoading(true);
    try {
      await sendEmailCode(email);
      setEmailCode('');
      toast.success('如果该邮箱已注册，验证码将发送到邮箱');
    } catch (err: unknown) {
      toast.error(friendlyError(err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }

  function switchMode(nextMode: LoginMode) {
    setMode(nextMode);
    setOtpSent(false);
    setEmailCode('');
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center overflow-hidden">
            <BrandLogo size={48} rounded="full" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">登录{brandName}</h1>
          <p className="mt-2 text-sm text-muted-foreground">登录后可查看历史订单与消费统计</p>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl border border-border p-1">
          <button type="button" onClick={() => switchMode('password')}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${mode === 'password' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            密码登录
          </button>
          <button type="button" onClick={() => switchMode('email-code')}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${mode === 'email-code' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            邮箱验证码
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              {mode === 'email-code' ? '邮箱地址' : '用户名或邮箱'}
            </label>
            <div className="relative">
              {mode === 'email-code' || username.includes('@')
                ? <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                : <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />}
              <input value={username} onChange={(e) => { setUsername(e.target.value); setOtpSent(false); setEmailCode(''); }}
                type={mode === 'email-code' ? 'email' : 'text'}
                placeholder={mode === 'email-code' ? '请输入已注册的邮箱' : '请输入用户名或邮箱'}
                autoComplete="username"
                className="w-full rounded-lg border border-border bg-input pl-9 pr-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>

          {mode === 'password' ? (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">密码</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 6 位"
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-border bg-input pl-9 pr-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            </div>
          ) : otpSent ? (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">6 位邮箱验证码</label>
              <div className="relative">
                <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={emailCode} onChange={(e) => setEmailCode(e.target.value.replace(/\\D/g, '').slice(0, 8))}
                  inputMode="numeric" autoComplete="one-time-code" placeholder="请输入邮件中的验证码"
                  className="w-full rounded-lg border border-border bg-input pl-9 pr-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div className="mt-2 flex justify-end">
                <button type="button" disabled={loading} onClick={() => void handleResendCode()}
                  className="text-xs text-muted-foreground hover:text-primary disabled:opacity-60">重新发送验证码</button>
              </div>
            </div>
          ) : null}

          {mode === 'password' && (
            <div className="flex justify-end">
              <Link to="/reset-password" className="text-xs text-muted-foreground transition-colors hover:text-primary">忘记密码？</Link>
            </div>
          )}

          <button type="submit" disabled={loading}
            className="btn-sheen w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary-hover active:scale-[0.99] disabled:opacity-60">
            {loading && <Loader2 size={15} className="animate-spin" />}
            {mode === 'email-code' ? (otpSent ? '验证并登录' : '发送登录验证码') : '登录'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          还没有账号？
          <Link to="/register" className="ml-1 text-primary hover:underline">邮箱验证码注册 →</Link>
        </p>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground transition-colors">← 返回首页</Link>
        </p>
      </div>
    </div>
  );
}
