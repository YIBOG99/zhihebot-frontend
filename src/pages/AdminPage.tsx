import { useState, useEffect, useRef } from 'react';
import { Link } from '@tanstack/react-router';
import { Loader2, Package, ShoppingCart, KeyRound, Settings, LayoutDashboard, Search, Pencil, Plus, Ban, ShieldCheck, Mail, Phone, AlertTriangle, ChevronDown, Clock, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/supabase/client';
import { useIsAdmin } from '@/hooks/use-is-admin';
import { StatsBoard, StatsSkeleton, StatsError } from '@/components/AdminStatsPanel';
import { ProductEditSheet } from '@/components/ProductEditSheet';
import { WechatPayConfigCard } from '@/components/WechatPayConfigCard';
import { AlipayQrPayConfigCard } from '@/components/AlipayQrPayConfigCard';
import { AlipayPrimaryPayConfigCard } from '@/components/AlipayPrimaryPayConfigCard';
import { AlipayManualPayConfigCard } from '@/components/AlipayManualPayConfigCard';
import { UsdtPayConfigCard } from '@/components/UsdtPayConfigCard';
import { ReferralConfigCard } from '@/components/ReferralConfigCard';
import { CaptchaConfigCard } from '@/components/CaptchaConfigCard';
import { FeeRecommendConfigCard } from '@/components/FeeRecommendConfigCard';
import { AnnouncementConfigCard } from '@/components/AnnouncementConfigCard';
import { BrandConfigCard } from '@/components/BrandConfigCard';
import { BlocklistPanel } from '@/components/admin/BlocklistPanel';
import { RateLimitPanel } from '@/components/admin/RateLimitPanel';
import { useAdminDashboard, callOrderRpc, useInvalidateShop, toProductDraft, emptyProductDraft, genProductId, blockCustomer, unblockCustomer, useBlockedCustomers, useSuspectBuyers, useInvalidateBlocklist } from '@/lib/queries';
import { refundOrderToBalance } from '@/lib/wallet';
import type { OrderRow, Product, CardSecretRow, Category, ProductDraft, BlockedCustomer, SuspectBuyer } from '@/lib/types';
import { formatYuan } from '@/lib/utils';
import { PAYMENT_LABEL } from '@/lib/pay-channels';

const TABS = [
  { id: 'overview', label: '概览', icon: LayoutDashboard },
  { id: 'orders', label: '订单管理', icon: ShoppingCart },
  { id: 'products', label: '商品管理', icon: Package },
  { id: 'cards', label: '卡密库', icon: KeyRound },
  { id: 'blocklist', label: '黑名单', icon: Ban },
  { id: 'ratelimit', label: '频控', icon: ShieldCheck },
  { id: 'payments', label: '支付设置', icon: CreditCard },
  { id: 'settings', label: '站点设置', icon: Settings },
] as const;

type TabId = typeof TABS[number]['id'];

export function AdminPage() {
  const isAdmin = useIsAdmin();
  const [tab, setTab] = useState<TabId>('overview');

  console.log('[AdminPage] 权限判定状态 =', isAdmin);

  if (isAdmin === 'loading') return <div className="flex min-h-screen items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  if (isAdmin === 'denied') return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
      <p className="text-muted-foreground">无管理员权限，请先以管理员账号登录</p>
      <Link to="/login" className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover">去登录</Link>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-surface/80 backdrop-blur-sm header-glow">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center gap-6 overflow-x-auto">
            <span className="shrink-0 text-sm font-bold text-foreground">智核 · 后台</span>
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setTab(id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-all ${
                  tab === id ? 'bg-gradient-to-r from-primary to-neon-cyan font-semibold text-primary-foreground shadow-[0_0_14px_oklch(0.75_0.17_162/0.35)]' : 'text-muted-foreground hover:text-foreground hover:bg-surface-2'
                }`}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'orders' && <OrdersTab />}
        {tab === 'products' && <ProductsTab />}
        {tab === 'cards' && <CardsTab />}
        {tab === 'blocklist' && <BlocklistPanel />}
        {tab === 'ratelimit' && <RateLimitPanel />}
        {tab === 'payments' && <PaymentsTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>
    </div>
  );
}

/* ── 通用：数据加载失败可见化（原先各 Tab 静默忽略 error，导致只显示空列表、无法定位原因） ── */
function LoadFail({ msg, onRetry }: { msg: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-danger/30 bg-danger/5 p-6 text-sm">
      <p className="font-semibold text-danger">数据加载失败</p>
      <p className="mt-1.5 break-all font-mono text-xs text-muted-foreground">{msg}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-3 rounded-lg border border-border px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          重新加载
        </button>
      )}
    </div>
  );
}

/* ── Overview ── */
function OverviewTab() {
  const dash = useAdminDashboard(30);
  if (dash.isLoading) return <StatsSkeleton />;
  if (dash.isError || !dash.data) return <StatsError />;
  return <StatsBoard data={dash.data} />;
}

/* ── Orders ── */
const TIME_RANGES = [
  { id: 'all', label: '全部' },
  { id: 'today', label: '今日' },
  { id: '7d', label: '近7天' },
  { id: '30d', label: '近30天' },
] as const;

function OrdersTab() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [range, setRange] = useState<(typeof TIME_RANGES)[number]['id']>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** 待关闭的订单（两段式行内确认），替代原生 window.confirm——后者在预览 iframe 内嵌环境会被静默拦截导致「点了没反应」 */
  const [pendingCloseId, setPendingCloseId] = useState<string | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  /** 待拉黑的联系方式 key（同样两段式行内确认，不使用任何浮层） */
  const [pendingBlockKey, setPendingBlockKey] = useState<string | null>(null);
  const blockTimerRef = useRef<number | null>(null);
  /** 展开查看历史订单的联系方式归一化值（行内面板，非浮层——微信浏览器里 Dialog 点击不可靠） */
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const [historyRows, setHistoryRows] = useState<OrderRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyErr, setHistoryErr] = useState<string | null>(null);
  /** 待「退回余额」的订单（两段式行内确认，同样不使用浮层） */
  const [pendingRefundId, setPendingRefundId] = useState<string | null>(null);
  const refundTimerRef = useRef<number | null>(null);
  const blockedQ = useBlockedCustomers();
  const invalidateBlocklist = useInvalidateBlocklist();
  /** 高危客户标记：与黑名单 Tab 同一阈值口径（未支付数 ≥ 5），命中的联系方式整行标红 */
  const SUSPECT_THRESHOLD = 5;
  const suspectsQ = useSuspectBuyers(SUSPECT_THRESHOLD);

  /** 该订单是否已被拉黑（按归一化联系方式比对生效中的黑名单） */
  function isBlocked(o: OrderRow): boolean {
    const rows: BlockedCustomer[] = blockedQ.data ?? [];
    const email = (o.contact_email ?? '').trim().toLowerCase();
    const phone = (o.contact_phone ?? '').replace(/[^0-9+]/g, '').trim();
    return rows.some((b) => (b.contact_type === 'email' && email !== '' && b.contact_value === email)
      || (b.contact_type === 'phone' && phone !== '' && b.contact_value === phone));
  }

  /** 该订单的联系方式是否达到卡单阈值（返回统计行，用于行内危险标记；已拉黑的不再标） */
  function suspectOf(o: OrderRow): SuspectBuyer | undefined {
    if (isBlocked(o)) return undefined;
    const rows: SuspectBuyer[] = suspectsQ.data ?? [];
    const email = (o.contact_email ?? '').trim().toLowerCase();
    const phone = (o.contact_phone ?? '').replace(/[^0-9+]/g, '').trim();
    return rows.find((s) => (s.contact_type === 'email' && email !== '' && s.contact_value === email)
      || (s.contact_type === 'phone' && phone !== '' && s.contact_value === phone));
  }

  async function doBlock(o: OrderRow) {
    if (acting) return;
    // 优先拉黑邮箱，无邮箱则拉黑手机号
    const type: 'email' | 'phone' = o.contact_email?.trim() ? 'email' : 'phone';
    const value = (type === 'email' ? o.contact_email : o.contact_phone)?.trim() ?? '';
    if (!value) { toast.error('该订单未留可拉黑的联系方式'); return; }
    setActing(`block:${o.id}`);
    console.log('[Admin orders] 拉黑开始', { order: o.id, type, value });
    try {
      const r = await blockCustomer(type, value, `订单 ${o.id} 卡单`);
      console.log('[Admin orders] 拉黑结果 =', JSON.stringify(r));
      if (r.ok) { toast.success(`已拉黑 ${value}`); invalidateBlocklist(); }
      else toast.error(r.message);
    } finally {
      setActing(null);
    }
  }

  /** 「拉黑」两段式行内确认：第一次点击进入待确认态（3 秒有效），第二次才真正执行 */
  function requestBlock(o: OrderRow) {
    if (acting) { console.log('[Admin orders] requestBlock 被 acting 拦截, order =', o.id); return; }
    const key = `block:${o.id}`;
    if (pendingBlockKey === key) {
      if (blockTimerRef.current) { window.clearTimeout(blockTimerRef.current); blockTimerRef.current = null; }
      setPendingBlockKey(null);
      void doBlock(o);
      return;
    }
    console.log('[Admin orders] 第一次点击「拉黑」，进入待确认态, order =', o.id);
    if (blockTimerRef.current) window.clearTimeout(blockTimerRef.current);
    setPendingBlockKey(key);
    blockTimerRef.current = window.setTimeout(() => {
      setPendingBlockKey((cur) => (cur === key ? null : cur));
      blockTimerRef.current = null;
    }, 3000);
  }

  /** 该订单要拉黑的联系方式（优先邮箱）；返回归一化值用于查询历史 */
  function blockTarget(o: OrderRow): { type: 'email' | 'phone'; value: string; norm: string } | null {
    const email = o.contact_email?.trim() ?? '';
    const phone = o.contact_phone?.trim() ?? '';
    if (email) return { type: 'email', value: email, norm: email.toLowerCase() };
    if (phone) return { type: 'phone', value: phone, norm: phone.replace(/[^0-9+]/g, '') };
    return null;
  }

  /** 展开态标识：同一联系方式的多张订单共享一个历史面板 key */
  function histKeyOf(o: OrderRow): string {
    const t = blockTarget(o);
    return t ? `${t.type}:${t.norm}` : '';
  }

  /** 解除拉黑：两段式行内确认（第一次点击变「再点一次确认解除」，3 秒内再点生效） */
  const [pendingUnblockKey, setPendingUnblockKey] = useState<string | null>(null);
  const unblockTimerRef = useRef<number | null>(null);

  async function doUnblock(o: OrderRow) {
    if (acting) return;
    const t = blockTarget(o);
    if (!t) { toast.error('该订单未留可查询的联系方式'); return; }
    const rows: BlockedCustomer[] = blockedQ.data ?? [];
    const hit = rows.find((b) => (b.contact_type === 'email' && t.type === 'email' && b.contact_value === t.norm)
      || (b.contact_type === 'phone' && t.type === 'phone' && b.contact_value === t.norm));
    if (!hit) { toast.error('未找到对应的拉黑记录，请刷新后重试'); return; }
    setActing(`unblock:${o.id}`);
    console.log('[Admin orders] 解除拉黑开始', { order: o.id, id: hit.id });
    try {
      const r = await unblockCustomer(hit.id);
      console.log('[Admin orders] 解除结果 =', JSON.stringify(r));
      if (r.ok) { toast.success(`已解除 ${t.value} 的拉黑`); invalidateBlocklist(); }
      else toast.error(r.message);
    } finally {
      setActing(null);
    }
  }

  function requestUnblock(o: OrderRow) {
    if (acting) { console.log('[Admin orders] requestUnblock 被 acting 拦截, order =', o.id); return; }
    const key = `unblock:${o.id}`;
    if (pendingUnblockKey === key) {
      if (unblockTimerRef.current) { window.clearTimeout(unblockTimerRef.current); unblockTimerRef.current = null; }
      setPendingUnblockKey(null);
      void doUnblock(o);
      return;
    }
    console.log('[Admin orders] 第一次点击「解除拉黑」，进入待确认态, order =', o.id);
    if (unblockTimerRef.current) window.clearTimeout(unblockTimerRef.current);
    setPendingUnblockKey(key);
    unblockTimerRef.current = window.setTimeout(() => {
      setPendingUnblockKey((cur) => (cur === key ? null : cur));
      unblockTimerRef.current = null;
    }, 3000);
  }

  /** 展开/收起某联系方式的全部历史订单（行内面板）。管理员 RLS 可跨用户读全部订单 */
  async function toggleHistory(o: OrderRow) {
    const t = blockTarget(o);
    if (!t) { toast.error('该订单未留可查询的联系方式'); return; }
    if (historyKey === `${t.type}:${t.norm}`) { setHistoryKey(null); return; }
    setHistoryKey(`${t.type}:${t.norm}`);
    setHistoryLoading(true);
    setHistoryErr(null);
    console.log('[Admin orders] 展开历史订单', { type: t.type, norm: t.norm });
    try {
      // 服务端按原始列匹配会漏掉大小写不同的邮箱，故取回后在前端按归一化值过滤
      const col = t.type === 'email' ? 'contact_email' : 'contact_phone';
      const like = `%${t.value.replace(/[%_]/g, '')}%`;
      const r = await supabase.from('orders').select('*').or(`${col}.ilike.${like}`).order('created_at', { ascending: false }).limit(200);
      if (r.error) {
        console.error('[Admin orders] history load failed:', r.error.code, r.error.message);
        setHistoryErr(`${r.error.code ?? ''} ${r.error.message}`.trim());
        setHistoryRows([]);
      } else {
        const rows = (r.data ?? []) as OrderRow[];
        const matched = rows.filter((x) => {
          const xv = (t.type === 'email' ? x.contact_email : x.contact_phone) ?? '';
          const norm = t.type === 'email' ? xv.trim().toLowerCase() : xv.replace(/[^0-9+]/g, '').trim();
          return norm === t.norm;
        });
        console.log('[Admin orders] history matched =', matched.length, '/ raw =', rows.length);
        setHistoryRows(matched);
      }
    } finally {
      setHistoryLoading(false);
    }
  }

  async function load() {
    setLoading(true);
    setErr(null);
    let q = supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(100);
    if (filter !== 'all') q = q.eq('status', filter);
    if (range !== 'all') {
      const days = range === 'today' ? 1 : range === '7d' ? 7 : 30;
      // UTC+8 日历日零点
      const since = new Date(Date.now() - (days - 1) * 86400_000);
      since.setUTCHours(since.getUTCHours() + 8, 0, 0, 0);
      const shifted = new Date(since.getTime() - 8 * 3600_000).toISOString();
      q = q.gte('created_at', shifted);
    }
    const kw = search.trim();
    if (kw) {
      const like = `%${kw.replace(/[%_]/g, '')}%`;
      q = q.or(`id.ilike.${like},contact_email.ilike.${like},contact_phone.ilike.${like}`);
    }
    const { data, error } = await q;
    if (error) { console.error('[Admin orders] load failed:', error.code, error.message); setErr(`${error.code ?? ''} ${error.message}`); }
    else console.log('[Admin orders] loaded rows =', data?.length ?? 0);
    setOrders((data ?? []) as OrderRow[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, [filter, range]);
  // eslint-disable-next-line react-hooks/exhaustive-deps

  async function confirmPayment(id: string) {
    if (acting) return; // 拦截连点，避免重复改状态/追加时间线
    setActing(id);
    console.log('[Admin orders] confirmPayment start, order =', id);
    try {
      const r = await callOrderRpc('order_confirm_payment', id);
      console.log('[Admin orders] confirmPayment rpc result =', JSON.stringify(r));
      if (!r.ok) {
        toast.error(r.message);
      } else if (r.message.includes('暂无可用卡密') || r.message.includes('库存不足') || r.message.includes('待补发')) {
        // 收款已生效、仅缺卡密：引导去卡密库补货，而非报失败
        toast.warning(r.message, { description: '可切到「卡密库」导入足量卡密后再次点击「确认收款」重试发货。' });
      } else {
        toast.success(r.message);
      }
      await load();
    } finally {
      setActing(null);
    }
  }

  /** 「关闭」两段式行内确认：第一次点击进入待确认态（3 秒有效），第二次点击才真正关单。
   *  不再使用任何浮层弹窗——微信内置浏览器等内嵌环境里 Dialog 内点击不可靠。 */
  function requestClose(o: OrderRow) {
    if (acting) { console.log('[Admin orders] requestClose 被 acting 拦截, order =', o.id); return; }
    if (pendingCloseId === o.id) {
      // 第二段：真正执行关单
      console.log('[Admin orders] 二次点击确认，开始关单, order =', o.id);
      if (closeTimerRef.current) { window.clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
      setPendingCloseId(null);
      void doCloseOrder(o.id);
      return;
    }
    console.log('[Admin orders] 第一次点击「关闭」，进入待确认态, order =', o.id);
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    setPendingCloseId(o.id);
    closeTimerRef.current = window.setTimeout(() => {
      setPendingCloseId((cur) => (cur === o.id ? null : cur));
      closeTimerRef.current = null;
    }, 3000);
  }

  async function doCloseOrder(orderId: string) {
    if (acting) return;
    setActing(orderId);
    console.log('[Admin orders] doCloseOrder start, order =', orderId);
    try {
      const r = await callOrderRpc('order_close', orderId);
      console.log('[Admin orders] order_close rpc result =', JSON.stringify(r));
      let ok = r.ok;
      if (!ok) {
        // 兜底裁决：RPC 判失败时重查订单真实状态，防「UPDATE 已提交但返回异常」误报
        const { data: row, error: qErr } = await supabase.from('orders').select('status').eq('id', orderId).maybeSingle();
        ok = !qErr && (row as { status?: string } | null)?.status === 'closed';
        console.log('[Admin orders] 重查订单状态 =', (row as { status?: string } | null)?.status, '| 判定 =', ok, qErr ? `查询错误: ${qErr.message}` : '');
      }
      if (ok) {
        toast.success('订单已关闭');
        // 乐观更新 + 重拉列表
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: 'closed' as OrderRow['status'] } : o)));
        await load();
      } else {
        toast.error(r.message || '关闭失败，请刷新后重试');
      }
    } catch (e) {
      console.error('[Admin orders] doCloseOrder unexpected:', e);
      toast.error('操作失败，请稍后再试');
    } finally {
      setActing(null);
    }
  }

  /** 「退回余额」两段式行内确认：第一次点击进待确认态（3 秒还原），第二次才真正退款 */
  function requestRefund(orderId: string) {
    if (acting) return;
    if (pendingRefundId === orderId) {
      if (refundTimerRef.current) { window.clearTimeout(refundTimerRef.current); refundTimerRef.current = null; }
      setPendingRefundId(null);
      void doRefund(orderId);
      return;
    }
    if (refundTimerRef.current) window.clearTimeout(refundTimerRef.current);
    setPendingRefundId(orderId);
    refundTimerRef.current = window.setTimeout(() => {
      setPendingRefundId((cur) => (cur === orderId ? null : cur));
      refundTimerRef.current = null;
    }, 3000);
  }

  async function doRefund(orderId: string) {
    if (acting) return;
    setActing(orderId);
    console.log('[Admin orders] doRefund start, order =', orderId);
    try {
      const r = await refundOrderToBalance(orderId);
      console.log('[Admin orders] wallet_refund_order result =', JSON.stringify(r));
      if (r.ok) {
        // wallet_refund_order is the authoritative money operation; this table is an admin audit trail.
        const order = orders.find((item) => item.id === orderId);
        const { data: authData } = await supabase.auth.getUser();
        const { error: auditError } = await supabase.from('order_refunds').insert({
          order_id: orderId,
          amount: Number(order?.amount ?? 0),
          refund_method: 'balance',
          reason: r.message,
          created_by: authData.user?.id ?? null,
        });
        if (auditError) console.warn('[Admin orders] refund audit write failed after successful wallet refund:', auditError.message);
        toast.success(auditError ? '退款已完成；退款流水已记入钱包，审计表暂不可用' : r.message);
        await load();
      } else toast.error(r.message);
    } finally {
      setActing(null);
    }
  }

  const STATUS_LABEL: Record<string, string> = { pending_payment: '待付款', pay_processing: '扫码支付中', paid_pending_delivery: '核账中', completed: '已完成', closed: '已关闭' };

  /** 剩余支付时间 MM:SS（基于服务端 expires_at，本机时钟只算差值） */
  function remainText(expiresAt: string): string {
    const total = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }
  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {['all', 'pending_payment', 'pay_processing', 'paid_pending_delivery', 'completed'].map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs transition-colors ${filter === s ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:text-foreground'}`}>
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
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
              placeholder="订单号 / 邮箱 / 手机，回车搜索"
              className="w-full rounded-lg border border-border bg-input py-1.5 pl-8 pr-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
          </div>
        </div>
      </div>
      {loading ? <div className="py-12 text-center text-muted-foreground">加载中…</div> : err ? <LoadFail msg={err} onRetry={load} /> : (
        <ul className="space-y-3">
          {orders.length === 0 && <li className="rounded-xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">没有符合条件的订单</li>}
          {(suspectsQ.data?.length ?? 0) > 0 && !loading && (
            <li className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-[11px] text-warning">
              <AlertTriangle size={12} className="shrink-0" />
              当前有 {suspectsQ.data?.length} 个联系方式未支付单数达到 {SUSPECT_THRESHOLD}，相关订单已标红；拉黑后标记自动消失。
            </li>
          )}
          {orders.map((o) => {
            const snap = o.product_snapshot as Record<string, unknown>;
            const blocked = isBlocked(o);
            const suspect = suspectOf(o);
            const blockKey = `block:${o.id}`;
            return (
              <li key={o.id} className={`relative overflow-hidden rounded-xl border p-4 ${suspect ? 'border-danger/50 bg-danger/5' : 'border-border bg-card'}`}>
                {/* 高危客户左侧强调条 */}
                {suspect && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-danger to-warning" />}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    {suspect && (
                      <p className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-danger/15 px-2.5 py-0.5 text-[11px] font-semibold text-danger badge-pulse">
                        <AlertTriangle size={11} /> 卡单嫌疑 · 未支付 {Number(suspect.unpaid_orders)} 单（共 {Number(suspect.total_orders)} 单）
                      </p>
                    )}
                    <p className="font-mono text-xs text-muted-foreground">{o.id}</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{String(snap.title ?? o.product_id)} × {o.quantity}</p>
                    {/* 客户信息：邮箱 / 手机号 / 备注 / 来源 / 下单时间，缺失显示「未留」 */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Mail size={11} className="shrink-0" />{o.contact_email || '未留邮箱'}</span>
                      <span className="inline-flex items-center gap-1"><Phone size={11} className="shrink-0" />{o.contact_phone || '未留手机'}</span>
                      <span>{o.user_id ? '登录用户' : '游客'} · {new Date(new Date(o.created_at).getTime() + 8 * 3600_000).toISOString().slice(5, 16).replace('T', ' ')}</span>
                      {o.note && <span className="truncate max-w-[16rem]" title={o.note}>备注：{o.note}</span>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">¥{Number(o.amount).toFixed(2)}</p>
                    {o.status === 'closed' && (
                      <p className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${o.close_reason === 'timeout_auto' ? 'bg-surface-3 text-muted-foreground' : 'bg-info/10 text-info'}`}>
                        <Clock size={11} className="shrink-0" />
                        关闭原因：{o.close_reason === 'timeout_auto' ? '超时自动关闭' : '管理员手动关闭'}
                      </p>
                    )}
                    {o.status !== 'closed' && o.expires_at && new Date(o.expires_at) > new Date() && (
                      <p className="mt-1.5 text-[11px] text-warning">剩余支付时间 {remainText(o.expires_at)}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {blocked && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-danger/15 px-2.5 py-1 text-[11px] font-medium text-danger">
                        <Ban size={11} /> 已拉黑
                      </span>
                    )}
                    {!blocked && (o.contact_email || o.contact_phone) && (
                      <button onClick={() => void toggleHistory(o)} disabled={!!acting}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
                        <ChevronDown size={12} className={`transition-transform ${historyKey === histKeyOf(o) ? 'rotate-180' : ''}`} />
                        {historyKey === histKeyOf(o) ? '收起历史' : '历史订单'}
                      </button>
                    )}
                    {!blocked && (o.contact_email || o.contact_phone) && (
                      <button onClick={() => requestBlock(o)} disabled={!!acting}
                        className={`rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:opacity-50 ${pendingBlockKey === blockKey ? 'border-danger/60 bg-danger/10 font-semibold text-danger' : 'border-border text-muted-foreground hover:text-danger'}`}>
                        {pendingBlockKey === blockKey ? '再点一次确认拉黑' : '拉黑'}
                      </button>
                    )}
                    {blocked && (
                      <button onClick={() => requestUnblock(o)} disabled={!!acting}
                        className={`rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:opacity-50 ${pendingUnblockKey === `unblock:${o.id}` ? 'border-success/60 bg-success/10 font-semibold text-success' : 'border-border text-muted-foreground hover:text-success'}`}>
                        {pendingUnblockKey === `unblock:${o.id}` ? '再点一次确认解除' : '解除拉黑'}
                      </button>
                    )}
                    <span className="rounded-full bg-surface-3 px-2.5 py-1 text-xs text-muted-foreground">{STATUS_LABEL[o.status]}</span>
                    <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
                      支付：{o.payment_method ? (PAYMENT_LABEL[o.payment_method] || o.payment_method) : '未选择'}
                    </span>
                    {o.status === 'completed' && o.payment_method === 'balance' && !o.is_recharge && (
                      <button onClick={() => requestRefund(o.id)} disabled={!!acting}
                        className={`rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:opacity-50 ${pendingRefundId === o.id ? 'border-warning/60 bg-warning/10 font-semibold text-warning' : 'border-border text-muted-foreground hover:border-warning/40 hover:text-warning'}`}>
                        {acting === o.id ? '…' : pendingRefundId === o.id ? '再点一次确认退回余额' : '退回余额'}
                      </button>
                    )}
                    {(o.status === 'pending_payment' || o.status === 'pay_processing' || o.status === 'paid_pending_delivery') && (
                      <>
                        <button onClick={() => confirmPayment(o.id)} disabled={acting === o.id}
                          className="rounded-lg bg-success/15 px-3 py-1.5 text-xs font-medium text-success hover:bg-success/25 transition-colors disabled:opacity-50">
                          {acting === o.id ? '…' : '确认收款'}
                        </button>
                        <button onClick={() => requestClose(o)} disabled={acting === o.id}
                          className={`rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:opacity-50 ${pendingCloseId === o.id ? 'border-danger/60 bg-danger/10 font-semibold text-danger' : 'border-border text-muted-foreground hover:text-danger'}`}>
                          {acting === o.id ? '…' : pendingCloseId === o.id ? '再点一次确认关闭' : '关闭'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {o.card_secret && <p className="mt-2 font-mono text-xs text-success break-all">凭证：{o.card_secret}</p>}
                {/* 行内历史订单面板：确认无误再拉黑（不使用浮层——微信浏览器里 Dialog 点击不可靠） */}
                {historyKey === histKeyOf(o) && (
                  <div className="mt-3 rounded-lg border border-border bg-surface-2/60 p-3">
                    <p className="mb-2 text-[11px] font-semibold text-foreground">
                      该联系方式的全部历史订单（{blockTarget(o)?.value}）
                    </p>
                    {historyLoading ? (
                      <p className="py-4 text-center text-xs text-muted-foreground">加载中…</p>
                    ) : historyErr ? (
                      <p className="py-4 text-center text-xs text-danger">加载失败：{historyErr}</p>
                    ) : historyRows.length === 0 ? (
                      <p className="py-4 text-center text-xs text-muted-foreground">暂无历史订单</p>
                    ) : (
                      <>
                        <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                          {historyRows.map((h) => {
                            const hs = h.product_snapshot as Record<string, unknown>;
                            const unpaid = (h.status === 'pending_payment' || h.status === 'pay_processing' || h.status === 'closed') && !h.card_secret;
                            return (
                              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface px-2.5 py-1.5 text-[11px]">
                                <span className="min-w-0 truncate text-muted-foreground">
                                  <span className="font-mono">{h.id}</span>
                                  {' · '}{String(hs.title ?? h.product_id)} × {h.quantity}
                                  {' · ¥'}{Number(h.amount).toFixed(2)}
                                  {' · '}{new Date(new Date(h.created_at).getTime() + 8 * 3600_000).toISOString().slice(5, 16).replace('T', ' ')}
                                </span>
                                <span className={`shrink-0 rounded-full px-2 py-0.5 ${unpaid ? 'bg-danger/15 font-medium text-danger' : 'bg-surface-3 text-muted-foreground'}`}>
                                  {STATUS_LABEL[h.status]}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          共 {historyRows.length} 单，其中未支付 {historyRows.filter((h) => ((h.status === 'pending_payment' || h.status === 'pay_processing' || h.status === 'closed') && !h.card_secret)).length} 单。确认属实再点上方「拉黑」。
                        </p>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <RefundAuditPanel />
    </div>
  );
}

function RefundAuditPanel() {
  const [rows, setRows] = useState<Array<{
    id: string; order_id: string; amount: number; refund_method: string;
    reason: string | null; created_at: string; created_by: string | null;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [orderId, setOrderId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('alipay');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);
    const { data, error } = await supabase.from('order_refunds')
      .select('*').order('created_at', { ascending: false }).limit(50);
    if (error) {
      setErr(error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as typeof rows);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function recordManualRefund() {
    const id = orderId.trim();
    const value = Number(amount);
    if (!id) { toast.error('请输入原订单号'); return; }
    if (!Number.isFinite(value) || value <= 0) { toast.error('请输入大于 0 的退款金额'); return; }
    if (!reason.trim()) { toast.error('请填写退款原因或凭证备注'); return; }
    const roundedAmount = Math.round(value * 100) / 100;
    setSaving(true);
    try {
      const { data: order, error: orderError } = await supabase.from('orders')
        .select('id, amount, status, payment_status').eq('id', id).maybeSingle();
      if (orderError) throw orderError;
      if (!order) throw new Error('未找到对应订单，请核对订单号');
      if (order.payment_status !== 'confirmed' && !['paid_pending_delivery', 'completed'].includes(order.status ?? '')) {
        throw new Error('订单尚未确认收款，不允许登记退款；请先核实实际到账情况');
      }
      const { data: existingRefunds, error: refundQueryError } = await supabase.from('order_refunds')
        .select('amount').eq('order_id', id);
      if (refundQueryError) throw refundQueryError;
      const previouslyRecorded = (existingRefunds ?? []).reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
      if (previouslyRecorded + roundedAmount > Number(order.amount) + 0.005) {
        throw new Error(`退款登记金额超出订单应付金额（订单 ¥${Number(order.amount).toFixed(2)}，已登记 ¥${previouslyRecorded.toFixed(2)}）`);
      }

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const { error } = await supabase.from('order_refunds').insert({
        order_id: id,
        amount: roundedAmount,
        refund_method: method,
        reason: reason.trim(),
        created_by: authData.user?.id ?? null,
      });
      if (error) throw error;
      toast.success('人工退款记录已登记；此操作不会发起实际退款');
      setOrderId('');
      setAmount('');
      setReason('');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '登记退款失败，请检查订单号及后台权限');
    } finally {
      setSaving(false);
    }
  }

  const methodLabel: Record<string, string> = {
    balance: '退回余额',
    alipay: '支付宝',
    wechat: '微信',
    usdt: 'USDT',
    other: '其他渠道',
  };

  return (
    <section className="mt-8 rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">退款记录</h3>
          <p className="mt-1 text-xs text-muted-foreground">钱包退款会自动记账；其他渠道请在实际退款处理完成后登记凭证。</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}
          className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">
          {loading ? '加载中…' : '刷新'}
        </button>
      </div>

      <div className="mb-5 rounded-lg border border-warning/25 bg-warning/5 p-4">
        <p className="text-xs font-semibold text-foreground">登记已完成的人工退款</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">仅用于记账，不会调用支付宝、微信或链上接口，也不会更改原订单支付状态。请在实际退款已完成后登记。</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">原订单号</label>
            <input value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="输入订单号"
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">退款金额（元）</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0.01" step="0.01" placeholder="0.00"
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">退款渠道</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none">
              <option value="alipay">支付宝</option>
              <option value="wechat">微信</option>
              <option value="usdt">USDT</option>
              <option value="other">其他渠道</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">退款原因 / 凭证备注</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例如：已通过原渠道退回，交易流水号…"
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
          </div>
        </div>
        <button type="button" onClick={() => void recordManualRefund()} disabled={saving}
          className="mt-3 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity disabled:opacity-50">
          {saving ? '登记中…' : '登记退款记录'}
        </button>
      </div>

      {loading ? (
        <p className="py-5 text-center text-xs text-muted-foreground">正在读取退款记录…</p>
      ) : err ? (
        <LoadFail msg={err} onRetry={() => void load()} />
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted-foreground">暂无退款记录；应用独立后端迁移后，记录会显示在此处。</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((item) => (
            <li key={item.id} className="flex flex-col gap-1.5 rounded-lg border border-border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="break-all font-mono text-xs text-foreground">{item.order_id}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{item.reason || '退款处理'} · {methodLabel[item.refund_method] || item.refund_method}</p>
              </div>
              <div className="shrink-0 text-left sm:text-right">
                <p className="text-sm font-semibold text-warning">¥{Number(item.amount).toFixed(2)}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{new Date(item.created_at).toLocaleString('zh-CN')}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ── Products ── */
function ProductsTab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ draft: ProductDraft; isNew: boolean } | null>(null);
  const invalidateShop = useInvalidateShop();

  async function load() {
    setLoading(true);
    setErr(null);
    const [{ data, error }, { data: cats }] = await Promise.all([
      supabase.from('products').select('*').order('sort_order'),
      supabase.from('categories').select('*').order('sort_order'),
    ]);
    if (error) { console.error('[Admin products] load failed:', error.code, error.message); setErr(`${error.code ?? ''} ${error.message}`); }
    else console.log('[Admin products] loaded rows =', data?.length ?? 0);
    setProducts((data ?? []) as unknown as Product[]);
    setCategories((cats ?? []) as Category[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function toggleActive(p: Product) {
    const { error } = await supabase.from('products').update({ is_active: !p.is_active, updated_at: new Date().toISOString() }).eq('id', p.id);
    if (error) { toast.error(`操作失败：${error.message}`); return; }
    setProducts((prev) => prev.map((x) => x.id === p.id ? { ...x, is_active: !p.is_active } : x));
    invalidateShop();
    toast.success(!p.is_active ? `「${p.title}」已上架` : `「${p.title}」已下架`);
  }

  /** 编辑/新增保存成功：就地更新列表 + 让前台缓存失效 */
  async function onSaved(draft: ProductDraft, isNew: boolean) {
    const payload = {
      id: draft.id, category_slug: draft.category_slug || null, badge: draft.badge || null,
      title: draft.title.trim(), subtitle: draft.subtitle || null, price: Number(draft.price),
      original_price: draft.original_price ? Number(draft.original_price) : null, cover_url: draft.cover_url || null,
      delivery_method: 'auto', stock_level: draft.stock_level, sold_base: Number(draft.sold_base) || 0,
      tips_title: draft.tips_title, tips_body: draft.tips_body || null, risk_title: draft.risk_title, risk_body: draft.risk_body || null,
      official_title: draft.official_title, official_body: draft.official_body || null, support_title: draft.support_title, support_body: draft.support_body || null,
      faq: draft.faq.filter((f) => f.q.trim() && f.a.trim()), payment_methods: draft.payment_methods,
      is_active: draft.is_active, is_hot: draft.is_hot, sort_order: Number(draft.sort_order) || 0,
    } as unknown as Product;
    setProducts((prev) => (isNew ? [...prev, payload].sort((a, b) => a.sort_order - b.sort_order) : prev.map((x) => (x.id === draft.id ? payload : x))));
    invalidateShop();
  }

  if (loading) return <div className="py-12 text-center text-muted-foreground">加载中…</div>;
  if (err) return <LoadFail msg={err} onRetry={load} />;
  // 价格展示取证：确认后台商品列表小数未被取整（修复 .toFixed(0) 导致 138.99 显示成 138）
  console.log('[AdminProducts] price display:', products.map((p) => ({ id: p.id, raw: p.price, shown: formatYuan(p.price) })));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">共 {products.length} 个商品，点「编辑」可随时修改名称、价格、详情图等全部信息。</p>
        <button onClick={() => setEditing({ draft: emptyProductDraft(genProductId('')), isNew: true })}
          className="btn-sheen inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-md shadow-primary/20 transition-colors hover:bg-primary-hover">
          <Plus size={14} /> 新增商品
        </button>
      </div>
      <ul className="space-y-2">
        {products.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
            <div className="flex min-w-0 items-center gap-3">
              {p.cover_url && <img src={p.cover_url} alt="" className="h-10 w-16 shrink-0 rounded-lg object-cover" />}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{p.title}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground font-mono">{p.id} · ¥{formatYuan(p.price)}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button onClick={() => setEditing({ draft: toProductDraft(p as unknown as Record<string, unknown>), isNew: false })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary">
                <Pencil size={12} /> 编辑
              </button>
              <button onClick={() => toggleActive(p)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${p.is_active ? 'bg-success/15 text-success' : 'bg-muted/20 text-muted-foreground'}`}>
                {p.is_active ? '在售' : '已下架'}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <ProductEditSheet
        open={!!editing}
        onOpenChange={(v) => { if (!v) setEditing(null); }}
        initial={editing?.draft ?? null}
        isNew={editing?.isNew ?? false}
        categories={categories}
        onSaved={onSaved}
      />
    </div>
  );
}

/* ── Cards ── */
function CardsTab() {
  const [cards, setCards] = useState<CardSecretRow[]>([]);
  const [productId, setProductId] = useState('');
  const [codes, setCodes] = useState('');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    supabase.from('products').select('id,title').order('title').then(({ data }) => setProducts((data ?? []) as Product[]));
  }, []);
  async function load() {
    setLoading(true);
    setErr(null);
    let q = supabase.from('card_secrets').select('*').order('created_at', { ascending: false }).limit(200);
    if (productId) q = q.eq('product_id', productId);
    const { data, error } = await q;
    if (error) { console.error('[Admin cards] load failed:', error.code, error.message); setErr(`${error.code ?? ''} ${error.message}`); }
    else console.log('[Admin cards] loaded rows =', data?.length ?? 0);
    setCards((data ?? []) as CardSecretRow[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, [productId]);

  async function importCards() {
    const lines = codes.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!productId) { toast.error('请先选择商品'); return; }
    if (lines.length === 0) { toast.error('请输入至少一行卡密'); return; }
    setImporting(true);
    const rows = lines.map((code) => ({ product_id: productId, code, status: 'unused' }));
    const { error } = await supabase.from('card_secrets').insert(rows);
    if (error) toast.error(`导入失败：${error.message}`);
    else { toast.success(`成功导入 ${lines.length} 条卡密`); setCodes(''); await load(); }
    setImporting(false);
  }

  return (
    <div className="space-y-6">
      {/* Import */}
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="mb-3 text-sm font-semibold text-foreground">批量导入卡密</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <select value={productId} onChange={(e) => setProductId(e.target.value)}
            className="rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none">
            <option value="">选择商品…</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <textarea value={codes} onChange={(e) => setCodes(e.target.value)} rows={3} placeholder="每行一个卡密"
            className="flex-1 rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none font-mono resize-none" />
        </div>
        <button onClick={importCards} disabled={importing}
          className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary-hover transition-colors disabled:opacity-60">
          {importing ? '导入中…' : '导入'}
        </button>
      </div>

      {/* List */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">卡密列表</p>
          <select value={productId} onChange={(e) => setProductId(e.target.value)}
            className="rounded-lg border border-border bg-input px-3 py-1.5 text-xs text-foreground">
            <option value="">全部商品</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
        {loading ? <div className="py-8 text-center text-muted-foreground text-sm">加载中…</div> : err ? <LoadFail msg={err} onRetry={load} /> : (
          <ul className="space-y-1.5">
            {cards.length === 0 && <li className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">暂无卡密，请先批量导入</li>}
            {cards.slice(0, 50).map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5">
                <code className="font-mono text-xs text-foreground break-all">{c.code}</code>
                <span className={`ml-3 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  c.status === 'unused' ? 'bg-success/15 text-success' : c.status === 'used' ? 'bg-muted/20 text-muted-foreground' : 'bg-warning/15 text-warning'
                }`}>{c.status === 'unused' ? '未使用' : c.status === 'used' ? '已发放' : c.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ── Payments ── */
function PaymentsTab() {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold text-foreground">支付通道配置</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          五种通道分别保存、独立启停。个人收款码与 USDT 都采用人工核账；确认到账后再从订单管理执行确认收款/发卡。
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          {['支付宝1 · 深链/收款码', '支付宝2 · 个人收款码', '支付宝3 · 账号/收款码', '微信支付 · 收款码', 'USDT · 地址/网络'].map((label) => (
            <span key={label} className="rounded-full border border-primary/25 bg-primary/5 px-2.5 py-1 text-primary">{label}</span>
          ))}
        </div>
      </div>
      <AlipayPrimaryPayConfigCard />
      <AlipayQrPayConfigCard />
      <AlipayManualPayConfigCard />
      <WechatPayConfigCard />
      <UsdtPayConfigCard />
    </div>
  );
}

/* ── Settings ── */
function SettingsTab() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  async function load() {
    setLoading(true);
    setErr(null);
    const { data, error } = await supabase.from('site_settings').select('*');
    if (error) { console.error('[Admin settings] load failed:', error.code, error.message); setErr(`${error.code ?? ''} ${error.message}`); }
    else console.log('[Admin settings] loaded rows =', data?.length ?? 0);
    const obj: Record<string, string> = {};
    for (const row of data ?? []) {
      if (row.key === 'ai_support') continue; // 旧库清理前也不再展示已移除的 AI 客服配置
      obj[row.key] = JSON.stringify(row.value, null, 2);
    }
    setSettings(obj);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  async function save(key: string) {
    setSaving(true);
    try {
      const parsed = JSON.parse(settings[key]);
      const { error } = await supabase.from('site_settings').upsert({ key, value: parsed, updated_at: new Date().toISOString() });
      if (error) throw error;
      toast.success(`「${key}」已保存`);
    } catch (e) {
      console.error('[Admin settings] save failed:', e);
      toast.error(e instanceof SyntaxError ? 'JSON 格式有误，请检查后重试' : '保存失败，请稍后再试');
    }
    setSaving(false);
  }
  if (loading) return <div className="py-12 text-center text-muted-foreground">加载中…</div>;
  if (err) return <LoadFail msg={err} onRetry={load} />;
  return (
    <div className="space-y-6">
      {/* 全站品牌与 LOGO（置顶，换一次全站同步） */}
      <BrandConfigCard />

      {/* 首页公告弹窗可视化配置（推荐） */}
      <AnnouncementConfigCard />

      {/* 邀请好友返券配置（面额/门槛/开关） */}
      <ReferralConfigCard />

      {/* 渠道手续费率 + 支付宝通道「优先推荐」角标配置 */}
      <FeeRecommendConfigCard />

      {/* 下单人机校验（防机器批量下单后恶意退款） */}
      <CaptchaConfigCard />


      {/* 原始 JSON 编辑（高级） */}
      {Object.entries(settings).map(([key, val]) => (
        <details key={key} className="group rounded-xl border border-border bg-card">
          <summary className="cursor-pointer list-none p-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground">
            {key} · 高级 JSON 编辑
          </summary>
          <div className="border-t border-border p-5 pt-4">
            <textarea value={val} onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.value }))} rows={6}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground font-mono focus:border-primary focus:outline-none resize-none" />
            <button onClick={() => save(key)} disabled={saving}
              className="mt-2 rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary-hover transition-colors disabled:opacity-60">
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </details>
      ))}
    </div>
  );
}
