// 钱包（账户余额）前端契约：查询、金额口径与手续费计算。
// ⚠️ 手续费的最终判定在 order_create RPC 内部（再读一次 site_settings.billing），
//    这里只是给前端做「实时联动显示」，两边必须用同一个公式，否则建单会被金额校验拒绝。
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/supabase/client';
import type { WalletInfo, BillingConfig } from '@/lib/types';

/** 支付宝类通道（需加收渠道手续费）。余额/微信/USDT 均免手续费 */
export const FEE_CHANNELS = new Set(['alipay', 'alipay_qr', 'alipay_manual']);

/** 默认费率（百分比数值），与 migration 种子值一致 */
export const DEFAULT_FEE_RATE = 4.6;

/** 取有效费率：后台关了总开关或填了非法值 → 0 / 回退默认，与服务端 order_create 同口径 */
export function effectiveFeeRate(billing?: BillingConfig): number {
  if (billing && billing.fee_enabled === false) return 0;
  const r = Number(billing?.alipay_fee_rate);
  if (!Number.isFinite(r) || r < 0 || r > 20) return DEFAULT_FEE_RATE;
  return r;
}

/**
 * 统一金额口径（服务端 order_create 完全一致）：
 *   fee = 支付宝类通道 ? round(round(gross - discount,2) × rate/100, 2) : 0
 *   payable = gross - discount + fee
 */
export function calcPayable(gross: number, discount: number, channel: string, rate: number) {
  const afterDiscount = Math.max(0, Math.round((gross - discount) * 100) / 100);
  // afterDiscount × rate% 后四舍五入到分（与服务端 round(round(...)*rate/100, 2) 一致）
  const fee = FEE_CHANNELS.has(channel)
    ? Math.round(Math.round(afterDiscount * 100) * rate) / 10000
    : 0;
  const feeRounded = Math.round(fee * 100) / 100;
  return {
    goods: gross,
    discount,
    fee: feeRounded,
    payable: Math.round((afterDiscount + feeRounded) * 100) / 100,
  };
}

/** 我的钱包（仅登录可用；未登录返回空结构，调用侧 enabled 控制） */
export function useMyWallet(enabled = true) {
  return useQuery({
    queryKey: ['my-wallet'],
    enabled,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_wallet');
      if (error) {
        console.error('[useMyWallet] rpc failed:', error.code, error.message);
        throw error;
      }
      const raw = (data ?? {}) as Record<string, unknown>;
      return {
        available: Number(raw.available ?? 0),
        frozen: Number(raw.frozen ?? 0),
        total_recharged: Number(raw.total_recharged ?? 0),
        total_spent: Number(raw.total_spent ?? 0),
        transactions: Array.isArray(raw.transactions) ? raw.transactions : [],
      } as WalletInfo;
    },
  });
}

/** 余额支付（order_pay_with_balance 标量 TEXT：NULL=成功）。失败文案直接透出给用户 */
export async function payWithBalance(orderId: string): Promise<{ ok: boolean; message: string }> {
  const { data, error } = await supabase.rpc('order_pay_with_balance', { _order_id: orderId });
  if (error) {
    console.error('[payWithBalance] transport error:', error.code, error.message);
    return { ok: false, message: `${error.code ?? ''} ${error.message}`.trim() };
  }
  if (data === null || data === undefined || data === '') return { ok: true, message: '余额支付成功' };
  const msg = String(Array.isArray(data) ? (data[0] ?? '') : data);
  return msg === '' ? { ok: true, message: '余额支付成功' } : { ok: false, message: msg };
}

/** 管理员对已完成余额单退款回余额（wallet_refund_order 标量 TEXT：NULL=成功） */
export async function refundOrderToBalance(orderId: string): Promise<{ ok: boolean; message: string }> {
  const { data, error } = await supabase.rpc('wallet_refund_order', { _order_id: orderId });
  if (error) {
    console.error('[refundOrderToBalance] transport error:', error.code, error.message);
    return { ok: false, message: `${error.code ?? ''} ${error.message}`.trim() };
  }
  if (data === null || data === undefined || data === '') return { ok: true, message: '已退回买家余额' };
  const msg = String(Array.isArray(data) ? (data[0] ?? '') : data);
  return msg === '' ? { ok: true, message: '已退回买家余额' } : { ok: false, message: msg };
}

/** 让钱包缓存失效（充值/支付/退款后调用） */
export function invalidateWallet(qc: { invalidateQueries: (o: { queryKey: string[] }) => void }) {
  qc.invalidateQueries({ queryKey: ['my-wallet'] });
}

/**
 * 建单成功后更换支付方式：服务端按所选通道重算手续费并回写订单金额。
 * order_set_payment_method 标量 TEXT：NULL=成功；返回新应付金额供前端刷新展示。
 * 游客单靠查询密码摘要做归属校验（与查单页同一把钥匙）。
 */
export async function switchOrderChannel(
  orderId: string,
  method: string,
  pwHash?: string | null,
): Promise<{ ok: boolean; message: string; amount: number }> {
  const { data, error } = await supabase.rpc('order_set_payment_method', {
    _order_id: orderId,
    _method: method,
    _lookup_password_hash: pwHash ?? null,
  });
  if (error) {
    console.error('[switchOrderChannel] transport error:', error.code, error.message);
    return { ok: false, message: `${error.code ?? ''} ${error.message}`.trim(), amount: 0 };
  }
  const msg = String(Array.isArray(data) ? (data[0] ?? '') : (data ?? ''));
  if (msg === '') {
    // 改单成功后回读一次真实金额，保证前端展示与服务端落库完全一致
    const { data: row } = await supabase.from('orders').select('amount').eq('id', orderId).maybeSingle();
    return { ok: true, message: '已更换支付方式', amount: Number(row?.amount ?? 0) };
  }
  return { ok: false, message: msg, amount: 0 };
}
