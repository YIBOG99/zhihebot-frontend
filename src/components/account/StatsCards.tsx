// 消费统计：四宫格指标 + 本月环比。无订单时显示引导而非 0。
import { Link } from '@tanstack/react-router';
import { Wallet, ShoppingBag, Clock3, CalendarCheck } from 'lucide-react';
import type { MyStats } from '@/lib/my-stats';

interface Props { stats: MyStats; loading: boolean; }

/** 环比文案：上月为 0 时不编造百分比 */
function monthDelta(cur: number, prev: number): string {
  if (prev <= 0) return cur > 0 ? '本月首笔消费' : '上月无消费';
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return '与上月持平';
  return pct > 0 ? `较上月 +${pct}%` : `较上月 ${pct}%`;
}

export function StatsCards({ stats, loading }: Props) {
  if (loading) {
    return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[...Array(4)].map((_, i) => <div key={i} className="h-[86px] animate-pulse rounded-xl bg-surface-2" />)}</div>;
  }

  const items = [
    { icon: Wallet, label: '累计消费', value: `¥${stats.totalSpent.toFixed(2)}`, tone: 'text-primary' },
    { icon: ShoppingBag, label: '成功订单', value: String(stats.doneCount), tone: 'text-success' },
    { icon: Clock3, label: '待付款', value: String(stats.pendingCount), tone: stats.pendingCount > 0 ? 'text-warning' : 'text-muted-foreground' },
    {
      icon: CalendarCheck, label: '最近购买', tone: 'text-info',
      value: stats.lastAt ? new Date(stats.lastAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) : '—',
    },
  ];

  const empty = stats.totalCount === 0;

  return (
    <section>
      <h2 className="section-title mb-4 text-lg text-foreground">消费统计</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((it) => (
          <div key={it.label} className="stat-glow rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <it.icon size={12} className={it.tone} /> {it.label}
            </div>
            <p className={`mt-2 truncate text-xl font-bold tabular-nums ${empty ? 'text-muted-foreground' : 'text-glow-gradient'}`}>{it.value}</p>
          </div>
        ))}
      </div>

      {empty ? (
        <div className="mt-3 rounded-xl border border-dashed border-border bg-surface/50 px-4 py-3 text-xs text-muted-foreground">
          完成第一笔订单后，这里会显示你的消费数据。<Link to="/" className="ml-1 text-primary hover:underline">去逛逛 →</Link>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          本月消费 <span className="font-mono text-foreground">¥{stats.monthSpent.toFixed(2)}</span>
          <span className="mx-1.5 text-border">·</span>{monthDelta(stats.monthSpent, stats.prevMonthSpent)}
          {stats.cardCount > 0 && (<><span className="mx-1.5 text-border">·</span>已持有 <span className="font-mono text-foreground">{stats.cardCount}</span> 张卡密</>)}
        </p>
      )}
    </section>
  );
}
