// 个人中心：登录态守卫 + 资料卡 + 消费统计 + 我的订单（各块拆在 components/account/）
import { Link } from '@tanstack/react-router';
import { LogOut, Package, Loader2 } from 'lucide-react';
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
    await supabase.auth.signOut();
    toast.success('已退出登录');
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;

  if (!user) return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
      <Package size={36} className="text-muted-foreground" />
      <p className="text-muted-foreground">登录后查看历史订单与消费统计</p>
      <div className="flex gap-3">
        <Link to="/login" className="btn-sheen rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 hover:bg-primary-hover transition-colors">去登录</Link>
        <Link to="/register" className="rounded-xl border border-border px-6 py-2.5 text-sm font-semibold text-foreground hover:border-primary/40 transition-colors">邮箱注册</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <div className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <span className="text-sm text-muted-foreground">个人中心</span>
          <button onClick={handleLogout} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-danger">
            <LogOut size={13} /> 退出登录
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-8 px-4 sm:px-6 py-8">
        <ProfileSummaryCard
          username={user.username}
          profile={profile}
          emailConfirmedAt={emailConfirmedAt}
          totalSpent={stats.totalSpent}
          isAdmin={adminState === 'granted'}
        />
        <WalletCard />
        <StatsCards stats={stats} loading={loadingOrders} />
        <InviteCard referral={referral} />
        <MyOrdersPanel orders={orders} loading={loadingOrders} err={err} />
      </div>
    </div>
  );
}
