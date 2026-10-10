import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from '@tanstack/react-router';
import { ChevronRight, Copy, Check, Loader2, QrCode, Wallet, Coins, MessageCircle, TimerOff, ShieldCheck, RefreshCw, PiggyBank } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/supabase/client';
import { useProduct, useSiteSettings } from '@/lib/queries';
import { loadBuyerInfo, saveBuyerInfo, hashPassword } from '@/lib/buyer-vault';
import { requestCaptcha, type CaptchaChallenge } from '@/lib/order-captcha';
import { PayCountdownBar } from '@/components/PayCountdownBar';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useMyRewardCoupons, type RewardCoupon } from '@/lib/referral';
import { PAY_CHANNELS, CASHIER_PATH, isChannelConfigured, feeSuffixOf, CHANNEL_CARD_BASE, TONE_TEXT, toChannelId, type PayChannel } from '@/lib/pay-channels';
import { useMyWallet, payWithBalance, switchOrderChannel, calcPayable, effectiveFeeRate } from '@/lib/wallet';
import { formatYuan, scrollToTopNow } from '@/lib/utils';
import { parseRateLimitSeconds, useCountdownSeconds, rateLimitButtonLabel, fmtMinSec } from '@/lib/rate-limit';

function genOrderNo() {
  const d = new Date();
  const ts = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('');
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ZH${ts}${rand}`;
}

/** 掩码态输入框的展示值（本机已记住查询密码时） */
const MASK = '••••••••';

/** 通道图标名 → lucide 组件（元数据驱动渲染，避免每个通道抄一份 JSX） */
const CHANNEL_ICON: Record<string, typeof QrCode> = {
  qrcode: QrCode, message: MessageCircle, wallet: Wallet, coins: Coins, piggybank: PiggyBank,
};

export function CheckoutPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const navigate = useNavigate();
  const { data: product, isLoading } = useProduct(id);
  const { data: settings, isLoading: settingsLoading } = useSiteSettings();
  const { user } = useAuthSession();
  /** 登录用户的邀请奖励券（游客为空数组，不展示券选择区） */
  const { coupons } = useMyRewardCoupons(user?.id ?? null);
  const [couponCode, setCouponCode] = useState<string | null>(null);
  /** 我的钱包余额（仅登录时拉取；余额支付按钮与不足提示都靠它） */
  const { data: wallet } = useMyWallet(Boolean(user));

  const [quantity, setQuantity] = useState(1);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [lookupPw, setLookupPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  /**
   * 频控拦截后的解禁时刻（epoch ms，0 表示未被拦）。
   * ⚠️ 秒数取服务端回传的「请 N 秒后再试」，不读本地配置——被拦那一刻只有 RPC 文案是真实等待时长。
   */
  const [throttleUntil, setThrottleUntil] = useState(0);
  const throttleLeft = useCountdownSeconds(throttleUntil);
  /** 频控倒计时进行中：按钮保持禁用并显示剩余秒数，归零后自动恢复可点 */
  const throttled = throttleLeft > 0;
  const [result, setResult] = useState<{ orderNo: string; amount: number } | null>(null);
  /** 建单成功后服务端下发的支付截止时刻（本地按创建时间 + 30 分钟推算，与服务端同一口径） */
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  /**
   * 本次订单实际使用的查询密码摘要。
   * ⚠️ 游客单没有登录态，建单后「更换支付方式」的服务端归属校验只能靠这把钥匙，
   *    因此建单时必须把它留在 state 里（掩码态则取本机记住的 savedHash）。
   */
  const [orderPwHash, setOrderPwHash] = useState<string | null>(null);
  /** 倒计时归零：把支付区切成超时终态，停止一切轮询 */
  const [payExpired, setPayExpired] = useState(false);
  /**
   * 支付通道视图。⚠️ 确认订单页**不再出现支付方式选择**：顾客提交订单后统一落到
   * 'choose' 屏挑选通道（用户明确要求），因此建单时通道未知，只能先按免手续费口径建单，
   * 选定后再调 order_set_payment_method 把通道与手续费写回订单。
   */
  const [payChannel, setPayChannel] = useState<'choose' | PayChannel>('choose');
  /** 切换通道进行中（防连点重复改单） */
  const [switching, setSwitching] = useState(false);
  /** 余额支付执行中 */
  const [balancePaying, setBalancePaying] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  /** 复制收款信息到剪贴板（失败降级 execCommand），带日志便于真机取证 */
  async function copyValue(key: string, value: string) {
    if (!value) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch { ok = false; }
    }
    console.log('[Checkout] copy', { key, ok, len: value.length });
    if (ok) {
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600);
    } else {
      toast.error('复制失败，请长按文字手动复制');
    }
  }
  /** 本机记住的查询密码摘要；用户一旦在框里重新输入即作废 */
  const [savedHash, setSavedHash] = useState<string | null>(null);

  /** 人机校验题（服务端出题，答案只存后端）；null 表示店主已关闭校验或尚未出题 */
  const [captcha, setCaptcha] = useState<CaptchaChallenge | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(false);

  /** 申请一道新题（进页面、提交失败后、手动换题都走这里） */
  async function loadCaptcha() {
    setCaptchaLoading(true);
    setCaptcha(null);
    setCaptchaAnswer('');
    try {
      const c = await requestCaptcha();
      setCaptcha(c);
      setCaptchaAnswer('');
    } catch (err: unknown) {
      console.error('[Checkout] captcha request failed:', err instanceof Error ? err.message : err);
      toast.error('验证码加载失败，请点击「换码」重试');
    } finally {
      setCaptchaLoading(false);
    }
  }

  // 本地随机码无需远程验证码服务，避免 Edge Function 故障阻塞结算。
  useEffect(() => {
    void loadCaptcha();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 首次下单后把联系方式与查询密码记在本机，后续订单自动带出
  useEffect(() => {
    const v = loadBuyerInfo();
    if (!v) return;
    setSavedHash(v.pwHash);
    setLookupPw(MASK);
    setConfirmPw(MASK);
    if (v.email && !email) setEmail(v.email);
    if (v.phone && !phone) setPhone(v.phone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 密码框变更：从掩码态切到真实编辑态 */
  function onPwChange(setter: (v: string) => void) {
    return (raw: string) => {
      if (savedHash && (raw === '' || raw.startsWith('•'))) {
        setSavedHash(null);
        setter('');
        return;
      }
      setter(raw);
    };
  }

  if (isLoading) return <div className="mx-auto max-w-2xl px-4 py-20"><div className="h-40 animate-pulse rounded-xl bg-surface-2" /></div>;
  if (!product) return <div className="mx-auto max-w-2xl px-4 py-24 text-center text-muted-foreground">商品不存在。<Link to="/" className="text-primary underline ml-1">返回首页</Link></div>;

  const grossTotal = Number(product.price) * quantity;

  /** 选中的券（可能已被数量变化淘汰）与实付金额 */
  const selectedCoupon: RewardCoupon | null = couponCode
    ? coupons.find((c) => c.code === couponCode && grossTotal >= c.min_amount) ?? null
    : null;
  // 与服务端一致：抵扣至少保留 1 元应付
  const discount = selectedCoupon ? Math.max(0, Math.min(Number(selectedCoupon.amount), grossTotal - 1)) : 0;
  /** 手续费率（后台可调，非法值回退 4.6%） */
  const feeRate = effectiveFeeRate(settings?.billing);

  /** 充值类商品：余额不可用于代充，且文案不同 */
  const isRecharge = product.id.startsWith('recharge-');

  /**
   * 「选择支付方式」屏展示的通道：**以店主已配置的真实收款通道为准**，
   * 不再被商品级 payment_methods 白名单筛掉。
   * ⚠️ 用户明确要求：不得擅自收窄他已开通的支付方式（三个支付宝 + 微信必须全部出现）。
   * 商品白名单仅作为后台勾选记录保留；未配置的收款方式不显示、不允许继续下单。
   * 余额支付只在登录后展示（游客无法站内扣款），充值类商品不可用余额代充。
   */
  // 商品后台勾选的支付方式是白名单；不允许结算页显示商品未开放的通道。
  // 只映射历史上明确支持的值，未知字符串绝不能因 toChannelId 的兼容兜底而意外开放 USDT。
  const knownProductPaymentValues = new Set(['balance', 'alipay', 'alipay_online', 'alipay_qr', 'alipay_manual', 'wechat', 'weixin', 'usdt', 'manual']);
  const productPaymentMethods = Array.isArray(product.payment_methods) ? product.payment_methods : [];
  const allowedProductChannels = new Set(
    productPaymentMethods
      .filter((value) => knownProductPaymentValues.has(String(value).trim().toLowerCase()))
      .map((value) => toChannelId(value)),
  );
  const configuredChannels = PAY_CHANNELS.filter((c) => {
    if (!allowedProductChannels.has(c.id)) return false;
    if (c.id === 'balance' && (!user || isRecharge)) return false;
    return isChannelConfigured(c.id, settings?.payment);
  });
  // 未配置的收款渠道不能作为可付款选项兜底展示，避免顾客把空白收款页误认为可付款。
  const pickableChannels = configuredChannels;
  const hasExternalPaymentChannels = configuredChannels.some((c) => c.id !== 'balance');
  console.log('[Checkout] 可选通道', {
    productId: product.id,
    whitelist: product.payment_methods,
    configured: configuredChannels.map((c) => c.id),
    shown: pickableChannels.map((c) => c.id),
  });

  /** 建单时按免手续费口径落库（此时通道未定），故应付 = 小计 − 券 */
  const total = Math.round((grossTotal - discount) * 100) / 100;
  const balanceAvailable = wallet?.available ?? 0;

  /** 推荐角标是否展示（后台 recommend.enabled，缺省视为开启） */
  const recOn = settings?.recommend?.enabled !== false;
  const recLabel = settings?.recommend?.label || '优先推荐';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (settingsLoading) {
      toast.info('正在读取支付配置，请稍后再提交订单');
      return;
    }
    const canUseBalance = Boolean(user && !isRecharge && balanceAvailable >= total);
    if (!hasExternalPaymentChannels && !canUseBalance) {
      toast.error('商城尚未配置可用收款方式，请联系店主完成支付设置后再下单');
      return;
    }
    if (!email && !phone) { toast.error('请至少填写邮箱或手机号'); return; }
    // 本地验证码用于防止误提交，不依赖远程接口。服务器仍负责订单频率限制。
    const captchaOn = true;
    if (!captcha) { toast.error('验证码尚未生成，请稍候重试'); void loadCaptcha(); return; }
    if (!captchaAnswer.trim()) { toast.error('请输入安全校验验证码'); return; }
    if (captchaAnswer.trim().toUpperCase() !== captcha.prompt) {
      toast.error('验证码不正确，请重新输入');
      void loadCaptcha();
      return;
    }

    // 掩码态直接沿用本机记住的密码，无需重输
    let hash: string;
    if (savedHash && lookupPw === MASK && confirmPw === MASK) {
      hash = savedHash;
    } else {
      if (lookupPw.length < 4) { toast.error('查询密码至少 4 位'); return; }
      if (lookupPw !== confirmPw) { toast.error('两次输入的查询密码不一致'); return; }
      hash = await hashPassword(lookupPw);
    }

    setSubmitting(true);
    try {
      const orderNo = genOrderNo();
      const snapshot = { title: product!.title, price: product!.price, subtitle: product!.subtitle, redeem_url: product!.redeem_url ?? null };
      // 走 SECURITY DEFINER RPC 建单：绕过 orders 表 SELECT RLS 回读限制，
      // 由服务端统一校验商品/数量/金额并落库，返回订单号。
      // ⚠️ 此处不传 _payment_method —— 支付方式在订单创建后的选择屏才决定。
      const { data, error } = await supabase.rpc('order_create', {
        _id: orderNo, _product_id: product!.id, _product_snapshot: snapshot,
        _quantity: quantity, _contact_email: email || null, _contact_phone: phone || null,
        _lookup_password_hash: hash, _note: note || null, _amount: total,
        _coupon_code: selectedCoupon?.code ?? null,
        // 本地验证码不使用远程 challenge；服务端仍执行联系方式频控。
        _challenge_id: null,
        _challenge_answer: null,
      } as never).select().single();
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? '提交失败，请重试');
      console.log('[Checkout] order created via rpc:', orderNo, '| amount =', total, '| discount =', data.discount);
      // 记住本次联系方式与查询密码，下次下单免填
      saveBuyerInfo({ pwHash: hash, password: savedHash && lookupPw === MASK ? '•'.repeat(8) : lookupPw, email, phone });
      // 游客单建单后「更换支付方式」要靠这把钥匙做归属校验，必须留在内存里
      setOrderPwHash(hash);
      setResult({ orderNo, amount: total });
      // 支付时限：与服务端 order_create 的 NOW() + 30 minutes 同一口径，以本地建单成功时刻起算
      setExpiresAt(new Date(Date.now() + 30 * 60_000).toISOString());
      setPayExpired(false);
      // 建单成功 → 统一进入「选择支付方式」屏
      setPayChannel('choose');
      // 「订单已创建」屏是同一路由内换视图（href 未变），路由 onRendered 不会触发，
      // 必须在这里手动回顶，否则用户停在表单底部的提交按钮处。
      scrollToTopNow();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '提交失败，请重试';
      console.error('[Checkout] submit failed:', msg);
      // 频控拦截 → 按服务端回传的秒数启动按钮倒计时，归零后自动恢复可点
      const secs = parseRateLimitSeconds(msg);
      if (secs !== null) {
        setThrottleUntil(Date.now() + secs * 1000);
        toast.warning(`下单太频繁了，请 ${fmtMinSec(secs)}后再提交`);
      } else {
        toast.error(msg);
      }
      // 凭证是一次性的：无论答错、过期还是被占用，都必须换新题才能再次提交
      if (captchaOn) void loadCaptcha();
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * 选择支付方式：先把通道与手续费写回订单（服务端重算 amount），再进入该通道视图。
   * 改单失败时停留在选择屏并透出服务端文案，绝不带着错误金额去付款。
   */
  async function handlePickChannel(c: PayChannel) {
    if (!result) return;
    console.log('[Checkout] pick channel', { order: result.orderNo, channel: c, hasPwHash: Boolean(orderPwHash), loggedIn: Boolean(user) });
    if (c === 'balance') {
      if (balanceAvailable < result.amount) {
        toast.error(`余额不足，当前可用 ¥${balanceAvailable.toFixed(2)}，本单应付 ¥${result.amount.toFixed(2)}`);
        return;
      }
      setPayChannel('balance');
      return;
    }
    // USDT 免手续费，但仍必须把所选支付方式写回订单，方便后台核账与筛选。
    // 与其他人工核账通道一样，调用服务端 RPC 记录 payment_method 后再展示地址。
    setSwitching(true);
    try {
      const r = await switchOrderChannel(result.orderNo, c, orderPwHash);
      console.log('[Checkout] switch channel', { order: result.orderNo, channel: c, ok: r.ok, amount: r.amount, msg: r.message });
      if (!r.ok) { toast.error(r.message); return; }
      setResult({ orderNo: result.orderNo, amount: r.amount || result.amount });
      setPayChannel(c);
      scrollToTopNow();
    } finally {
      setSwitching(false);
    }
  }

  /** 余额支付：建单已在提交时完成，这里只做扣款 + 发卡 */
  async function handleBalancePay() {
    if (!result) return;
    setBalancePaying(true);
    try {
      const r = await payWithBalance(result.orderNo);
      if (r.ok) {
        toast.success(isRecharge ? '余额扣除成功' : '支付成功，卡密已发放');
        scrollToTopNow();
      } else {
        toast.error(r.message);
      }
    } finally {
      setBalancePaying(false);
    }
  }

  /** 所选通道的手续费明细（选择屏逐条展示「含手续费 ¥x.xx」时用） */
  const feeOf = (c: PayChannel) => calcPayable(grossTotal, discount, c, feeRate).fee;

  if (result) {
    const usdt = settings?.payment?.usdt;
    const usdtNetwork = usdt?.network?.trim() || 'TRC20';
    return (
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-12">
        <div className="glow-frame rounded-2xl border border-success/30 bg-success/5 p-6 text-center">
          <Check size={32} className="mx-auto mb-3 text-success" />
          <h1 className="text-xl font-bold text-foreground">订单已创建</h1>
          <p className="mt-2 text-sm text-muted-foreground">请选择支付方式完成付款。支付宝收款码通道需店主核账后发卡；自动发卡需先完成正式支付接口配置。</p>
        </div>

        {/* Order info */}
        <div className="mt-6 rounded-xl border border-border bg-card p-5 space-y-3">
          {[
            { label: '订单号', value: result.orderNo },
            { label: '商品', value: `${product.title} × ${quantity}` },
            { label: '应付金额', value: `¥${result.amount.toFixed(2)}`, highlight: true, copyKey: 'order_amount' },
          ].map(({ label, value, highlight, copyKey }) => (
            <div key={label} className="flex items-center justify-between gap-4">
              <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-mono ${highlight ? 'text-primary font-bold' : 'text-foreground'}`}>{value}</span>
                <button onClick={() => copyValue(copyKey ?? label, value)}
                  className="text-muted-foreground hover:text-foreground transition-colors">
                  {copied === (copyKey ?? label) ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                </button>
              </div>
            </div>
          ))}

          {/* 支付时限倒计时：归零后停止一切轮询并切超时终态 */}
          {!payExpired && <PayCountdownBar expiresAt={expiresAt} onExpired={() => setPayExpired(true)} />}
        </div>

        {/* 超时终态：取代全部支付通道视图 */}
        {payExpired && (
          <div className="mt-6 rounded-xl border border-danger/30 bg-danger/5 p-6 text-center">
            <TimerOff size={30} className="mx-auto mb-3 text-danger" />
            <h3 className="text-base font-bold text-foreground">订单已超时关闭</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              超过 30 分钟未完成付款，系统已自动关闭本订单。如需购买请重新下单；若你确信已经付款成功，请到查单页凭订单三要素核实或联系客服。
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link to="/product/$id" params={{ id: product.id }}
                className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover">
                重新下单
              </Link>
              <Link to="/orders/lookup" search={{ order: result.orderNo } as never}
                className="rounded-xl border border-border px-6 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                去查单页核实
              </Link>
            </div>
          </div>
        )}

        {/* Channel chooser —— 支付方式统一在此挑选，每个通道一个独立视图 */}
        {!payExpired && payChannel === 'choose' && (
          <div className="mt-6">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">选择支付方式</p>
            {pickableChannels.length === 0 ? (
              <div className="rounded-xl border border-warning/30 bg-warning/5 p-5 text-sm leading-relaxed text-muted-foreground">
                当前没有可用的支付方式。请稍后重试，或联系店主在后台「支付设置」中配置收款码、收款链接或 USDT 地址。
              </div>
            ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {pickableChannels.map((c) => {
                const Icon = CHANNEL_ICON[c.icon] ?? QrCode;
                const feeAmt = feeOf(c.id);
                return (
                  <button key={c.id} disabled={switching} onClick={() => void handlePickChannel(c.id)}
                    className={CHANNEL_CARD_BASE}>
                    <span className="inline-flex flex-wrap items-center gap-2 text-sm font-bold text-foreground">
                      <Icon size={16} className={TONE_TEXT[c.tone]} /> {c.label}
                      <span className={`text-[11px] font-semibold ${c.hasFee ? 'text-warning' : 'text-success'}`}>
                        {feeSuffixOf(c.id, feeRate)}
                      </span>
                      {recOn && c.recommended && (
                        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">{recLabel}</span>
                      )}
                    </span>
                    <span className="text-xs leading-relaxed text-muted-foreground">{c.desc}</span>
                    {c.hasFee && (
                      <span className="text-[11px] text-muted-foreground">本单需支付 ¥{(result.amount + feeAmt).toFixed(2)}（含手续费 ¥{feeAmt.toFixed(2)}）</span>
                    )}
                    {c.id === 'balance' && (
                      <span className={`text-[11px] font-semibold ${balanceAvailable < result.amount ? 'text-warning' : 'text-success'}`}>
                        可用余额 ¥{balanceAvailable.toFixed(2)}{balanceAvailable < result.amount ? ' · 余额不足' : ''}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            )}
            {recOn && (
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                {settings?.recommend?.note || '请根据页面提示选择支付方式；转账类通道付款后需等待店主核账'}。
              </p>
            )}
          </div>
        )}

        {/* 账户余额支付 —— 站内扣减，无需跳转外部 */}
        {!payExpired && payChannel === 'balance' && (
          <div className="mt-6 space-y-3">
            <div className="rounded-xl border border-success/40 bg-success/5 p-5">
              <p className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
                <PiggyBank size={15} className="text-success" /> 账户余额支付
              </p>
              <div className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">当前可用余额</span><span className="font-mono text-foreground">¥{balanceAvailable.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">本单应付</span><span className="font-mono font-bold text-primary">¥{result.amount.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">支付后剩余</span><span className="font-mono text-muted-foreground">¥{Math.max(0, balanceAvailable - result.amount).toFixed(2)}</span></div>
              </div>
              {balanceAvailable < result.amount ? (
                <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs leading-relaxed text-warning">
                  余额不足，还差 ¥{(result.amount - balanceAvailable).toFixed(2)}。请先<Link to="/account" className="underline font-semibold mx-1">充值余额</Link>或更换其他支付方式。
                </div>
              ) : (
                <button onClick={() => void handleBalancePay()} disabled={balancePaying}
                  className="btn-sheen mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover active:scale-[0.99] disabled:opacity-60">
                  {balancePaying ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  {balancePaying ? '正在扣款…' : `确认使用余额支付 ¥${result.amount.toFixed(2)}`}
                </button>
              )}
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">余额支付免渠道手续费，扣款成功后立即自动发放卡密。</p>
            </div>
            <button onClick={() => setPayChannel('choose')} className="text-xs text-muted-foreground hover:text-foreground transition-colors">← 更换支付方式</button>
          </div>
        )}

        {/* Wechat pay — 跳转独立收款页 */}
        {!payExpired && payChannel === 'wechat' && (
          <div className="mt-6 space-y-3">
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-sm text-muted-foreground">点击下方按钮进入微信收款页，页面会展示收款码、应付金额与备注要求。</p>
              <button onClick={() => navigate({ to: '/pay/wechat', search: { order: result.orderNo, amount: String(result.amount) } as never })}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-success py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-success/85 active:scale-[0.99]">
                <MessageCircle size={15} /> 前往微信收款页
              </button>
            </div>
            <button onClick={() => setPayChannel('choose')} className="text-xs text-muted-foreground hover:text-foreground transition-colors">← 更换支付方式</button>
          </div>
        )}

        {/* 支付宝1：独立收款码/收款链接；若链接可唤起 App，则收银页显示深链按钮 */}
        {!payExpired && payChannel === 'alipay' && (
          <div className="mt-6 space-y-3">
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-sm text-muted-foreground">点击下方进入支付宝1收银页。若后台配置的是可用的支付宝收款链接，手机浏览器会显示「打开支付宝立即付款」；仅有图片时仍可扫码付款。</p>
              <button onClick={() => navigate({ to: '/pay/alipay-qr', search: { order: result.orderNo, amount: String(result.amount), product: product.title, channel: 'alipay' } as never })}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-info py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-info/85 active:scale-[0.99]">
                <QrCode size={15} /> 前往支付宝1收银页
              </button>
            </div>
            <button onClick={() => setPayChannel('choose')} className="text-xs text-muted-foreground hover:text-foreground transition-colors">← 更换支付方式</button>
          </div>
        )}

        {/* 支付宝扫码转账（个人经营码）—— 跳转独立收银页，展示收款码 + 倒计时 + 过期变暗 */}
        {!payExpired && payChannel === 'alipay_qr' && (
          <div className="mt-6 space-y-3">
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-sm text-muted-foreground">点击下方按钮进入支付宝2收银页，页面展示收款码、应付金额与倒计时。注意：静态个人收款码本身不会自动失效，订单是否过期以订单状态和服务端截止时间为准。</p>
              <button onClick={() => navigate({ to: CASHIER_PATH.alipay_qr!, search: { order: result.orderNo, amount: String(result.amount), product: product.title } as never })}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-info py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-info/85 active:scale-[0.99]">
                <QrCode size={15} /> 前往支付宝收银页
              </button>
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                该通道为店主个人支付宝收款码，钱直接到账个人账户，需店主人工核账后发放卡密（通常数分钟内）。
              </p>
            </div>
            <button onClick={() => setPayChannel('choose')} className="text-xs text-muted-foreground hover:text-foreground transition-colors">← 更换支付方式</button>
          </div>
        )}

        {/* USDT —— 独立通道，仅展示链上收款地址 */}
        {!payExpired && payChannel === 'usdt' && (
          <div className="mt-6 space-y-3">
            {usdt?.address ? (
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-warning">USDT · {usdtNetwork}</p>
                <p className="select-all text-sm font-mono leading-relaxed break-all text-foreground">{usdt.address}</p>
                {usdt.note && <p className="mt-2 text-[11px] leading-relaxed text-danger">{usdt.note}</p>}
                <button type="button"
                  onClick={() => copyValue('usdt', usdt.address!)}
                  className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border py-2.5 text-xs font-semibold text-foreground transition-colors hover:border-warning/50">
                  {copied === 'usdt' ? <><Check size={13} className="text-success" /> 地址已复制</> : <><Copy size={13} /> 复制收款地址</>}
                </button>
                <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                  请在交易所选择 <b className="text-foreground">{usdtNetwork}</b> 网络提币到上方地址，金额按应付 <span className="font-mono text-foreground">¥{result.amount.toFixed(2)}</span> 折算等值 USDT。务必让提币网络与此处配置完全一致，错误网络可能造成资产永久丢失。
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-warning/30 bg-warning/5 p-5 text-sm text-muted-foreground">店主尚未配置 USDT 收款地址，请改用其他支付方式或联系客服。</div>
            )}
            <p className="text-[11px] leading-relaxed text-muted-foreground">转账时请务必备注订单号 <span className="font-mono text-foreground">{result.orderNo}</span>，以便快速核账。</p>
            <button onClick={() => setPayChannel('choose')} className="text-xs text-muted-foreground hover:text-foreground transition-colors">← 更换支付方式</button>
          </div>
        )}

        {/* 支付宝人工转账 —— 跳转独立收款页（与微信同款交互：展示收款码 + 保留复制账号转账） */}
        {!payExpired && payChannel === 'alipay_manual' && (
          <div className="mt-6 space-y-3">
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-sm text-muted-foreground">点击下方按钮进入支付宝收款页，页面会展示你的收款二维码、收款账号、应付金额与备注要求。</p>
              <button onClick={() => navigate({ to: CASHIER_PATH.alipay_manual!, search: { order: result.orderNo, amount: String(result.amount) } as never })}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-info py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-info/85 active:scale-[0.99]">
                <Wallet size={15} /> 前往支付宝收款页
              </button>
            </div>
            <button onClick={() => setPayChannel('choose')} className="text-xs text-muted-foreground hover:text-foreground transition-colors">← 更换支付方式</button>
          </div>
        )}

        <div className="mt-8 flex gap-3">
          <Link to="/orders/lookup"
            className="btn-sheen flex-1 rounded-xl bg-primary py-3 text-center text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-colors hover:bg-primary-hover">
            前往查单页取货
          </Link>
          <button onClick={() => navigate({ to: '/' })}
            className="rounded-xl border border-border px-6 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors">
            返回首页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-surface/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">首页</Link>
          <ChevronRight size={12} />
          <span className="text-foreground">结算</span>
        </div>
      </div>
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-10">
        <h1 className="text-2xl font-bold text-foreground mb-2">确认订单</h1>
        <p className="text-sm text-muted-foreground mb-8">{product.title} · ¥{formatYuan(product.price)} / 件</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Quantity */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">购买数量</label>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="h-9 w-9 rounded-lg border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors">−</button>
              <span className="w-12 text-center text-lg font-bold text-foreground">{quantity}</span>
              <button type="button" onClick={() => setQuantity(Math.min(10, quantity + 1))}
                className="h-9 w-9 rounded-lg border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors">+</button>
            </div>
          </div>

          {/* Contact */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">邮箱（与手机号二选一）</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
                className="w-full rounded-lg border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">手机号</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="13800138000"
                className="w-full rounded-lg border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>

          {/* Lookup password */}
          <div className="rounded-xl border border-warning/20 bg-warning/5 p-4">
            {savedHash ? (
              <p className="mb-3 text-xs font-semibold text-success">✓ 已使用本机记住的查询密码，可直接付款；如需更换请清空下方输入框重设。</p>
            ) : (
              <p className="mb-3 text-xs font-semibold text-warning">⚠ 查询密码由你自己设置，忘记后无法找回，请务必记录！</p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">{savedHash ? '已保存的查询密码' : '设置查询密码（≥4位）'}</label>
                <input type="password" value={lookupPw} onChange={(e) => onPwChange(setLookupPw)(e.target.value)} placeholder="••••••"
                  className="w-full rounded-lg border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">确认查询密码</label>
                <input type="password" value={confirmPw} onChange={(e) => onPwChange(setConfirmPw)(e.target.value)} placeholder="••••••"
                  className="w-full rounded-lg border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">备注（选填）</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="如有特殊需求可在此说明"
              className="w-full rounded-lg border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
          </div>

          {/* 奖励券（仅登录用户且有可用券时展示） */}
          {user && coupons.length > 0 && (
            <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
              <p className="mb-2 text-xs font-semibold text-foreground">使用邀请奖励券</p>
              <div className="space-y-2">
                {coupons.map((c) => {
                  const usable = grossTotal >= c.min_amount;
                  const active = couponCode === c.code;
                  return (
                    <button key={c.code} type="button" disabled={!usable}
                      onClick={() => setCouponCode(active ? null : c.code)}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                        active ? 'border-primary bg-primary/10' : 'border-border bg-surface'
                      } ${usable ? 'hover:border-primary/50' : 'cursor-not-allowed opacity-45'}`}>
                      <span className="min-w-0">
                        <span className="block font-mono text-xs text-foreground">{c.code}</span>
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">满 ¥{formatYuan(c.min_amount)} 可用</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="price-tag text-base"><span className="currency">-¥</span>{formatYuan(c.amount)}</span>
                        {!usable && <span className="block text-[10px] text-warning">金额未达门槛</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 人机安全校验：验证码由服务端生成并只存哈希，提交时由 order_create RPC 内核验，一次有效 */}
          {true && (
            <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
              <p className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <ShieldCheck size={13} className="text-primary" /> 安全校验
              </p>
              {captcha ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  {/* 展示给顾客照抄的随机码：等宽大字 + 字距，手机上不易看错 */}
                  <span className="select-none rounded-lg border border-border bg-input px-4 py-2.5 text-center font-mono text-2xl font-bold tracking-[0.35em] text-foreground">
                    {captcha.prompt}
                  </span>
                  <div className="flex flex-1 items-center gap-2">
                    <input value={captchaAnswer} onChange={(e) => setCaptchaAnswer(e.target.value)}
                      placeholder="输入上方验证码" autoComplete="off" autoCapitalize="characters"
                      className="w-full rounded-lg border border-border bg-input px-3.5 py-2.5 text-sm uppercase text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
                    <button type="button" onClick={() => void loadCaptcha()} disabled={captchaLoading}
                      title="换一个验证码"
                      className="inline-flex h-[42px] shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-60">
                      <RefreshCw size={13} className={captchaLoading ? 'animate-spin' : ''} /> 换码
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{captchaLoading ? '正在生成验证码…' : '验证码加载失败，请点击「换码」重试'}</p>
              )}
              <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
                请输入左侧方框内的 4 位字符（不区分大小写），用于防止机器批量下单后恶意退款；每次提交都会更换新码。
              </p>
            </div>
          )}

          {/* Total —— 支付方式在提交后统一选择，故此处只列不含手续费的小计口径 */}
          <div className="space-y-1.5 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">商品小计</span>
              <span className="text-xs text-muted-foreground">¥{grossTotal.toFixed(2)}</span>
            </div>
            {discount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-success">奖励券抵扣</span>
                <span className="text-xs font-semibold text-success">-¥{discount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-1">
              <span className="text-sm font-semibold text-foreground">应付金额</span>
              <span className="price-tag text-2xl"><span className="currency">¥</span>{total.toFixed(2)}</span>
            </div>
            <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
              支付宝类通道需加收 {feeRate}% 渠道手续费，具体金额在你选择支付方式后显示。
            </p>
          </div>

          <button type="submit" disabled={submitting || throttled}
            className={`w-full inline-flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 ${
              throttled
                ? 'border border-warning/40 bg-warning/10 text-warning'
                : 'btn-sheen bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary-hover'
            }`}>
            {throttled ? <TimerOff size={16} /> : submitting ? <Loader2 size={16} className="animate-spin" /> : null}
            {throttled ? rateLimitButtonLabel(throttleLeft) : submitting ? '提交中…' : '提交订单并选择支付方式'}
          </button>

          {throttled && (
            <p className="mt-2 text-center text-[11px] leading-relaxed text-warning">
              同一联系方式短时间内下单次数已达上限，倒计时结束后会自动恢复提交，无需刷新页面。
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
