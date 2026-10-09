// 支付通道元数据：结算页、续付页、商品详情标签与后台勾选清单共用同一套定义，
// 避免多处各抄一份导致「后台能勾但前台无入口」（见 AGENTS.md 三处映射教训）。
import type { PaymentChannels } from '@/lib/types';
import { isAlipayPayLink } from '@/lib/alipay-deeplink';

export type PayChannel = 'balance' | 'alipay' | 'wechat' | 'alipay_qr' | 'alipay_manual' | 'usdt';

/** 静态收款类通道的独立收银页路径（URL 只带 order + amount，页面自行回读时限） */
export const CASHIER_PATH: Partial<Record<PayChannel, string>> = {
  alipay: '/pay/alipay-qr',
  wechat: '/pay/wechat',
  alipay_qr: '/pay/alipay-qr',
  alipay_manual: '/pay/alipay-manual',
};

/** 需加收渠道手续费的通道（余额充值单同样适用，口径收口在这里避免各处硬编码） */
export const FEE_CHANNELS: PayChannel[] = ['alipay', 'alipay_qr', 'alipay_manual'];

export interface ChannelMeta {
  id: PayChannel;
  label: string;
  /** 通道按钮上的角标说明 */
  badge: string;
  desc: string;
  /** lucide 图标名，由消费方映射成组件 */
  icon: 'qrcode' | 'message' | 'wallet' | 'coins' | 'piggybank';
  /** 主题色调（info=蓝 success=绿 warning=黄），与结算页原有视觉保持一致 */
  tone: 'info' | 'success' | 'warning' | 'muted';
  /** 三个支付宝通道展示「优先推荐」角标（受后台 recommend.enabled 控制） */
  recommended?: boolean;
  /** true = 该通道按后台费率加收渠道手续费；false = 免手续费 */
  hasFee: boolean;
}

/**
 * 通道卡片统一配色（结算页选择屏 / 续付页 / 充值面板共用同一份，避免三处各抄一遍改漏）。
 * ⚠️ 用户反馈：原先按 tone 给整块卡片染不同底色（绿/蓝/黄/灰混排）「太突兀」，
 * 现统一为中性深底 + 常规边框，色调只保留在图标上；选中态用品牌色描边区分。
 */
export const CHANNEL_CARD_BASE =
  'group flex flex-col items-start gap-2 rounded-xl border border-border bg-surface p-5 text-left transition-all hover:border-primary/50 hover:bg-surface-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50';

/** 选中态附加 class（与 base 拼接使用） */
export const CHANNEL_CARD_ACTIVE = 'border-primary/70 ring-1 ring-primary/30';

/** 通道图标名 → lucide 组件的映射由消费方提供；此处只收口「色调 → 图标文字色」 */
export const TONE_TEXT: Record<string, string> = {
  info: 'text-info', success: 'text-success', warning: 'text-warning', muted: 'text-muted-foreground',
};

/** 通道顺序即展示顺序：余额（站内抵扣、秒发货）置顶，在线秒到账次之，其余按人工核账成本排列 */
export const PAY_CHANNELS: ChannelMeta[] = [
  {
    id: 'balance', label: '账户余额支付', badge: '免手续费 · 秒发货', icon: 'piggybank', tone: 'success',
    hasFee: false,
    desc: '直接用账户余额抵扣，免渠道手续费，付款后立即自动发放卡密。余额不足时请先充值。',
  },
  {
    id: 'alipay', label: '支付宝1', badge: '深链优先 · 人工核账', icon: 'qrcode', tone: 'info',
    hasFee: true, recommended: true,
    desc: '使用后台单独上传的支付宝收款码/收款链接；可识别有效收款链接时支持手机唤起支付宝，收款后由店主核账发卡。',
  },
  {
    id: 'alipay_qr', label: '支付宝2', badge: '个人收款码 · 人工核账', icon: 'qrcode', tone: 'info',
    hasFee: true, recommended: true,
    desc: '使用支付宝2独立收款码/链接；识别到有效支付宝收款链接时可尝试唤起 App，否则扫码付款并备注订单号，店主核账后发卡。',
  },
  {
    id: 'alipay_manual', label: '支付宝3', badge: '备用通道', icon: 'wallet', tone: 'muted',
    hasFee: true, recommended: true,
    desc: '进入支付宝收款页按金额转账并备注订单号，店主核账后发卡（通常需数分钟至数小时）。',
  },
  {
    id: 'wechat', label: '微信收款', badge: '扫码转账', icon: 'message', tone: 'success',
    hasFee: false,
    desc: '跳转到微信收款页，扫描店主收款码按金额付款并备注订单号，核账后发卡。',
  },
  {
    id: 'usdt', label: 'USDT', badge: '链上转账', icon: 'coins', tone: 'warning',
    hasFee: false,
    desc: '复制收款地址后在交易所提币，链上确认后店主核账发卡（通常需数分钟至数小时）。',
  },
];

