// 余额充值建单：个人中心内联收银面板专用。
// ⚠️ 充值已脱离商品体系（recharge-* 商品全部下架），因此必须显式传 _is_recharge=true，
//    由 order_create 走「不查 products 表」的分支；金额口径与服务端完全一致：
//    建单时按免手续费落库（amount = 本金），选定通道后由 switchOrderChannel 重算手续费。
import { supabase } from '@/supabase/client';
import { hashPassword, loadBuyerInfo } from '@/lib/buyer-vault';

/** 充值金额上下限，与服务端 order_create 的校验区间保持一致 */
export const RECHARGE_MIN = 1;
export const RECHARGE_MAX = 9999;

/** 解析并夹紧充值金额：非法输入返回 null，交由调用方提示 */
export function parseRechargeAmount(raw: string): number | null {
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  const rounded = Math.round(n * 100) / 100;
  if (rounded < RECHARGE_MIN || rounded > RECHARGE_MAX) return null;
  return rounded;
}

/**
 * 创建一笔充值单。
 * @param amount 充值本金（元，即到账进余额的金额）
 * @param contact 联系方式兜底：本机 buyer-vault 没记录时，由调用方传入当前登录账号的邮箱
 * @param captcha 人机校验凭证：⚠️ 服务端 order_create 对充值单同样强制校验，缺省不传会被直接拒单
 * @returns 订单号与免手续费口径的应付金额；失败时 message 为服务端文案，直接透出给用户。
 */
export async function createRechargeOrder(
  amount: number,
  fallbackEmail?: string | null,
  captcha?: { id: string; answer: string } | null,
): Promise<{ ok: boolean; orderNo: string; amount: number; message: string }> {
  const info = loadBuyerInfo();
  const pwHash = info?.pwHash ?? null;
  if (!pwHash) {
    return { ok: false, orderNo: '', amount: 0, message: '请先在商城完成一次下单以设置查询密码，再回来充值余额' };
  }
  const email = info?.email || (fallbackEmail || '') || null;
  const phone = info?.phone || null;
  if (!email && !phone) {
    return { ok: false, orderNo: '', amount: 0, message: '未找到可用的联系方式，请先在商城完成一次下单' };
  }

  const orderNo = genRechargeOrderNo();
  const snapshot = { title: `账户余额充值 ¥${amount.toFixed(2)}`, price: amount, subtitle: '站内余额充值', redeem_url: null };

  const { data, error } = await supabase.rpc('order_create', {
    _id: orderNo,
    _product_id: 'recharge-inline',
    _product_snapshot: snapshot,
    _quantity: 1,
    _contact_email: email,
    _contact_phone: phone,
    _lookup_password_hash: info.pwHash,
    _note: null,
    _amount: amount,
    _is_recharge: true,
    _challenge_id: captcha?.id ?? null,
    _challenge_answer: captcha?.answer ?? null,
  }).select().single();

  if (error) {
    console.error('[createRechargeOrder] rpc transport error:', error.code, error.message);
    return { ok: false, orderNo: '', amount: 0, message: `${error.code ?? ''} ${error.message}`.trim() || '充值订单创建失败' };
  }
  const row = (data ?? {}) as Record<string, unknown>;
  if (!row.ok) {
    console.error('[createRechargeOrder] rejected by server:', row.message, { hasCaptcha: Boolean(captcha?.id && captcha?.answer) });
    return { ok: false, orderNo: '', amount: 0, message: String(row.message ?? '充值订单创建失败') };
  }
  console.log('[createRechargeOrder] created', { orderNo, amount, captchaVerified: Boolean(captcha?.id) });
  return { ok: true, orderNo: String(row.order_id ?? orderNo), amount, message: '' };
}

/** 充值单号与普通订单同一格式（服务端正则要求 ZH + 8 位日期 + 6 位大写字符） */
function genRechargeOrderNo(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}`;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let tail = '';
  for (let i = 0; i < 6; i += 1) tail += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `ZH${stamp.slice(0, 8)}${tail}`;
}

export { hashPassword };
