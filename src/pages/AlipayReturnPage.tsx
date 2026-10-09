// 支付宝付款完成后的回跳结果页（需求4：自动回到本站并显示成功/失败）。
// ⚠️ 回跳 URL 上的任何参数都不作为到账依据 —— 只取 out_trade_no，
//    结果一律以服务端向支付宝网关查单（callAlipayPay('query')）为准。
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { Loader2, CheckCircle2, XCircle, AlertTriangle, TimerOff, ArrowLeft, RefreshCw } from 'lucide-react';
import { callAlipayPay } from '@/lib/queries';

type Phase = 'checking' | 'paid' | 'pending' | 'failed' | 'notfound';

const MAX_TRIES = 10; // 约 30 秒：给网关状态同步留缓冲
const TRY_MS = 3000;

export function AlipayReturnPage() {
  const search = useSearch({ strict: false }) as Record<string, string | undefined>;
  const navigate = useNavigate();
  const orderNo = (search.out_trade_no ?? search.order ?? '').trim();

  const [phase, setPhase] = useState<Phase>(orderNo ? 'checking' : 'notfound');
  const [tries, setTries] = useState(0);
  const [message, setMessage] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aliveRef = useRef(true);

  /** 单次核验：结果以服务端向支付宝网关查单为准，未到账则安排下一轮重试 */
  function check(n: number) {
    if (!orderNo) return;
    setPhase('checking');
    setTries(n);
    void callAlipayPay('query', orderNo)
      .then((r) => {
        if (!aliveRef.current) return;
        if (r.paid && r.status === 'completed') { setPhase('paid'); return; }
        if (r.status === 'closed') {
          setPhase('failed');
          setMessage('该订单已关闭（超时或已取消）。若你确信已完成付款，请到查单页核实，款项不会丢失。');
          return;
        }
        if (r.status === 'pending_payment') {
          setPhase('failed');
          setMessage('未查询到这笔订单的付款记录，可能是付款尚未完成或使用了其他订单号。');
          return;
        }
        // pay_processing / paid_pending_delivery：网关状态可能还没同步，继续重试
        if (n + 1 >= MAX_TRIES) {
          setMessage(r.status === 'paid_pending_delivery' ? '款项已确认，卡密正在自动发放中。' : '');
          setPhase('pending');
          return;
        }
        timerRef.current = setTimeout(() => check(n + 1), TRY_MS);
      })
      .catch(() => {
        if (!aliveRef.current) return;
        if (n + 1 >= MAX_TRIES) { setPhase('pending'); return; }
        timerRef.current = setTimeout(() => check(n + 1), TRY_MS);
      });
  }

  useEffect(() => {
    aliveRef.current = true;
    if (orderNo) check(0);
    return () => {
      aliveRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNo]);

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="mx-auto max-w-xl px-4 py-16">
      <button onClick={() => navigate({ to: '/orders/lookup', search: { order: orderNo } as never })}
        className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft size={13} /> 去查单页
      </button>
      <div className="glow-frame rounded-2xl border border-border bg-card p-8 text-center">{children}</div>
      <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
        本页结果由系统直接向支付宝核验得出，与回跳链接携带的参数无关。{orderNo && <>订单号 <span className="font-mono text-foreground">{orderNo}</span></>}
      </p>
    </div>
  );

  if (phase === 'checking') {
    return (
      <Shell>
        <Loader2 size={34} className="mx-auto mb-4 animate-spin text-primary" />
        <h1 className="text-lg font-bold text-foreground">正在确认支付结果…</h1>
        <p className="mt-2 text-sm text-muted-foreground">系统正在向支付宝核验这笔订单是否到账，请稍候（第 {tries + 1}/{MAX_TRIES} 次查询）。</p>
      </Shell>
    );
  }

  if (phase === 'paid') {
    return (
      <Shell>
        <CheckCircle2 size={38} className="mx-auto mb-4 text-success" />
        <h1 className="text-xl font-bold text-success">支付成功</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          云端已确认到账，卡密将自动发放到你的订单。点击下方按钮凭订单三要素即可取货。
        </p>
        <Link to="/orders/lookup" search={{ order: orderNo } as never}
          className="btn-sheen mt-6 inline-block rounded-xl bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover">
          立即查看卡密
        </Link>
      </Shell>
    );
  }

  if (phase === 'pending') {
    return (
      <Shell>
        <AlertTriangle size={34} className="mx-auto mb-4 text-warning" />
        <h1 className="text-lg font-bold text-foreground">正在确认到账</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {message || '你的付款已在处理中，云端核验通常在一分钟内完成。若长时间未看到卡密，请到查单页凭订单三要素核实，或联系客服。'}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={() => check(0)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-5 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <RefreshCw size={13} /> 刷新结果
          </button>
          <Link to="/orders/lookup" search={{ order: orderNo } as never}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover">
            去查单页
          </Link>
        </div>
      </Shell>
    );
  }

  if (phase === 'failed') {
    return (
      <Shell>
        <XCircle size={38} className="mx-auto mb-4 text-danger" />
        <h1 className="text-xl font-bold text-danger">付款未完成</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{message}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/account" className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover">
            去个人中心重新支付
          </Link>
          <Link to="/orders/lookup" search={{ order: orderNo } as never}
            className="rounded-xl border border-border px-6 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
            查单核实
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <TimerOff size={34} className="mx-auto mb-4 text-muted-foreground" />
      <h1 className="text-lg font-bold text-foreground">缺少订单信息</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        回跳链接中没有携带订单号，无法为你核验结果。请到查单页凭「订单号 + 联系方式 + 查询密码」核实到账情况。
      </p>
      <Link to="/orders/lookup" className="btn-sheen mt-6 inline-block rounded-xl bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover">
        前往查单页
      </Link>
    </Shell>
  );
}
