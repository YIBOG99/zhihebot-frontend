import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Cloud, Database, ExternalLink, HardDrive, RefreshCw, Server, ShieldCheck, ShoppingCart, Users, Wifi } from 'lucide-react';
import { supabase, supabaseUrl } from '@/supabase/client';

type Check = { label: string; ok: boolean; detail: string };
type Counts = { orders: number | null; products: number | null; profiles: number | null; users: number | null; cardSecrets: number | null };
const numberFmt = (n: number | null) => n === null ? '不可读取' : n.toLocaleString('zh-CN');

export function SystemHealthPanel() {
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [counts, setCounts] = useState<Counts>({ orders: null, products: null, profiles: null, users: null, cardSecrets: null });
  const [errors, setErrors] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const names = [
      ['orders', 'orders'],
      ['products', 'products'],
      ['profiles', 'profiles'],
      ['users', 'users'],
      ['card_secrets', 'cardSecrets'],
    ] as const;
    const next: Counts = { orders: null, products: null, profiles: null, users: null, cardSecrets: null };
    const nextChecks: Check[] = [];
    const nextErrors: string[] = [];
    for (const [table, key] of names) {
      const result = await supabase.from(table as 'orders').select('*', { count: 'exact', head: true });
      if (result.error) {
        nextChecks.push({ label: table, ok: false, detail: result.error.message });
        nextErrors.push(table + ': ' + result.error.message);
      } else {
        next[key] = result.count ?? 0;
        nextChecks.push({ label: table, ok: true, detail: '表可访问' });
      }
    }
    const url = supabaseUrl;
    nextChecks.unshift({ label: '数据库连接', ok: nextChecks.some(x => x.label === 'orders' && x.ok), detail: url.replace(/^https?:\/\//, '') });
    setCounts(next);
    setChecks(nextChecks);
    setErrors(nextErrors);
    setLastChecked(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const cards = [
    { label: '今日订单总量', value: numberFmt(counts.orders), sub: '当前订单表累计记录 · 非今日统计', icon: ShoppingCart },
    { label: '商品记录', value: numberFmt(counts.products), sub: '商品表可读取记录数', icon: HardDrive },
    { label: '用户资料', value: numberFmt(counts.profiles), sub: 'profiles 表记录数（若存在）', icon: Users },
    { label: '卡密记录', value: numberFmt(counts.cardSecrets), sub: '卡密表可读取记录数', icon: ShieldCheck },
  ];

  return (
    <section className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-card via-card to-primary/10 p-5 shadow-[0_0_35px_hsl(var(--primary)/0.08)] sm:p-6">
        <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-primary"><Activity size={18} /><span className="text-xs font-semibold uppercase tracking-[0.18em]">SYSTEM TELEMETRY</span></div>
            <h2 className="mt-2 text-xl font-bold text-foreground sm:text-2xl">系统资源与运行状况</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">检查当前网站连接的数据项目、核心数据表可用性与记录规模。无法从浏览器安全读取的托管平台用量会明确标记，不会伪造数据。</p>
          </div>
          <button onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition hover:bg-primary/20 disabled:opacity-60">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {loading ? '检测中…' : '刷新检测'}
          </button>
        </div>
        <div className="relative mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><Database size={13} className="text-primary" /> Supabase 数据库</span>
          <span className="break-all font-mono">{supabaseUrl}</span>
          {lastChecked && <span>最近检测：{lastChecked.toLocaleString('zh-CN')}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, sub, icon: Icon }) => (
          <div key={label} className="stat-glow rounded-xl border border-border bg-card p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40">
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><Icon size={15} className="text-primary" />{label}</p>
            <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">{loading ? '…' : value}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Server size={16} className="text-primary" /> 数据存储与连接检查</h3>
          <div className="mt-4 space-y-2">
            {checks.map((check) => (
              <div key={check.label} className="flex items-start gap-2 rounded-lg border border-border/70 bg-background/40 px-3 py-2.5">
                {check.ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-primary" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" />}
                <div className="min-w-0 flex-1"><p className="text-xs font-medium text-foreground">{check.label}</p><p className="mt-0.5 break-all text-[11px] text-muted-foreground">{check.detail}</p></div>
                <span className={check.ok ? 'text-[10px] text-primary' : 'text-[10px] text-warning'}>{check.ok ? '正常' : '需检查'}</span>
              </div>
            ))}
            {!checks.length && <p className="text-xs text-muted-foreground">{loading ? '正在检测数据表…' : '暂无检测结果'}</p>}
          </div>
          {errors.length > 0 && <p className="mt-3 text-[11px] text-warning">部分表不可读取不一定代表数据库故障，也可能是表不存在或权限策略限制。请根据错误详情核对。</p>}
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Cloud size={16} className="text-primary" /> 托管额度与扩容建议</h3>
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <p className="flex items-center gap-2 text-xs font-semibold text-foreground"><Wifi size={14} className="text-primary" /> Cloudflare 请求量 / CPU 用量</p>
              <p className="mt-1 text-xs text-muted-foreground">当前无法从前端公开密钥安全读取账户级 Analytics。请在 Cloudflare 控制台查看 Workers & Pages → Analytics；不要把 API Token 放进前端。</p>
              <a href="https://dash.cloudflare.com/" target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">打开 Cloudflare 控制台 <ExternalLink size={12} /></a>
            </div>
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <p className="flex items-center gap-2 text-xs font-semibold text-foreground"><Database size={14} className="text-primary" /> Supabase 数据库空间 / 出站流量</p>
              <p className="mt-1 text-xs text-muted-foreground">浏览器只能检查本项目的可访问表和记录数，不能安全获取数据库磁盘占用、月流量或账单额度。</p>
              <a href="https://supabase.com/dashboard/" target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">打开 Supabase 控制台 <ExternalLink size={12} /></a>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs font-semibold text-foreground">何时考虑升级</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">当平台用量持续达到额度的 50%–70%、出现频繁 API 错误或高峰延迟时开始规划；出现订单写入失败、数据库连接耗尽或支付状态异常时，应优先处理，不要等到流量阈值。</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
