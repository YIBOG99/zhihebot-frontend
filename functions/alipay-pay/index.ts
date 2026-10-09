// 支付宝在线收款 Edge Function
//   create → 出码。优先「当面付」alipay.trade.precreate（扫码支付，无需 return_url）；
//            未签约当面付时自动降级「电脑网站支付」alipay.trade.page.pay（返回收银台链接）。
//   query  → 主动查单对账 → order_mark_paid → 自动发卡。不依赖公网异步通知。
// Secrets: ALIPAY_APP_ID / ALIPAY_PRIVATE_KEY(PKCS#8) / ALIPAY_PUBLIC_KEY
//          可选 ALIPAY_RETURN_URL（网站支付付款后跳回地址，如 https://xxx/orders/lookup）
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { importPrivateKey, rsaSign, buildSignContent, deriveAppPublicKeyB64 } from './pkcs8.ts';
// importPrivateKey 供 signedForm 签名使用；deriveAppPublicKeyB64 仅 selfcheck 通道使用

const functionName = 'alipay-pay';
const GATEWAY = 'https://openapi.alipay.com/gateway.do';

type Json = Record<string, unknown>;
type OrderRow = { id: string; amount: number; status: string; product_id: string | null; card_secret?: string | null };
type AssignResult = { ok: boolean; message: string };

