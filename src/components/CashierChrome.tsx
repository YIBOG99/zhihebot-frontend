// 浅色收银台（.cashier-light 作用域）的三个公共外壳件：蓝头、大红金额、大号倒计时。
// 三个收款页（支付宝扫码转账 / 支付宝人工转账 / 微信收款码）共用，保证观感一模一样；
// 想调整收银台风格只改这里，不要在各页面各抄一份。
import type { ReactNode } from 'react';

/** 蓝色实心头 + 右侧状态胶囊：白底收银页用支付宝品牌蓝做实心头 */
export function CashierHeader({ title, icon, expired }: { title: string; icon: ReactNode; expired: boolean }) {
  return (
    <div className="bg-info">
      <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-4">
        <span className="inline-flex items-center gap-2 text-base font-bold text-white">
          {icon} {title}
        </span>
        <span
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold ${
            expired ? 'bg-white/20 text-white' : 'bg-warning text-white'
          }`}
        >
          {expired ? '已过期' : '待支付'}
        </span>
      </div>
    </div>
  );
}

/** 应付金额：红色超大字，手机端一眼看到要付多少 */
export function CashierAmount({ amount, label }: { amount: number; label?: string }) {
  return (
    <div className="text-center">
      <p className="text-sm text-muted-foreground">{label ? `${label} · 应付金额` : '应付金额'}</p>
      <p className="mt-1.5 text-[44px] leading-tight font-extrabold tabular-nums text-danger sm:text-5xl">
        <span className="mr-0.5 align-baseline text-3xl">¥</span>
        {amount.toFixed(2)}
      </p>
    </div>
  );
}

/**
 * 大号红字倒计时：remainText 由父级按服务端 expires_at 算差值传入，不受本机时钟影响。
 * limitMinutes 仅用于文案说明本通道时限，实际关单仍由后端决定。
 */
export function CashierCountdown({ remainText, limitMinutes }: { remainText: string; limitMinutes: number }) {
  return (
    <div className="mt-5 text-center">
      <p className="text-xs text-muted-foreground">请在以下时间内完成支付，超时订单将自动关闭</p>
      <div className="mt-1.5 flex items-baseline justify-center gap-2">
        <span className="text-3xl font-extrabold tabular-nums text-danger">{remainText}</span>
        <span className="text-xs text-muted-foreground">后失效</span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">本通道支付时限 {limitMinutes} 分钟</p>
    </div>
  );
}
