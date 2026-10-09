// Local storefront snapshot derived from the exported Meoo seed data.
// Used as a read-only fallback so the independent storefront can render without the original backend.
import type { Category, ContentRow, FaqRow, Product, SiteSettings } from '@/lib/types';

export const DEMO_CATEGORIES: Category[] = [
  {
    "slug": "chatgpt",
    "name": "ChatGPT 专区",
    "description": "Plus / Pro 5X / Pro 20X 会员代充与账号权益",
    "sort_order": 1
  },
  {
    "slug": "claude",
    "name": "Claude 专区",
    "description": "Claude Pro / Max 订阅充值",
    "sort_order": 2
  },
  {
    "slug": "grok",
    "name": "Grok 专区",
    "description": "Grok Super / Premium 订阅",
    "sort_order": 3
  },
  {
    "slug": "gemini",
    "name": "Gemini 专区",
    "description": "Gemini Advanced / AI Pro / Ultra",
    "sort_order": 4
  },
  {
    "slug": "coding",
    "name": "AI 编程工具",
    "description": "Codex / Cursor / Copilot 等开发向订阅",
    "sort_order": 5
  },
  {
    "slug": "other",
    "name": "其他权益",
    "description": "流媒体、云服务与其他数字权益",
    "sort_order": 9
  }
];

