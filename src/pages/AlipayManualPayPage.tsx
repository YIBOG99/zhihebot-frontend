import { useState, useEffect } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { Copy, Check, Wallet, AlertCircle, ExternalLink, ShieldCheck } from 'lucide-react';
import { supabase } from '@/supabase/client';
import { useSiteSettings } from '@/lib/queries';
import { ExactAmountNotice } from '@/components/ExactAmountNotice';
import { QrExpiryFrame } from '@/components/QrExpiryFrame';
import { CashierHeader, CashierAmount, CashierCountdown } from '@/components/CashierChrome';
import { isAlipayPayLink, jumpToAlipayApp } from '@/lib/alipay-deeplink';

/** mm:ss 文本，超过一小时按分钟累计显示 */
function fmtRemain(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** 订单在收款页需要的字段：支付截止时刻 + 状态（用于过期判定） */
interface OrderTimer {
  expires_at: string | null;
  status: string;
}

/** 本通道支付时限（分钟）：沿用后端 30 分钟口径，只有个人经营码那条单独收紧到 10 分钟 */
const CASHIER_LIMIT_MIN = 30;

/**
 * 支付宝人工转账落地页：展示店主收款码 + 收款账号 + 应付金额 + 转账备注要求。
 * 视觉与「支付宝扫码转账」收银页共用同一套浅色收银台模板（.cashier-light + CashierChrome）。
 * 钱直接进店主个人账户，无法自动对账，靠人工核账发卡。
 */
export function AlipayManualPayPage() {
  const search = useSearch({ strict: false }) as { order?: string; amount?: string };
  const { data: settings, isLoading } = useSiteSettings();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  /** 从 orders 表回读的支付截止时刻；NULL = 老订单不限时 */
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  /** 剩余毫秒（自绘大号倒计时用，以服务端时刻算差值，不受本机时钟影响） */
  const [remain, setRemain] = useState(CASHIER_LIMIT_MIN * 60_000);

  const alipay = settings?.payment?.alipay;
  const orderNo = search.order ?? '';
  const amount = Number(search.amount) || 0;
  const remainText = fmtRemain(remain);
  /** 收款码若填的是收款链接（qr.alipay.com/…），本页可一键唤起支付宝直达付款页 */
  const qrValue = alipay?.qr_url ?? '';
  const canJump = isAlipayPayLink(qrValue);
  const [jumpNotice, setJumpNotice] = useState<string | null>(null);

  function handleJump() {
    const r = jumpToAlipayApp(qrValue);
    console.log('[AlipayManualPay] jump', { handled: r.handled, canJump });
    if (r.notice) {
      setJumpNotice(r.notice);
      setTimeout(() => setJumpNotice(null), 6000);
    }
  }

  // 按订单号回读时限与状态：查不到订单时不显示倒计时、不过期，绝不留白屏
  useEffect(() => {
    if (!orderNo) return;
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('expires_at,status')
          .eq('id', orderNo)
          .maybeSingle();
        if (!alive || error || !data) return;
        const row = data as unknown as OrderTimer;
        console.log('[AlipayManualPay] order timer loaded', { orderNo, expires_at: row.expires_at, status: row.status });
        setExpiresAt(row.expires_at ?? null);
        if (row.status === 'closed' || (row.expires_at && new Date(row.expires_at).getTime() <= Date.now())) {
          setExpired(true);
        }
      } catch (e) {
        console.warn('[AlipayManualPay] load order timer failed', e);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNo]);

  // 每秒刷新剩余时间；归零即切过期态
  useEffect(() => {
    if (!expiresAt) return;
    const target = new Date(expiresAt).getTime();
    const tick = () => {
      const left = target - Date.now();
      setRemain(left);
      if (left <= 0) {
        console.log('[AlipayManualPay] countdown hit zero');
        setRemain(0);
        setExpired(true);
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  /** 复制到剪贴板（失败降级 execCommand） */
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
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    }
  }

  if (isLoading) {
    return <div className="cashier-light mx-auto flex max-w-lg items-center justify-center px-4 py-24 text-center text-muted-foreground">加载中…</div>;
  }

  const hasQr = Boolean(alipay?.qr_url);
  const hasAccount = Boolean(alipay?.account?.trim());

  return (
    <div className="cashier-light min-h-screen bg-background">
      {/* 蓝色头部条 + 状态胶囊（与个人经营码收银页同一公共件） */}
      <CashierHeader title="支付宝转账付款" icon={<Wallet size={19} />} expired={expired} />

      <div className="mx-auto max-w-lg px-4 sm:px-6 py-7">
        <CashierAmount amount={amount} />

        {/* 一键跳转引导：配置为收款链接时最显眼处提示顾客点按钮，而不是自己找扫码 */}
        {!expired && canJump && (
          <div className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-info/30 bg-info/10 px-4 py-3">
            <ExternalLink size={15} className="shrink-0 text-info" />
            <p className="text-sm font-semibold leading-snug text-info">请点击下方按钮跳转支付宝付款</p>
          </div>
        )}

        {!expired && <CashierCountdown remainText={remainText} limitMinutes={CASHIER_LIMIT_MIN} />}

        {/* 精确金额警示：人工转账无系统自动对账，金额错付最难追回 */}
        {!expired && amount > 0 && (
          <div className="mt-6">
            <ExactAmountNotice amount={amount} />
          </div>
        )}

        {/* 二维码 / 未配置 / 过期 */}
        <div className="mt-6">
          {expired ? (
            <div className="rounded-2xl border border-danger/30 bg-surface p-6 text-center">
              {hasQr && (
                <div className="mb-5">
                  <QrExpiryFrame src={alipay!.qr_url!} alt="支付宝收款码" expired />
                </div>
              )}
              <h3 className="text-lg font-bold text-danger">订单已过期，请返回重新下单</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                本订单已超过支付时限并进入关闭流程。若你确信已经完成付款，请到查单页凭订单三要素核实到账情况。
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <Link to="/orders/lookup" search={{ order: orderNo } as never}
                  className="rounded-xl bg-info px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-info/85">
                  去查单页核实
                </Link>
                <Link to="/"
                  className="rounded-xl border border-border bg-card px-6 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                  返回首页重新下单
                </Link>
              </div>
            </div>
          ) : (hasQr || hasAccount) ? (
            <div>
              {hasQr && <QrExpiryFrame
                src={qrValue}
                alt="支付宝收款码"
                caption={canJump ? '扫码或点击下方按钮，直接打开支付宝付款' : '请使用支付宝扫描二维码完成支付'}
                footer={
                  <p className="mt-4 text-center text-sm text-foreground">
                    收款方：<span className="font-semibold">{alipay!.name || '店主'}</span>
                  </p>
                }
              />}
              {hasQr && canJump && (
                <div className="mt-5">
                  <button type="button" onClick={handleJump}
                    className="btn-sheen flex w-full items-center justify-center gap-2 rounded-xl bg-info py-3.5 text-sm font-bold text-white shadow-md shadow-info/25 transition-colors hover:bg-info/90 active:scale-[0.99]">
                    <ExternalLink size={16} /> 打开支付宝立即付款
                  </button>
                  {jumpNotice && (
                    <p className="mt-2.5 rounded-lg border border-warning/40 bg-surface p-3 text-center text-xs leading-relaxed text-warning">
                      {jumpNotice}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-surface p-5">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-warning" />
              <div>
                <p className="text-sm text-warning">店主尚未上传支付宝收款码</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  请返回更换支付方式，或改用「支付宝2」「微信收款」「USDT」完成付款。
                </p>
              </div>
            </div>
          )}
        </div>

        {!expired && hasAccount && (
          <div className="mt-5 rounded-xl border border-info/30 bg-card p-5">
            <p className="text-sm font-semibold text-foreground">收款账号（备用转账方式）</p>
            <p className="mt-1 text-xs text-muted-foreground">请在支付宝中选择转账，核对收款方后输入页面显示的准确金额，并备注订单号。</p>
            <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-3">
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">收款账号</p>
                <p className="break-all font-mono text-sm text-foreground">{alipay?.account}</p>
              </div>
              <button type="button" onClick={() => copyValue('account', alipay?.account ?? '')}
                className="shrink-0 rounded-lg border border-info/40 px-3 py-2 text-xs font-semibold text-info hover:bg-info/10">
                {copiedKey === 'account' ? <Check size={13} /> : <Copy size={13} />}
                {copiedKey === 'account' ? '已复制' : '复制账号'}
              </button>
            </div>
            {alipay?.name && <p className="mt-2 text-xs text-muted-foreground">收款方：<span className="font-semibold text-foreground">{alipay.name}</span></p>}
          </div>
        )}

        {/* 图片形式的收款码：无一键跳转能力，给店主一个可感知的说明（仅展示，不阻断） */}
        {!expired && hasQr && !canJump && (
          <p className="mt-4 rounded-lg border border-border bg-surface p-3 text-center text-[11px] leading-relaxed text-muted-foreground">
            当前收款码为图片形式，仅支持扫码付款。店主在后台把收款码换成「收款链接」后，本页会出现一键打开支付宝的按钮。
          </p>
        )}

        {/* ⚠️ 原「或复制收款账号转账」卡片已删除：本页主路径是扫码 / 一键跳转直达付款页，
            展示收款账号既没人用、又容易让顾客走错流程。payment.alipay.account 字段与后台配置保留，需要时可复原。 */}

        {/* 等待提示 */}
        {!expired && (hasQr || hasAccount) && (
          <p className="mt-5 text-center text-sm text-info">等待支付，支付完成后点击下方按钮查询卡密。</p>
        )}

        {/* 订单号 */}
        {orderNo && (
          <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="shrink-0 text-xs text-muted-foreground">订单号 / 转账备注（必填）</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-foreground">{orderNo}</span>
                <button type="button" onClick={() => copyValue('order', orderNo)}
                  aria-label="复制订单号"
                  className="text-muted-foreground transition-colors hover:text-info">
                  {copiedKey === 'order' ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                </button>
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              请只复制订单号本身作为备注，不要带前后空格；备注正确才能秒级核账。
            </p>
          </div>
        )}

        {/* 步骤 */}
        {(hasQr || hasAccount) && !expired && (
          <ol className="mt-6 space-y-3">
            {[
              !hasQr
                ? '打开支付宝，进入转账功能并填写上方收款账号'
                : canJump
                  ? '点击下方「打开支付宝立即付款」按钮，自动跳转支付宝付款页'
                  : '保存上面的收款码图片',
              !hasQr
                ? `核对收款方为「${alipay?.name || '店主'}」，输入页面显示的准确金额`
                : canJump
                  ? `核对收款方为「${alipay!.name || '店主'}」，输入精确金额`
                  : '打开支付宝 → 扫一扫 → 从相册选取收款码',
              '在备注里粘贴上面的订单号，确认付款',
              '付款完成后点击下方按钮，凭订单号与查询密码自助查单取卡密',
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-info/12 text-[11px] font-bold text-info">{i + 1}</span>
                <span className="text-sm leading-relaxed text-muted-foreground">{step}</span>
              </li>
            ))}
          </ol>
        )}

        {alipay?.note && !expired && (
          <p className="mt-5 rounded-lg border border-border bg-surface p-3 text-[11px] leading-relaxed text-muted-foreground">{alipay.note}</p>
        )}

        <div className="mt-8 space-y-3">
          {!expired && (
            <Link to="/orders/lookup" search={{ order: orderNo } as never}
              className="btn-sheen flex items-center justify-center gap-2 rounded-xl bg-info py-3.5 text-sm font-bold text-white shadow-md shadow-info/25 transition-colors hover:bg-info/90 active:scale-[0.99]">
              我已完成支付，去查单取卡密
            </Link>
          )}
          <Link to="/"
            className="block rounded-xl border border-border bg-card py-3 text-center text-sm text-muted-foreground transition-colors hover:text-foreground">
            返回首页
          </Link>
        </div>

        {/* 底部安全提示 */}
        <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <ShieldCheck size={12} className="shrink-0 text-success" />
          支付信息已加密保护，请勿关闭或刷新支付页面
        </p>
      </div>
    </div>
  );
}
