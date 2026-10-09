// 个人中心内联充值收银面板：建单 → 选通道 → 出码/跳转/展示地址，全程不离开本页。
// ⚠️ 用户明确要求：点固定金额不再跳转商品页，就地出现「订单已创建 + 选择支付方式」。
// 紧耦合子状态（建单、改通道、倒计时）全部内联本文件；通道卡片配色与结算页共用 pay-channels 表。
import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Loader2, QrCode, Wallet, Coins, MessageCircle, TimerOff, Copy, Check, X, PiggyBank, ShieldCheck, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useSiteSettings } from '@/lib/queries';
import { PayCountdownBar } from '@/components/PayCountdownBar';
import { loadBuyerInfo } from '@/lib/buyer-vault';
import { createRechargeOrder, RECHARGE_MIN, RECHARGE_MAX } from '@/lib/recharge';
import { requestCaptcha, type CaptchaChallenge } from '@/lib/order-captcha';
import { PAY_CHANNELS, CASHIER_PATH, cashierSearch, isChannelConfigured, feeSuffixOf, CHANNEL_CARD_BASE, TONE_TEXT, type PayChannel } from '@/lib/pay-channels';
import { parseRateLimitSeconds, useCountdownSeconds, fallbackRateLimitSeconds, fmtMinSec } from '@/lib/rate-limit';
import { switchOrderChannel, calcPayable, effectiveFeeRate, invalidateWallet } from '@/lib/wallet';
import { useAuthSession } from '@/hooks/use-auth-session';

const ICON_MAP = { qrcode: QrCode, message: MessageCircle, wallet: Wallet, coins: Coins, piggybank: PiggyBank } as const;