export const DEMO_PRODUCTS: Product[] = [
  {
    "id": "chatgpt-plus-month",
    "category_slug": "chatgpt",
    "badge": "本周爆款",
    "title": "ChatGPT Plus 月卡",
    "subtitle": "官方 Plus 会员 · 30 天 · GPT-5 优先访问 + 更高额度",
    "price": 138.0,
    "original_price": 168.0,
    "cover_url": "https://g.cdn.meoo.host/s5lynl8068w5/ai-images/cover-chatgpt-plus.png?auth_key=aa7ba2b1e70afdbd786f7cae9a46cbcd6543153bd05a88082bfaf1aaea8a511d",
    "delivery_method": "auto",
    "stock_level": "many",
    "sold_base": 2380,
    "is_hot": true,
    "sort_order": 1,
    "tips_title": "商品详情",
    "tips_body": "本商品为 ChatGPT Plus 一个月时长的会员权益交付。下单后系统自动发放兑换凭证，按详情页教程在自有账号内完成激活即可享受 Plus 全部能力：更高请求上限、优先响应、最新模型访问权限与高级功能内测资格。",
    "risk_title": "使用提醒",
    "risk_body": "请确认您的账号注册地区与网络环境可正常访问官方服务。凭证一经发出即视为已消耗，无法撤回或换绑他人账号；若激活过程中提示区域限制，请先更换合规网络环境后重试。",
    "official_title": "风险说明",
    "official_body": "本站提供的是正规渠道获取的兑换凭证，非共享账号、非破解服务。请勿将凭证转卖或在多个账号间反复尝试使用，异常调用可能导致凭证失效。因买家自身账号违规被封禁所产生的损失不在售后范围内。",
    "support_title": "常见问题",
    "support_body": "发货后多久能激活？通常 1 分钟内自动发卡，收到凭证后按教程操作 3 分钟即可完成。若长时间未收到，请使用查单页凭订单号重新获取。",
    "redeem_url": null,
    "faq": [
      {
        "q": "常见问题",
        "a": "发货后多久能激活？通常 1 分钟内自动发卡，收到凭证后按教程操作 3 分钟即可完成。若长时间未收到，请使用查单页凭订单号重新获取。"
      }
    ],
    "payment_methods": [
      "alipay",
      "usdt"
    ],
    "is_active": true
  },
  {
    "id": "chatgpt-pro-5x",
    "category_slug": "chatgpt",
    "badge": "高额度",
    "title": "ChatGPT Pro 5X",
    "subtitle": "面向重度使用者的加量档位 · 30 天 · 适合日常高频创作",
    "price": 328.0,
    "original_price": 398.0,
    "cover_url": "https://g.cdn.meoo.host/s5lynl8068w5/ai-images/cover-chatgpt-pro.png?auth_key=d6df75ceb0dc61a9a7f0148453cd84b82cf1405b6de6370f3101cdcd35cc9c64",
    "delivery_method": "auto",
    "stock_level": "some",
    "sold_base": 640,
    "is_hot": false,
    "sort_order": 2,
    "tips_title": "商品详情",
    "tips_body": "Pro 5X 档位提供高于 Plus 的请求配额与推理资源优先级，适合内容创作者、研究人员与需要长上下文连续工作的用户。有效期 30 天，到期不自动续费。",
    "risk_title": "使用提醒",
    "risk_body": "该档位为一次性权益交付，不支持中途降级或折算为 Plus 时长。建议根据实际用量选择档位，避免资源闲置。",
    "official_title": "风险说明",
    "official_body": "高额度权益受官方策略调整影响，具体可用模型与限额以账号内实际显示为准。如遇官方规则变更导致权益范围变化，本站将按比例补偿时长而非退款。",
    "support_title": "常见问题",
    "support_body": "能否与 Plus 叠加？同一账号同一时间仅存在一个生效档位，建议在当前周期结束前续购同档位以保持连续性。",
    "redeem_url": null,
    "faq": [
      {
        "q": "常见问题",
        "a": "能否与 Plus 叠加？同一账号同一时间仅存在一个生效档位，建议在当前周期结束前续购同档位以保持连续性。"
      }
    ],
    "payment_methods": [
      "alipay",
      "usdt"
    ],
    "is_active": true
  },
  {
    "id": "chatgpt-pro-20x",
    "category_slug": "chatgpt",
    "badge": "顶配",
    "title": "ChatGPT Pro 20X",
    "subtitle": "极限额度 · 30 天 · 团队与专业生产力场景首选",
    "price": 888.0,
    "original_price": 1088.0,
    "cover_url": "https://g.cdn.meoo.host/s5lynl8068w5/ai-images/cover-chatgpt-pro.png?auth_key=d6df75ceb0dc61a9a7f0148453cd84b82cf1405b6de6370f3101cdcd35cc9c64",
    "delivery_method": "auto",
    "stock_level": "few",
    "sold_base": 120,
    "is_hot": false,
    "sort_order": 3,
    "tips_title": "商品详情",
    "tips_body": "20X 为本站最高额度档位，适用于高强度批量生成、长文档处理与多轮复杂推理场景。交付方式与 5X 一致，凭证自动发放。",
    "risk_title": "使用提醒",
    "risk_body": "由于额度较高，请确保账号绑定信息完整且状态正常后再激活，避免因账号风控造成权益浪费。",
    "official_title": "风险说明",
    "official_body": "极端高频调用仍可能触发官方限流机制，此为平台侧行为，与凭证质量无关。建议合理分配调用节奏。",
    "support_title": "常见问题",
    "support_body": "支持开具凭证吗？如需对公采购或报销材料，请在下单备注中说明并联系客服处理。",
    "redeem_url": null,
    "faq": [
      {
        "q": "常见问题",
        "a": "支持开具凭证吗？如需对公采购或报销材料，请在下单备注中说明并联系客服处理。"
      }
    ],
    "payment_methods": [
      "alipay",
      "usdt"
    ],
    "is_active": true
  },
  {
    "id": "claude-pro",
    "category_slug": "claude",
    "badge": "推荐",
    "title": "Claude Pro 月卡",
    "subtitle": "Claude Pro 订阅 · 30 天 · Opus 访问权 + 扩展用量",
    "price": 158.0,
    "original_price": 188.0,
    "cover_url": "https://g.cdn.meoo.host/s5lynl8068w5/ai-images/cover-claude.png?auth_key=eaca9a266c0431adffaf1f7fb025560a209e14b8b577e1c212737f31183970d1",
    "delivery_method": "auto",
    "stock_level": "many",
    "sold_base": 1560,
    "is_hot": true,
    "sort_order": 4,
    "tips_title": "商品详情",
    "tips_body": "Claude Pro 提供高峰时段优先访问、更高消息上限以及对最强模型的完整使用权，尤其擅长长文本理解、代码编写与结构化写作。",
    "risk_title": "使用提醒",
    "risk_body": "激活前请确认账号已完成手机号验证，未完成验证的账号可能无法加载 Pro 权益。",
    "official_title": "风险说明",
    "official_body": "Claude 对部分地区的注册与使用存在限制，请自行评估账号所在区域的可用性。因区域不可用导致的激活失败可申请换发凭证。",
    "support_title": "常见问题",
    "support_body": "有年付方案吗？本站按单个周期售卖，如需长期使用可分次购买，累计消费满额会自动发放老客折扣码。",
    "redeem_url": null,
    "faq": [
      {
        "q": "常见问题",
        "a": "有年付方案吗？本站按单个周期售卖，如需长期使用可分次购买，累计消费满额会自动发放老客折扣码。"
      }
    ],
    "payment_methods": [
      "alipay",
      "usdt"
    ],
    "is_active": true
  },
  {
    "id": "claude-max-5x",
    "category_slug": "claude",
    "badge": "重度",
    "title": "Claude Max 5X",
    "subtitle": "Max 档 · 30 天 · 高用量 Claude Code 与工作流",
    "price": 880.0,
    "original_price": 999.0,
    "cover_url": "https://g.cdn.meoo.host/s5lynl8068w5/ai-images/cover-claude.png?auth_key=eaca9a266c0431adffaf1f7fb025560a209e14b8b577e1c212737f31183970d1",
    "delivery_method": "auto",
    "stock_level": "few",
    "sold_base": 88,
    "is_hot": false,
    "sort_order": 5,
    "tips_title": "商品详情",
    "tips_body": "Max 5X 面向开发者与自动化工作流，提供数倍于 Pro 的周期间用量，配合 Claude Code 可在大型仓库中持续作业。",
    "risk_title": "使用提醒",
    "risk_body": "Max 权益按滚动周期计算用量，建议避开周期末集中调用，以免提前耗尽当周额度。",
    "official_title": "风险说明",
    "official_body": "用量上限由官方动态调整，本站不承诺固定条数。若实际额度显著低于页面描述，可在有效期内提交截图申请差额补偿。",
    "support_title": "常见问题",
    "support_body": "适合个人使用吗？普通写作与研究场景 Pro 已足够，Max 更适合每日长时间编码的用户。",
    "redeem_url": null,
    "faq": [
      {
        "q": "常见问题",
        "a": "适合个人使用吗？普通写作与研究场景 Pro 已足够，Max 更适合每日长时间编码的用户。"
      }
    ],
    "payment_methods": [
      "alipay",
      "usdt"
    ],
    "is_active": true
  },
  {
    "id": "grok-super",
    "category_slug": "grok",
    "badge": "热门",
    "title": "Grok Super 月卡",
    "subtitle": "Grok SuperGrok · 30 天 · 深度推理与图像生成",
    "price": 128.0,
    "original_price": 158.0,
    "cover_url": "https://g.cdn.meoo.host/s5lynl8068w5/ai-images/cover-grok.png?auth_key=488653ab265e4ceb7e1ff56712fa122051758a11ecd53f44c25a215b59ec2ce4",
    "delivery_method": "auto",
    "stock_level": "many",
    "sold_base": 720,
    "is_hot": true,
    "sort_order": 6,
    "tips_title": "商品详情",
    "tips_body": "Grok Super 解锁更快响应、更大上下文窗口与 Imagine 图像生成能力，实时信息检索是其突出优势。",
    "risk_title": "使用提醒",
    "risk_body": "需绑定支持该功能的账号类型，部分新注册账号可能存在功能灰度差异。",
    "official_title": "风险说明",
    "official_body": "实时检索类回答的准确性依赖数据源，请勿将其作为投资、医疗等专业决策的唯一依据。",
    "support_title": "常见问题",
    "support_body": "和 Plus 比怎么选？追热点与实时资讯选 Grok，长文与代码选 Claude，通用创作选 ChatGPT。",
    "redeem_url": null,
    "faq": [
      {
        "q": "常见问题",
        "a": "和 Plus 比怎么选？追热点与实时资讯选 Grok，长文与代码选 Claude，通用创作选 ChatGPT。"
      }
    ],
    "payment_methods": [
      "alipay",
      "usdt"
    ],
    "is_active": true
  },
  {
    "id": "gemini-pro",
    "category_slug": "gemini",
    "badge": "生态",
    "title": "Gemini AI Pro",
    "subtitle": "Google AI Pro · 30 天 · 超大上下文 + Workspace 联动",
    "price": 118.0,
    "original_price": 148.0,
    "cover_url": "https://g.cdn.meoo.host/s5lynl8068w5/ai-images/cover-gemini.png?auth_key=6e517498cd93d027af58686e40b539f0f73fc48be9b6f3e788655c1150bd5eb0",
    "delivery_method": "auto",
    "stock_level": "many",
    "sold_base": 930,
    "is_hot": false,
    "sort_order": 7,
    "tips_title": "商品详情",
    "tips_body": "Google AI Pro 除模型能力外还附带云端存储与全家桶协同，适合已在 Google 生态内办公的用户。",
    "risk_title": "使用提醒",
    "risk_body": "权益与 Google 账号强绑定，激活后请勿随意更换主账号，跨账号迁移不支持。",
    "official_title": "风险说明",
    "official_body": "Google 对家庭组共享的规则较为严格，请勿用于违反条款的多人群组分发。",
    "support_title": "常见问题",
    "support_body": "包含存储吗？包含，具体容量以账号后台显示为准。",
    "redeem_url": null,
    "faq": [
      {
        "q": "常见问题",
        "a": "包含存储吗？包含，具体容量以账号后台显示为准。"
      }
    ],
    "payment_methods": [
      "alipay",
      "usdt"
    ],
    "is_active": true
  },
  {
    "id": "codex-credits",
    "category_slug": "coding",
    "badge": "开发者",
    "title": "Codex 用量包",
    "subtitle": "AI 编程代理用量 · 适合 CI 与日常重构",
    "price": 268.0,
    "original_price": 328.0,
    "cover_url": "https://g.cdn.meoo.host/s5lynl8068w5/ai-images/cover-codex.png?auth_key=3b495332e5181469d5dcbcceaa6affdca856041de063fc52b471b04570f0c584",
    "delivery_method": "auto",
    "stock_level": "some",
    "sold_base": 210,
    "is_hot": false,
    "sort_order": 8,
    "tips_title": "商品详情",
    "tips_body": "面向 Codex CLI 与云端代理的用量交付，覆盖代码补全、批量重构与测试生成等典型工程任务。",
    "risk_title": "使用提醒",
    "risk_body": "请在项目根目录配置好运行环境后再消耗额度，环境调试阶段的调用同样计入用量。",
    "official_title": "风险说明",
    "official_body": "涉及私有代码上传时，请自行确认企业合规要求；本站不接触也不存储任何买家代码。",
    "support_title": "常见问题",
    "support_body": "可以开发票吗？个人订单提供电子收据，企业采购请联系客服。",
    "redeem_url": null,
    "faq": [
      {
        "q": "常见问题",
        "a": "可以开发票吗？个人订单提供电子收据，企业采购请联系客服。"
      }
    ],
    "payment_methods": [
      "alipay",
      "usdt"
    ],
    "is_active": true
  },
  {
    "id": "cursor-pro",
    "category_slug": "coding",
    "badge": "编辑器",
    "title": "Cursor Pro 月卡",
    "subtitle": "AI 原生编辑器 Pro · 30 天 · 无限 Tab + 快速请求",
    "price": 148.0,
    "original_price": 178.0,
    "cover_url": "https://g.cdn.meoo.host/s5lynl8068w5/ai-images/cover-codex.png?auth_key=3b495332e5181469d5dcbcceaa6affdca856041de063fc52b471b04570f0c584",
    "delivery_method": "auto",
    "stock_level": "some",
    "sold_base": 460,
    "is_hot": false,
    "sort_order": 9,
    "tips_title": "商品详情",
    "tips_body": "Cursor Pro 解锁高级模型快速请求额度与后台 Agent 能力，是目前最流行的 AI 编程工作流之一。",
    "risk_title": "使用提醒",
    "risk_body": "权益跟随邮箱账号生效，下单时填写的接收邮箱请务必准确。",
    "official_title": "风险说明",
    "official_body": "官方对免费试用与付费账号的模型池划分较细，个别模型可用性可能随版本变动。",
    "support_title": "常见问题",
    "support_body": "支持 IDE 插件吗？Cursor 本身是独立编辑器，无需额外插件。",
    "redeem_url": null,
    "faq": [
      {
        "q": "常见问题",
        "a": "支持 IDE 插件吗？Cursor 本身是独立编辑器，无需额外插件。"
      }
    ],
    "payment_methods": [
      "alipay",
      "usdt"
    ],
    "is_active": true
  }
];

