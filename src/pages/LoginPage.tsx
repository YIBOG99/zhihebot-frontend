import { useState } from 'react';
import { useNavigate, Link } from '@tanstack/react-router';
import { Loader2, User, Lock, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, supabaseUrl, supabaseAnonKey, projectUrlId } from '@/supabase/client';
import { BrandLogo, useBrandName } from '@/components/BrandLogo';

/** 输入含 @ 视为完整邮箱原样提交；否则按用户名拼接虚拟邮箱域 */
function toIdentifier(raw: string): string {
  const v = raw.trim().toLowerCase();
  return v.includes('@') ? v : `${v}@meoo.local`;
}

/** 用户名 → 真实登录邮箱：先走服务端映射（新注册账号 auth 邮箱是真实邮箱，拼域名无法命中），失败回退拼域名 */
async function resolveLoginEmail(identifier: string): Promise<string> {
  // 真实邮箱（非虚拟域）直接返回，无需解析
  if (identifier.includes('@') && !identifier.endsWith('@meoo.local')) return identifier;
  const username = identifier.replace(/@meoo\.local$/, '');
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/login-lookup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        'OneDay-App-Id': projectUrlId,
      },
      body: JSON.stringify({ username }),
    });
    const j = (await res.json()) as { ok?: boolean; email?: string };
    // 不在浏览器控制台记录用户名与邮箱映射，避免暴露账号关联信息。
    if (j.ok && j.email) return j.email.toLowerCase();
  } catch (e) {
    console.warn('[LoginPage] login-lookup 异常，回退拼域名:', e);
  }
  return `${username}@meoo.local`;
}

/** GoTrue 英文错误 → 中文可读文案 */
function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return '用户名或密码不正确';
  if (m.includes('email not confirmed')) return '账号邮箱尚未确认，请重新注册或联系管理员';
  if (m.includes('rate limit') || m.includes('too many')) return '尝试次数过多，请稍后再试';
  if (m.includes('already registered') || m.includes('already exists')) return '该账号已存在，请直接登录';
  if (m.includes('password')) return '密码不符合要求（至少 6 位）';
  return message || '操作失败，请重试';
}

export function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const brandName = useBrandName();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) { toast.error('请输入用户名或邮箱'); return; }
    if (password.length < 6) { toast.error('密码至少 6 位'); return; }
    setLoading(true);
    try {
      const identifier = toIdentifier(username);
      const loginEmail = await resolveLoginEmail(identifier);
      console.log('[LoginPage] 登录解析:', username, '→', loginEmail);
      let { data: signInData, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
      // 兜底：服务端映射出的邮箱登录失败时，再试一次传统拼域名方式（覆盖老 @meoo.local 账号）
      if (error && loginEmail !== identifier) {
        console.warn('[LoginPage] 映射邮箱登录失败，回退拼域名重试:', error.message);
        ({ data: signInData, error } = await supabase.auth.signInWithPassword({ email: identifier, password }));
      }
      if (error) throw error;
      toast.success('登录成功');
      // 管理员直接进后台，普通用户进个人中心
      const uid = signInData.user?.id ?? '';
      let isAdmin = false;
      try {
        const { data, error: roleErr } = await supabase.rpc('has_role', { _user_id: uid, _role: 'admin' });
        if (roleErr) console.warn('[LoginPage] has_role 查询失败，按普通用户跳转:', roleErr.message);
        isAdmin = !roleErr && Boolean(data);
      } catch (e) {
        console.warn('[LoginPage] has_role 异常，按普通用户跳转:', e);
      }
      console.log('[LoginPage] 登录成功 uid =', uid, '| isAdmin =', isAdmin);
      navigate({ to: isAdmin ? '/admin' : '/account' });
    } catch (err: unknown) {
      toast.error(friendlyError(err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">用户名或邮箱</label>
            <div className="relative">
              {username.includes('@')
                ? <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                : <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />}
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="请输入用户名或邮箱" autoComplete="username"
                className="w-full rounded-lg border border-border bg-input pl-9 pr-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">密码</label>
            <div className="relative">
              <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 6 位"
                autoComplete="current-password"
                className="w-full rounded-lg border border-border bg-input pl-9 pr-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>
          <div className="flex justify-end">
            <Link to="/reset-password" className="text-xs text-muted-foreground transition-colors hover:text-primary">忘记密码？</Link>
          </div>
          <button type="submit" disabled={loading}
            className="btn-sheen w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary-hover active:scale-[0.99] disabled:opacity-60">
            {loading && <Loader2 size={15} className="animate-spin" />}
            登录
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
