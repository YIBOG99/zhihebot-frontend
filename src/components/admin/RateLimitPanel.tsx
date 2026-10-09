import { useRef, useState } from 'react';
import { ShieldCheck, UserCheck, Plus, Mail, Phone, RefreshCw, Activity, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import {
  addRateLimitWhitelist, removeRateLimitWhitelist,
  useRateLimitWhitelist, useRateLimitBlocks, useInvalidateRateLimit,
} from '@/lib/queries';

/** 时间格式化（UTC+8 展示，与黑名单面板同口径） */
function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(new Date(iso).getTime() + 8 * 3600_000);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** 窗口秒数 → 人类可读（300 → 5 分钟；45 → 45 秒） */
function fmtWindow(secs: number): string {
  if (secs >= 60 && secs % 60 === 0) return `${Math.floor(secs / 60)} 分钟`;
  if (secs >= 60) return `${Math.floor(secs / 60)} 分 ${secs % 60} 秒`;
  return `${secs} 秒`;
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

/** 后台「频控」Tab：白名单管理 + 最近拦截记录 */
export function RateLimitPanel() {
  const [newType, setNewType] = useState<'email' | 'phone'>('email');
  const [newValue, setNewValue] = useState('');
  const [newNote, setNewNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  /** 待确认的移除目标 id → setTimeout 句柄 */
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const timerRef = useRef<{ current: number | null }>({ current: null });

  const whitelist = useRateLimitWhitelist();
  const blocks = useRateLimitBlocks(50);
  const invalidate = useInvalidateRateLimit();

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

  async function addManual() {
    if (adding) return;
    const v = newValue.trim();
    if (!v) { toast.error('请填写要加入白名单的邮箱或手机号'); return; }
    setAdding(true);
    try {
      const r = await addRateLimitWhitelist(newType, v, newNote.trim() || undefined);
      if (r.ok) {
        toast.success(`已加入白名单 ${v}`);
        setNewValue(''); setNewNote('');
        invalidate();
      } else {
        toast.error(r.message);
      }
    } finally {
      setAdding(false);
    }
  }

  async function doRemove(id: string, display: string) {
    setActingId(id);
    try {
      const r = await removeRateLimitWhitelist(id);
      if (r.ok) { toast.success(`已移除 ${display}`); invalidate(); }
      else toast.error(r.message);
    } finally {
      setActingId(null);
    }
  }

  const wlRows = whitelist.data ?? [];
  const blockRows = blocks.data ?? [];

  return (
    <div className="space-y-6">
      {/* 白名单录入 */}
      <section className="rounded-xl border border-success/30 bg-card p-4 glow-frame">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Plus size={14} className="text-success" /> 添加频控白名单
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
            placeholder={newType === 'email' ? '要豁免的邮箱' : '要豁免的手机号'}
            className="min-w-0 flex-1 rounded-lg border border-border bg-input px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
          <input value={newNote} onChange={(e) => setNewNote(e.target.value)}
            placeholder="备注（可选，默认「店主测试账号」）"
            className="min-w-0 flex-1 rounded-lg border border-border bg-input px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
          <button onClick={addManual} disabled={adding}
            className="shrink-0 rounded-lg bg-success/15 px-4 py-1.5 text-xs font-medium text-success hover:bg-success/25 transition-colors disabled:opacity-50">
            {adding ? '…' : '加入白名单'}
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          命中白名单的联系方式<b className="text-foreground">不受下单次数限制</b>，可反复下单，适合你自己测试各种支付通道。
          注意：白名单<b className="text-foreground">只豁免频控</b>，下单验证码仍要照填；被拉进黑名单的联系方式依然无法下单。
          另外，顾客<b className="text-foreground">登录后下单本来就不受频控</b>，无需加白名单——白名单主要给游客身份下的测试用。
          成交满设定单数（默认 <b className="text-foreground">1 单</b>）的顾客会被系统<b className="text-foreground">自动加入</b>本名单，标着「自动加入」；你手动移除后不会再被自动加回。阈值可在「站点设置 → 下单人机校验」里调整或关闭。
        </p>
      </section>

      {/* 生效中的白名单 */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <UserCheck size={14} className="text-success" /> 生效中的白名单（{wlRows.length}）
          </h3>
          <button onClick={() => { whitelist.refetch(); blocks.refetch(); }}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw size={11} /> 刷新
          </button>
        </div>
        {whitelist.isLoading ? (
          <p className="py-8 text-center text-xs text-muted-foreground">加载中…</p>
        ) : whitelist.isError ? (
          <p className="py-8 text-center text-xs text-danger">白名单加载失败，请刷新重试</p>
        ) : wlRows.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">暂无白名单，可在上方添加你的测试邮箱</p>
        ) : (
          <ul className="space-y-2">
            {wlRows.map((w) => {
              const display = w.raw_value || w.contact_value;
              const key = `remove:${w.id}`;
              return (
                <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-2/50 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate font-mono text-xs text-foreground">
                      {display}
                      {w.source === 'auto' ? (
                        <span className="shrink-0 rounded border border-primary/40 bg-primary/10 px-1.5 py-px text-[10px] font-semibold text-primary">自动加入</span>
                      ) : (
                        <span className="shrink-0 rounded border border-border px-1.5 py-px text-[10px] text-muted-foreground">手动添加</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {w.contact_type === 'email' ? '邮箱' : '手机号'} · {w.note || '未填备注'} · 添加于 {fmtTime(w.created_at)}
                    </p>
                  </div>
                  <ConfirmButton
                    armed={pendingKey === key}
                    onArm={() => arm(key, () => void doRemove(w.id, display))}
                    onConfirm={() => void doRemove(w.id, display)}
                    pending={actingId === w.id}
                    idleClass="border-border text-muted-foreground hover:text-danger"
                    armedClass="border-danger/60 bg-danger/10 font-semibold text-danger"
                    idleLabel="移除"
                    armedLabel="再点一次确认移除"
                  />
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <ShieldCheck size={12} className="mt-0.5 shrink-0 text-success" />
          移除为软删除，历史记录保留；同一联系方式再次加入会复用最近一条记录。
        </p>
      </section>

      {/* 最近拦截记录 */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Activity size={14} className="text-warning" /> 最近被频控拦截
            <span className="text-[11px] font-normal text-muted-foreground">最多显示 50 条，用于判断有没有误伤</span>
          </h3>
          <button onClick={() => blocks.refetch()}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw size={11} /> 刷新
          </button>
        </div>
        {blocks.isLoading ? (
          <p className="py-8 text-center text-xs text-muted-foreground">统计中…</p>
        ) : blocks.isError ? (
          <p className="py-8 text-center text-xs text-danger">拦截记录加载失败，请刷新重试</p>
        ) : blockRows.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">暂无拦截记录 —— 说明目前没人被频控挡住</p>
        ) : (
          <ul className="space-y-2">
            {blockRows.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-2/50 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs text-foreground">{b.contact_value}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                    {b.contact_type === 'email' ? '邮箱' : '手机号'} · {fmtTime(b.blocked_at)} ·
                    窗口 <span className="text-foreground">{fmtWindow(b.window_seconds)}</span> 内已有
                    <span className="font-semibold text-warning"> {b.recent_count} </span>单（上限 {b.max_orders}）
                    {b.user_id ? ' · 登录态请求' : ' · 游客'}
                  </p>
                </div>
                <button onClick={() => arm(`quick:${b.contact_value}`, () => void addManualFor(b.contact_type, b.contact_value))}
                  className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs transition-colors ${pendingKey === `quick:${b.contact_value}` ? 'border-success/60 bg-success/10 font-semibold text-success' : 'border-border text-muted-foreground hover:text-success'}`}>
                  {pendingKey === `quick:${b.contact_value}` ? '再点一次加入白名单' : '加入白名单'}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <LogOut size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
          判定标准是「窗口内该联系方式新建的订单数」，不是付款成功数——顾客反复点开结算页但没付款也会累计。若某联系方式频繁上榜且你认为是真人顾客，可直接点右侧按钮把他加入白名单。
        </p>
      </section>
    </div>
  );

  /** 从拦截记录一键加白：沿用当前表单逻辑但不占用输入框 */
  async function addManualFor(type: 'email' | 'phone', value: string) {
    setActingId(`quick:${value}`);
    try {
      const r = await addRateLimitWhitelist(type, value, '频控误伤豁免');
      if (r.ok) { toast.success(`已加入白名单 ${value}`); invalidate(); }
      else toast.error(r.message);
    } finally {
      setActingId(null);
      setPendingKey(null);
    }
  }
}
