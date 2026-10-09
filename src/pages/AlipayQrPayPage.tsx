import { useEffect, useState } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { Copy, Check, QrCode, AlertCircle, ShieldCheck, ExternalLink } from 'lucide-react';
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

/** 订单在收款页需要的字段：创建时刻 + 支付截止时刻 + 状态（用于过期判定） */
interface OrderTimer {
  created_at: string | null;
  expires_at: string | null;
  status: string;
}

/**
 * 本收银页专属支付时限（分钟）。全站订单默认 30 分钟，此通道单独收紧到 10 分钟：
 * 只要订单剩余时限长于本值，页面就按「建单时刻 + 本值」展示倒计时；
 * 若真实时限已不足 10 分钟（用户晚进了收银页），则仍按真实时限走，绝不显示比后端更长的时间。
 * 要恢复 30 分钟：把本常量改回 30 即可。
 */
const CASHIER_LIMIT_MIN = 10;

/**
 * 支付宝扫码转账落地页（个人经营码通道）。
 * 与「支付宝人工转账」的区别：本页只做一件事——把店主上传的个人收款码以竞品式
 * 独立收银台形态呈现（蓝头 + 待支付胶囊 + 大红金额 + 绿框码 + 倒计时），
 * 过期后二维码变暗并提示重新下单。钱直接进店主个人账户，无法自动对账，靠人工核账发卡。
 */
