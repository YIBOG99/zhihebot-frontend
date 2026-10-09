// 支付时限倒计时横幅：以服务端下发的 expires_at 为唯一真相，只算差值，不受本机时钟影响。
// 行内渲染，不使用任何浮层（微信内置浏览器里浮层点击不可靠）。
import { useEffect, useState } from 'react';
import { Clock, TimerOff } from 'lucide-react';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function fmt(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

export function PayCountdownBar({
  expiresAt,
  onExpired,
}: {
  /** 服务端下发的截止时刻 ISO 串；为空表示老订单不限时，整条横幅不渲染 */
  expiresAt?: string | null;
  /** 归零回调（仅触发一次），父级据此停止轮询并切超时视图 */
  onExpired?: () => void;
}) {
  const target = expiresAt ? new Date(expiresAt).getTime() : NaN;
  const [remain, setRemain] = useState(() => (expiresAt ? target - Date.now() : 0));
  const [fired, setFired] = useState(false);

  useEffect(() => {
    if (!expiresAt || Number.isNaN(target)) return;
    const tick = () => {
      const left = target - Date.now();
      setRemain(left);
      if (left <= 0 && !fired) {
        setFired(true);
        onExpired?.();
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  if (!expiresAt || Number.isNaN(target)) return null;

  const expired = remain <= 0;
  const urgent = !expired && remain < 60_000;
  const warn = !expired && remain < 5 * 60_000;

  const tone = expired
    ? 'border-danger/40 bg-danger/10 text-danger'
    : urgent
      ? 'border-danger/40 bg-danger/5 text-danger countdown-pulse'
      : warn
        ? 'border-warning/40 bg-warning/5 text-warning'
        : 'border-border bg-surface-2/60 text-muted-foreground';

  return (
    <div className={`mt-4 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors ${tone}`}>
      <span className="inline-flex min-w-0 items-center gap-2 text-xs">
        {expired ? <TimerOff size={14} className="shrink-0" /> : <Clock size={14} className="shrink-0" />}
        <span className="truncate">
          {expired ? '支付时限已到，订单正在关闭…' : '请在 30 分钟内完成付款，逾期订单将自动关闭'}
        </span>
      </span>
      <span className={`shrink-0 font-mono text-lg font-bold tabular-nums ${expired ? 'line-through opacity-60' : ''}`}>
        {expired ? '00:00' : fmt(remain)}
      </span>
    </div>
  );
}