export function RechargePanel({ principal, onClose }: {
  /** 充值本金（元），即到账进余额的金额 */
  principal: number;
  /** 关闭面板（取消未付充值单时由父级收起） */
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuthSession();
  const { data: settings } = useSiteSettings();
  const feeRate = effectiveFeeRate(settings?.billing);

  const [creating, setCreating] = useState(true);
  /** 人机校验题面与答案：⚠️ 服务端 order_create 对充值单同样强制校验，缺这一环会导致点档位永远建不成单 */
  const [captcha, setCaptcha] = useState<CaptchaChallenge | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(false);
  /** 频控拦截后的解禁时刻（epoch ms）：面板不再直接收起，而是就地显示倒计时重试按钮 */
  const [throttleUntil, setThrottleUntil] = useState(0);
  const throttleLeft = useCountdownSeconds(throttleUntil);
  /** 建单失败原因（非频控时沿用旧的「请重新点击金额重试」提示） */
  const [createError, setCreateError] = useState<string | null>(null);
  const [orderNo, setOrderNo] = useState('');
  /** 当前应付金额：建单时为本金，选定支付宝类通道后含手续费 */
  const [amount, setAmount] = useState(principal);
  const [channel, setChannel] = useState<'choose' | PayChannel>('choose');
  const [switching, setSwitching] = useState(false);
  const [expired, setExpired] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  /** 建单成功时刻起算 30 分钟，与服务端 order_create 的 NOW() + 30 minutes 同口径 */
  const [expiresAt] = useState<string>(() => new Date(Date.now() + 30 * 60_000).toISOString());

  async function copyValue(key: string, value: string) {
    if (!value) return;
    let ok = false;
    try { await navigator.clipboard.writeText(value); ok = true; } catch { ok = false; }
    console.log('[RechargePanel] copy', { key, ok });
    if (ok) { setCopied(key); setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600); }
    else toast.error('复制失败，请长按文字手动复制');
  }

  const captchaOn = settings?.captcha?.enabled !== false;

  async function loadCaptcha() {
    setCaptchaLoading(true);
    try {
      const c = await requestCaptcha();
      console.log('[RechargePanel] captcha loaded', { hasChallenge: Boolean(c) });
      setCaptcha(c);
      setCaptchaAnswer('');
    } catch (err) {
      console.error('[RechargePanel] captcha load failed:', err);
      setCaptcha(null);
      toast.error('验证码加载失败，请点击「换码」重试');
    } finally {
      setCaptchaLoading(false);
    }
  }

  async function tryCreate() {
    setCreating(true);
    setCreateError(null);
    // 建单前必须有人机校验凭证：服务端 order_create 对充值单同样强制核验，缺了会被拒成「请先完成安全验证码校验」
    if (captchaOn && !captcha) {
      console.warn('[RechargePanel] 验证码尚未就绪，暂不建单');
      setCreating(false);
      return;
    }
    const r = await createRechargeOrder(principal, user?.email ?? null, captcha ? { id: captcha.id, answer: captchaAnswer.trim().toUpperCase() } : null);
    if (r.ok) {
      setOrderNo(r.orderNo);
      setAmount(r.amount);
      setThrottleUntil(0);
      setCreating(false);
      return;
    }
    console.error('[RechargePanel] 充值建单失败', r.message);
    // 频控拦截 → 就地显示倒计时重试按钮，不收起面板（收起会让用户以为充值功能坏了）
    const secs = parseRateLimitSeconds(r.message);
    if (secs !== null) {
      setThrottleUntil(Date.now() + secs * 1000);
      setCreateError(r.message);
      toast.warning(`下单太频繁了，请 ${secs} 秒后再充值`);
    } else {
      setCreateError(r.message || '充值订单创建失败');
      toast.error(r.message || '充值订单创建失败');
      // 验证码是一次性凭证，答错/过期后必须换新题，否则重试永远撞同一道墙
      if (captchaOn) void loadCaptcha();
    }
    setCreating(false);
  }

  // 挂载即拉题：拿到题面才允许建单，避免用户点档位后被服务端一句「请先完成安全验证码校验」卡死
  useEffect(() => {
    if (settings && captchaOn) void loadCaptcha();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.captcha?.enabled]);

  // 题目就绪后再建单：首帧 settings 未到位时先等，避免拿不到开关就盲发请求
  const createGuard = !settings ? 'pending' : captchaOn ? (captcha ? 'ready' : 'waiting') : 'no-captcha';
  useEffect(() => {
    if (createGuard === 'ready' || createGuard === 'no-captcha') void tryCreate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createGuard]);

  /** 频控文案解析失败时的兜底秒数，与服务端 cap_window_seconds × cap_window_unit 同口径 */
  const retrySecs = fallbackRateLimitSeconds(settings?.captcha?.cap_window_seconds, settings?.captcha?.cap_window_unit);

  const pickable = PAY_CHANNELS.filter((c) => c.id !== 'balance' && isChannelConfigured(c.id, settings?.payment));

  async function handlePick(c: PayChannel) {
    if (!orderNo) return;
    console.log('[RechargePanel] pick channel', { order: orderNo, channel: c });
    // USDT 为纯展示地址、不加手续费也不改单
    if (c === 'usdt') { setChannel('usdt'); return; }
    setSwitching(true);
    try {
      const r = await switchOrderChannel(orderNo, c, loadBuyerInfo()?.pwHash ?? null);
      console.log('[RechargePanel] switch', { ok: r.ok, amount: r.amount, msg: r.message });
      if (!r.ok) { toast.error(r.message); return; }
      setAmount(r.amount || amount);
      setChannel(c);
    } finally {
      setSwitching(false);
    }
  }

  const usdt = settings?.payment?.usdt;
  const feeOf = (c: PayChannel) => calcPayable(principal, 0, c, feeRate).fee;

  return (
    <div className="mt-4 rounded-xl border border-primary/25 bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-sm font-bold text-foreground">
          <PiggyBank size={14} className="text-primary" /> 充值 ¥{principal.toFixed(2)}
        </p>
        <button onClick={onClose} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground">
          <X size={13} /> 取消
        </button>
      </div>

      {creating && (
        <p className="mt-4 inline-flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 size={13} className="animate-spin" />
          {createGuard === 'waiting' ? '正在生成安全验证码…' : '正在创建充值订单…'}
        </p>
      )}

      {/* 人机安全校验：与结算页同一套题面，凭证一次性有效，建单前必须先答对 */}
      {!creating && !orderNo && captchaOn && (
        <div className="mt-4 rounded-lg border border-primary/25 bg-primary/5 p-4">
          <p className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <ShieldCheck size={13} className="text-primary" /> 安全校验
          </p>
          {captcha ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <span className="select-none rounded-lg border border-border bg-input px-4 py-2.5 text-center font-mono text-2xl font-bold tracking-[0.35em] text-foreground">
                {captcha.prompt}
              </span>
              <div className="flex flex-1 items-center gap-2">
                <input value={captchaAnswer} onChange={(e) => setCaptchaAnswer(e.target.value)}
                  placeholder="输入上方验证码" autoComplete="off" autoCapitalize="characters"
                  className="w-full rounded-lg border border-border bg-input px-3.5 py-2.5 text-sm uppercase text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
                <button type="button" onClick={() => void loadCaptcha()} disabled={captchaLoading} title="换一个验证码"
                  className="inline-flex h-[42px] shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-60">
                  <RefreshCw size={13} className={captchaLoading ? 'animate-spin' : ''} /> 换码
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{captchaLoading ? '正在生成验证码…' : '验证码加载失败，请点击「换码」重试'}</p>
          )}
          <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
            请输入左侧方框内的 4 位字符（不区分大小写），填好后点下方按钮即可创建充值订单。
          </p>
          <button type="button" disabled={captchaLoading || !captcha || throttleLeft > 0}
            onClick={() => void tryCreate()}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60">
            {throttleLeft > 0 ? `请 ${fmtMinSec(throttleLeft)}后重试` : '确认并创建充值订单'}
          </button>
        </div>
      )}

      {!creating && !orderNo && createError && (
        <div className="mt-4 rounded-lg border border-warning/30 bg-warning/5 p-4">
          <p className="inline-flex items-center gap-2 text-xs font-semibold text-warning">
            <TimerOff size={13} /> {createError}
          </p>
          <button type="button" disabled={throttleLeft > 0 || retrySecs <= 0} onClick={() => void tryCreate()}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60">
            {throttleLeft > 0 ? <TimerOff size={14} /> : null}
            {throttleLeft > 0 ? `请 ${fmtMinSec(throttleLeft)}后重试` : '重新创建充值订单'}
          </button>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            倒计时结束后按钮会自动恢复可点，无需刷新页面；也可以直接取消，稍后再来充值。
          </p>
        </div>
      )}

      {!creating && orderNo && (
        <>
          <div className="mt-3 space-y-2 rounded-lg border border-border bg-card px-4 py-3 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="shrink-0 text-muted-foreground">订单号</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="font-mono text-foreground">{orderNo}</span>
                <button onClick={() => void copyValue('no', orderNo)} className="text-muted-foreground hover:text-foreground transition-colors">
                  {copied === 'no' ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                </button>
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">当前应付</span>
              <span className="font-mono font-bold text-primary">¥{amount.toFixed(2)}</span>
            </div>
            <PayCountdownBar expiresAt={expiresAt} onExpired={() => setExpired(true)} />
          </div>

          {expired ? (
            <div className="mt-4 rounded-lg border border-danger/30 bg-danger/5 p-4 text-center">
              <TimerOff size={22} className="mx-auto mb-2 text-danger" />
              <p className="text-sm font-semibold text-foreground">充值订单已超时关闭</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">超过 30 分钟未完成付款，系统已自动关闭。如需充值请重新点击金额。</p>
            </div>
          ) : (
            <>
              {channel === 'choose' && (
                <div className="mt-4">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">选择支付方式</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {pickable.map((c) => {
                      const Icon = ICON_MAP[c.icon];
                      const f = feeOf(c.id);
                      return (
                        <button key={c.id} disabled={switching} onClick={() => void handlePick(c.id)} className={CHANNEL_CARD_BASE}>
                          <span className="inline-flex flex-wrap items-center gap-2 text-sm font-bold text-foreground">
                            <Icon size={15} className={TONE_TEXT[c.tone]} /> {c.label}
                            <span className={`text-[11px] font-semibold ${c.hasFee ? 'text-warning' : 'text-success'}`}>{feeSuffixOf(c.id, feeRate)}</span>
                          </span>
                          <span className="text-[11px] leading-relaxed text-muted-foreground">{c.desc}</span>
                          {c.hasFee && (
                            <span className="text-[11px] text-muted-foreground">本单需支付 ¥{(principal + f).toFixed(2)}（含手续费 ¥{f.toFixed(2)}）</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                    付款成功后余额自动到账；支付宝类通道按页面标示收取渠道手续费（¥{RECHARGE_MIN} - ¥{RECHARGE_MAX} 可充），实际到账金额仍为本金 ¥{principal.toFixed(2)}。
                  </p>
                </div>
              )}

              {channel === 'alipay' && (
                <div className="mt-4 space-y-3">
                  <div className="rounded-lg border border-border bg-card p-4">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      支付宝1使用你在后台单独设置的收款码/收款链接。完成付款后请按页面提示保留订单号；店主在后台核实到账并确认充值后，余额才会入账。当前开发分支未接入该静态收款方式的自动对账。
                    </p>
                    <button onClick={() => void navigate({ to: '/pay/alipay-qr', search: { order: orderNo, amount: String(amount), channel: 'alipay' } as never })}
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover">
                      前往支付宝1付款
                    </button>
                  </div>
                  <button onClick={() => setChannel('choose')} className="text-xs text-muted-foreground hover:text-foreground transition-colors">← 更换支付方式</button>
                </div>
              )}

              {(channel === 'alipay_qr' || channel === 'alipay_manual' || channel === 'wechat') && (
                <div className="mt-4 space-y-3">
                  <div className="rounded-lg border border-border bg-card p-4">
                    <p className="text-xs leading-relaxed text-muted-foreground">点击下方按钮进入独立收银页，按页面展示的收款码与精确金额付款并备注订单号，店主核账后余额自动到账。</p>
                    <button onClick={() => void navigate({ to: CASHIER_PATH[channel]!, search: cashierSearch(channel, orderNo, amount) as never })}
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover active:scale-[0.99]">
                      前往收银页付款 ¥{amount.toFixed(2)}
                    </button>
                  </div>
                  <button onClick={() => setChannel('choose')} className="text-xs text-muted-foreground hover:text-foreground transition-colors">← 更换支付方式</button>
                </div>
              )}

              {channel === 'usdt' && (
                <div className="mt-4 space-y-3">
                  {usdt?.address ? (
                    <div className="rounded-lg border border-border bg-card p-4">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-warning">USDT · {usdt.network || 'TRC20'}</p>
                      <p className="break-all font-mono text-xs leading-relaxed text-foreground select-all">{usdt.address}</p>
                      <button type="button" onClick={() => void copyValue('usdt', usdt.address!)}
                        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-semibold text-foreground transition-colors hover:border-warning/50">
                        {copied === 'usdt' ? <><Check size={12} className="text-success" /> 地址已复制</> : <><Copy size={12} /> 复制收款地址</>}
                      </button>
                      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                        请按应付 <span className="font-mono text-foreground">¥{amount.toFixed(2)}</span> 折算等值 USDT，通过 TRON（TRC20）网络提币，并备注订单号 {orderNo}。
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-xs text-muted-foreground">店主尚未配置 USDT 收款地址，请改用其他支付方式。</div>
                  )}
                  <button onClick={() => setChannel('choose')} className="text-xs text-muted-foreground hover:text-foreground transition-colors">← 更换支付方式</button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
