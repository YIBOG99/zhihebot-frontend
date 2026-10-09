// AI 在线客服 Edge Function（游客可用，故部署时 verify_jwt=false）
// 职责：服务端组装本站真实知识（商品/FAQ/教程/站点设置）→ 限流 → 调 Meoo AI 流式转发。
// 安全红线：收款账号与钱包地址一律不注入上下文；日志不落完整用户输入。
const MEOO_AI_BASE_URL = 'https://api.meoo.host';
const DEFAULT_MODEL = 'qwen3.6-plus';
const FUNCTION_NAME = 'ai-support';

/** 限流：单访客每分钟最多 6 条、每天最多 200 条（实例内存级，冷启动重置可接受） */
const RATE_WINDOW_MS = 60_000;
const RATE_PER_MIN = 6;
const RATE_PER_DAY = 200;
const DAY_MS = 86_400_000;

interface RateEntry { min: number[]; day: number; dayAt: number }
const rateMap = new Map<string, RateEntry>();

/** 知识库缓存：60 秒内复用，避免高频提问重复查库 */
const KB_TTL_MS = 60_000;
let kbCache: { at: number; text: string; counts: Record<string, number> } | null = null;

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function trim(s: unknown, max: number): string {
  const v = typeof s === 'string' ? s.trim() : '';
  return v.length > max ? `${v.slice(0, max)}…` : v;
}

function checkRate(visitorId: string): { allowed: boolean; reason?: string } {
  const now = Date.now();
  let e = rateMap.get(visitorId);
  if (!e || now - e.dayAt > DAY_MS) {
    e = { min: [], day: 0, dayAt: now };
    rateMap.set(visitorId, e);
  }
  e.min = e.min.filter((t) => now - t < RATE_WINDOW_MS);
  if (e.min.length >= RATE_PER_MIN) return { allowed: false, reason: 'RATE_LIMIT_MIN' };
  if (e.day >= RATE_PER_DAY) return { allowed: false, reason: 'RATE_LIMIT_DAY' };
  e.min.push(now);
  e.day += 1;
  return { allowed: true };
}

/* ── 知识库组装（全部来自本站真实数据） ── */
/** Edge Function 内无项目 types，统一用行级弱类型 + trim() 兜底读取 */
type Row = Record<string, unknown>;

function str(row: Row, key: string): string {
  const v = row[key];
  return typeof v === 'string' ? v : '';
}

