// 支付宝在线支付面板：出码（当面付二维码 / 网站支付收银台）→ 轮询到账 → 成功展示卡密。
// 紧耦合子状态全部内联本文件。
import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import QRCode from 'qrcode';
import { Loader2, CheckCircle2, AlertTriangle, RefreshCw, Copy, Check, Smartphone, ExternalLink, TimerOff } from 'lucide-react';
import { callAlipayPay } from '@/lib/queries';
import { ExactAmountNotice } from '@/components/ExactAmountNotice';

type Phase = 'loading' | 'qr' | 'page' | 'paid' | 'unconfigured' | 'error' | 'timeout';

const POLL_MS = 3000;
const MAX_POLLS = 100; // 约 5 分钟

export function PayQrPanel({ orderId, amount, expiresAt, onUnavailable, onSettled }: {
  orderId: string;
  amount: number;
  /** 支付截止时刻；归零后停止轮询并切超时视图（老订单为空则不限制） */
  expiresAt?: string | null;
  /** 在线通道不可用时回调（父级只在本通道内标注原因，不再切到其它支付通道的视图） */
  onUnavailable: (reason: string) => void;
  /** 到账确认回调：充值面板据此刷新余额（普通商品单无需传） */
  onSettled?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [expired, setExpired] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [payUrl, setPayUrl] = useState('');
  const [pageOpened, setPageOpened] = useState(false);
  const [cardSecret, setCardSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const pollsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPoll() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  // 支付时限归零：停止轮询，避免已关闭订单继续查到账
  useEffect(() => {
    if (!expiresAt) return;
    const target = new Date(expiresAt).getTime();
    const tick = () => {
      if (Date.now() >= target) { stopPoll(); setExpired(true); }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  async function startCreate() {
    setPhase('loading');
    setPageOpened(false);
    try {
      const r = await callAlipayPay('create', orderId);
      console.log('[PayQrPanel] create result', { channel: r.channel, error: r.error, message: r.message });
      if (r.error === 'NOT_CONFIGURED') { setPhase('unconfigured'); console.log('[PayQrPanel] 支付宝在线收款未配置，停留本通道并提示', { msg: r.message }); onUnavailable(r.message ?? '在线支付未开通'); return; }
      // 签约预检失败：当面付与电脑网站支付均无权限 → 明确告知需到开放平台签约，不再给出打不开的收银台链接
      if (r.error === 'CHANNEL_UNAVAILABLE') { setPhase('unconfigured'); console.log('[PayQrPanel] 支付宝收单产品未签约，通道不可用', { detail: r.detail }); onUnavailable(r.message ?? '支付宝收单产品未开通'); return; }
      if (!r.ok) { setPhase('error'); setErrMsg(r.message ?? '下单失败，请重试'); return; }

      // 当面付未签约时服务端自动降级为电脑网站支付，返回收银台链接
      if (r.channel === 'alipay_page' && r.pay_url) {
        console.log('[PayQrPanel] 使用电脑网站支付收银台', { orderId });
        setPayUrl(r.pay_url);
        setPhase('page');
        startPoll();
        return;
      }
      if (!r.qr_code) { setPhase('error'); setErrMsg('未获取到支付二维码，请重试'); return; }
      const url = await QRCode.toDataURL(r.qr_code, { margin: 1, width: 440, color: { dark: '#101418ff', light: '#ffffffff' } });
      setQrDataUrl(url);
      setPhase('qr');
      startPoll();
    } catch {
      setPhase('error');
      setErrMsg('网络异常，无法连接支付服务');
    }
  }

  function startPoll() {
    stopPoll();
    pollsRef.current = 0;
    timerRef.current = setInterval(async () => {
      pollsRef.current += 1;
      if (pollsRef.current > MAX_POLLS) { stopPoll(); setPhase('timeout'); return; }
      try {
        const r = await callAlipayPay('query', orderId);
        if (r.paid && r.status === 'completed') {
          stopPoll();
          setCardSecret(r.card_secret ?? null);
          setPhase('paid');
          onSettled?.();
        } else if (r.status === 'closed') {
          stopPoll();
          setPhase('error');
          setErrMsg('订单已关闭，请重新下单');
        }
      } catch { /* 单次轮询失败忽略，等下一轮 */ }
    }, POLL_MS);
  }

  useEffect(() => {
    startCreate();
    return stopPoll;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  if (expired) {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger/5 p-8 text-center">
        <TimerOff size={28} className="mx-auto mb-3 text-danger" />
        <h3 className="text-base font-bold text-foreground">支付时限已到</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          订单将在一分钟内由系统自动关闭。若你已完成付款，请到查单页凭订单三要素核实到账情况。
        </p>
        <Link to="/orders/lookup" search={{ order: orderId } as never}
          className="mt-5 inline-block rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover">
          去查单页核实
        </Link>
      </div>
    );
  }

  if (phase === 'loading') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-10">
        <Loader2 size={28} className="animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">正在向支付宝创建收款单…</p>
      </div>
    );
  }

  if (phase === 'paid') {
    return (
      <div className="rounded-xl border border-success/30 bg-success/5 p-8 text-center">
        <CheckCircle2 size={36} className="mx-auto mb-3 text-success" />
        <h3 className="text-lg font-bold text-foreground">支付成功，已自动发货</h3>
        {cardSecret ? (
          <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-3">
            <span className="font-mono text-sm text-success break-all">{cardSecret}</span>
            <button onClick={() => { navigator.clipboard.writeText(cardSecret); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
              {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
            </button>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">卡密生成中，请稍后到查单页查看。</p>
        )}
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/orders/lookup" className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover transition-colors">
            前往查单页
          </Link>
        </div>
      </div>
    );
  }

  if (phase === 'timeout') {
    return (
      <div className="rounded-xl border border-warning/30 bg-warning/5 p-8 text-center">
        <AlertTriangle size={28} className="mx-auto mb-3 text-warning" />
        <h3 className="text-base font-bold text-foreground">支付处理中</h3>
        <p className="mt-2 text-sm text-muted-foreground">尚未查到到账记录。若你已完成付款，稍后凭订单三要素到查单页即可取卡密。</p>
        <div className="mt-5 flex justify-center gap-3">
          <button onClick={startCreate} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-5 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw size={13} /> 继续等待
          </button>
          <Link to="/orders/lookup" className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover transition-colors">
            去查单页
          </Link>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger/5 p-8 text-center">
        <AlertTriangle size={28} className="mx-auto mb-3 text-danger" />
        <p className="text-sm text-foreground">{errMsg}</p>
        <div className="mt-4 flex justify-center gap-3">
          <button onClick={startCreate} className="rounded-xl border border-border px-5 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">重试</button>
          <button onClick={() => onUnavailable(errMsg || '在线支付暂不可用')} className="rounded-xl px-5 py-2 text-sm text-info hover:underline transition-colors">
            了解原因
          </button>
        </div>
      </div>
    );
  }

  // phase === 'page'：电脑网站支付 —— 跳转支付宝收银台，本页继续轮询到账结果
  if (phase === 'page') {
    return (
      <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-info/10">
            <ExternalLink size={22} className="text-info" />
          </span>
          <p className="text-sm font-semibold text-foreground">前往支付宝收银台完成付款</p>
          <p className="price-tag text-3xl"><span className="currency">¥</span>{amount.toFixed(2)}</p>
          <div className="w-full max-w-md text-left">
            <ExactAmountNotice amount={amount} />
          </div>
          <a href={payUrl} target="_blank" rel="noopener noreferrer"
            onClick={() => setPageOpened(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary-hover active:scale-95">
            <Smartphone size={15} /> 打开支付宝付款
          </a>
          <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
            点击上方按钮会在新窗口打开支付宝官方收银台，可用<b className="text-foreground">扫码或账号登录</b>两种方式付款。
            {pageOpened && <span className="text-info"> 已为你打开付款页 → </span>}
            <Link to="/orders/lookup" className="text-primary hover:underline">点此回到本页</Link>
            查看到账结果。付款成功后系统实时核验并<b className="text-primary">自动发放卡密</b>，请勿关闭本页面。
          </p>
          <div className="flex items-center gap-2 text-xs text-info">
            <Loader2 size={13} className="animate-spin" /> 正在等待支付结果…
          </div>
        </div>
      </div>
    );
  }

  // phase === 'unconfigured'：支付宝在线收款尚未开通 —— 保留在本通道内说明原因，
  // 不再把用户甩到其它支付通道的视图（原先的 onFallbackManual 跳视图正是「两个通道内容一模一样」的根因）。
  if (phase === 'unconfigured') {
    return (
      <div className="rounded-xl border border-warning/30 bg-warning/5 p-8 text-center">
        <AlertTriangle size={28} className="mx-auto mb-3 text-warning" />
        <h3 className="text-base font-bold text-foreground">支付宝在线收款暂未开通</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          店主尚未配置支付宝商户凭据，本通道暂时无法出码。请点下方「← 更换支付方式」改用 USDT、微信收款或支付宝3；已下单未付款的订单不受影响。
        </p>
        <button onClick={startCreate} className="mt-5 inline-flex items-center gap-1.5 rounded-xl border border-border px-5 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <RefreshCw size={13} /> 重新尝试出码
        </button>
      </div>
    );
  }

  // phase === 'qr'
  return (
    <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        <img src={qrDataUrl} alt="支付宝收款二维码" width={200} height={200}
          className="rounded-lg bg-white p-2 shadow-lg shadow-black/30" />
        <div className="flex-1 text-center sm:text-left">
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Smartphone size={15} className="text-info" /> 打开支付宝「扫一扫」完成付款
          </p>
          <p className="mt-2 price-tag text-3xl"><span className="currency">¥</span>{amount.toFixed(2)}</p>
          <div className="w-full">
            <ExactAmountNotice amount={amount} />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            二维码仅对本订单有效，请在支付时限内完成付款，逾期订单将由系统自动关闭。付款成功后系统实时核验到账并<b className="text-primary">自动发放卡密</b>，无需任何人工操作，请勿关闭本页面。
          </p>
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-info sm:justify-start">
            <Loader2 size={13} className="animate-spin" /> 正在等待支付结果…
          </div>
        </div>
      </div>
    </div>
  );
}
