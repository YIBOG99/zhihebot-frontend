// 数据库行类型（与 supabase/types.ts 解耦，业务层使用）
export interface Category {
  slug: string; name: string; description: string | null; sort_order: number;
}
export interface Product {
  id: string; category_slug: string | null; badge: string | null;
  title: string; subtitle: string | null; price: number; original_price: number | null;
  cover_url: string | null; redeem_url?: string | null; delivery_method: string; stock_level: 'many' | 'some' | 'few';
  sold_base: number; tips_title: string; tips_body: string | null;
  risk_title: string; risk_body: string | null; official_title: string; official_body: string | null;
  support_title: string; support_body: string | null; faq: { q: string; a: string }[];
  payment_methods: string[]; is_active: boolean; is_hot: boolean; sort_order: number;
}
export interface OrderRow {
  id: string; user_id: string | null; product_id: string | null;
  product_snapshot: Record<string, unknown>; quantity: number;
  contact_email: string | null; contact_phone: string | null;
  lookup_password_hash: string | null; lookup_fail_count: number;
  lookup_locked_until: string | null; note: string | null;
  payment_method: string | null; payment_ref: string | null;
  amount: number; discount_amount: number; coupon_code: string | null;
  /** 商品小计（价×数量，未减券未加费）；老订单为 NULL */
  goods_amount?: number | null;
  /** 渠道手续费（仅支付宝类通道 >0）；amount = goods_amount - discount_amount + channel_fee */
  channel_fee?: number;
  /** true = 余额充值订单，到账后入钱包而非发卡 */
  is_recharge?: boolean;
  status: 'pending_payment' | 'pay_processing' | 'paid_pending_delivery' | 'completed' | 'closed';
  card_secret: string | null; timeline: { at: string; label: string }[];
  /** 支付时限截止时刻；NULL = 本功能上线前的老订单，不限时 */
  expires_at?: string | null;
  /** 关闭来源；NULL = 历史遗留（当时唯一关单入口是后台手动，UI 兜底显示管理员手动关闭） */
  close_reason?: 'timeout_auto' | 'admin_manual' | 'customer_cancel' | null;
  created_at: string; updated_at: string;
}
export interface ContentRow {
  id: string; kind: 'guide' | 'tutorial' | 'blog' | 'policy' | 'about';
  slug: string; title: string; summary: string | null; body: string | null;
  cover_url: string | null; tags: string[]; related_products: string[];
  published: boolean; sort_order: number; created_at: string;
}
export interface FaqRow { id: string; question: string; answer: string; group_name: string; sort_order: number; }

/** 会员资料行（public.profiles，与 auth.users 一对一） */
export interface ProfileRow {
  id: string;
  username: string;
  /** 注册用真实邮箱；老的「用户名 + 密码」账号为 @meoo.local 虚拟域或 NULL */
  email: string | null;
  avatar_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  /** 本人专属邀请码（首次进个人中心时由服务端生成） */
  invite_code?: string | null;
  /** 注册时被谁邀请 */
  invited_by?: string | null;
  created_at: string;
}

