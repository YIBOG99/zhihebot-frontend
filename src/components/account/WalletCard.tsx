import { useState } from 'react';
import { PiggyBank, Loader2, ArrowDownLeft, ArrowUpRight, RotateCcw, History } from 'lucide-react';
import { toast } from 'sonner';
import { useMyWallet } from '@/lib/wallet';
import { parseRechargeAmount, RECHARGE_MIN, RECHARGE_MAX } from '@/lib/recharge';
import { RechargePanel } from '@/components/account/RechargePanel';
import type { WalletTx } from '@/lib/types';

/** 快捷充值档位（元）。⚠️ 已脱离商品体系：点击只在本卡内展开收银面板，不再跳转任何商品页 */
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

/**
 * 我的钱包：余额展示 + 快捷充值入口 + 最近流水。
 * 余额只能由站内充值订单到账产生（后台无手工加钱入口），扣款/入账全部在服务端函数内完成。
 */
export function WalletCard() {
  const { data: wallet, isLoading, isError } = useMyWallet(true);
  const [showAll, setShowAll] = useState(false);
  /** 当前进行中的充值本金（元）；null 表示收银面板收起 */
  const [rechargeAmount, setRechargeAmount] = useState<number | null>(null);
  /** 「自定义金额」是否展开输入框 */
  const [customOpen, setCustomOpen] = useState(false);
  const [customRaw, setCustomRaw] = useState('');

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="h-24 animate-pulse rounded-lg bg-surface-2" />
      </div>
    );
  }
  if (isError || !wallet) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        钱包信息加载失败，请刷新页面重试。
      </div>
    );
  }

  const txs = showAll ? wallet.transactions : wallet.transactions.slice(0, 5);

  return (
    <div className="glow-frame rounded-xl border border-primary/25 bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="inline-flex items-center gap-2 text-sm font-bold text-foreground">
          <PiggyBank size={15} className="text-primary" /> 我的钱包
        </h2>
        <span className="text-[11px] text-muted-foreground">余额仅限站内消费 · 不可提现</span>
      </div>

      {/* 余额三栏 */}
      <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg border border-border bg-surface p-4 text-center">
        <div>
          <p className="text-[11px] text-muted-foreground">可用余额</p>
          <p className="price-tag mt-1 text-xl"><span className="currency">¥</span>{wallet.available.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">累计充值</p>
          <p className="mt-1 font-mono text-lg font-semibold text-foreground">¥{wallet.total_recharged.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">累计消费</p>
          <p className="mt-1 font-mono text-lg font-semibold text-foreground">¥{wallet.total_spent.toFixed(2)}</p>
        </div>
      </div>

      {/* 快捷充值档位：点击后在本卡内就地展开收银面板，不跳转任何商品页 */}
      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">充值到余额</p>
        <div className="flex flex-wrap gap-2">
          {RECHARGE_TIER.map((v) => (
            <button key={v} type="button"
              onClick={() => { setCustomOpen(false); setRechargeAmount(v); }}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors active:scale-[0.98] ${
                rechargeAmount === v ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-surface text-foreground hover:border-primary/60 hover:text-primary'
              }`}>
              ¥{v}
            </button>
          ))}
          <button type="button"
            onClick={() => {
              if (customOpen) { setCustomOpen(false); return; }
              setCustomOpen(true);
              setRechargeAmount(null);
            }}
            className={`inline-flex items-center gap-1 rounded-lg border border-dashed px-4 py-2 text-xs transition-colors ${
              customOpen ? 'border-primary/70 text-primary' : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
            }`}>
            自定义金额
          </button>
        </div>

        {/* 选中「自定义金额」后就地出现输入框，可直接输入想要充值的金额 */}
        {customOpen && (
          <div className="mt-3 rounded-lg border border-border bg-surface p-3">
            <label className="mb-1.5 block text-[11px] text-muted-foreground">充值金额（¥{RECHARGE_MIN} - ¥{RECHARGE_MAX}，最多两位小数）</label>
            <input inputMode="decimal" value={customRaw}
              onChange={(e) => setCustomRaw(e.target.value.replace(/[^\d.]/g, '').replace(/^(\d*\.\d{0,2}).*$/, '$1'))}
              placeholder="例如 66.60"
              className="w-full rounded-lg border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
            <button type="button" disabled={!parseRechargeAmount(customRaw)}
              onClick={() => {
                const n = parseRechargeAmount(customRaw);
                if (n === null) { toast.error(`请输入 ¥${RECHARGE_MIN} - ¥${RECHARGE_MAX} 之间的金额`); return; }
                setRechargeAmount(n);
              }}
              className="mt-2 w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50">
              创建充值订单
            </button>
            {!parseRechargeAmount(customRaw) && customRaw.trim() !== '' && (
              <p className="mt-1.5 text-[11px] text-warning">金额需在 ¥{RECHARGE_MIN} - ¥{RECHARGE_MAX} 之间</p>
            )}
          </div>
        )}

        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          充值单用支付宝/微信/USDT 付款，到账后自动进入余额；支付宝类通道按页面标示收取渠道手续费。
        </p>

        {/* 就地收银：订单已创建 + 选择支付方式，全程不离开本页 */}
        {rechargeAmount !== null && (
          <RechargePanel principal={rechargeAmount} onClose={() => setRechargeAmount(null)} />
        )}
      </div>

      {/* 流水 */}
      {wallet.transactions.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <History size={12} /> 最近流水
          </p>
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
                    <span className={`font-mono font-semibold ${meta.positive ? 'text-success' : 'text-foreground'}`}>
                      {meta.positive ? '+' : ''}{Number(t.amount).toFixed(2)}
                    </span>
                    <span className="ml-2 text-[10px] text-muted-foreground">{fmtTime(t.created_at)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          {wallet.transactions.length > 5 && (
            <button onClick={() => setShowAll((v) => !v)}
              className="mt-2 text-[11px] text-primary hover:underline">
              {showAll ? '收起' : `查看全部 ${wallet.transactions.length} 条`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
