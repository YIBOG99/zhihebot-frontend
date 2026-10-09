// 云端到账核验 Edge Function（每分钟由定时任务触发，无需顾客页面开着）
//   1) alipay_sweep_pick() 取本轮在途订单，并顺带完成两项本地清理：
//        · 从未出码且已过时限的待付款单 → 关闭
//        · 余额已扣但缺货且已过时限的单 → 原路退回余额
//   2) 对已出码的支付宝在线单逐笔 alipay.trade.query 复核
//        TRADE_SUCCESS/FINISHED → alipay_mark_settled（充值单入钱包，普通单发卡）
//        已过时限且确实未成交   → order_expire_close（宁可晚关不误关）
// Secrets: 复用 alipay-pay 的 ALIPAY_APP_ID / ALIPAY_PRIVATE_KEY(PKCS#8) / ALIPAY_PUBLIC_KEY
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { importPrivateKey, rsaSign, buildSignContent } from './pkcs8.ts';

const functionName = 'alipay-sweep';
const GATEWAY = 'https://openapi.alipay.com/gateway.do';
const MAX_QUERY_PER_RUN = 30; // 单次调度上限，避免网关限流

type Json = Record<string, unknown>;
type Candidate = {
  id: string; amount: number; status: string; payment_method: string | null;
  is_recharge: boolean | null; expires_at: string | null; card_secret: string | null;
};

function json(data: Json, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function nowStamp(): string {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

async function signedForm(params: Record<string, string>): Promise<string> {
  const privateKeyPem = Deno.env.get('ALIPAY_PRIVATE_KEY') ?? '';
  const appId = Deno.env.get('ALIPAY_APP_ID') ?? '';
  if (!appId || !privateKeyPem) throw new Error('NOT_CONFIGURED');
  const key = await importPrivateKey(privateKeyPem);
  const signed = { ...params };
  delete signed.sign;
  signed.sign = await rsaSign(buildSignContent(signed), key);
  return Object.entries(signed).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

/** 单笔查单：返回交易状态与支付宝交易号；查无此单时以 sub_code 表达 */
async function queryTrade(orderId: string): Promise<Json> {
  const params: Record<string, string> = {
    app_id: Deno.env.get('ALIPAY_APP_ID') ?? '',
    method: 'alipay.trade.query',
    format: 'JSON', charset: 'utf-8', sign_type: 'RSA2',
    timestamp: nowStamp(), version: '1.0',
    biz_content: JSON.stringify({ out_trade_no: orderId }),
  };
  const res = await fetch(GATEWAY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: await signedForm(params),
  });
  const text = await res.text();
  let body: Json;
  try { body = JSON.parse(text) as Json; } catch { throw new Error(`网关响应异常: ${text.slice(0, 160)}`); }
  return (body.alipay_trade_query_response as Json | undefined) ?? {};
}

/** RPC 返回标量 TEXT：NULL=成功，非 NULL=拒绝原因（Deno 下 supabase-js 会把行推成 never，需显式取值） */
function rpcMessage(data: unknown, error: { message: string } | null): string | null {
  if (error) return error.message;
  return typeof data === 'string' ? data : null;
}

Deno.serve(async () => {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: pickData, error: pickErr } = await admin.rpc('alipay_sweep_pick', {
      _limit: MAX_QUERY_PER_RUN,
    });
    if (pickErr) {
      console.error(`[${functionName}] pick failed ${requestId}: ${pickErr.code} ${pickErr.message}`);
      return json({ error: 'PICK_FAILED', message: pickErr.message }, 500);
    }
    const pick = (pickData ?? {}) as { orders?: Candidate[] };
    const orders = Array.isArray(pick.orders) ? pick.orders : [];
    console.info(`[${functionName}] request ${requestId} candidates=${orders.length}`);
    if (orders.length === 0) return json({ ok: true, scanned: 0, settled: 0, closed: 0 });

    let settled = 0;
    let closed = 0;
    let skipped = 0;

    for (const o of orders) {
      // 站内余额单无需向支付宝复核（退回已由 pick 处理）
      if (o.payment_method === 'balance') { skipped++; continue; }

      let resp: Json;
      try {
        resp = await queryTrade(o.id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === 'NOT_CONFIGURED') return json({ error: 'NOT_CONFIGURED', message: '支付宝在线收款尚未配置' }, 503);
        console.warn(`[${functionName}] query failed order=${o.id}: ${msg}`);
        skipped++;
        continue;
      }

      const code = String(resp.code ?? '');
      const subCode = String(resp.sub_code ?? '');
      const tradeStatus = String(resp.trade_status ?? '');
      const expired = o.expires_at ? new Date(o.expires_at).getTime() < Date.now() : false;

      // 确实已付款 → 登记到账（充值单入钱包 / 普通单发卡），函数内部幂等
      if (code === '10000' && (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED')) {
        const { data: sd, error: se } = await admin.rpc('alipay_mark_settled', {
          _order_id: o.id, _trade_no: String(resp.trade_no ?? ''),
        });
        const r = rpcMessage(sd, se as { message: string } | null);
        if (r) console.error(`[${functionName}] settle rejected order=${o.id}: ${r}`);
        else settled++;
        continue;
      }

      // 未到时限：仍在正常支付窗口内，本轮不动
      if (!expired) { skipped++; continue; }

      // 支付宝侧已关闭，或查无此单（买家从未完成下单）→ 本地同步关闭
      const notFound = subCode.includes('TRADE_NOT_EXIST') || code.includes('TRADE_NOT_EXIST');
      if ((code === '10000' && tradeStatus === 'TRADE_CLOSED') || notFound) {
        const { data: cd, error: ce } = await admin.rpc('order_expire_close', { _order_id: o.id });
        const r = rpcMessage(cd, ce as { message: string } | null);
        if (r) console.warn(`[${functionName}] close rejected order=${o.id}: ${r}`);
        else closed++;
        continue;
      }

      // WAIT_BUYER_PAY 或状态不明：宁可晚关也不误关，下一分钟再判
      skipped++;
    }

    console.info(`[${functionName}] success ${requestId} settled=${settled} closed=${closed} skipped=${skipped}`);
    return json({ ok: true, scanned: orders.length, settled, closed, skipped });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[${functionName}] failed ${requestId}: ${message}`);
    return json({ error: 'INTERNAL', message }, 500);
  }
});