/**
 * 商品级支付方式白名单（products.payment_methods）→ 通道 id。
 * 取值同时出现在 ProductEditSheet 的 PAYMENT_OPTIONS、商品详情标签与本表，漏任一处会出现
 * 「后台能勾但前台无入口」。兼容历史 manual 别名为支付宝3；其余未知值回退为 USDT。
 */
export function toChannelId(raw: string): PayChannel {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'balance') return 'balance';
  if (v === 'alipay' || v === 'alipay_online') return 'alipay';
  if (v === 'wechat' || v === 'weixin') return 'wechat';
  if (v === 'alipay_qr') return 'alipay_qr';
  if (v === 'alipay_manual' || v === 'manual') return 'alipay_manual';
  return 'usdt';
}

/** 该通道当前是否可用（静态收款类看店主是否配置了码/地址；在线通道由出码结果决定；余额恒可用，不足时由按钮置灰表达） */
export function isChannelConfigured(id: PayChannel, payment?: PaymentChannels): boolean {
  switch (id) {
    case 'balance': return true;
    case 'wechat': return Boolean(payment?.wechat?.qr_url);
    case 'alipay_qr': return Boolean(payment?.alipay_qr?.qr_url);
    case 'alipay_manual': return Boolean(payment?.alipay?.qr_url || payment?.alipay?.account);
    case 'usdt': return Boolean(payment?.usdt?.address);
    // 在线通道无法在前台判断签约状态，交给 PayQrPanel 出码时反馈
    case 'alipay': return Boolean(payment?.alipay_primary?.qr_url || isAlipayPayLink(payment?.alipay_primary?.pay_url ?? ''));
  }
}

/** 收银页跳转参数：静态收款三页统一只认 order + amount（alipay_qr 额外带 product 用于展示） */
export function cashierSearch(id: PayChannel, orderNo: string, amount: number, title?: string) {
  const base = { order: orderNo, amount: String(amount) };
  if (id === 'alipay') return { ...base, channel: 'alipay', ...(title ? { product: title } : {}) };
  if (id === 'alipay_qr') return title ? { ...base, product: title } : base;
  return base;
}

/** 通道按钮上的手续费说明行（每种支付方式都要写清楚） */
export function feeNoteOf(id: PayChannel, rate: number): string {
  return id === 'balance'
    ? '免手续费，直接从账户余额扣减'
    : FEE_CHANNELS.includes(id)
      ? `含 ${rate}% 渠道手续费`
      : '免手续费';
}

/**
 * 通道名后的手续费括注 —— 直接跟在支付方式名字后面，形如
 * 「支付宝1 (4.6%手续费)」「微信收款 (免手续费)」。
 * 用户明确要求：手续费口径写在每个支付方式本身上，而不是页面顶部另起一行提示。
 */
export function feeSuffixOf(id: PayChannel, rate: number): string {
  return FEE_CHANNELS.includes(id) ? `(${rate}%手续费)` : '(免手续费)';
}

/**
 * 中文标签映射（后台订单列表等只读展示点共用，避免再抄一份）。
 * ⚠️ 键是数据库里 payment_methods 的历史取值，label 与 PAY_CHANNELS 保持一致；
 * 商品详情页的「支持支付方式」区块已按用户要求删除，此处仅供后台/其他只读场景使用。
 */
export const PAYMENT_LABEL: Record<string, string> = {
  balance: '账户余额支付',
  alipay: '支付宝1',
  alipay_online: '支付宝1',
  alipay_qr: '支付宝2',
  alipay_manual: '支付宝3',
  wechat: '微信收款',
  weixin: '微信收款',
  usdt: 'USDT',
  manual: '支付宝3',
};
