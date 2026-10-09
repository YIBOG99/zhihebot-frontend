// 数据看板纯展示组件：6 指标卡 + 近 N 天收款/日活双轴趋势图。
// 数据由调用方传入（/admin 走 useAdminDashboard，/boss 走 useBossDashboard），本文件不取数。
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';
import { Activity, Banknote, Receipt, Timer, TrendingUp, Users } from 'lucide-react';
import type { DashboardData } from '@/lib/types';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';

const chartConfig = {
  revenue: { label: '收款金额', color: 'var(--color-primary)' },
  visits: { label: '日活访客', color: 'var(--color-info)' },
} satisfies ChartConfig;

export function fmtMoney(n: number): string {
  return `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function StatsSkeleton() {
  return <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-surface-2" />)}</div>;
}

export function StatsError() {
  return <div className="rounded-xl border border-danger/30 bg-danger/5 p-6 text-sm text-muted-foreground">看板数据加载失败，请稍后刷新重试。</div>;
}

export function StatsBoard({ data }: { data: DashboardData }) {
  const today = data.today ?? {};
  const cards = [
    { label: '今日订单', value: String(today.order_count ?? 0), sub: `累计 ${data.total_orders} 单`, icon: Receipt, color: 'text-info' },
    { label: '今日收款', value: fmtMoney(Number(today.revenue ?? 0)), sub: '已完成订单口径', icon: Banknote, color: 'text-primary' },
    { label: '累计收款', value: fmtMoney(Number(data.total_revenue ?? 0)), sub: '全部成交金额', icon: TrendingUp, color: 'text-success' },
    { label: '今日日活', value: String(today.visits ?? 0), sub: `登录用户 ${today.login_users ?? 0}`, icon: Users, color: 'text-foreground' },
    { label: '近 7 日日活', value: String(data.week_visits ?? 0), sub: '独立访客合计', icon: Activity, color: 'text-foreground' },
    { label: '待核账订单', value: String(data.pending_audit ?? 0), sub: '需人工确认收款', icon: Timer, color: 'text-warning' },
  ];

  const series = (data.series ?? []).map((p) => ({
    day: p.day.slice(5), // MM-DD
    revenue: Number(p.revenue),
    visits: Number(p.visits),
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="stat-glow rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40">
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Icon size={12} className={color} />{label}</p>
            <p className={`mt-2 truncate text-xl font-bold tabular-nums sm:text-2xl ${color}`}>{value}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{sub}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">近 {series.length} 天收款与日活</h3>
          <span className="text-[11px] text-muted-foreground">柱：收款 ¥ · 线：独立访客</span>
        </div>
        <ChartContainer config={chartConfig} className="h-64 w-full sm:h-80">
          <ComposedChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} interval={4} />
            <YAxis yAxisId="left" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} width={56} tickFormatter={(v: number) => `¥${v}`} />
            <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} width={32} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar yAxisId="left" dataKey="revenue" fill="var(--color-revenue)" radius={[3, 3, 0, 0]} maxBarSize={18} />
            <Line yAxisId="right" dataKey="visits" type="monotone" stroke="var(--color-visits)" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ChartContainer>
      </div>
    </div>
  );
}
