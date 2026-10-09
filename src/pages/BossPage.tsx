// 老板看板（/boss）：口令门 + 数据三分区。全站无任何站内入口链接，仅凭 URL + 密钥访问。
import { useEffect, useState } from 'react';
import { Lock, LogOut, RefreshCw, Search, Crown } from 'lucide-react';
import { useBossDashboard, useBossSales, useBossOrders, BossAuthError, callBossProbe } from '@/lib/queries';
import { StatsBoard, StatsSkeleton, StatsError, fmtMoney } from '@/components/AdminStatsPanel';
import type { DashboardData, OrderRow } from '@/lib/types';

const SS_KEY = 'zh_boss_key';

const STATUS_LABEL: Record<string, string> = { pending_payment: '待付款', pay_processing: '扫码支付中', paid_pending_delivery: '核账中', completed: '已完成', closed: '已关闭' };
const TIME_RANGES = [
  { id: 'all', label: '全部' },
  { id: 'today', label: '今日' },
  { id: '7d', label: '近7天' },
  { id: '30d', label: '近30天' },
] as const;

export function BossPage() {
  const [key, setKey] = useState<string | null>(() => sessionStorage.getItem(SS_KEY));
  const [input, setInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [err, setErr] = useState('');

  // URL 带 ?key= 时自动验证一次，成功后清掉地址栏 query（不留浏览器历史）
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const k = p.get('key');
    if (k && k !== key) { void tryUnlock(k); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function tryUnlock(candidate: string) {
    setVerifying(true);
    setErr('');
    try {
      await callBossProbe(candidate);
      sessionStorage.setItem(SS_KEY, candidate);
      setKey(candidate);
      window.history.replaceState({}, '', '/boss');
    } catch (e) {
      setErr(e instanceof BossAuthError ? '口令不正确，请核对后重试' : '网络异常，请稍后重试');
    } finally {
      setVerifying(false);
    }
  }

  if (!key) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="glow-frame w-full max-w-sm rounded-2xl border border-border bg-card p-8">
          <div className="mb-6 flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-neon-violet/20 ring-1 ring-primary/40"><Crown size={17} className="text-primary" /></span>
            <div>
              <h1 className="text-base font-bold text-foreground">店主数据看板</h1>
              <p className="text-[11px] text-muted-foreground">仅限持有人输入访问口令</p>
            </div>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); void tryUnlock(input.trim()); }} className="space-y-3">
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="password" value={input} onChange={(e) => setInput(e.target.value)} placeholder="访问口令" autoFocus
                className="w-full rounded-lg border border-border bg-input py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            {err && <p className="text-xs text-danger">{err}</p>}
            <button type="submit" disabled={verifying || !input.trim()}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60">
              {verifying ? '验证中…' : '进入看板'}
            </button>
          </form>
          <p className="mt-5 text-center text-[10px] leading-relaxed text-muted-foreground">本页面不在站内任何位置露出；忘记口令请联系技术人员重置。</p>
        </div>
      </div>
    );
  }

  return <BossDashboard key={key} bossKey={key} onLock={() => { sessionStorage.removeItem(SS_KEY); setKey(null); }} />;
}

/** 口令有效性探测：拉一天数据即完成 verify+dashboard 双重用途 */
async function fetchBossProbe(key: string): Promise<void> {
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/boss-api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'dashboard', key, days: 1 }),
  });
  if (res.status === 401) throw new BossAuthError();
  if (!res.ok) throw new Error('probe failed');
}

