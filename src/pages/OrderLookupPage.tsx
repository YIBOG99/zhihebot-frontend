import { useState, useEffect } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { Search, Loader2, KeyRound, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/supabase/client';
import { DeliveryPanel } from '@/components/DeliveryPanel';
import { PayCountdownBar } from '@/components/PayCountdownBar';
import { callAlipayPay } from '@/lib/queries';
import { loadBuyerInfo, hashPassword } from '@/lib/buyer-vault';

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending_payment:       { label: '待付款',   cls: 'bg-warning/15 text-warning' },
  pay_processing:        { label: '支付中',   cls: 'bg-info/15 text-info' },
  paid_pending_delivery: { label: '核账中',   cls: 'bg-info/15 text-info' },
  completed:             { label: '已完成',   cls: 'bg-success/15 text-success' },
  closed:                { label: '已关闭',   cls: 'bg-muted/20 text-muted-foreground' },
};

interface OrderView {
  id: string; product_snapshot: Record<string, unknown>; quantity: number;
  amount: number; status: string; card_secret: string | null;
  timeline: { at: string; label: string }[]; created_at: string;
  /** 支付截止时刻；NULL = 本功能上线前的老订单，不显示倒计时 */
  expires_at?: string | null;
  /** 关闭来源；NULL = 历史遗留，按管理员手动关闭兜底展示 */
  close_reason?: 'timeout_auto' | 'admin_manual' | null;
}

/** 已关闭订单的原因文案：超时自动关闭 / 管理员手动关闭（历史无值单归入后者） */
function closeReasonText(reason?: string | null): string {
  return reason === 'timeout_auto'
    ? '该订单因超时未付款已自动关闭，如需购买请重新下单。'
    : '该订单已由管理员关闭，如有疑问请联系客服。';
}