export function AlipayQrPayPage() {
  const search = useSearch({ strict: false }) as { order?: string; amount?: string; product?: string };
  const { data: settings, isLoading } = useSiteSettings();
  const [copied, setCopied] = useState(false);
  /** 从 orders 表回读的支付截止时刻；NULL = 老订单不限时 */
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  /** 后端真实截止时刻，用于区分「本页 10 分钟时限先到」与「订单本身已超时」 */
  const [realExpiresAt, setRealExpiresAt] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  /** 剩余毫秒（本页自绘大号倒计时用，以服务端时刻算差值，不受本机时钟影响） */
  const [remain, setRemain] = useState(0);

  const alipayQr = settings?.payment?.alipay_qr;
  const orderNo = search.order ?? '';
  const amount = Number(search.amount) || 0;
  const remainText = fmtRemain(remain);
  /** 配置值是收款链接时才能一键唤起支付宝 App；图片形式只能扫码 */
  const qrValue = alipayQr?.qr_url ?? '';
  const canJump = isAlipayPayLink(qrValue);
  const [jumpNotice, setJumpNotice] = useState<string | null>(null);

  function handleJump() {
    const r = jumpToAlipayApp(qrValue);
    if (r.notice) {
      setJumpNotice(r.notice);
      setTimeout(() => setJumpNotice(null), 6000);
    }
    if (!r.handled) console.log('[AlipayQrPay] jump not handled', { canJump });
  }

  // 按订单号回读时限与状态：查不到订单时保持不显示倒计时，绝不留白屏
  useEffect(() => {
    if (!orderNo) return;
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('created_at,expires_at,status')
          .eq('id', orderNo)
          .maybeSingle();
        if (!alive || error || !data) return;
        const row = data as unknown as OrderTimer;
        // 本页时限收紧到 10 分钟：以「建单时刻 + 10 分钟」为目标，但不超过后端真实截止时刻
        const realExpireMs = row.expires_at ? new Date(row.expires_at).getTime() : null;
        const cashierMs = row.created_at
          ? new Date(row.created_at).getTime() + CASHIER_LIMIT_MIN * 60_000
          : null;
        const targetMs = cashierMs === null ? realExpireMs : realExpireMs === null ? cashierMs : Math.min(cashierMs, realExpireMs);
        console.log('[AlipayQrPay] order timer loaded', { orderNo, expires_at: row.expires_at, status: row.status, cashierLimitMin: CASHIER_LIMIT_MIN });
        if (realExpireMs !== null) setRealExpiresAt(new Date(realExpireMs).toISOString());
        if (targetMs !== null) setExpiresAt(new Date(targetMs).toISOString());
        // 过期判定只看后端真实时限：本页 10 分钟只是展示口径，实际关单仍由后端 30 分钟决定
        if (row.status === 'closed' || (realExpireMs !== null && realExpireMs <= Date.now())) {
          setExpired(true);
        }
      } catch (e) {
        console.warn('[AlipayQrPay] load order timer failed', e);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNo]);

  // 每秒刷新剩余时间；归零即切过期态
  useEffect(() => {
    if (!expiresAt) return;
    const target = new Date(expiresAt).getTime();
    const realTarget = realExpiresAt ? new Date(realExpiresAt).getTime() : null;
    const tick = () => {
      const left = target - Date.now();
      setRemain(left);
      if (left <= 0) {
        console.log('[AlipayQrPay] countdown hit zero');
        // 收银页 10 分钟到点、但后端订单仍在时限内：只把数字钉在 00:00，不判过期
        if (realTarget !== null && realTarget > Date.now()) {
          setRemain(0);
          return;
        }
        setExpired(true);
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [expiresAt, realExpiresAt]);

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
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    }
  }

  if (isLoading) {
    return <div className="cashier-light mx-auto flex max-w-lg items-center justify-center px-4 py-24 text-center text-muted-foreground">加载中…</div>;
  }

  const hasQr = Boolean(alipayQr?.qr_url);

  return (
    <div className="cashier-light min-h-screen bg-background">
      {/* 蓝色头部条 + 状态胶囊（公共件，三页共用） */}
      <CashierHeader title="支付宝2" icon={<QrCode size={19} />} expired={expired} />

      <div className="mx-auto max-w-lg px-4 sm:px-6 py-7">
        {/* 金额区：红色超大字 */}
        <CashierAmount amount={amount} label={search.product} />

        {/* 一键跳转引导：放在金额下方最显眼处，顾客一进页面就知道该点按钮而不是自己找扫码 */}
        {!expired && canJump && (
          <div className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-info/30 bg-info/10 px-4 py-3">
            <ExternalLink size={15} className="shrink-0 text-info" />
            <p className="text-sm font-semibold leading-snug text-info">请点击下方按钮跳转支付宝付款</p>
          </div>
        )}

        {/* 倒计时：独立成行居中显示，比通用横幅更贴近实例的大红数字 */}
        {!expired && <CashierCountdown remainText={remainText} limitMinutes={CASHIER_LIMIT_MIN} />}

        {/* 二维码 / 未配置 / 过期 */}
        <div className="mt-6">
          {expired ? (
            <div className="rounded-2xl border border-danger/30 bg-surface p-6 text-center">
              {hasQr && (
                <div className="mb-5">
                  <QrExpiryFrame src={alipayQr!.qr_url!} alt="支付宝收款码" expired />
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
            <div>
              <QrExpiryFrame
                src={qrValue}
                alt="支付宝收款码"
                caption={canJump ? '扫码或点击下方按钮，直接打开支付宝付款' : '请使用支付宝扫描二维码完成支付'}
                footer={
                  <p className="mt-4 text-center text-sm text-foreground">
                    收款方：<span className="font-semibold">{alipayQr!.name || '店主'}</span>
                  </p>
                }
              />
              {canJump && !expired && (
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
                  请返回更换支付方式，或改用「支付宝3」「微信收款」「USDT」完成付款。
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 图片形式的收款码：无一键跳转能力，给店主一个可感知的说明（仅展示，不阻断） */}
        {!expired && hasQr && !canJump && (
          <p className="mt-4 rounded-lg border border-border bg-surface p-3 text-center text-[11px] leading-relaxed text-muted-foreground">
            当前收款码为图片形式，仅支持扫码付款。店主在后台把收款码换成「收款链接」后，本页会出现一键打开支付宝的按钮。
          </p>
        )}

        {!expired && amount > 0 && (
          <div className="mt-6">
            <ExactAmountNotice amount={amount} />
          </div>
        )}

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
                  {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                </button>
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              支付宝给个人付款时可填写备注，请把订单号原样填进备注，不要带空格；备注正确才能秒级核账。
            </p>
          </div>
        )}

        {/* 步骤 */}
        {hasQr && !expired && (
          <ol className="mt-6 space-y-3">
            {[
            canJump ? '点击下方「打开支付宝立即付款」按钮，自动跳转支付宝付款页' : '打开支付宝 App，使用「扫一扫」扫描上方收款码',
            canJump ? '核对收款方无误后，输入精确金额' : `核对收款方为「${alipayQr?.name || '店主'}」，输入精确金额 ¥${amount.toFixed(2)}`,
            '在备注里粘贴上面的订单号，确认付款',
            '付款完成后点击下方按钮，凭订单号与查询密码自助取卡密',
          ].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-info/12 text-[11px] font-bold text-info">{i + 1}</span>
                <span className="text-sm leading-relaxed text-muted-foreground">{step}</span>
              </li>
            ))}
          </ol>
        )}

        {alipayQr?.note && !expired && (
          <p className="mt-5 rounded-lg border border-border bg-surface p-3 text-[11px] leading-relaxed text-muted-foreground">{alipayQr.note}</p>
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