export const DEMO_CONTENTS: ContentRow[] = [
  {
    "id": "demo-content-1",
    "kind": "guide",
    "slug": "chatgpt-plus-guide",
    "title": "ChatGPT Plus / Pro 价格、购买与套餐对比完整指南",
    "summary": "从官方定价到国内如何稳定开通，一文讲清 Plus 与 Pro 各档位的差别、适合人群与常见坑。",
    "body": "# ChatGPT Plus / Pro 价格、购买与套餐对比\\n\\n## 一、官方定价一览\\n\\nOpenAI 目前的个人订阅分为三档：Free、Plus（约 $20/月）与 Pro（约 $200/月）。Pro 内部又按用量拆出不同倍率档位，核心差异不是「能不能用」，而是**同一周期内可调用的推理资源上限**。\\n\\n| 档位 | 官方价 | 主要差别 |\\n|---|---|---|\\n| Free | $0 | 基础模型、限额严格、高峰期排队 |\\n| Plus | $20/月 | 最新模型优先访问、更高消息上限、DALL·E 与高级数据分析 |\\n| Pro 5X | 加量档 | 显著高于 Plus 的配额，适合每日高频创作 |\\n| Pro 20X | 顶配档 | 面向批量生成、长文档与复杂多轮推理 |\\n\\n## 二、你到底该买哪一档\\n\\n判断标准只有一个：**你是否在周期中途被限流过。**\\n\\n- 每周提问不超过几十次 → Free 足够，不必花钱。\\n- 每天使用、需要长上下文和稳定响应 → Plus 是性价比最高的选择。\\n- 做内容矩阵、批量翻译、长报告撰写 → 直接上 5X，避免反复等待重置。\\n- 团队共用或跑自动化流程 → 20X 更划算，单条调用成本更低。\\n\\n## 三、国内开通的三种现实路径\\n\\n1. **自有国际信用卡直付**：最干净，但需要卡组织支持且账单地址填写规范，失败率主要来自银行风控。\\n2. **苹果/谷歌内购**：方便但有平台抽成，实际支付价格更高，且退款政策受应用商店约束。\\n3. **正规渠道凭证兑换**：无需暴露卡片信息，按周期购买，本站即采用此方式——交付兑换凭证，由你在自己账号内激活。\\n\\n## 四、避坑清单\\n\\n- 不要购买「共享账号」，多人同时登录极易触发风控导致整组封禁。\\n- 不要在非本人设备保存登录态后离手。\\n- 任何索要你账号密码的「代充」都应直接拒绝，正规做法只需要你自行完成激活。\\n- 下单后请立刻保存订单号与查询密码，这是唯一的取货与售后凭据。",
    "cover_url": null,
    "tags": [],
    "related_products": [],
    "published": true,
    "sort_order": 1,
    "created_at": "2026-10-01T00:00:00.000Z"
  },
  {
    "id": "demo-content-2",
    "kind": "guide",
    "slug": "claude-pro-vs-max",
    "title": "Claude Pro 与 Max 怎么选：用量、Claude Code 与长文本实测",
    "summary": "Pro 与 Max 的差距不在功能开关，而在滚动周期内的用量池。本文给出可自测的判断方法。",
    "body": "# Claude Pro 与 Max 怎么选\\n\\n## 核心区别是一句话\\n\\nPro 给你「比免费多很多」，Max 给你「多到基本不用数着花」。\\n\\nClaude 的额度按**滚动周期**计算，而不是自然月清零。这意味着如果你习惯在周末集中赶工，很可能在周期末就被限流；Max 的意义就是把这条曲线拉平。\\n\\n## 三个自测问题\\n\\n1. 你是否曾经在一次连续编码会话中被提示达到上限？\\n2. 你是否需要同时开多个长上下文任务（读仓库 + 写文档 + 复盘）？\\n3. 你的月度 token 消耗是否稳定超过 Pro 上限的 80%？\\n\\n三问中有两问答「是」，Max 的差价就能被省下的等待时间覆盖。\\n\\n## Claude Code 场景特别说明\\n\\n在真实大型仓库里，一次重构可能消耗数十万 token。Pro 档位通常撑不过一个完整的功能迭代周期，而 Max 5X 可以支撑连续多日的日常开发。若你以 AI 编程为主用途，建议直接评估 Max。\\n\\n## 使用节奏建议\\n\\n- 把大批量任务拆分到周期前中段，避免堆积到末期。\\n- 长文档先做结构化摘要再逐节展开，能显著降低无效消耗。\\n- 保留必要的对话历史长度，过长的上下文重复携带是最常见的浪费来源。",
    "cover_url": null,
    "tags": [],
    "related_products": [],
    "published": true,
    "sort_order": 2,
    "created_at": "2026-10-02T00:00:00.000Z"
  },
  {
    "id": "demo-content-3",
    "kind": "guide",
    "slug": "ai-subscribe-compare",
    "title": "2026 主流 AI 会员横向对比：ChatGPT / Claude / Grok / Gemini",
    "summary": "四个方向的模型在不同任务类型上的表现差异明显，本文按使用场景给出选型矩阵。",
    "body": "# 2026 主流 AI 会员横向对比\\n\\n## 选型矩阵\\n\\n| 场景 | 首选 | 备选 | 说明 |\\n|---|---|---|---|\\n| 通用创作与问答 | ChatGPT Plus | Gemini Pro | 生态最全、插件与工具链成熟 |\\n| 长文理解与写作 | Claude Pro/Max | ChatGPT Pro | 长上下文一致性与文风控制更稳 |\\n| 实时资讯检索 | Grok Super | Gemini Pro | 数据源更新快，适合追热点 |\\n| AI 编程 | Claude Max | Cursor Pro + Codex | 大仓库理解与重构能力突出 |\\n| 办公全家桶联动 | Gemini AI Pro | — | 附带云存储与协作套件 |\\n\\n## 关于「多买几个是否值得」\\n\\n对多数个人用户，**一个主力 + 一个备用**是最优解。主力承担 80% 的日常任务，备用用于交叉验证关键结论。四个全开的边际收益很低，除非你是做模型评测或内容矩阵。\\n\\n## 成本核算方法\\n\\n把月费换算成「单次有效产出成本」：\\n\\n> 月费 ÷（当月实际完成任务数 × 每任务节省小时数 × 时薪）\\n\\n如果结果远小于 1，说明这笔订阅带来的效率提升远超支出，可以放心续；若接近或大于 1，说明你的使用强度还不足以支撑当前档位，应降档。",
    "cover_url": null,
    "tags": [],
    "related_products": [],
    "published": true,
    "sort_order": 3,
    "created_at": "2026-10-03T00:00:00.000Z"
  },
  {
    "id": "demo-content-4",
    "kind": "tutorial",
    "slug": "how-to-order",
    "title": "三分钟完成下单：从选品到拿到卡密",
    "summary": "图文步骤说明游客下单全流程，包括查询密码设置、付款凭证回填与查单页取货。",
    "body": "# 三分钟完成下单\\n\\n## 第 1 步：选择商品与数量\\n\\n在首页或分类页找到目标商品，进入详情页确认档位与有效期，点击「立即下单」。\\n\\n## 第 2 步：填写联系信息\\n\\n- **邮箱或手机号**：至少填一项，用于核对身份，务必保证可用。\\n- **查询密码**：由你自己设置，系统只保存其哈希值。忘记后无法找回，只能凭原密码查询，请当场记录。\\n\\n## 第 3 步：提交并获取收款信息\\n\\n提交后页面会展示订单号与两种收款方式（支付宝 / USDT TRC20）。请按订单金额精确转账，并在备注中填写订单号后 6 位。\\n\\n## 第 4 步：回填凭证等待核账\\n\\n在结算完成页上传或填写转账流水号。店主确认到账后，系统自动从卡密池分配凭证，订单状态变为「已完成」。\\n\\n## 第 5 步：查单页取货\\n\\n打开「订单查询」，输入订单号 + 联系方式 + 查询密码，即可看到卡密与激活教程。建议立即复制保存到本地备忘录。",
    "cover_url": null,
    "tags": [],
    "related_products": [],
    "published": true,
    "sort_order": 10,
    "created_at": "2026-10-04T00:00:00.000Z"
  },
  {
    "id": "demo-content-5",
    "kind": "tutorial",
    "slug": "activate-chatgpt-plus",
    "title": "ChatGPT Plus 兑换凭证激活教程",
    "summary": "适用于本站所有 ChatGPT 档位商品的详细激活步骤与失败排查表。",
    "body": "# ChatGPT Plus 激活教程\\n\\n## 前置条件\\n\\n1. 已注册 OpenAI 账号并完成手机验证。\\n2. 网络环境可正常访问官方站点且地区合规。\\n3. 手上持有本站发放的有效凭证。\\n\\n## 激活步骤\\n\\n1. 登录你自己的账号，进入账户升级页面。\\n2. 选择对应档位（Plus / Pro），在支付方式处选择「兑换码 / Gift Card」入口。\\n3. 粘贴凭证，确认后等待权益刷新，通常 30 秒内生效。\\n4. 回到账户信息页核对到期日期是否正确延长了一个周期。\\n\\n## 失败排查表\\n\\n| 现象 | 原因 | 处理 |\\n|---|---|---|\\n| 输入后提示无效 | 复制时带空格或换行 | 重新粘贴，去除首尾空白 |\\n| 找不到兑换入口 | 账号地区不支持 | 更换合规网络环境后刷新重试 |\\n| 提示已被使用 | 凭证泄露或被他人抢先激活 | 立即携订单号联系客服核实发放时间 |\\n| 权益未刷新 | 缓存延迟 | 退出登录后重新登录，等待 5 分钟 |\\n\\n如以上方式均无法解决，请提供订单号与操作录屏，客服将在核实后换发新凭证。",
    "cover_url": null,
    "tags": [],
    "related_products": [],
    "published": true,
    "sort_order": 11,
    "created_at": "2026-10-05T00:00:00.000Z"
  },
  {
    "id": "demo-content-6",
    "kind": "blog",
    "slug": "why-virtual-goods-price-fluctuate",
    "title": "为什么 AI 会员的价格会一周一个样",
    "summary": "解释汇率、渠道成本与官方调价三者如何共同影响零售端价格。",
    "body": "# 为什么 AI 会员的价格会一周一个样\\n\\n很多老客会发现，同一款商品上周标 138，这周变成 148。这不是随意改价，背后有三条真实的成本线。\\n\\n## 一、汇率波动\\n\\n官方定价以美元计价，采购端的实际支出随汇率浮动。当人民币对美元走强或走弱超过一定幅度，零售端必须同步调整，否则会出现倒挂。\\n\\n## 二、渠道稀缺度\\n\\n正规可用的兑换凭证供给并非无限。每逢新品发布或开学季，需求短期激增而渠道补货有周期，价格自然上浮；反之在淡季会出现促销空间。\\n\\n## 三、官方规则变更\\n\\n平台调整免费额度、修改分档结构或收紧某些地区的可用性，都会直接影响单个凭证的实际价值。这类变化我们通常会在公告栏第一时间说明，并对已下单未使用的订单按比例补偿时长。\\n\\n## 给买家的实用建议\\n\\n- 有确定需求时不必赌最低价，长期持有的总成本比单次差价更重要。\\n- 关注大促节点，通常在新模型发布后的两周左右会有阶段性让利。\\n- 累计消费会自动触发老客折扣，长期使用建议固定在同一账号下。",
    "cover_url": null,
    "tags": [],
    "related_products": [],
    "published": true,
    "sort_order": 20,
    "created_at": "2026-10-06T00:00:00.000Z"
  },
  {
    "id": "demo-content-7",
    "kind": "policy",
    "slug": "after-sales",
    "title": "售后与退款政策",
    "summary": "明确可退与不可退的边界、申请流程与处理时效。",
    "body": "# 售后与退款政策\\n\\n## 支持退款的情形\\n\\n1. 凭证尚未使用，且因渠道侧原因确认无法激活。\\n2. 因本站发货错误（档位不符、有效期不足）。\\n3. 重复付款或多付。\\n\\n## 不支持退款的情形\\n\\n1. 凭证已成功激活并使用。\\n2. 因买家自身账号违规、封禁导致的权益损失。\\n3. 因买家未按教程操作造成的失败（可协助排障，但不构成退款理由）。\\n4. 超过售后时限（发货后 7 个自然日）的申请。\\n\\n## 申请流程\\n\\n1. 准备订单号、失败截图或录屏、问题描述。\\n2. 通过页面底部联系方式提交申请。\\n3. 核实在 1 个工作日内给出结论；符合退款条件的，款项在 1–3 个工作日内原路退回。\\n\\n## 补偿原则\\n\\n若因官方规则变更导致权益范围缩小，本站以**延长时长或换发更高档位**的方式补偿，而非现金退款。这一原则同样适用于不可抗力情形。",
    "cover_url": null,
    "tags": [],
    "related_products": [],
    "published": true,
    "sort_order": 30,
    "created_at": "2026-10-07T00:00:00.000Z"
  },
  {
    "id": "demo-content-8",
    "kind": "policy",
    "slug": "terms",
    "title": "服务条款",
    "summary": "使用本站服务前请阅读的权利义务约定。",
    "body": "# 服务条款\\n\\n## 服务内容\\n\\n本站为数字权益凭证的零售方，交付标的为可在官方平台兑换相应订阅权益的一次性凭证，不提供任何形式的账号登录代办或共享账号服务。\\n\\n## 买方义务\\n\\n1. 提供真实有效的联系信息，妥善保管订单号与查询密码。\\n2. 遵守所购产品官方服务条款，不得用于违法或违反平台规则的场景。\\n3. 不得转售、公开传播凭证，或在多个账号间反复尝试使用。\\n\\n## 责任限制\\n\\n本站对以下情形不承担责任：官方服务中断、模型策略调整、买方账号自身违规、买方网络环境问题。本站承诺的责任上限为该笔订单的实际支付金额。\\n\\n## 争议解决\\n\\n双方应先友好协商；协商不成的，任何一方可向本站运营方所在地有管辖权的机构提起解决程序。",
    "cover_url": null,
    "tags": [],
    "related_products": [],
    "published": true,
    "sort_order": 31,
    "created_at": "2026-10-08T00:00:00.000Z"
  },
  {
    "id": "demo-content-9",
    "kind": "policy",
    "slug": "privacy",
    "title": "隐私政策",
    "summary": "我们收集什么、为什么收集、以及绝不做什么。",
    "body": "# 隐私政策\\n\\n## 我们收集的信息\\n\\n- 下单时填写的邮箱或手机号：仅用于订单核对与售后联系。\\n- 查询密码：仅保存不可逆哈希，我们无法还原明文。\\n- 订单快照：包含商品、金额、状态与时间线，用于纠纷举证。\\n\\n## 我们不收集的信息\\n\\n- 您的任何 AI 平台账号密码。\\n- 您的对话内容与上传文件。\\n- 支付机构的账户余额等敏感金融信息。\\n\\n## 数据保护\\n\\n所有业务数据存放于受访问控制策略保护的数据库中，卡密明文仅在管理员权限下可读，普通接口无法批量导出。\\n\\n## 信息共享\\n\\n除法律法规要求外，我们不向任何第三方出售、出租或交换您的个人信息。",
    "cover_url": null,
    "tags": [],
    "related_products": [],
    "published": true,
    "sort_order": 32,
    "created_at": "2026-10-09T00:00:00.000Z"
  },
  {
    "id": "demo-content-10",
    "kind": "about",
    "slug": "about-us",
    "title": "关于智核",
    "summary": "一支专注海外 AI 数字权益的小型团队，把复杂的跨境订阅变成三步自助下单。",
    "body": "# 关于智核\\n\\n智核成立于海外 AI 工具开始大规模进入中文创作者视野的那一年。最初只是几个朋友之间互相帮忙代购订阅，后来发现大家真正的痛点不是「买不到」，而是**信息不对称**：不知道哪个档位适合自己、不知道渠道是否正规、出了问题找不到人。\\n\\n所以我们把这件事做成了一个自助商城：\\n\\n- **明码标价**：每个商品都写清有效期、库存状态与风险说明，不藏着「共享账号」这类灰色玩法。\\n- **全程留痕**：订单从提交、核账到发卡每一步都有时间线，出问题可以回溯。\\n- **只要凭证，不要密码**：我们的交付模式决定了永远不需要接触你的账号，这是底线。\\n\\n今天智核服务的品类已经从最初的 ChatGPT 扩展到 Claude、Grok、Gemini 与多款 AI 编程工具，同时维护着一批持续更新的选型指南与激活教程，帮助第一次接触这些工具的人少走弯路。\\n\\n如果你在使用中遇到任何不清楚的地方，欢迎随时联系我们 —— 比起成交，我们更希望你对这笔支出感到满意。",
    "cover_url": null,
    "tags": [],
    "related_products": [],
    "published": true,
    "sort_order": 40,
    "created_at": "2026-10-10T00:00:00.000Z"
  }
];