/** 商品编辑表单态：所有字段以字符串承载，保存时再转回 Product 的行类型 */
export interface ProductDraft {
  id: string;
  category_slug: string;
  badge: string;
  title: string;
  subtitle: string;
  price: string;
  original_price: string;
  cover_url: string;
  redeem_url: string;
  stock_level: 'many' | 'some' | 'few';
  sold_base: string;
  tips_title: string;
  tips_body: string;
  risk_title: string;
  risk_body: string;
  official_title: string;
  official_body: string;
  support_title: string;
  support_body: string;
  faq: { q: string; a: string }[];
  payment_methods: string[];
  is_active: boolean;
  is_hot: boolean;
  sort_order: string;
  /** 消费返佣（products.commission JSONB）：enabled=false 即不参与计佣 */
  commission_enabled: boolean;
  /** rate=按实付比例 / fixed=固定金额券 */
  commission_mode: 'rate' | 'fixed';
  /** rate 为百分比数值；fixed 为券面额（元） */
  commission_value: string;
  /** 单笔返佣封顶（元） */
  commission_cap: string;
}
export interface CardSecretRow { id: string; product_id: string; code: string; note: string | null; status: string; order_id: string | null; used_at: string | null; created_at: string; }
/** 客户黑名单行（public.blocked_customers）。contact_value 为归一化值，raw_value 仅展示用 */
export interface BlockedCustomer {
  id: string;
  contact_type: 'email' | 'phone';
  contact_value: string;
  raw_value: string | null;
  reason: string | null;
  created_by: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
/** 可疑买家统计行（admin_suspect_buyers RPC） */
export interface SuspectBuyer {
  contact_type: 'email' | 'phone';
  contact_value: string;
  display_value: string;
  total_orders: number;
  paid_orders: number;
  unpaid_orders: number;
  last_order_at: string | null;
}
/** 频控白名单行（rate_limit_whitelist，RLS 仅 admin 可读） */
export interface RateLimitWhitelistRow {
  id: string;
  contact_type: 'email' | 'phone';
  /** 归一化后的联系方式（邮箱小写去空格 / 手机号只留数字和加号） */
  contact_value: string;
  raw_value: string | null;
  note: string | null;
  /** manual = 店主手动添加；auto = 累计付款满阈值单数由系统自动加入 */
  source: 'manual' | 'auto';
  is_active: boolean;
  created_at: string;
}
/** 频控拦截日志行（rate_limit_blocks，由 order_create 内联写入） */
export interface RateLimitBlockRow {
  id: string;
  contact_type: 'email' | 'phone';
  contact_value: string;
  user_id: string | null;
  /** 拦截当时的窗口秒数 */
  window_seconds: number;
  max_orders: number;
  /** 拦截那一刻窗口内该联系方式的既有订单数 */
  recent_count: number;
  blocked_at: string;
}
/** 收款通道配置（存于 site_settings key='payment'） */
export interface PaymentChannels {
  alipay?: { account?: string; name?: string; note?: string; qr_url?: string };
  usdt?: { network?: string; address?: string; note?: string };
  wechat?: { qr_url?: string; account_name?: string; note?: string };
  /** 支付宝个人经营码通道：钱直接进店主个人账户，无自动对账，靠人工核账发卡 */
  alipay_qr?: { qr_url?: string; name?: string; note?: string };
}
/** 全站品牌设置（存于 site_settings key='branding'），顶栏/页脚/登录页/公告弹窗/标签页图标共用 */
export interface BrandingConfig {
  /** LOGO 图片公网 URL；为空则各渲染点回退文字占位 */
  logo_url?: string;
  name?: string;
  /** 顶栏店名后的短副标 */
  tagline?: string;
}
/** 渠道按钮动作类型：外链 / 拉起QQ加群 / 加微信 / 电话 / 邮箱 / 仅展示二维码 */
export type LinkAction = 'url' | 'qq_group' | 'wechat' | 'tel' | 'mailto' | 'qrcode';
/** 首页公告弹窗的单个渠道按钮 */
export interface AnnouncementLink {
  label: string;
  /** action='url' 时为跳转链接；其余动作可留空（作为降级跳转地址） */
  url: string;
  /** lucide 图标名，见 src/components/AnnouncementDialog 的 ICON_MAP；未知值一律回退 ExternalLink */
  icon?: string;
  /** 缺省按 'url' 处理，兼容旧数据 */
  action?: LinkAction;
  /** qq_group: QQ群号；wechat: 微信号（用于复制兜底） */
  account_id?: string;
  /** qq_group: 腾讯官方加群密钥 key（qun.qq.com/join.html 生成），有则手机端可拉起 QQ 直达加群页 */
  join_key?: string;
  /** 二维码图片公网 URL：scheme 拉不起或桌面端时展示，长按保存扫码 */
  qr_url?: string;
}
/** 首页公告弹窗配置（存于 site_settings key='announcement'） */
export interface AnnouncementConfig {
  enabled?: boolean;
  title?: string;
  subtitle?: string;
  /** 蓝色提示条第一行，如「官方地址：xxx.shop」 */
  official_url?: string;
  /** 蓝色提示条第二行（防骗说明） */
  security_note?: string;
  /** 粉色警示条文案 */
  warning_note?: string;
  links?: AnnouncementLink[];
  /** 确认按钮文案 */
  cta_label?: string;
  /** 勾选框文案 */
  snooze_label?: string;
  /** 勾选后静默小时数，默认 24 */
  snooze_hours?: number;
}
/** AI 客服自定义知识条目（补充 FAQ 之外的问答） */
export interface AiKnowledgeItem { q: string; a: string; }
/** AI 客服配置（存于 site_settings key='ai_support'）。提示词与知识库由服务端读取，前端仅用于展示/编辑 */
export interface AiSupportConfig {
  /** 关闭后前台气泡隐藏 */
  enabled?: boolean;
  /** 客服显示名，默认「AI 在线客服」 */
  display_name?: string;
  /** 开场白（首次展开面板时作为第一条 AI 消息） */
  greeting?: string;
  /** 快捷提问列表（最多 6 条） */
  quick_questions?: string[];
  /** 店主追加的业务说明（拼在安全条款之后，不可覆盖安全条款） */
  system_prompt_extra?: string;
  /** 自定义知识库 Q&A */
  knowledge?: AiKnowledgeItem[];
  /** 「转人工」引导文案 */
  human_note?: string;
}
/**
 * 下单人机校验配置（存于 site_settings key='captcha'）。
 * ⚠️ 开关的最终判定在 order_create RPC 内部再读一次本配置，前端传什么值都绕不过去；
 *    这里的 enabled 只决定前台是否展示题目。
 */
export interface CaptchaConfig {
  /** 关闭时下单不校验人机题（默认开启） */
  enabled?: boolean;
  /** 同一联系方式在窗口内最多允许 max_orders 笔订单（0 表示不限） */
  max_orders?: number;
  /** ⚠️ 频控窗口长度，单位由 cap_window_unit 决定；旧字段 window_minutes 已不再被服务端读取 */
  cap_window_seconds?: number;
  /** 窗口长度单位：'seconds' | 'minutes'（缺省 seconds，非法值服务端回退 seconds） */
  cap_window_unit?: 'seconds' | 'minutes';
  /** 累计付款满阈值单数自动加入频控白名单（缺省开启）；关闭后已有记录仍保持有效 */
  auto_whitelist_enabled?: boolean;
  /** 自动加白的达标单数（缺省 1，即只要成功付过一笔款就永久豁免次数限制） */
  auto_whitelist_threshold?: number;
}
/** 渠道手续费配置（存于 site_settings key='billing'）。费率最终判定在 order_create RPC 内部再读一次 */
export interface BillingConfig {
  /** 关闭后所有通道均免手续费 */
  fee_enabled?: boolean;
  /** 支付宝类通道手续费百分比数值（如 4.6 表示 4.6%）；非法值服务端回退 4.6 */
  alipay_fee_rate?: number;
}
/** 支付方式推荐配置（存于 site_settings key='recommend'） */
export interface RecommendConfig {
  enabled?: boolean;
  /** 角标文字，默认「优先推荐」 */
  label?: string;
  /** 通道列表顶部的说明行 */
  note?: string;
}
/** 我的钱包（my_wallet RPC 返回） */
export interface WalletInfo {
  available: number; frozen: number; total_recharged: number; total_spent: number;
  transactions: WalletTx[];
}
export interface WalletTx {
  id: string; kind: 'recharge' | 'spend' | 'unfreeze' | 'refund' | 'admin_adjust';
  amount: number; balance_after: number; order_id: string | null; note: string | null; created_at: string;
}
export interface SiteSettings { brand: Record<string, string>; contact: Record<string, string>; payment: PaymentChannels; seo: Record<string, string>; referral?: Record<string, unknown>; announcement?: AnnouncementConfig; branding?: BrandingConfig; ai_support?: AiSupportConfig; captcha?: CaptchaConfig; billing?: BillingConfig; recommend?: RecommendConfig; }
export interface DashboardPoint { day: string; visits: number; order_count: number; revenue: number; }
export interface BossSalesRow { title: string; sold_count: number; revenue: number; }
export interface DashboardData {
  series: DashboardPoint[];
  today: { visits?: number; login_users?: number; order_count?: number; revenue?: number };
  week_visits: number;
  total_revenue: number;
  total_orders: number;
  pending_audit: number;
}
