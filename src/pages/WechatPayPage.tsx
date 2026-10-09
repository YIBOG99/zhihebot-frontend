import { useState, useEffect } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { Copy, Check, MessageCircle, AlertCircle, ShieldCheck } from 'lucide-react';
import { supabase } from '@/supabase/client';
import { useSiteSettings } from '@/lib/queries';
import { ExactAmountNotice } from '@/components/ExactAmountNotice';
import { QrExpiryFrame } from '@/components/QrExpiryFrame';
import { CashierHeader, CashierAmount, CashierCountdown } from '@/components/CashierChrome';

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

/** 本通道支付时限（分钟）：沿用后端 30 分钟口径 */
const CASHIER_LIMIT_MIN = 30;

/**
 * 微信收款落地页：展示店主收款码 + 订单金额 + 转账备注要求。
 * 视觉与「支付宝扫码转账」收银页共用同一套浅色收银台模板（.cashier-light + CashierChrome）。
 * ⚠️ 微信官方未开放「网页拉起 → 直达付款页」的能力（weixin:// 只能到微信首页），
 *    因此本页没有一键跳转按钮；且页面跑在系统浏览器里，长按二维码无法被微信识别，
 *    可行路径只有「另一台设备扫码」与「存图后微信扫一扫相册选取」两条。
 */
export function WechatPayPage() {
  const search = useSearch({ strict: false }) as { order?: string; amount?: string };
  const { data: settings, isLoading } = useSiteSettings();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  /** 从 orders 表回读的支付截止时刻；NULL = 老订单不限时 */
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  /** 剩余毫秒（自绘大号倒计时用，以服务端时刻算差值，不受本机时钟影响） */
  const [remain, setRemain] = useState(CASHIER_LIMIT_MIN * 60_000);

  const wechat = settings?.payment?.wechat;
  const orderNo = search.order ?? '';
  const amount = Number(search.amount) || 0;
  const remainText = fmtRemain(remain);
  const hasQr = Boolean(wechat?.qr_url);

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
        console.log('[WechatPay] order timer loaded', { orderNo, expires_at: row.expires_at, status: row.status });
        setExpiresAt(row.expires_at ?? null);
        if (row.status === 'closed' || (row.expires_at && new Date(row.expires_at).getTime() <= Date.now())) {
          setExpired(true);
        }
      } catch (e) {
        console.warn('[WechatPay] load order timer failed', e);
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
        console.log('[WechatPay] countdown hit zero');
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

  return (
    <div className="cashier-light min-h-screen bg-background">
      {/* 蓝色头部条 + 状态胶囊（与支付宝收银页同一公共件，保证三页观感统一） */}
      <CashierHeader title="微信扫码付款" icon={<MessageCircle size={19} />} expired={expired} />

      <div className="mx-auto max-w-lg px-4 sm:px-6 py-7">
        <CashierAmount amount={amount} />

        {/* 扫码引导：本页在系统浏览器里打开，长按二维码只会选中图片、识别不了；
            真正可行的路径是「存图 → 微信扫一扫 → 相册选取」，文案必须与二维码方位一致 */}
        {!expired && hasQr && (
          <div className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-info/30 bg-info/10 px-4 py-3">
            <MessageCircle size={15} className="shrink-0 text-info" />
            <p className="text-sm font-semibold leading-snug text-info">请使用微信扫描下方二维码完成支付</p>
          </div>
        )}

        {!expired && <CashierCountdown remainText={remainText} limitMinutes={CASHIER_LIMIT_MIN} />}

        {/* 精确金额警示：扫码转账同样依赖金额对账 */}
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
                  <QrExpiryFrame src={wechat!.qr_url!} alt="微信收款码" expired />
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
          ) : hasQr ? (
            <QrExpiryFrame
              src={wechat!.qr_url!}
              alt="微信收款码"
              caption="若无法直接扫码：长按二维码图片选择「存储图片」，再用微信扫一扫从相册选取"
              footer={
                <p className="mt-4 text-center text-sm text-foreground">
                  收款方：<span className="font-semibold">{wechat.account_name || '店主'}</span>
                </p>
              }
            />
          ) : (
            <div className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-surface p-5">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-warning" />
              <div>
                <p className="text-sm text-warning">店主尚未上传微信收款码</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  可先使用「支付宝1」或 USDT 转账完成付款，或联系客服获取微信收款方式。
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 等待提示 */}
        {!expired && hasQr && (
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
        {hasQr && !expired && (
          <ol className="mt-6 space-y-3">
            {[
              '用微信「扫一扫」直接扫描下方收款码（另一台手机扫码更方便）',
              '或在浏览器中长按二维码图片 → 选择「存储图片」→ 打开微信扫一扫 → 相册选取',
              `核对收款方为「${wechat?.account_name || '店主'}」，按应付金额 ¥${amount.toFixed(2)} 付款`,
              '在备注里粘贴上面的订单号，付款完成后点击下方按钮取卡密',
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-info/12 text-[11px] font-bold text-info">{i + 1}</span>
                <span className="text-sm leading-relaxed text-muted-foreground">{step}</span>
              </li>
            ))}
          </ol>
        )}

        {wechat?.note && !expired && (
          <p className="mt-5 rounded-lg border border-border bg-surface p-3 text-[11px] leading-relaxed text-muted-foreground">{wechat.note}</p>
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
