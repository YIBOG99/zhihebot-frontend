// 精确金额支付警示：金额带小数时系统才能自动对账识别到账，多付少付都认不出。
// 纯行内展示，无任何浮层（微信内置浏览器红线）。
import { AlertTriangle } from 'lucide-react';

/** 把应付金额拆成整数位与小数位，便于把 .99 这类尾数单独高亮 */
function splitAmount(amount: number) {
  const fixed = amount.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  return { full: fixed, intPart, decPart };
}

export function ExactAmountNotice({ amount }: { amount: number }) {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const { full, intPart, decPart } = splitAmount(amount);

  return (
    <div className="rounded-xl border border-danger/40 bg-danger/8 p-4">
      <p className="flex items-center gap-1.5 text-sm font-bold text-danger">
        <AlertTriangle size={15} className="shrink-0" />
        请务必按精确金额付款
      </p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        本次应付金额为{' '}
        <span className="font-mono text-base font-bold tabular-nums text-foreground">
          ¥{intPart}
          <span className="text-danger">.{decPart}</span>
        </span>
        ，请<b className="text-danger">一分不差</b>地支付这个金额
        {decPart !== '00' && <>（含小数点后两位，不要四舍五入成整数、不要抹零）</>}。
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
        系统依靠这笔<b className="text-foreground">精确金额</b>自动识别你的付款并发卡。
        金额多付或少付都会<b className="text-danger">无法匹配到订单</b>，卡密不会发放，退款处理也需要时间。
      </p>
      <button
        type="button"
        onClick={() => { navigator.clipboard.writeText(full).catch(() => {}); }}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-semibold text-danger transition-colors hover:bg-danger/20 active:scale-[0.98]"
      >
        复制付款金额 {full}
      </button>
    </div>
  );
}