function arr<T = unknown>(row: Row, key: string): T[] {
  const v = row[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

async function buildKnowledge(sb: any): Promise<{ at: number; text: string; counts: Record<string, number> }> {
  if (kbCache && Date.now() - kbCache.at < KB_TTL_MS) return kbCache;

  const [settingsRes, productsRes, categoriesRes, faqsRes, contentsRes] = await Promise.all([
    sb.from('site_settings').select('key,value'),
    sb.from('products').select('title,subtitle,price,original_price,category_slug,stock_level,is_hot,faq,support_body,payment_methods')
      .eq('is_active', true).order('sort_order').limit(60),
    sb.from('categories').select('slug,name,description').order('sort_order'),
    sb.from('faqs').select('group_name,question,answer').order('sort_order').limit(80),
    sb.from('contents').select('kind,title,summary').eq('published', true).order('sort_order').limit(40),
  ]);

  const settings = new Map<string, unknown>();
  for (const row of (settingsRes.data ?? []) as Row[]) settings.set(str(row, 'key'), row.value);
  const cfg = (settings.get('ai_support') ?? {}) as { knowledge?: { q?: string; a?: string }[] };
  const brand = (settings.get('branding') ?? {}) as { name?: string; tagline?: string };
  const contact = (settings.get('contact') ?? {}) as Record<string, string>;
  const announcement = (settings.get('announcement') ?? {}) as { official_url?: string; security_note?: string };
  const payment = (settings.get('payment') ?? {}) as {
    alipay?: { note?: string }; usdt?: { network?: string; note?: string }; wechat?: { note?: string };
  };

  const parts: string[] = [];

  parts.push([
    '【店铺信息】',
    `店名：${trim(brand.name, 40) || '本店'}`,
    brand.tagline ? `定位：${trim(brand.tagline, 60)}` : '',
    contact.workTime ? `营业时间：${trim(contact.workTime, 40)}` : '',
    announcement.official_url ? `官方网址：${trim(announcement.official_url, 80)}` : '',
    announcement.security_note ? `防骗提示：${trim(announcement.security_note, 120)}` : '',
    contact.notice ? `下单须知：${trim(contact.notice, 160)}` : '',
  ].filter(Boolean).join('\n'));

  if ((productsRes.data ?? []).length) {
    const lines = ((productsRes.data ?? []) as Row[]).map((p) => {
      const price = typeof p.price === 'number' ? p.price : str(p, 'price');
      const orig = typeof p.original_price === 'number' && p.original_price > 0 ? p.original_price : '';
      const stock = p.stock_level === 'few' ? '紧张' : p.stock_level === 'some' ? '一般' : '充足';
      const payMethods = arr<string>(p, 'payment_methods');
      const faqStr = arr<{ q?: string; a?: string }>(p, 'faq').slice(0, 3)
        .map((f) => `    - ${trim(f?.q, 50)}：${trim(f?.a, 140)}`).join('\n');
      return [
        `- ${trim(str(p, 'title'), 50)}｜¥${price}${orig ? `（原价 ¥${orig}）` : ''}｜库存:${stock}${p.is_hot ? '｜热销' : ''}`,
        str(p, 'subtitle') ? `  简介：${trim(str(p, 'subtitle'), 90)}` : '',
        str(p, 'support_body') ? `  说明：${trim(str(p, 'support_body'), 200)}` : '',
        payMethods.length ? `  支持支付：${payMethods.join('/')}` : '',
        faqStr,
      ].filter(Boolean).join('\n');
    });
    parts.push(`【在售商品与价格（以此为准，禁止编造其他价格）】\n${lines.join('\n')}`);
  }

  if ((categoriesRes.data ?? []).length) {
    parts.push(`【商品分类】\n${((categoriesRes.data ?? []) as Row[])
      .map((c) => `- ${trim(str(c, 'name'), 30)}${str(c, 'description') ? `：${trim(str(c, 'description'), 70)}` : ''}`).join('\n')}`);
  }

  if ((faqsRes.data ?? []).length) {
    parts.push(`【常见问题 FAQ】\n${((faqsRes.data ?? []) as Row[])
      .map((f) => `- [${trim(str(f, 'group_name'), 20)}] Q：${trim(str(f, 'question'), 70)}\n  A：${trim(str(f, 'answer'), 260)}`).join('\n')}`);
  }

  if ((contentsRes.data ?? []).length) {
    parts.push(`【教程与政策文章（顾客问操作步骤时，引导到站内对应页面）】\n${((contentsRes.data ?? []) as Row[])
      .map((c) => `- [${trim(str(c, 'kind'), 12)}] ${trim(str(c, 'title'), 50)}${str(c, 'summary') ? `：${trim(str(c, 'summary'), 100)}` : ''}`).join('\n')}`);
  }

  // 只注入「规则」，绝不注入收款账号/钱包地址 —— 防止聊天里出现错价或被篡改的收款信息
  const payRules = [
    payment.alipay?.note ? `- 支付宝：${trim(payment.alipay.note, 90)}` : '',
    payment.wechat?.note ? `- 微信：${trim(payment.wechat.note, 90)}` : '',
    payment.usdt ? `- USDT：网络 ${trim(payment.usdt.network, 20) || 'TRC20'}；${trim(payment.usdt.note, 110)}` : '',
  ].filter(Boolean).join('\n');
  if (payRules) {
    parts.push(`【支付方式与规则】本站结算页提供：支付宝扫码、微信收款码、USDT(TRC20)、支付宝人工转账。\n${payRules}\n注意：具体收款账号与钱包地址只在结算页实时展示，你不得在对话中提供任何收款账号或地址，一律引导顾客下单后在结算页查看。`);
  }

  const custom = (cfg.knowledge ?? []).filter((k) => k?.q?.trim() && k?.a?.trim()).slice(0, 40);
  if (custom.length) {
    parts.push(`【店主补充问答】\n${custom.map((k) => `- Q：${trim(k.q, 70)}\n  A：${trim(k.a, 240)}`).join('\n')}`);
  }

  const text = parts.join('\n\n');
  kbCache = {
    at: Date.now(),
    text,
    counts: {
      products: (productsRes.data ?? []).length,
      faqs: (faqsRes.data ?? []).length,
      contents: (contentsRes.data ?? []).length,
      knowledge: custom.length,
    },
  };
  return kbCache;
}

/** 固定安全条款：店主只能追加，不能覆盖 */
function buildSystemPrompt(knowledgeText: string, extra: string, displayName: string): string {
  return [
    `你是「${displayName}」，本虚拟商品自助商城的在线客服。`,
    '',
    '【必须遵守的规则】',
    '1. 只依据下面提供的本站资料作答。资料里没有的信息，必须直说"这条我不确定，建议联系人工客服"，严禁编造价格、时效、退款资格或商品参数。',
    '2. 涉及金额、发货时长、退款条件的回答，末尾附一句「以下单页/查单页实际展示为准」。',
    '3. 不在对话中提供任何收款账号、钱包地址或二维码内容，一律引导顾客下单后在结算页查看。',
    '4. 绝不索取顾客的登录密码、查询密码、私钥或验证码；若顾客主动粘贴，提醒对方注意隐私并建议清空。',
    '5. 不提供任何绕过本站下单流程的私下交易；不代客改价、发卡、退款、查询具体订单（订单三要素属隐私，引导去查单页自助查询）。',
    '6. 与充值/本站业务无关的请求（写作、翻译、写代码、推销等）礼貌拒绝并把话题引回本站。',
    '7. 语气：中文、简洁友好、不啰嗦。单次回复控制在 200 字以内，可用短横线列表；不使用 Markdown 标题、加粗符号或代码块。',
    extra ? `\n【店主补充的业务说明（不得违反以上规则）】\n${extra}` : '',
    '\n===== 本站资料开始 =====',
    knowledgeText || '（本站资料暂缺，任何问题都应引导顾客联系人工客服）',
    '===== 本站资料结束 =====',
  ].filter(Boolean).join('\n');
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const startTime = Date.now();

  try {
    // GET：仅返回模型目录（前端选择器用），失败由前端保留旧列表
    if (req.method === 'GET') {
      const ak = readServiceAK(req);
      if (!ak) return json({ error: 'AI 服务凭证未就绪' }, 503);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1500);
      try {
        const r = await fetch(`${MEOO_AI_BASE_URL}/meoo-ai/compatible-mode/v1/models`, {
          headers: { Authorization: `Bearer ${ak}` }, signal: controller.signal,
        });
        return new Response(await r.text(), {
          status: r.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
      } catch {
        return json({ error: '模型目录暂时不可用' }, 503);
      } finally {
        clearTimeout(timer);
      }
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const messages = Array.isArray(body.messages) ? (body.messages as Msg[]) : [];
    const visitorId = trim(body.visitor_id, 64) || 'anonymous';
    const model = trim(body.model, 60) || DEFAULT_MODEL;

    if (!messages.length) return json({ error: 'EMPTY_MESSAGES', message: '没有收到消息内容' }, 400);

    const projectUrlId = req.headers.get('X-Meoo-Project-Url-Id')?.trim() || '';
    const serviceAK = readServiceAK(req);
    if (!serviceAK) return json({ error: 'AI_UNAVAILABLE', message: '当前项目的 AI 服务凭证未就绪，请稍后重试' }, 503);

    // 游客可用：函数以 verify_jwt=false 部署，但仍需一个 Supabase 客户端读知识库。
    // 这里用 anon key（RLS 已允许 anon 读商品/FAQ/站点设置），不使用 service role。
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: projectUrlId ? { 'OneDay-App-Id': projectUrlId } : {} } },
    );

    const [kb, settingsRes] = await Promise.all([
      buildKnowledge(sb),
      sb.from('site_settings').select('value').eq('key', 'ai_support').maybeSingle(),
    ]);
    const cfg = (((settingsRes.data ?? {}) as Row).value ?? {}) as {
      enabled?: boolean; display_name?: string; system_prompt_extra?: string;
    };
    if (cfg.enabled === false) {
      console.warn(`[${FUNCTION_NAME}] ${requestId} rejected: support disabled by owner`);
      return json({ error: 'SUPPORT_DISABLED', message: '在线客服已下线，请联系人工客服' }, 503);
    }

    const rate = checkRate(visitorId);
    if (!rate.allowed) {
      console.warn(`[${FUNCTION_NAME}] ${requestId} rate limited visitor=${visitorId.slice(0, 12)} reason=${rate.reason}`);
      return json({
        error: rate.reason,
        message: rate.reason === 'RATE_LIMIT_MIN' ? '提问太快啦，稍等一下再问～' : '今天提问次数已达上限，如需帮助请联系人工客服',
      }, 429);
    }

    // 只保留最近 12 轮，且丢弃非法角色，控制 token 成本
    const history = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-24)
      .map((m) => ({ role: m.role, content: trim(m.content, 500) }));
    if (!history.length) return json({ error: 'EMPTY_MESSAGES', message: '请输入想咨询的问题' }, 400);

    const displayName = trim(cfg.display_name, 20) || 'AI 在线客服';
    const payload = {
      model,
      stream: true,
      messages: [
        { role: 'system', content: buildSystemPrompt(kb.text, trim(cfg.system_prompt_extra, 800), displayName) },
        ...history,
      ] as Msg[],
    };

    console.info(`[${FUNCTION_NAME}] request ${requestId} model=${model} turns=${history.length} kbChars=${kb.text.length} products=${kb.counts.products} faqs=${kb.counts.faqs}`);

    const upstream = await fetch(`${MEOO_AI_BASE_URL}/meoo-ai/compatible-mode/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceAK}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    console.info(`[${FUNCTION_NAME}] upstream ${requestId} status=${upstream.status} durationMs=${Date.now() - startTime}`);

    if (!upstream.ok) {
      const errBody = await upstream.text();
      console.error(`[${FUNCTION_NAME}] upstream failed ${requestId} status=${upstream.status}: ${errBody.slice(0, 300)}`);
      return new Response(errBody, { status: upstream.status, headers: { 'Content-Type': 'application/json' } });
    }

    const reader = upstream.body!.getReader();
    let bytes = 0;
    const readable = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            controller.enqueue(value);
          }
          controller.close();
          console.info(`[${FUNCTION_NAME}] stream done ${requestId} bytes=${bytes} durationMs=${Date.now() - startTime}`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[${FUNCTION_NAME}] stream failed ${requestId}: ${message}`);
          controller.error(err);
        }
      },
    });

    return new Response(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error(`[${FUNCTION_NAME}] failed ${requestId}: ${message}`);
    return json({ error: 'INTERNAL', message: '客服服务异常，请稍后重试或联系人工客服' }, 500);
  }
});

/** 平台按项目自动注入 AK；系统保护变量，严禁 set-secret */
function readServiceAK(req: Request): string {
  const projectUrlId = req.headers.get('X-Meoo-Project-Url-Id')?.trim() || '';
  return (projectUrlId ? Deno.env.get(`MEOO_PROJECT_API_KEY_${projectUrlId}`) : '')
    || Deno.env.get('MEOO_PROJECT_API_KEY')
    || '';
}