export const DEMO_FAQS: FaqRow[] = [
  {
    "id": "demo-faq-1",
    "group_name": "下单与支付",
    "question": "支持哪些付款方式？",
    "answer": "目前支持支付宝转账与 USDT（TRC20）两种收款方式。下单页会展示对应收款信息，完成付款后回填转账凭证即可，店主确认到账后系统自动发货。",
    "sort_order": "1"
  },
  {
    "id": "demo-faq-2",
    "group_name": "下单与支付",
    "question": "为什么没有在线自动扣款？",
    "answer": "虚拟商品跨境代充涉及渠道合规问题，本站采用「先下单锁定库存 → 人工核账 → 自动发卡」的流程，既保证资金安全也能避免异常订单误扣款。",
    "sort_order": "2"
  },
  {
    "id": "demo-faq-3",
    "group_name": "下单与支付",
    "question": "付款后多久能收到卡密？",
    "answer": "正常营业时间内通常 5–15 分钟完成核账并自动发放；夜间提交的订单会在次日集中处理，处理完成后查单页状态会同步更新。",
    "sort_order": "3"
  },
  {
    "id": "demo-faq-4",
    "group_name": "发货与激活",
    "question": "如何查询我的订单和卡密？",
    "answer": "进入「订单查询」页，输入下单时填写的订单号、邮箱或手机号以及自设的查询密码即可查看完整发货信息。请妥善保存这三项，连续输错 5 次会临时锁定 10 分钟。",
    "sort_order": "4"
  },
  {
    "id": "demo-faq-5",
    "group_name": "发货与激活",
    "question": "卡密激活失败怎么办？",
    "answer": "请先按详情页教程逐步核对：账号地区、网络环境、是否已完成手机号验证。若确认操作无误仍失败，携带订单号与失败截图联系客服，可换发新凭证。",
    "sort_order": "5"
  },
  {
    "id": "demo-faq-6",
    "group_name": "发货与激活",
    "question": "一个凭证能在多个账号上使用吗？",
    "answer": "不能。每个凭证仅可绑定一个账号，激活后即作废。请勿在公开场合泄露凭证内容。",
    "sort_order": "6"
  },
  {
    "id": "demo-faq-7",
    "group_name": "售后与退款",
    "question": "哪些情况可以退款？",
    "answer": "凭证未使用且因渠道原因无法激活的，可申请全额退款或换发；已激活成功的权益不支持退款。因买家自身账号违规被封禁不属于可退范围。",
    "sort_order": "7"
  },
  {
    "id": "demo-faq-8",
    "group_name": "售后与退款",
    "question": "退款多久到账？",
    "answer": "确认符合退款条件后，原路退回一般在 1–3 个工作日内完成；USDT 订单按提交时的汇率折算退回。",
    "sort_order": "8"
  },
  {
    "id": "demo-faq-9",
    "group_name": "账号与安全",
    "question": "必须注册才能购买吗？",
    "answer": "不强制。游客可完整下单，凭「订单号 + 联系方式 + 查询密码」取货。注册后可在个人中心查看历史订单、享受会员折扣与老客专属码。",
    "sort_order": "9"
  },
  {
    "id": "demo-faq-10",
    "group_name": "账号与安全",
    "question": "你们会拿到我的账号密码吗？",
    "answer": "不会。本站只交付兑换凭证，全程不需要也不应索取您的任何登录密码。任何索要密码的行为都不是本站客服。",
    "sort_order": "10"
  }
];

