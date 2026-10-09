import { useState } from 'react';
import { Ban, ShieldCheck, UserX, Plus, Mail, Phone, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { blockCustomer, unblockCustomer, useBlockedCustomers, useSuspectBuyers, useInvalidateBlocklist } from '@/lib/queries';
import type { BlockedCustomer, SuspectBuyer } from '@/lib/types';

/** 时间格式化（UTC+8 展示，仅用于统计行） */
function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(new Date(iso).getTime() + 8 * 3600_000);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** 两段式行内确认按钮：第一次点击进入待确认态（3 秒超时还原），第二次才执行。
 *  严禁浮层弹窗——微信内置浏览器等内嵌环境里 Dialog 内点击不可靠。 */
function ConfirmButton({
  armed, onArm, onConfirm, pending, idleClass, armedClass, idleLabel, armedLabel,
}: {
  armed: boolean;
  onArm: () => void;
  onConfirm: () => void;
  pending: boolean;
  idleClass: string;
  armedClass: string;
  idleLabel: string;
  armedLabel: string;
}) {
  return (
    <button
      onClick={armed ? onConfirm : onArm}
      disabled={pending}
      className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:opacity-50 ${armed ? armedClass : idleClass}`}
    >
      {pending ? '…' : armed ? armedLabel : idleLabel}
    </button>
  );
}

export function BlocklistPanel() {
  const [threshold, setThreshold] = useState(5);
  const [newType, setNewType] = useState<'email' | 'phone'>('email');
  const [newValue, setNewValue] = useState('');
  const [newReason, setNewReason] = useState('');
  const [adding, setAdding] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  /** 待确认的拉黑/解除目标 key → setTimeout 句柄 */
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [timerRef] = useState<{ current: number | null }>({ current: null });

  const blocked = useBlockedCustomers();
  const suspects = useSuspectBuyers(threshold);
  const invalidate = useInvalidateBlocklist();

  function arm(key: string, run: () => void) {
    if (actingId) return;
    if (pendingKey === key) {
      if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; }
      setPendingKey(null);
      run();
      return;
    }
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setPendingKey(key);
    timerRef.current = window.setTimeout(() => {
      setPendingKey((cur) => (cur === key ? null : cur));
      timerRef.current = null;
    }, 3000);
  }

  async function doBlock(type: 'email' | 'phone', value: string, reason?: string) {
    setActingId(`block:${type}:${value}`);
    console.log('[Blocklist] 拉黑开始', { type, value });
    try {
      const r = await blockCustomer(type, value, reason);
      console.log('[Blocklist] 拉黑结果 =', JSON.stringify(r));
      if (r.ok) { toast.success(`已拉黑 ${value}`); invalidate(); }
      else toast.error(r.message);
    } finally {
      setActingId(null);
    }
  }

  async function doUnblock(row: BlockedCustomer) {
    setActingId(row.id);
    console.log('[Blocklist] 解除拉黑开始', row.id);
    try {
      const r = await unblockCustomer(row.id);
      console.log('[Blocklist] 解除结果 =', JSON.stringify(r));
      if (r.ok) { toast.success(`已解除 ${row.raw_value || row.contact_value}`); invalidate(); }
      else toast.error(r.message);
    } finally {
      setActingId(null);
    }
  }

  async function addManual() {
    if (adding) return;
    const v = newValue.trim();
    if (!v) { toast.error('请填写要拉黑的邮箱或手机号'); return; }
    setAdding(true);
    console.log('[Blocklist] 手动添加', { newType, v });
    try {
      const r = await blockCustomer(newType, v, newReason.trim() || undefined);
      console.log('[Blocklist] 手动添加结果 =', JSON.stringify(r));
      if (r.ok) {
        toast.success(`已拉黑 ${v}`);
        setNewValue(''); setNewReason('');
        invalidate();
      } else {
        toast.error(r.message);
      }
    } finally {
      setAdding(false);
    }
  }

  const blockedRows = blocked.data ?? [];
  const suspectRows = suspects.data ?? [];

  return (
    <div className="space-y-6">
      {/* 手动拉黑 */}
      <section className="rounded-xl border border-border bg-card p-4 glow-frame">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Plus size={14} className="text-primary" /> 手动拉黑联系方式
        </h3>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex shrink-0 gap-1">
            {(['email', 'phone'] as const).map((t) => (
              <button key={t} onClick={() => setNewType(t)}
                className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs transition-colors ${newType === t ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:text-foreground'}`}>
                {t === 'email' ? <Mail size={12} /> : <Phone size={12} />} {t === 'email' ? '邮箱' : '手机号'}
              </button>
            ))}
          </div>
          <input value={newValue} onChange={(e) => setNewValue(e.target.value)}
            placeholder={newType === 'email' ? '要拉黑的邮箱' : '要拉黑的手机号'}
            className="min-w-0 flex-1 rounded-lg border border-border bg-input px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
          <input value={newReason} onChange={(e) => setNewReason(e.target.value)}
            placeholder="原因（可选，默认「多次下单未支付」）"
            className="min-w-0 flex-1 rounded-lg border border-border bg-input px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
          <button onClick={addManual} disabled={adding}
            className="shrink-0 rounded-lg bg-danger/15 px-4 py-1.5 text-xs font-medium text-danger hover:bg-danger/25 transition-colors disabled:opacity-50">
            {adding ? '…' : '拉黑'}
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          拉黑后该邮箱/手机号将无法新建订单；已在途订单不受影响，仍可正常付款与取卡密。本系统未采集 IP 与设备指纹，对方更换联系方式则拦不住。
        </p>
      </section>

      {/* 可疑买家 */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <UserX size={14} className="text-warning" /> 可疑买家
            <span className="text-[11px] font-normal text-muted-foreground">按联系方式聚合，仅作判断参考</span>
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">告警阈值 ≥</span>
            <input type="number" min={1} max={99} value={threshold}
              onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) setThreshold(Math.min(99, Math.max(1, Math.floor(n)))); }}
              className="w-16 rounded-lg border border-border bg-input px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none" />
            <button onClick={() => { suspects.refetch(); blocked.refetch(); }}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw size={11} /> 刷新
            </button>
          </div>
        </div>
        {suspects.isLoading ? (
          <p className="py-8 text-center text-xs text-muted-foreground">统计中…</p>
        ) : suspectRows.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">暂无达到阈值的联系方式</p>
        ) : (
          <ul className="space-y-2">
            {suspectRows.map((s: SuspectBuyer) => {
              const key = `suspect:${s.contact_type}:${s.contact_value}`;
              const highRisk = s.unpaid_orders >= threshold;
              return (
                <li key={key}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5 ${highRisk ? 'border-danger/40 bg-danger/5' : 'border-border bg-surface-2/50'}`}>
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs text-foreground">{s.display_value}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      共 {s.total_orders} 单 · 已完成 {s.paid_orders} · <span className={highRisk ? 'font-semibold text-danger' : ''}>未支付 {s.unpaid_orders}</span> · 最近 {fmtTime(s.last_order_at)}
                    </p>
                  </div>
                  <ConfirmButton
                    armed={pendingKey === key}
                    onArm={() => arm(key, () => void doBlock(s.contact_type, s.contact_value, `未支付 ${s.unpaid_orders} 单`))}
                    onConfirm={() => void doBlock(s.contact_type, s.contact_value, `未支付 ${s.unpaid_orders} 单`)}
                    pending={actingId === `block:${s.contact_type}:${s.contact_value}`}
                    idleClass="border-border text-muted-foreground hover:text-danger"
                    armedClass="border-danger/60 bg-danger/10 font-semibold text-danger"
                    idleLabel="拉黑"
                    armedLabel="再点一次确认拉黑"
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 黑名单列表 */}
      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Ban size={14} className="text-danger" /> 生效中的黑名单（{blockedRows.length}）
        </h3>
        {blocked.isLoading ? (
          <p className="py-8 text-center text-xs text-muted-foreground">加载中…</p>
        ) : blocked.isError ? (
          <p className="py-8 text-center text-xs text-danger">名单加载失败，请刷新重试</p>
        ) : blockedRows.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">暂无拉黑记录</p>
        ) : (
          <ul className="space-y-2">
            {blockedRows.map((b) => {
              const key = `unblock:${b.id}`;
              return (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-2/50 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs text-foreground">{b.raw_value || b.contact_value}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {b.contact_type === 'email' ? '邮箱' : '手机号'} · {b.reason || '未填原因'} · {fmtTime(b.created_at)}
                    </p>
                  </div>
                  <ConfirmButton
                    armed={pendingKey === key}
                    onArm={() => arm(key, () => void doUnblock(b))}
                    onConfirm={() => void doUnblock(b)}
                    pending={actingId === b.id}
                    idleClass="border-border text-muted-foreground hover:text-success"
                    armedClass="border-success/60 bg-success/10 font-semibold text-success"
                    idleLabel="解除拉黑"
                    armedLabel="再点一次确认解除"
                  />
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <ShieldCheck size={12} className="mt-0.5 shrink-0 text-success" />
          解除拉黑为软删除，历史记录保留；同一联系方式再次拉黑会复用最近一条记录。
        </p>
      </section>
    </div>
  );
}
