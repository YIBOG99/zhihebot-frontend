import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from '@tanstack/react-router';
import { QrCode, Wallet, Coins, MessageCircle, TimerOff, Loader2, Copy, Check, ArrowLeft, PiggyBank } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useSiteSettings, callOrderRpc } from '@/lib/queries';
import { PayCountdownBar } from '@/components/PayCountdownBar';
import { PAY_CHANNELS, CASHIER_PATH, cashierSearch, isChannelConfigured, feeNoteOf, CHANNEL_CARD_BASE, TONE_TEXT, type PayChannel } from '@/lib/pay-channels';
import { useMyWallet, payWithBalance, effectiveFeeRate, invalidateWallet } from '@/lib/wallet';
import { useAuthSession } from '@/hooks/use-auth-session';
import type { OrderRow } from '@/lib/types';

const ICON_MAP = { qrcode: QrCode, message: MessageCircle, wallet: Wallet, coins: Coins, piggybank: PiggyBank } as const;

type Load = 'loading' | 'ok' | 'notfound' | 'needlogin';

/**
 * 继续支付恢复页：个人中心「继续支付」的唯一入口。
 * 只凭订单号从 orders 表回读金额/时限/状态，不依赖结算页内存里的建单结果，
 * 因此退出重进、换设备登录后都能接着付。
 * ⚠️ 仅登录用户可用（RLS 只能读到 user_id = auth.uid() 的行）；游客单请走查单页。
 */