export const DEMO_SITE_SETTINGS: SiteSettings = {
  "brand": {
    "name": "智核",
    "slogan": "AI 会员自助充值商城",
    "subtitle": "海外 AI 订阅 · 正规渠道 · 自动发卡",
    "logoText": "智核"
  },
  "contact": {
    "wechat": "zhihe-service",
    "qq": "88001234",
    "email": "support@zhihe.shop",
    "workTime": "每日 09:00 - 24:00",
    "notice": "本店为虚拟商品自助商城，付款后请保留订单号与查询密码，这是唯一取货凭证。"
  },
  "payment": {
    "alipay": {
      "account": "zhihe999@outlook.com",
      "name": "智核数字服务",
      "note": "转账请备注订单号后 6 位"
    },
    "usdt": {
      "network": "TRC20",
      "address": "XU6YcNKqAqxGZrLbs0P5bHh8svtkaeGGit",
      "note": "仅支持 TRON（TRC20）链转账，其他链转入无法找回；转账前请反复核对地址。"
    },
    "wechat": {
      "qr_url": "",
      "account_name": "智核数字服务",
      "note": "请添加店主微信后转账，务必备注订单号后 6 位；确认到账后立即发放卡密。"
    }
  },
  "seo": {
    "title": "智核 · AI 会员自助充值商城",
    "description": "ChatGPT Plus / Pro、Claude Pro / Max、Grok Super、Gemini AI Pro 等海外 AI 订阅正规渠道代充，自动发卡、订单可查、售后有保障。",
    "keywords": "ChatGPT Plus 代充,Claude Pro 购买,AI 会员充值,Grok Super,Gemini Pro"
  },
  "announcement": {
    "enabled": true,
    "title": "智核",
    "subtitle": "请认准官方网址，谨防假冒。",
    "official_url": "nl8068w5.meoo.info",
    "security_note": "客服只通过首页展示的联系方式处理，谨防被骗。",
    "warning_note": "下单前请看清商品介绍，有问题请先联系客服。",
    "links": [
      {
        "label": "微信客服",
        "url": "",
        "icon": "chat"
      },
      {
        "label": "QQ 通知交流群",
        "url": "",
        "icon": "qq"
      },
      {
        "label": "Telegram 频道",
        "url": "",
        "icon": "telegram"
      }
    ],
    "cta_label": "好的，我知道了",
    "snooze_label": "24 小时内不再提醒",
    "snooze_hours": 24
  },
  "branding": {
    "logo_url": "",
    "name": "智核商店",
    "tagline": "AI MEMBERSHIP & DIGITAL SERVICES"
  }
};
