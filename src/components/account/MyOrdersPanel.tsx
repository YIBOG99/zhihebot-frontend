// 我的订单：状态筛选 + 列表 + 交付卡密面板 + 待付款续付/取消入口
import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { CreditCard, X } from 'lucide-react';
import { toast } from 'sonner';
import type { OrderRow } from '@/lib/types';
import { DeliveryPanel } from '@/components/DeliveryPanel';
import { callOrderRpc } from '@/lib/queries';

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending_payment:       { label: '待付款', cls: 'bg-warning/15 text-warning' },
  pay_processing:        { label: '支付中', cls: 'bg-info/15 text-info' },
  paid_pending_delivery: { label: '核账中', cls: 'bg-info/15 text-info' },
  completed:             { label: '已完成', cls: 'bg-success/15 text-success' },
  closed:                { label: '已关闭', cls: 'bg-muted/20 text-muted-foreground' },
};

type Filter = 'all' | 'pending' | 'completed';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'pending', label: '待付款' },
  { id: 'completed', label: '已完成' },
];

interface Props { orders: OrderRow[]; loading: boolean; err: string | null; }

/** 剩余支付时间文案（MM:SS），基于服务端 expires_at 计算 */
function remainText(expiresAt: string): string {
  const total = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const CLOSE_LABEL: Record<string, string> = {
  timeout_auto: '超时自动关闭',
  admin_manual: '管理员手动关闭',
  customer_cancel: '你已主动取消',
};

/**
 * 待付款订单的操作行：继续支付 + 取消订单。
 * 取消采用单击直接执行，避免移动端二次确认状态不明显导致用户误以为按钮失效。
 */
function PendingActions({ order, onCancelled }: { order: OrderRow; onCancelled: (orderId: string) => void }) {
  const [busy, setBusy] = useState(false);

  async function handleCancel() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await callOrderRpc('order_customer_cancel', order.id);
      if (r.ok) {
        onCancelled(order.id);
        toast.success('订单已取消');
      } else {
        toast.error(r.message || '取消失败，请刷新后重试');
      }
    } catch (error) {
      console.error('[MyOrdersPanel] cancel order failed:', error);
      toast.error(error instanceof Error ? error.message : '取消失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Link to="/pay/resume/$id" params={{ id: order.id }}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover active:scale-[0.99]">
        <CreditCard size={13} /> 继续支付
      </Link>
      <button type="button" onClick={() => void handleCancel()} disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-60"
      >
        <X size={13} /> {busy ? '取消中…' : '取消订单'}
      </button>
    </div>
  );
}

export function MyOrdersPanel({ orders, loading, err }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  // RPC 成功后立即在界面反映关闭状态，不要求用户手动刷新个人中心。
  const [locallyClosed, setLocallyClosed] = useState<Record<string, boolean>>({});

  const displayOrders = orders.map((o) => locallyClosed[o.id] ? { ...o, status: 'closed', close_reason: 'customer_cancel' } as OrderRow : o);
  const list = displayOrders.filter((o) =>
    filter === 'all' ? true
      : filter === 'pending' ? (o.status === 'pending_payment' || o.status === 'pay_processing')
      : o.status === 'completed',
  );

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="section-title text-lg text-foreground">我的订单</h2>
        <div className="flex gap-1 rounded-xl bg-surface p-1">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(2)].map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-2" />)}</div>
      ) : err ? (
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-5 text-sm text-danger">订单读取失败，请稍后刷新重试。</div>
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">{filter === 'all' ? '暂无订单记录' : '该状态下暂无订单'}</p>
          {filter === 'all' && <Link to="/" className="mt-3 inline-block text-sm text-primary hover:underline">去逛逛 →</Link>}
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((o) => {
            const st = STATUS_LABEL[o.status] ?? { label: o.status, cls: '' };
            const snap = o.product_snapshot as Record<string, unknown>;
            return (
              <li key={o.id} className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/25">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{String(snap.title ?? o.product_id)}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground font-mono">{o.id}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${st.cls}`}>{st.label}</span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleDateString('zh-CN')} · ×{o.quantity}
                    {o.status === 'pending_payment' && o.expires_at && new Date(o.expires_at) > new Date() && (
                      <span className="ml-2 text-warning">剩余支付时间 {remainText(o.expires_at)}</span>
                    )}
                  </span>
                  <span className="price-tag text-base"><span className="currency">¥</span>{Number(o.amount).toFixed(2)}</span>
                </div>
                {o.status === 'closed' && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    关闭原因：{CLOSE_LABEL[o.close_reason ?? 'admin_manual'] ?? '订单已关闭'}
                  </p>
                )}
                {/* 待付款 / 支付中且仍在时限内：给出续付与主动取消入口 */}
                {(o.status === 'pending_payment' || o.status === 'pay_processing')
                  && (!o.expires_at || new Date(o.expires_at) > new Date()) && (
                  <PendingActions order={o} onCancelled={(orderId) => setLocallyClosed((prev) => ({ ...prev, [orderId]: true }))} />
                )}
                {o.status === 'completed' && o.card_secret && (
                  <div className="mt-3">
                    <DeliveryPanel
                      orderId={o.id}
                      cardSecret={o.card_secret}
                      redeemUrl={snap.redeem_url ? String(snap.redeem_url) : null}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