export function PayResumePage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: settings } = useSiteSettings();
  const { user } = useAuthSession();
  const { data: wallet } = useMyWallet(Boolean(user));
  const feeRate = effectiveFeeRate(settings?.billing);
  const recOn = settings?.recommend?.enabled !== false;
  const recLabel = settings?.recommend?.label || '优先推荐';
  const orderNo = (id ?? '').trim();

  const [state, setState] = useState<Load>('loading');
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [channel, setChannel] = useState<PayChannel | null>(null);
  const [expired, setExpired] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cancelArmed, setCancelArmed] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [balancePaying, setBalancePaying] = useState(false);

  // 回读订单：拿不到行 = 订单不存在或属于他人/游客
  useEffect(() => {
    if (!orderNo) { setState('notfound'); return; }
    let alive = true;
    setState('loading');
    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!alive) return;
        if (!data.session) { setState('needlogin'); return; }
        const { data: row, error: qErr } = await supabase
          .from('orders')
          .select('*')
          .eq('user_id', data.session.user.id)
          .eq('id', orderNo)
          .maybeSingle();
        if (!alive) return;
        if (qErr || !row) {
          console.warn('[PayResume] order not readable', { orderNo, code: qErr?.code, msg: qErr?.message });
          setState('notfound');
          return;
        }
        const o = row as unknown as OrderRow;
        setOrder(o);
        if (o.status === 'closed' || (o.expires_at && new Date(o.expires_at).getTime() <= Date.now())) {
          setExpired(true);
        }
        setState('ok');
      } catch (e) {
        console.error('[PayResume] load failed:', e);
        if (alive) setState('notfound');
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNo]);

  // 倒计时归零后切超时态（时限真相仍是服务端 expires_at）
  useEffect(() => {
    if (!order?.expires_at || expired) return;
    const target = new Date(order.expires_at).getTime();
    const t = setInterval(() => { if (Date.now() >= target) setExpired(true); }, 1000);
    return () => clearInterval(t);
  }, [order?.expires_at, expired]);

  async function copyOrder() {
    try {
      await navigator.clipboard.writeText(orderNo);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('复制失败，请长按订单号手动复制');
    }
  }

  /** 行内两段式确认：首次点击进入待确认态、3 秒自动还原，二次点击才真正关单（微信内置浏览器禁浮层） */
  async function handleCancel() {
    if (!cancelArmed) {
      setCancelArmed(true);
      setTimeout(() => setCancelArmed(false), 3000);
      return;
    }
    setCancelling(true);
    try {
      const r = await callOrderRpc('order_customer_cancel', orderNo);
      if (r.ok) {
        toast.success('订单已取消');
        setChannel(null);
        setExpired(true);
        setOrder((o) => (o ? { ...o, status: 'closed', close_reason: 'customer_cancel' } : o));
      } else {
        toast.error(r.message);
      }
    } finally {
      setCancelArmed(false);
      setCancelling(false);
    }
  }

  /** 余额支付：扣款 + 发卡一步完成（仅登录单，本页面已强制登录） */
  async function handleBalancePay() {
    setBalancePaying(true);
    try {
      const r = await payWithBalance(orderNo);
      if (r.ok) {
        toast.success('余额支付成功');
        invalidateWallet(qc);
        setOrder((o) => (o ? { ...o, status: 'completed' } : o));
        setChannel(null);
      } else {
        toast.error(r.message);
      }
    } finally {
      setBalancePaying(false);
    }
  }

  if (state === 'loading') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <Loader2 size={26} className="animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">正在读取订单…</p>
      </div>
    );
  }

  if (state === 'needlogin' || state === 'notfound') {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <TimerOff size={30} className="mx-auto mb-3 text-muted-foreground" />
          <h1 className="text-lg font-bold text-foreground">{state === 'needlogin' ? '请先登录' : '没有找到这笔订单'}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {state === 'needlogin'
              ? '继续支付需要登录下单时使用的账号。登录后即可在个人中心看到这笔订单并接着付款。'
              : '该订单可能由未登录状态下创建，或已被关闭。未登录下的单请到查单页凭「订单号 + 联系方式 + 查询密码」取卡密。'}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {state === 'needlogin' ? (
              <Link to="/login"
                className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover">
                去登录
              </Link>
            ) : (
              <Link to="/orders/lookup" search={{ order: orderNo } as never}
                className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover">
                去查单页核实
              </Link>
            )}
            <Link to="/account"
              className="rounded-xl border border-border px-6 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
              返回个人中心
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const amount = Number(order!.amount);
  const snap = order!.product_snapshot as Record<string, unknown>;
  const title = String(snap.title ?? order!.product_id ?? '');

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8">
      <button onClick={() => navigate({ to: '/account' })}
        className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft size={13} /> 返回个人中心
      </button>

      {/* 订单信息 */}
      <div className="glow-frame rounded-2xl border border-primary/25 bg-primary/5 p-6">
        <h1 className="text-lg font-bold text-foreground">继续支付</h1>
        <p className="mt-1 text-sm text-muted-foreground">这笔订单尚未付款，可直接接着支付，无需重新下单。</p>
        <div className="mt-4 space-y-2.5">
          <div className="flex items-center justify-between gap-4">
            <span className="shrink-0 text-xs text-muted-foreground">商品</span>
            <span className="truncate text-sm text-foreground">{title} × {order!.quantity}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="shrink-0 text-xs text-muted-foreground">订单号</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-foreground">{orderNo}</span>
              <button type="button" onClick={copyOrder} aria-label="复制订单号"
                className="text-muted-foreground transition-colors hover:text-foreground">
                {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="shrink-0 text-xs text-muted-foreground">应付金额</span>
            <span className="price-tag text-xl"><span className="currency">¥</span>{amount.toFixed(2)}</span>
          </div>
        </div>
        {!expired && <PayCountdownBar expiresAt={order!.expires_at} onExpired={() => setExpired(true)} />}
      </div>

      {/* 终态：超时 / 已关闭 / 已取消 */}
      {expired && (
        <div className="mt-6 rounded-xl border border-danger/30 bg-danger/5 p-6 text-center">
          <TimerOff size={30} className="mx-auto mb-3 text-danger" />
          <h3 className="text-base font-bold text-foreground">
            {order!.close_reason === 'customer_cancel' ? '订单已取消' : '订单已超时关闭'}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {order!.close_reason === 'customer_cancel'
              ? '本订单已由你主动取消。如需购买请重新下单；若你确信已经付款成功，请到查单页凭订单三要素核实。'
              : '超过支付时限未完成付款，系统已自动关闭本订单。如需购买请重新下单；若你确信已经付款成功，请到查单页核实或联系客服。'}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link to="/product/$id" params={{ id: String(order!.product_id ?? '') }}
              className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover">
              重新下单
            </Link>
            <Link to="/orders/lookup" search={{ order: orderNo } as never}
              className="rounded-xl border border-border px-6 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
              去查单页核实
            </Link>
          </div>
        </div>
      )}

      {/* 通道选择 */}
      {!expired && !channel && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {recOn && (
            <p className="col-span-full text-[11px] leading-relaxed text-primary">
              {settings?.recommend?.note || '推荐使用支付宝付款，到账最快'}；支付宝类通道含 {feeRate}% 渠道手续费（已计入应付金额），余额与微信、USDT 免手续费。
            </p>
          )}
          {PAY_CHANNELS.map((c) => {
            const Icon = ICON_MAP[c.icon];
            const configured = isChannelConfigured(c.id, settings?.payment);
            const short = c.id === 'balance' && (wallet?.available ?? 0) < amount;
            return (
              <button key={c.id} onClick={() => setChannel(c.id)} disabled={!configured || short}
                className={CHANNEL_CARD_BASE}>
                <span className="inline-flex flex-wrap items-center gap-2 text-sm font-bold text-foreground">
                  <Icon size={16} className={TONE_TEXT[c.tone]} />
                  {c.label}
                  <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{c.badge}</span>
                  {recOn && c.recommended && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">{recLabel}</span>
                  )}
                </span>
                <span className="text-xs leading-relaxed text-muted-foreground">{c.desc}</span>
                <span className={`text-[11px] font-semibold ${c.hasFee ? 'text-warning' : 'text-success'}`}>{feeNoteOf(c.id, feeRate)}</span>
                {!configured && (
                  <span className="rounded-lg border border-warning/30 bg-warning/10 px-2 py-1 text-[10px] font-semibold text-warning">店主暂未配置该收款方式</span>
                )}
                {short && (
                  <span className="rounded-lg border border-warning/30 bg-warning/10 px-2 py-1 text-[10px] font-semibold text-warning">余额不足，当前可用 ¥{(wallet?.available ?? 0).toFixed(2)}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* 账户余额支付：站内扣减，无需跳转外部 */}
      {!expired && channel === 'balance' && (
        <div className="mt-6 space-y-3">
          <div className="rounded-xl border border-success/40 bg-success/5 p-5">
            <p className="inline-flex items-center gap-2 text-sm font-bold text-foreground">
              <PiggyBank size={15} className="text-success" /> 账户余额支付
            </p>
            <div className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">当前可用余额</span><span className="font-mono text-foreground">¥{(wallet?.available ?? 0).toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">本单应付</span><span className="font-mono font-bold text-primary">¥{amount.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">支付后剩余</span><span className="font-mono text-muted-foreground">¥{Math.max(0, (wallet?.available ?? 0) - amount).toFixed(2)}</span></div>
            </div>
            <button onClick={() => void handleBalancePay()} disabled={balancePaying || (wallet?.available ?? 0) < amount}
              className="btn-sheen mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover active:scale-[0.99] disabled:opacity-60">
              {balancePaying ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              {balancePaying ? '正在扣款…' : `确认使用余额支付 ¥${amount.toFixed(2)}`}
            </button>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">余额支付免渠道手续费，扣款成功后立即自动发放卡密。</p>
          </div>
          <button onClick={() => setChannel(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">← 更换支付方式</button>
        </div>
      )}

      {/* 支付宝1：与下单页统一使用独立收款码/收款链接收银页，不调用旧在线网关 */}
      {!expired && channel === 'alipay' && (
        <div className="mt-6 space-y-3">
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">支付宝1 使用后台单独配置的收款码或收款链接。若二维码中包含有效支付宝链接，手机端会尝试唤起支付宝；图片形式则扫码付款并按页面提示备注订单号。</p>
            <button onClick={() => navigate({ to: '/pay/alipay-qr', search: { order: orderNo, amount: String(amount), product: title, channel: 'alipay' } as never })}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-info py-3 text-sm font-bold text-white transition-colors hover:bg-info/85 active:scale-[0.99]">
              <QrCode size={15} /> 前往支付宝1收银页
            </button>
          </div>
          <button onClick={() => setChannel(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">← 更换支付方式</button>
        </div>
      )}

      {/* USDT：本页展示地址，无需跳转 */}
      {!expired && channel === 'usdt' && (
        <div className="mt-6 space-y-3">
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-warning">USDT · {settings?.payment?.usdt?.network || 'TRC20'}</p>
            <p className="select-all break-all font-mono text-sm leading-relaxed text-foreground">{settings?.payment?.usdt?.address}</p>
            {settings?.payment?.usdt?.note && <p className="mt-2 text-[11px] leading-relaxed text-danger">{settings.payment.usdt.note}</p>}
            <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
              请在交易所选择 <b className="text-foreground">TRON（TRC20）</b> 网络提币到上面这个地址，金额按应付 <span className="font-mono text-foreground">¥{amount.toFixed(2)}</span> 折算等值 USDT，并备注订单号 <span className="font-mono text-foreground">{orderNo}</span>。其他网络转入无法找回。
            </p>
          </div>
          <button onClick={() => setChannel(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">← 更换支付方式</button>
        </div>
      )}

      {/* 静态收款类：跳独立收银页（页面自行回读时限，支持续付场景） */}
      {!expired && channel && channel !== 'alipay' && channel !== 'usdt' && (
        <div className="mt-6 space-y-3">
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">点击下方按钮进入收银页，页面展示收款二维码、应付金额与剩余时限。</p>
            <button onClick={() => navigate({ to: CASHIER_PATH[channel]!, search: cashierSearch(channel, orderNo, amount, title) as never })}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover active:scale-[0.99]">
              <QrCode size={15} /> 前往收银页
            </button>
          </div>
          <button onClick={() => setChannel(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">← 更换支付方式</button>
        </div>
      )}

      {/* 取消订单：行内两段式确认，不用任何浮层 */}
      {!expired && (
        <div className="mt-8 border-t border-border pt-5">
          <button type="button" onClick={() => void handleCancel()} disabled={cancelling}
            className={`w-full rounded-xl border py-3 text-sm font-semibold transition-colors ${
              cancelArmed
                ? 'border-danger bg-danger/10 text-danger'
                : 'border-border text-muted-foreground hover:border-danger/40 hover:text-danger'
            }`}>
            {cancelling ? '正在取消…' : cancelArmed ? '再次点击确认取消订单' : '取消此订单'}
          </button>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            取消后订单立即关闭、无法恢复付款；若曾使用奖励券抵扣，券会自动退回账户。已在支付宝完成付款的订单不会被取消，云端核验到到账记录后会照常为你发放卡密。
          </p>
        </div>
      )}
    </div>
  );
}
