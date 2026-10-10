import { useState } from 'react';
import { PiggyBank, Loader2, ArrowDownLeft, ArrowUpRight, RotateCcw, History, RefreshCw, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useMyWallet } from '@/lib/wallet';
import { parseRechargeAmount, RECHARGE_MIN, RECHARGE_MAX } from '@/lib/recharge';
import { RechargePanel } from '@/components/account/RechargePanel';
import type { WalletTx } from '@/lib/types';

/** 快捷充值档位（元）。充值在本卡内展开，不跳转商品页。 */
const RECHARGE_TIER = [50, 100, 200, 500];

const KIND_META: Record<WalletTx['kind'], { label: string; icon: typeof ArrowDownLeft; positive: boolean }> = {
  recharge: { label: '充值到账', icon: ArrowDownLeft, positive: true },
  spend: { label: '余额消费', icon: ArrowUpRight, positive: false },
  unfreeze: { label: '缺货退回', icon: RotateCcw, positive: true },
  refund: { label: '管理员退款', icon: RotateCcw, positive: true },
  admin_adjust: { label: '账户调整', icon: ArrowDownLeft, positive: true },
};

function fmtTime(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function WalletCard() {
  const { data: wallet, isLoading, isError, error, refetch } = useMyWallet(true);
  const [showAll, setShowAll] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState<number | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customRaw, setCustomRaw] = useState('');

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5" aria-busy="true">
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin text-primary" />正在读取钱包…</div>
        <div className="mt-3 h-20 animate-pulse rounded-lg bg-surface-2" />
      </div>
    );
  }

  if (isError || !wallet) {
    const detail = error instanceof Error ? error.message : '';
    return (
      <div className="rounded-xl border border-warning/30 bg-card p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle size={17} className="mt-0.5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-foreground">我的钱包暂时无法加载</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">余额和流水没有成功读取。为避免显示错误余额，加载成功前不会开放充值或余额支付。</p>
            {detail && <p className="mt-2 break-words rounded-lg bg-surface p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">{detail}</p>}
            <button type="button" onClick={() => { void refetch(); }} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/50">
              <RefreshCw size={12} /> 重新加载钱包
            </button>
          </div>
        </div>
      </div>
    );
  }

  const txs = showAll ? wallet.transactions : wallet.transactions.slice(0, 5);

  return (
    <div className="glow-frame rounded-xl border border-primary/25 bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-sm font-bold text-foreground">
          <PiggyBank size={15} className="text-primary" /> 我的钱包
        </h2>
        <span className="text-right text-[11px] text-muted-foreground">余额仅限站内消费 · 不可提现</span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg border border-border bg-surface p-3 text-center sm:gap-3 sm:p-4">
        <div>
          <p className="text-[11px] text-muted-foreground">可用余额</p>
          <p className="price-tag mt-1 break-all text-lg sm:text-xl"><span className="currency">¥</span>{wallet.available.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">累计充值</p>
          <p className="mt-1 break-all font-mono text-base font-semibold text-foreground sm:text-lg">¥{wallet.total_recharged.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">累计消费</p>
          <p className="mt-1 break-all font-mono text-base font-semibold text-foreground sm:text-lg">¥{wallet.total_spent.toFixed(2)}</p>
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">充值到余额</p>
        <div className="flex flex-wrap gap-2">
          {RECHARGE_TIER.map((v) => (
            <button key={v} type="button" onClick={() => { setCustomOpen(false); setRechargeAmount(v); }}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors active:scale-[0.98] ${rechargeAmount === v ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-surface text-foreground hover:border-primary/60 hover:text-primary'}`}>
              ¥{v}
            </button>
          ))}
          <button type="button" onClick={() => { if (customOpen) { setCustomOpen(false); return; } setCustomOpen(true); setRechargeAmount(null); }}
            className={`inline-flex items-center gap-1 rounded-lg border border-dashed px-4 py-2 text-xs transition-colors ${customOpen ? 'border-primary/70 text-primary' : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'}`}>
            自定义金额
          </button>
        </div>

        {customOpen && (
          <div className="mt-3 rounded-lg border border-border bg-surface p-3">
            <label className="mb-1.5 block text-[11px] text-muted-foreground">充值金额（¥{RECHARGE_MIN} - ¥{RECHARGE_MAX}，最多两位小数）</label>
            <input inputMode="decimal" value={customRaw}
              onChange={(e) => setCustomRaw(e.target.value.replace(/[^\d.]/g, '').replace(/^(\d*\.\d{0,2}).*$/, '$1'))}
              placeholder="例如 66.60"
              className="w-full rounded-lg border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
            <button type="button" disabled={!parseRechargeAmount(customRaw)} onClick={() => {
              const n = parseRechargeAmount(customRaw);
              if (n === null) { toast.error(`请输入 ¥${RECHARGE_MIN} - ¥${RECHARGE_MAX} 之间的金额`); return; }
              setRechargeAmount(n);
            }} className="mt-2 w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50">
              创建充值订单
            </button>
            {!parseRechargeAmount(customRaw) && customRaw.trim() !== '' && <p className="mt-1.5 text-[11px] text-warning">金额需在 ¥{RECHARGE_MIN} - ¥{RECHARGE_MAX} 之间</p>}
          </div>
        )}

        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">充值单用支付宝/微信/USDT 付款，到账后自动进入余额；支付宝类通道按页面标示收取渠道手续费。</p>

        {rechargeAmount !== null && <RechargePanel principal={rechargeAmount} onClose={() => setRechargeAmount(null)} />}
      </div>

      {wallet.transactions.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><History size={12} /> 最近流水</p>
          <ul className="space-y-2">
            {txs.map((t) => {
              const meta = KIND_META[t.kind] ?? KIND_META.recharge;
              const Icon = meta.icon;
              return (
                <li key={t.id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <Icon size={13} className={meta.positive ? 'text-success' : 'text-warning'} />
                    <span className="shrink-0 text-foreground">{meta.label}</span>
                    <span className="truncate text-muted-foreground">{t.note ?? t.order_id ?? ''}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={`font-mono font-semibold ${meta.positive ? 'text-success' : 'text-foreground'}`}>{meta.positive ? '+' : ''}{Number(t.amount).toFixed(2)}</span>
                    <span className="ml-2 text-[10px] text-muted-foreground">{fmtTime(t.created_at)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          {wallet.transactions.length > 5 && <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 text-[11px] text-primary hover:underline">{showAll ? '收起' : `查看全部 ${wallet.transactions.length} 条`}</button>}
        </div>
      )}
    </div>
  );
}
