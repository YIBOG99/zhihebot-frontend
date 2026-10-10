import { useEffect, useState } from 'react';
import { Activity, Cloud, Database, Gauge, RefreshCw, ShoppingCart, Users, ExternalLink, AlertTriangle } from 'lucide-react';
import { supabase } from '@/supabase/client';

type Metrics = { ordersToday: number; orders7d: number; orders30d: number; products: number; users: number | null };
const card = 'rounded-2xl border border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 p-4 shadow-[0_0_24px_rgba(139,92,246,0.07)]';
const number = 'mt-2 text-2xl font-bold tracking-tight text-foreground';
const label = 'text-xs text-muted-foreground';
const link = 'inline-flex items-center gap-1 text-xs text-primary hover:underline';

function since(days: number) { return new Date(Date.now() - days * 86400000).toISOString(); }

export function CapacityOverviewPanel() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  async function load() {
    setLoading(true); setError('');
    try {
      const [today, week, month, products] = await Promise.all([
        supabase.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', since(1)),
        supabase.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', since(7)),
        supabase.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', since(30)),
        supabase.from('products').select('id', { count: 'exact', head: true }),
      ]);
      const failed = [today, week, month, products].find(x => x.error);
      if (failed?.error) throw new Error(failed.error.message);
      setMetrics({ ordersToday: today.count ?? 0, orders7d: week.count ?? 0, orders30d: month.count ?? 0, products: products.count ?? 0, users: null });
      setUpdatedAt(new Date());
    } catch (e) { setError(e instanceof Error ? e.message : '数据读取失败'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const estimatedDailyRequests = metrics ? Math.round(metrics.ordersToday * 10) : null;
  const workerLimit = 100000;
  const estimatedPercent = estimatedDailyRequests === null ? 0 : Math.min(100, estimatedDailyRequests / workerLimit * 100);
  const tone = estimatedPercent >= 70 ? 'text-amber-300' : 'text-primary';
  return (
    <section className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><Activity size={17} className="text-primary" /><h2 className="text-base font-semibold text-foreground">站点容量与用量监控</h2></div>
          <p className="mt-1 text-xs text-muted-foreground">业务数据自动统计；Cloudflare / Supabase 资源用量请查看官方控制台。</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/25 px-3 py-2 text-xs text-muted-foreground transition hover:border-primary/50 hover:text-primary disabled:opacity-50"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} />刷新数据</button>
      </div>

      {error && <div className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/5 p-3 text-xs text-amber-200"><AlertTriangle size={15} className="mt-0.5 shrink-0" /><span>订单/商品统计读取失败：{error}。请检查管理员账号的数据库读取权限。</span></div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className={card}><div className="flex items-center gap-2 text-primary"><ShoppingCart size={16}/><span className={label}>今日订单</span></div><div className={number}>{loading ? '—' : (metrics?.ordersToday ?? '—')}</div><p className="mt-1 text-[11px] text-muted-foreground">按创建时间统计</p></div>
        <div className={card}><div className="flex items-center gap-2 text-primary"><Activity size={16}/><span className={label}>近 7 天订单</span></div><div className={number}>{loading ? '—' : (metrics?.orders7d ?? '—')}</div><p className="mt-1 text-[11px] text-muted-foreground">含未支付及已关闭订单</p></div>
        <div className={card}><div className="flex items-center gap-2 text-primary"><Gauge size={16}/><span className={label}>近 30 天订单</span></div><div className={number}>{loading ? '—' : (metrics?.orders30d ?? '—')}</div><p className="mt-1 text-[11px] text-muted-foreground">订单量不等于成功支付量</p></div>
        <div className={card}><div className="flex items-center gap-2 text-primary"><Database size={16}/><span className={label}>商品数量</span></div><div className={number}>{loading ? '—' : (metrics?.products ?? '—')}</div><p className="mt-1 text-[11px] text-muted-foreground">当前商品记录数</p></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <div className="flex items-center gap-2"><Cloud size={17} className="text-primary"/><h3 className="text-sm font-semibold text-foreground">Cloudflare Workers 免费额度参考</h3></div>
          <div className="mt-4 flex items-end justify-between gap-3"><div><p className={label}>估算动态请求 / 天</p><p className={number}>{loading || estimatedDailyRequests === null ? '—' : estimatedDailyRequests.toLocaleString()}</p></div><div className="text-right"><p className={label}>免费额度参考</p><p className="mt-2 text-lg font-semibold text-foreground">100,000 / 天</p></div></div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted/40"><div className="h-full rounded-full bg-gradient-to-r from-primary to-violet-400 transition-all duration-700" style={{ width: estimatedPercent + '%' }}/></div>
          <p className={`mt-2 text-xs ${tone}`}>{loading ? '正在计算…' : '仅为粗略估算：按每笔订单 10 次动态请求；真实请求量可能高很多或更低。'}</p>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">静态资源请求与 Workers / Pages Functions 动态请求的计费口径不同。请以实际控制台 Usage 为准，不能据此单独判断是否需要服务器。</p>
          <a className={link + ' mt-3'} href="https://dash.cloudflare.com/" target="_blank" rel="noreferrer">打开 Cloudflare 控制台 <ExternalLink size={12}/></a>
        </div>
        <div className={card}>
          <div className="flex items-center gap-2"><Database size={17} className="text-primary"/><h3 className="text-sm font-semibold text-foreground">Supabase 数据库与函数用量</h3></div>
          <p className="mt-3 text-sm text-foreground">建议每周检查一次</p>
          <ul className="mt-3 space-y-2 text-xs text-muted-foreground"><li>• 数据库空间：关注 Database Size / 500 MB（免费套餐参考）</li><li>• 出站流量：关注 Egress / 5 GB（免费套餐参考）</li><li>• Edge Functions：关注调用量 / 500,000 次（免费套餐参考）</li><li>• 检查慢查询、连接数、API 错误与项目暂停提示</li></ul>
          <a className={link + ' mt-4'} href="https://supabase.com/dashboard/" target="_blank" rel="noreferrer">打开 Supabase 控制台 <ExternalLink size={12}/></a>
        </div>
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center gap-2"><Gauge size={16} className="text-primary"/><h3 className="text-sm font-semibold text-foreground">什么时候该升级？</h3></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div><span className="text-xs font-semibold text-primary">50% · 留意</span><p className="mt-1 text-xs leading-relaxed text-muted-foreground">用量接近额度一半，开始记录每日增长速度。</p></div>
          <div><span className="text-xs font-semibold text-amber-300">70% · 预警</span><p className="mt-1 text-xs leading-relaxed text-muted-foreground">持续增长或活动高峰前，评估升级套餐与缓存优化。</p></div>
          <div><span className="text-xs font-semibold text-rose-300">错误 / 瓶颈 · 处理</span><p className="mt-1 text-xs leading-relaxed text-muted-foreground">出现超限、订单失败、慢查询或数据库连接瓶颈时，先定位瓶颈再决定扩容。</p></div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">50% / 70% 是运维提醒线，不是平台官方限制。此面板不会读取 Cloudflare / Supabase 的真实资源用量，也不会自动创建服务器。</p>
      </div>
      <p className="text-right text-[10px] text-muted-foreground">{updatedAt ? `业务数据更新于 ${updatedAt.toLocaleString('zh-CN')}` : ''}</p>
    </section>
  );
}
