// 老板看板专用 Edge Function：BOSS_KEY 口令校验 + service-role 查库（绕开 RLS）。
// 所有 action 先过密钥关，不匹配一律 401 且不查库、不泄露任何业务数据。
// Secrets: BOSS_KEY（通过 meoo-cli cloud set-secret 配置）
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const functionName = 'boss-api';

type Json = Record<string, unknown>;

function json(data: Json, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, OneDay-App-Id',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  });
}

/** 常量时间比对，防时序侧信道 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// 口令配对通道：action='pair' 且请求体 key 与当前 BOSS_KEY 完全一致时，仅返回其 SHA-256 摘要
// （不可逆推明文），供部署方一次性校准口令；每次重新部署（进程重启）后限用一次。
let pairingConsumed = false;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true });
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const body = (await req.json()) as { action?: string; key?: string; days?: number; status?: string; range?: string; q?: string };
    const bossKey = (Deno.env.get('BOSS_KEY') ?? '').trim();
    if (!bossKey) return json({ error: 'NOT_CONFIGURED', message: '老板看板尚未开通' }, 503);
    const inputKey = (body.key ?? '').trim();
    if (!inputKey || !safeEqual(inputKey, bossKey)) {
      console.info(`[${functionName}] ${requestId} invalid key attempt action=${body.action} len=${inputKey.length}`);
      return json({ error: 'INVALID_KEY' }, 401);
    }
    // 配对通道：口令正确才可达，只回显摘要，绝不回显明文
    if (body.action === 'pair') {
      if (pairingConsumed) return json({ error: 'PAIRING_CLOSED', message: '本次部署的配对通道已使用，请重新部署后重试' }, 409);
      pairingConsumed = true;
      return json({ ok: true, hash: await sha256Hex(bossKey) });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── dashboard：日活/收款序列 + 今日/累计标量 ──
    if (body.action === 'dashboard') {
      const days = Math.min(Math.max(Number(body.days) || 30, 1), 90);
      const todayCn = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
      const sinceCn = new Date(Date.now() + 8 * 3600_000 - (days - 1) * 86400_000).toISOString().slice(0, 10);

      const [{ data: stats }, { data: completed }, { data: pendingCnt }] = await Promise.all([
        admin.from('daily_stats').select('day, visits, login_users, order_count, revenue').gte('day', sinceCn).lte('day', todayCn).order('day'),
        admin.from('orders').select('amount').eq('status', 'completed'),
        admin.from('orders').select('id', { count: 'exact', head: true }).in('status', ['pending_payment', 'pay_processing', 'paid_pending_delivery']),
      ]);

      const map = new Map((stats ?? []).map((s: { day: string }) => [s.day, s]));
      const series: Json[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(Date.now() + 8 * 3600_000 - i * 86400_000).toISOString().slice(0, 10);
        const row = map.get(d) as { visits?: number; order_count?: number; revenue?: number } | undefined;
        series.push({ day: d, visits: row?.visits ?? 0, order_count: row?.order_count ?? 0, revenue: Number(row?.revenue ?? 0) });
      }
      const todayRow = map.get(todayCn) as { visits?: number; login_users?: number; order_count?: number; revenue?: number } | undefined;
      const totalRevenue = (completed ?? []).reduce((s: number, r: { amount: number }) => s + Number(r.amount), 0);
      const weekVisits = series.slice(-7).reduce((s, p) => s + Number(p.visits), 0);
      const { count: totalOrders } = await admin.from('orders').select('id', { count: 'exact', head: true });

      return json({
        ok: true,
        series,
        today: {
          visits: todayRow?.visits ?? 0,
          login_users: todayRow?.login_users ?? 0,
          order_count: todayRow?.order_count ?? 0,
          revenue: Number(todayRow?.revenue ?? 0),
        },
        week_visits: weekVisits,
        total_revenue: totalRevenue,
        total_orders: totalOrders ?? 0,
        pending_audit: pendingCnt ?? 0,
      });
    }

    // ── sales：近 N 天 completed 订单按商品聚合排行 ──
    if (body.action === 'sales') {
      const days = Math.min(Math.max(Number(body.days) || 30, 1), 90);
      const sinceIso = new Date(Date.now() - (days - 1) * 86400_000 - 8 * 3600_000).toISOString();
      const { data: rows, error } = await admin.from('orders')
        .select('product_id, product_snapshot, amount').eq('status', 'completed').gte('created_at', sinceIso);
      if (error) return json({ ok: false, error: error.message }, 500);
      const agg = new Map<string, { title: string; sold_count: number; revenue: number }>();
      for (const r of rows ?? []) {
        const id = String(r.product_id ?? 'unknown');
        const snap = r.product_snapshot as { title?: string } | null;
        const cur = agg.get(id) ?? { title: snap?.title ?? id, sold_count: 0, revenue: 0 };
        cur.sold_count += 1;
        cur.revenue += Number(r.amount);
        agg.set(id, cur);
      }
      const list = Array.from(agg.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
      return json({ ok: true, sales: list });
    }

    // ── orders：订单列表（状态/时间范围/关键词过滤） ──
    if (body.action === 'orders') {
      let query = admin.from('orders').select('*').order('created_at', { ascending: false }).limit(200);
      if (body.status && body.status !== 'all') query = query.eq('status', body.status);
      if (body.range && body.range !== 'all') {
        const d = body.range === 'today' ? 1 : body.range === '7d' ? 7 : 30;
        const since = new Date(Date.now() - (d - 1) * 86400_000 - 8 * 3600_000);
        since.setUTCHours(0, 0, 0, 0);
        query = query.gte('created_at', since.toISOString());
      }
      const kw = typeof body.q === 'string' ? body.q.trim().replace(/[%_]/g, '') : '';
      if (kw) {
        const like = `%${kw}%`;
        query = query.or(`id.ilike.${like},contact_email.ilike.${like},contact_phone.ilike.${like}`);
      }
      const { data, error } = await query;
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, orders: data ?? [] });
    }

    return json({ error: 'UNKNOWN_ACTION' }, 400);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[${functionName}] failed ${requestId}: ${message}`);
    return json({ error: 'INTERNAL', message }, 500);
  }
});
