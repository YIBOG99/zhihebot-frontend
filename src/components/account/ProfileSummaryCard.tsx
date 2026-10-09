// 个人中心顶部卡：头像 + 用户名 + 邮箱（脱敏）+ 验证状态徽标 + 注册时间 + 累计消费
import { Link } from '@tanstack/react-router';
import { LayoutDashboard, ShieldCheck, ShieldAlert } from 'lucide-react';
import type { ProfileRow } from '@/lib/types';
import { maskEmail, isVirtualEmail } from '@/lib/my-stats';

interface Props {
  username: string;
  profile: ProfileRow | null;
  /** auth.users.email_confirmed_at，有值即邮箱已验证 */
  emailConfirmedAt: string | null;
  totalSpent: number;
  isAdmin: boolean;
}

export function ProfileSummaryCard({ username, profile, emailConfirmedAt, totalSpent, isAdmin }: Props) {
  const email = profile?.email ?? null;
  const virtual = isVirtualEmail(email);
  const joinedAt = profile?.created_at ? new Date(profile.created_at).toLocaleDateString('zh-CN') : null;

  return (
    <div className="glow-frame relative overflow-hidden rounded-2xl border border-border bg-card p-5 sm:p-6">
      {/* 背景光晕：与首页 hero 同源的翠绿渐层，营造会员身份感 */}
      <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-primary/10 blur-3xl" />
      <span aria-hidden className="orb-slow pointer-events-none absolute -bottom-24 left-1/3 h-40 w-40 rounded-full bg-neon-violet/10 blur-3xl" />

      <div className="relative flex flex-wrap items-start gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-neon-cyan text-xl font-bold text-primary-foreground shadow-lg shadow-primary/30">
          {(username || '用').slice(0, 1).toUpperCase()}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold text-foreground">{username || '用户'}</h1>
            {virtual ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
                <ShieldAlert size={11} /> 未绑定真实邮箱
              </span>
            ) : emailConfirmedAt ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
                <ShieldCheck size={11} /> 邮箱已验证
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-info/15 px-2 py-0.5 text-[11px] font-medium text-info">
                <ShieldAlert size={11} /> 待验证
              </span>
            )}
          </div>

          <p className="mt-1.5 truncate font-mono text-xs text-muted-foreground">
            {virtual ? '账号标识：用户名（无邮箱）' : maskEmail(email)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {joinedAt ? `注册于 ${joinedAt}` : '注册时间未知'}
            {!virtual && !emailConfirmedAt && ' · 完成邮箱验证后可用于找回密码'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[11px] text-muted-foreground">累计消费</p>
            <p className="price-tag text-xl"><span className="currency">¥</span>{totalSpent.toFixed(2)}</p>
          </div>
          {isAdmin && (
            <Link to="/admin"
              className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20">
              <LayoutDashboard size={15} /> <span className="hidden sm:inline">进入后台</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
