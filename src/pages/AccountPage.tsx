// 个人中心主页面：统一登录守卫、资料、钱包、邀请、订单与异常恢复入口。
import { Link } from '@tanstack/react-router';
import { LogOut, Package, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/supabase/client';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useIsAdmin } from '@/hooks/use-is-admin';
import { useMyOrders, useMyProfile, computeMyStats } from '@/lib/my-stats';
import { useReferral } from '@/lib/referral';
import { ProfileSummaryCard } from '@/components/account/ProfileSummaryCard';
import { StatsCards } from '@/components/account/StatsCards';
import { MyOrdersPanel } from '@/components/account/MyOrdersPanel';
import { InviteCard } from '@/components/account/InviteCard';
import { WalletCard } from '@/components/account/WalletCard';

export function AccountPage() {
  const { user, emailConfirmedAt, loading } = useAuthSession();
  const adminState = useIsAdmin();
  const { profile } = useMyProfile(user?.id ?? null);
  const { orders, loading: loadingOrders, err } = useMyOrders(user?.id ?? null);
  const referral = useReferral(user?.id ?? null);
  const stats = computeMyStats(orders);

  async function handleLogout() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      toast.success('已退出登录');
    } catch (error) {
      console.error('[AccountPage] sign out failed:', error);
      toast.error('退出登录失败，请稍后重试');
    }
  }

  function handleRefresh() {
    window.location.reload();
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 size={18} className="animate-spin text-primary" />
        正在加载账号信息…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <Package size={36} className="text-muted-foreground" />
        <h1 className="text-lg font-bold text-foreground">登录后查看个人中心</h1>
        <p className="max-w-sm text-sm text-muted-foreground">登录后可以查看余额、充值记录、邀请奖励、历史订单与消费统计。</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/login" className="btn-sheen rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 transition-colors hover:bg-primary-hover">去登录</Link>
          <Link to="/register" className="rounded-xl border border-border px-6 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/40">邮箱注册</Link>
          <Link to="/" className="rounded-xl border border-border px-6 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">返回首页</Link>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen pb-10">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">个人中心</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">账户、钱包、邀请奖励与订单管理</p>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={handleRefresh} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground" title="重新加载所有个人中心数据">
              <RefreshCw size={13} /> 刷新数据
            </button>
            <button type="button" onClick={handleLogout} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-danger">
              <LogOut size={13} /> 退出登录
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
        {err && (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4">
            <AlertTriangle size={17} className="mt-0.5 shrink-0 text-warning" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">部分订单数据暂时无法读取</p>
              <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">{err}</p>
              <p className="mt-1 text-xs text-muted-foreground">如果反复出现，通常需要检查当前网站连接的 Supabase 项目及数据库迁移状态；单纯刷新无法补建缺失的数据表或函数。</p>
            </div>
            <button type="button" onClick={handleRefresh} className="shrink-0 text-xs font-semibold text-primary hover:underline">重试</button>
          </div>
        )}

        <ProfileSummaryCard
          username={user.username}
          profile={profile}
          emailConfirmedAt={emailConfirmedAt}
          totalSpent={stats.totalSpent}
          isAdmin={adminState === 'granted'}
        />

        <section aria-label="我的钱包">
          <WalletCard />
        </section>

        <StatsCards stats={stats} loading={loadingOrders} />

        <section aria-label="邀请与奖励">
          <InviteCard referral={referral} />
        </section>

        <section aria-label="我的订单">
          <MyOrdersPanel orders={orders} loading={loadingOrders} err={err} />
        </section>
      </div>
    </main>
  );
}