export function OrderLookupPage() {
  const search = useSearch({ strict: false }) as { order?: string };
  const [orderNo, setOrderNo] = useState('');
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<OrderView | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 本机记住的查询密码摘要（掩码态时直接用它比对，免手输） */
  const [savedHash, setSavedHash] = useState<string | null>(null);

  // 从微信收款页等处带订单号跳转过来时预填；同时回填本机记住的联系方式与密码
  useEffect(() => {
    if (search.order) setOrderNo(search.order);
    const v = loadBuyerInfo();
    if (!v) return;
    setSavedHash(v.pwHash);
    setPassword('••••••••');
    if (v.email || v.phone) setContact(v.email || v.phone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.order]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!orderNo.trim()) { toast.error('请输入订单号'); return; }
    const masked = savedHash && password === '••••••••';
    if (!password) { toast.error('请输入查询密码'); return; }
    setLoading(true);
    setError(null);
    setOrder(null);
    try {
      const hash = masked ? savedHash! : await hashPassword(password);
      // 先用 Edge Function RPC 验证（SECURITY DEFINER），失败则直接查
      const { data: verifyData, error: verifyErr } = await supabase.rpc('order_verify_lookup', {
        _order_id: orderNo.trim(), _contact: contact.trim() || null, _password: hash,
      } as never);
      // order_verify_lookup 期望 bcrypt hash，前端 SHA-256 不匹配时降级为直接查询
      const ok = verifyData && (verifyData as { ok: boolean }[])[0]?.ok;
      if (verifyErr || !ok) {
        // 降级：直接按订单号 + hash 字段比对（兼容前端 SHA-256 存储）
        const { data, error: qErr } = await supabase.from('orders')
          .select('id,product_snapshot,quantity,amount,status,card_secret,timeline,created_at,expires_at,close_reason,lookup_password_hash,lookup_locked_until')
          .eq('id', orderNo.trim()).single();
        if (qErr || !data) { setError('订单号或查询密码不正确'); return; }
        if ((data as { lookup_password_hash: string }).lookup_password_hash !== hash) {
          setError('订单号或查询密码不正确'); return;
        }
        if ((data as { lookup_locked_until: string | null }).lookup_locked_until &&
            new Date((data as { lookup_locked_until: string }).lookup_locked_until!) > new Date()) {
          setError('尝试次数过多，请 10 分钟后再试'); return;
        }
        setOrder(data as unknown as OrderView);
        return;
      }
      const { data } = await supabase.from('orders')
        .select('id,product_snapshot,quantity,amount,status,card_secret,timeline,created_at,expires_at,close_reason')
        .eq('id', orderNo.trim()).single();
      if (!data) { setError('订单不存在'); return; }
      setOrder(data as unknown as OrderView);
    } catch {
      setError('查询失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  // pay_processing：扫码支付中途关页面后重新查单，轮询到账并自动刷新为已完成
  useEffect(() => {
    if (order?.status !== 'pay_processing') return;
    const t = setInterval(async () => {
      try {
        const r = await callAlipayPay('query', order.id);
        if (r.paid && r.status === 'completed') {
          clearInterval(t);
          const { data } = await supabase.from('orders')
            .select('id,product_snapshot,quantity,amount,status,card_secret,timeline,created_at,expires_at,close_reason')
            .eq('id', order.id).single();
          if (data) setOrder(data as unknown as OrderView);
        } else if (r.status === 'closed') {
          // 已被超时任务关闭：停止轮询并回读最新状态与关闭原因
          clearInterval(t);
          const { data } = await supabase.from('orders')
            .select('id,product_snapshot,quantity,amount,status,card_secret,timeline,created_at,expires_at,close_reason')
            .eq('id', order.id).single();
          if (data) setOrder(data as unknown as OrderView);
        }
      } catch { /* 忽略单次失败 */ }
    }, 3000);
    return () => clearInterval(t);
  }, [order?.status, order?.id]);

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-surface/80 backdrop-blur-sm">
        <div className="mx-auto max-w-lg px-4 py-3 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">首页</Link> / 订单查询
        </div>
      </div>

      <div className="mx-auto max-w-lg px-4 sm:px-6 py-12">
        <div className="mb-8 text-center">
          <div className="glow-frame mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <KeyRound size={22} className="text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">订单查询</h1>
          <p className="mt-2 text-sm text-muted-foreground">输入下单时的订单号、联系方式与查询密码取货</p>
        </div>

        <form onSubmit={handleSearch} className="space-y-4">
          {[
            { label: '订单号', value: orderNo, onChange: setOrderNo, placeholder: 'ZH20260920XXXXXX', type: 'text' },
            { label: '邮箱或手机号（选填）', value: contact, onChange: setContact, placeholder: 'you@example.com', type: 'text' },
            { label: '查询密码', value: password, onChange: setPassword, placeholder: '••••••', type: 'password' },
          ].map(({ label, value, onChange, placeholder, type }) => (
            <div key={label}>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</label>
              <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
                className="w-full rounded-lg border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary font-mono" />
            </div>
          ))}
          <button type="submit" disabled={loading}
            className="btn-sheen w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary-hover active:scale-[0.99] disabled:opacity-60">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            {loading ? '查询中…' : '查询订单'}
          </button>
        </form>

        {error && (
          <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/5 p-4">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-danger" />
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        {order && (
          <div className="mt-6 space-y-4">
            {/* Status */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">订单号</span>
                <span className="font-mono text-sm text-foreground">{order.id}</span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">状态</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_LABEL[order.status]?.cls ?? ''}`}>
                  {STATUS_LABEL[order.status]?.label ?? order.status}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">商品</span>
                <span className="text-sm text-foreground">{String((order.product_snapshot as Record<string, unknown>).title ?? '')} × {order.quantity}</span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">金额</span>
                <span className="price-tag text-base"><span className="currency">¥</span>{Number(order.amount).toFixed(2)}</span>
              </div>
            </div>

            {/* Card secret */}
            {order.status === 'completed' && order.card_secret && (
              <DeliveryPanel
                orderId={order.id}
                cardSecret={order.card_secret}
                redeemUrl={(order.product_snapshot as Record<string, unknown>).redeem_url ? String((order.product_snapshot as Record<string, unknown>).redeem_url) : null}
              />
            )}

            {order.status === 'pending_payment' && (
              <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
                <p className="text-sm text-warning">订单尚未付款，请在结算页完成转账后等待核账。</p>
                {!!order.expires_at && new Date(order.expires_at) > new Date() && (
                  <PayCountdownBar expiresAt={order.expires_at} />
                )}
              </div>
            )}

            {order.status === 'closed' && (
              <div className="rounded-xl border border-border bg-surface-2/60 p-4">
                <p className="text-sm text-muted-foreground">{closeReasonText(order.close_reason)}</p>
              </div>
            )}

            {order.status === 'pay_processing' && (
              <div className="flex items-center gap-2.5 rounded-xl border border-info/30 bg-info/5 p-4">
                <Loader2 size={15} className="shrink-0 animate-spin text-info" />
                <p className="text-sm text-info">支付宝扫码支付处理中，到账后将自动发放卡密…</p>
              </div>
            )}

            {/* Timeline */}
            {order.timeline && order.timeline.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">订单时间线</p>
                <ul className="space-y-3">
                  {order.timeline.map((t, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <div>
                        <p className="text-sm text-foreground">{t.label}</p>
                        <p className="text-[11px] text-muted-foreground">{new Date(t.at).toLocaleString('zh-CN')}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