function BossDashboard({ bossKey, onLock }: { bossKey: string; onLock: () => void }) {
  const dash = useBossDashboard(bossKey, 30);
  const sales = useBossSales(bossKey, 30);
  const [status, setStatus] = useState('all');
  const [range, setRange] = useState<(typeof TIME_RANGES)[number]['id']>('all');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const orders = useBossOrders(bossKey, { status, range, q });

  // 口令失效（如服务端已换 key）→ 回口令页
  useEffect(() => {
    const authFailed = [dash.error, sales.error, orders.error].some((e) => e instanceof BossAuthError);
    if (authFailed) onLock();
  }, [dash.error, sales.error, orders.error, onLock]);

  function refresh() {
    void dash.refetch(); void sales.refetch(); void orders.refetch();
  }

  const salesList = sales.data ?? [];
  const maxRevenue = Math.max(1, ...salesList.map((s) => s.revenue));
  const orderList = (orders.data ?? []) as OrderRow[];

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-surface/80 backdrop-blur-sm header-glow">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-foreground"><Crown size={15} className="text-primary" /> 店主数据看板</span>
          <div className="flex items-center gap-2">
            <button onClick={refresh} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
              <RefreshCw size={12} /> 刷新
            </button>
            <button onClick={onLock} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-danger">
              <LogOut size={12} /> 锁定
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        {/* 指标 + 趋势 */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">经营概览</h2>
          {dash.isLoading ? <StatsSkeleton /> : dash.isError || !dash.data ? <StatsError /> : <StatsBoard data={dash.data as unknown as DashboardData} />}
        </section>

        {/* 商品销量排行 */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">近 30 天商品销量排行</h2>
          <div className="rounded-xl border border-border bg-card p-5">
            {sales.isLoading ? <div className="py-8 text-center text-sm text-muted-foreground">加载中…</div>
              : salesList.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">近 30 天还没有成交订单。</div>
              : (
                <ul className="space-y-3">
                  {salesList.map((s, i) => (
                    <li key={s.title}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground"><span className="mr-2 inline-block w-5 text-right font-mono text-muted-foreground">{i + 1}</span>{s.title}</span>
                        <span className="text-muted-foreground">{s.sold_count} 单 · <span className="font-mono text-primary">{fmtMoney(s.revenue)}</span></span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-gradient-to-r from-primary to-neon-cyan shadow-[0_0_8px_oklch(0.75_0.17_162/0.4)] transition-all" style={{ width: `${Math.round((s.revenue / maxRevenue) * 100)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
          </div>
        </section>

        {/* 订单列表 */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">订单列表</h2>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {['all', 'pending_payment', 'pay_processing', 'paid_pending_delivery', 'completed'].map((s) => (
                <button key={s} onClick={() => setStatus(s)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs transition-colors ${status === s ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:text-foreground'}`}>
                  {s === 'all' ? '全部' : STATUS_LABEL[s]}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {TIME_RANGES.map((r) => (
                  <button key={r.id} onClick={() => setRange(r.id)}
                    className={`rounded-md px-2.5 py-1 text-[11px] transition-colors ${range === r.id ? 'bg-surface-3 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                    {r.label}
                  </button>
                ))}
              </div>
              <div className="relative flex-1 sm:w-52 sm:flex-none">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={qInput} onChange={(e) => setQInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setQ(qInput.trim()); }}
                  placeholder="订单号 / 邮箱 / 手机，回车搜索"
                  className="w-full rounded-lg border border-border bg-input py-1.5 pl-8 pr-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
              </div>
            </div>
          </div>
          {orders.isLoading ? <div className="py-12 text-center text-muted-foreground">加载中…</div> : orders.isError ? <StatsError /> : (
            <ul className="space-y-3">
              {orderList.length === 0 && <li className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">没有符合条件的订单。</li>}
              {orderList.map((o) => {
                const snap = o.product_snapshot as Record<string, unknown>;
                return (
                  <li key={o.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs text-muted-foreground">{o.id}</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{String(snap.title ?? o.product_id ?? '')} × {o.quantity}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{o.contact_email || o.contact_phone || '—'} · ¥{Number(o.amount).toFixed(2)} · {new Date(o.created_at).toLocaleString('zh-CN')}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs ${o.status === 'completed' ? 'bg-success/15 text-success' : o.status === 'closed' ? 'bg-muted/20 text-muted-foreground' : 'bg-warning/15 text-warning'}`}>
                          {STATUS_LABEL[o.status] ?? o.status}
                        </span>
                      </div>
                    </div>
                    {o.card_secret && <p className="mt-2 font-mono text-xs text-success break-all">凭证：{o.card_secret}</p>}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">确认收款、发卡等管理操作请前往后台 /admin（需管理员账号登录）。</p>
        </section>
      </div>
    </div>
  );
}