function json(data: Json, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

function nowStamp(): string {
  // 支付宝要求 yyyy-MM-dd HH:mm:ss（东八区）
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

/** 公共请求参数（不含 biz_content 与 sign） */
function commonParams(method: string): Record<string, string> {
  return {
    app_id: Deno.env.get('ALIPAY_APP_ID') ?? '',
    method,
    format: 'JSON',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: nowStamp(),
    version: '1.0',
  };
}

/** 已签名、可直接 POST 给网关的表单串 */
async function signedForm(params: Record<string, string>): Promise<string> {
  const privateKeyPem = Deno.env.get('ALIPAY_PRIVATE_KEY') ?? '';
  if (!params.app_id || !privateKeyPem) throw new Error('NOT_CONFIGURED');
  const key = await importPrivateKey(privateKeyPem);
  const signed = { ...params };
  delete signed.sign;
  signed.sign = await rsaSign(buildSignContent(signed), key);
  return Object.entries(signed)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
}

/** 调用网关 API 并解析 xxx_response */
async function callAlipay(method: string, bizContent: Json): Promise<Json> {
  const params = { ...commonParams(method), biz_content: JSON.stringify(bizContent) };
  const res = await fetch(GATEWAY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: await signedForm(params),
  });
  const text = await res.text();
  let body: Json;
  try {
    body = JSON.parse(text) as Json;
  } catch {
    throw new Error(`支付宝网关响应异常: ${text.slice(0, 200)}`);
  }
  const respKey = method.replace(/\./g, '_') + '_response';
  const resp = body[respKey] as Json | undefined;
  if (!resp) throw new Error(`支付宝响应缺少 ${respKey}`);
  return resp;
}

/** 生成电脑网站支付的收银台 GET 链接 */
async function buildPagePayUrl(bizContent: Json): Promise<string> {
  const params: Record<string, string> = { ...commonParams('alipay.trade.page.pay'), biz_content: JSON.stringify(bizContent) };
  const returnUrl = (Deno.env.get('ALIPAY_RETURN_URL') ?? '').trim();
  if (returnUrl) params.return_url = returnUrl;
  return `${GATEWAY}?${await signedForm(params)}`;
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const body = (await req.json()) as { action?: string; order_id?: string };

    // 自检通道：不碰数据库、不打网关，只校验本地密钥可用性并回显私钥对应的应用公钥。
    // 用途：与开放平台「接口加签方式 → 应用公钥」逐字符比对，判断两边是否同一对钥匙。
    if (body.action === 'selfcheck') {
      const priv = Deno.env.get('ALIPAY_PRIVATE_KEY') ?? '';
      const appId = Deno.env.get('ALIPAY_APP_ID') ?? '';
      const alipayPub = (Deno.env.get('ALIPAY_PUBLIC_KEY') ?? '').replace(/\s+/g, '');
      if (!priv || !appId) return json({ error: 'NOT_CONFIGURED', message: '缺少 ALIPAY_APP_ID 或 ALIPAY_PRIVATE_KEY' }, 503);
      let appPublicKey = '';
      try {
        appPublicKey = await deriveAppPublicKeyB64(priv);   // 内含 WebCrypto pkcs8 解析，失败即私钥不可用
      } catch (e) {
        return json({ ok: false, stage: 'parse_private_key', message: e instanceof Error ? e.message : String(e) }, 500);
      }
      const flat = appPublicKey.replace(/\s+/g, '');
      return json({
        ok: true,
        app_id: appId,
        private_key_parse_ok: true,
        // ↓ 这一串就是必须登记在开放平台「应用公钥」框里的内容（单行、无空格、无 PEM 头尾）
        app_public_key: flat,
        app_public_key_len: flat.length,
        alipay_public_key_configured: alipayPub.length > 0,
        alipay_public_key_head: alipayPub.slice(0, 16),
      });
    }

    const orderId = (body.order_id ?? '').trim();
    if (!/^ZH\d{8}[A-Z0-9]{6}$/.test(orderId)) return json({ error: 'INVALID_ORDER' }, 400);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: order, error: qErr } = await admin
      .from('orders')
      .select('id, amount, status, product_id, card_secret')
      .eq('id', orderId)
      .maybeSingle() as { data: OrderRow | null; error: { message: string } | null };
    if (qErr || !order) return json({ error: 'ORDER_NOT_FOUND' }, 404);

    console.info(`[${functionName}] request ${requestId} action=${body.action} order=${orderId}`);

    if (body.action === 'create') {
      if (order.status !== 'pending_payment' && order.status !== 'pay_processing') {
        return json({ error: 'STATUS_NOT_PAYABLE', status: order.status }, 400);
      }
      const { data: prod } = await admin.from('products').select('title').eq('id', order.product_id).maybeSingle();
      const subject = String(prod?.title ?? '智核数字服务');
      const amount = Number(order.amount).toFixed(2);

      // 通道一：当面付（扫码）。网站应用通常未签约此产品，失败原因仅用于日志诊断。
      let channel = 'alipay_qr';
      let qrCode = '';
      let payUrl = '';
      let precreateReason = '';
      try {
        const precreateResp = await callAlipay('alipay.trade.precreate', {
          out_trade_no: orderId,
          total_amount: amount,
          subject,
          timeout_express: '15m',
        });
        if (precreateResp.code === '10000' && precreateResp.qr_code) {
          qrCode = String(precreateResp.qr_code);
        } else {
          precreateReason = `${String(precreateResp.sub_code ?? '')} ${String(precreateResp.sub_msg ?? precreateResp.msg ?? '')}`.trim();
        }
      } catch (e) {
        precreateReason = e instanceof Error ? e.message : String(e);
      }

      if (!qrCode) {
        console.info(`[${functionName}] 当面付不可用，改用电脑网站支付 ${requestId}: ${precreateReason || '未签约'}`);
        // 签约预检：page.pay 只签名拼 URL、不打网关，若该应用同样未签约「电脑网站支付」，
        // 买家点开链接才在支付宝侧看到报错页。这里先用一次 trade.query 探活——
        // 已收单 → 交易状态类错误码（ACQ.TRADE_*）说明产品可用；
        // 仅当返回 isv.insufficient-isv-permissions / Invalid product code 时才判定为未签约，
        // 其余情况一律放行出链接，避免误伤正常支付。
        let pagePayUnavailable = '';
        try {
          const probe = await callAlipay('alipay.trade.query', { out_trade_no: orderId });
          const subCode = String(probe.sub_code ?? '');
          const code = String(probe.code ?? '');
          const productIssue = subCode === 'isv.insufficient-isv-permissions'
            || subCode === 'invalid-api-or-method'
            || subCode === 'isv.invalid-product-code'
            || code === 'isv.insufficient-isv-permissions';
          if (productIssue) {
            pagePayUnavailable = `${subCode || code} ${String(probe.sub_msg ?? probe.msg ?? '')}`.trim();
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes('isv.insufficient-isv-permissions') || msg.includes('Invalid product code')) {
            pagePayUnavailable = msg;
          }
          // 其他异常（如查无此单）视为产品可用，继续出链接
        }
        if (pagePayUnavailable) {
          console.error(`[${functionName}] CHANNEL_UNAVAILABLE 电脑网站支付未签约 ${requestId} order=${orderId}: ${pagePayUnavailable}`);
          return json({
            error: 'CHANNEL_UNAVAILABLE',
            message: '支付宝「电脑网站支付」产品尚未开通（当前应用未签约可用收单产品），请到支付宝开放平台完成签约后再启用在线收款',
            detail: pagePayUnavailable,
          }, 503);
        }
        try {
          payUrl = await buildPagePayUrl({
            out_trade_no: orderId,
            total_amount: amount,
            subject,
            product_code: 'FAST_INSTANT_TRADE_PAY',
            qr_pay_mode: '4',       // 内嵌二维码模式，便于在站内直接展示
            qrcode_width: '120',
            timeout_express: '15m',
          });
          channel = 'alipay_page';
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[${functionName}] page.pay failed ${requestId}: ${msg}`);
          if (msg === 'NOT_CONFIGURED') throw e;
          return json({ error: 'ALIPAY_REJECTED', message: `下单失败：${msg}` }, 502);
        }
      }

      await admin.from('orders')
        .update({ status: 'pay_processing', payment_method: channel, updated_at: new Date().toISOString() })
        .eq('id', orderId);
      return json({ ok: true, channel, qr_code: qrCode || null, pay_url: payUrl || null, amount: Number(order.amount) });
    }

    if (body.action === 'query') {
      // 已完成订单直接回卡密，不再打扰支付宝
      if (order.status === 'completed') {
        return json({ ok: true, paid: true, status: 'completed', card_secret: order.card_secret ?? null });
      }
      if (order.status === 'closed') return json({ ok: true, paid: false, status: 'closed' });
      if (order.status === 'paid_pending_delivery') {
        // 已收款但缺卡密的历史态，尝试再发一次
        const { data: r } = await admin.rpc('order_assign_card', { _order_id: orderId }).maybeSingle() as { data: AssignResult | null };
        return json({ ok: true, paid: true, status: 'checking', message: r?.message ?? '' });
      }
      if (order.status !== 'pay_processing') return json({ ok: true, paid: false, status: order.status });

      const resp = await callAlipay('alipay.trade.query', { out_trade_no: orderId });
      const tradeStatus = String(resp.trade_status ?? '');
      if (resp.code === '10000' && (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED')) {
        const { data: mark } = await admin
          .rpc('order_mark_paid', { _order_id: orderId, _trade_no: String(resp.trade_no ?? '') })
          .maybeSingle() as { data: AssignResult | null };
        const { data: fresh } = await admin.from('orders').select('status, card_secret').eq('id', orderId).maybeSingle() as { data: { status: string; card_secret: string | null } | null };
        console.info(`[${functionName}] paid ${requestId} order=${orderId} assignOk=${Boolean(mark?.ok)}`);
        return json({
          ok: true,
          paid: true,
          status: fresh?.status ?? 'completed',
          card_secret: fresh?.card_secret ?? null,
          message: mark?.message ?? '',
        });
      }
      return json({ ok: true, paid: false, status: tradeStatus || 'WAIT_BUYER_PAY' });
    }

    if (body.action === 'expire-check') {
      // 超时关单复核：仅处理已过支付时限、已出码但尚未到账的在途订单。
      // 先向支付宝确认确实没有成功交易，才允许关闭，避免误杀临界时刻付款的买家。
      if (order.status !== 'pay_processing') return json({ ok: true, closed: order.status === 'closed', skipped: true, status: order.status });
      if (order.card_secret) return json({ ok: true, skipped: true, status: 'has_card' });

      let resp: Json;
      try {
        resp = await callAlipay('alipay.trade.query', { out_trade_no: orderId });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.info(`[${functionName}] expire-check 查单异常，跳过本轮 order=${orderId}: ${msg}`);
        return json({ ok: true, skipped: true, reason: 'QUERY_FAILED' });
      }
      const tradeStatus = String(resp.trade_status ?? '');
      const code = String(resp.code ?? '');
      const subCode = String(resp.sub_code ?? '');

      // 确实已付款 → 走正常核账发卡，绝不关闭
      if (code === '10000' && (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED')) {
        const { data: mark } = await admin
          .rpc('order_mark_paid', { _order_id: orderId, _trade_no: String(resp.trade_no ?? '') })
          .maybeSingle() as { data: AssignResult | null };
        console.info(`[${functionName}] expire-check 发现已付款，改为发货 order=${orderId} assignOk=${Boolean(mark?.ok)}`);
        return json({ ok: true, paid: true, status: 'completed', message: mark?.message ?? '' });
      }

      // 交易进行中（买家正在付）→ 本轮不关，下一分钟再判
      if (code === '10000' && (tradeStatus === 'WAIT_BUYER_PAY' || tradeStatus === 'TRADE_CLOSED')) {
        if (tradeStatus === 'TRADE_CLOSED') {
          // 支付宝侧交易已关闭（其自身 timeout_express 生效），本地同步关闭
          const { data: r } = await admin.rpc('order_expire_close', { _order_id: orderId }).maybeSingle() as { data: string | null };
          console.info(`[${functionName}] expire-check 支付宝交易已关闭，本地同步 order=${orderId} result=${r ?? 'OK'}`);
          return json({ ok: true, closed: r === null, status: 'closed' });
        }
        return json({ ok: true, skipped: true, reason: 'WAIT_BUYER_PAY' });
      }

      // 查无此单 / 未创建交易：说明买家从未在支付宝侧完成下单动作，可安全关闭
      const notFound = subCode === 'ACQ.TRADE_NOT_EXIST' || code === 'ACQ.TRADE_NOT_EXIST'
        || subCode.includes('TRADE_NOT_EXIST');
      if (notFound) {
        const { data: r } = await admin.rpc('order_expire_close', { _order_id: orderId }).maybeSingle() as { data: string | null };
        console.info(`[${functionName}] expire-check 超时关单 order=${orderId} result=${r ?? 'OK'}`);
        return json({ ok: true, closed: r === null, status: 'closed' });
      }

      // 其余情况一律保守跳过，宁可晚关也不误关
      console.info(`[${functionName}] expire-check 状态不明，跳过 order=${orderId} code=${code} sub=${subCode}`);
      return json({ ok: true, skipped: true, reason: code || subCode || 'UNKNOWN' });
    }

    return json({ error: 'UNKNOWN_ACTION' }, 400);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'NOT_CONFIGURED') {
      return json({ error: 'NOT_CONFIGURED', message: '支付宝在线支付尚未开通，请使用人工转账通道' }, 503);
    }
    // 兜底：网关异常文本里带权限不足/产品未签约特征时，归一为 CHANNEL_UNAVAILABLE，
    // 让前端能给出「请到开放平台签约」的明确指引而不是笼统网络错误
    if (message.includes('isv.insufficient-isv-permissions') || message.includes('Invalid product code')) {
      return json({
        error: 'CHANNEL_UNAVAILABLE',
        message: '支付宝收单产品尚未开通（接口调用权限不足），请到支付宝开放平台完成产品签约后再启用在线收款',
        detail: message,
      }, 503);
    }
    console.error(`[${functionName}] failed ${requestId}: ${message}`);
    return json({ error: 'INTERNAL', message }, 500);
  }
});
