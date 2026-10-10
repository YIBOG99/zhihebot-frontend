// 邀请有礼：专属邀请码、待生效推荐人（本机暂存）、归因绑定与统计
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/supabase/client';
import type { ProfileRow } from '@/lib/types';

/** 奖励券（public.referral_rewards，RLS 只放行自己名下的行） */
export interface ReferralReward {
  id: string;
  inviter_id: string;
  invitee_id: string | null;
  code: string;
  amount: number;
  min_amount: number;
  status: 'available' | 'used';
  created_at: string;
  used_at: string | null;
}

export interface ReferralStats {
  inviteCount: number;
  availableCount: number;
  availableAmount: number;
  usedCount: number;
  /** 累计消费返佣金额（granted 记录之和） */
  totalCommission: number;
  /** 返佣记录条数 */
  commissionCount: number;
}

/** 我的返佣明细行（my_commission_records RPC，好友名已服务端脱敏） */
export interface CommissionRecord {
  id: string;
  order_id: string;
  friend_name: string | null;
  product_title: string | null;
  base_amount: number;
  reward_amount: number;
  status: 'granted' | 'capped';
  created_at: string;
}

const PENDING_KEY = 'zh_ref_pending_v1';

/** 从 ?ref=XXX 或落地页 hash 里取推荐人邀请码，暂存本机等待注册后绑定 */
export function captureReferralCode(): string | null {
  try {
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get('ref') || url.searchParams.get('invite');
    const fromHash = /[#&?]ref=([A-Za-z0-9]+)/.exec(url.hash)?.[1];
    const raw = (fromQuery || fromHash || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4,16}$/.test(raw)) return null;
    sessionStorage.setItem(PENDING_KEY, raw);
    console.log('[referral] 已记录推荐人邀请码:', raw);
    return raw;
  } catch (e) {
    console.warn('[referral] 解析邀请码失败（隐私模式等不影响下单）:', e);
    return null;
  }
}

export function readPendingReferralCode(): string | null {
  try {
    return sessionStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

function clearPendingReferralCode() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch { /* 忽略 */ }
}

/** PostgREST 对 TABLE(ok,...) 的布尔列序列化不可靠，统一以「有无传输层 error」+ 宽松取值判定 */
function firstRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T) ?? null;
  return (data as T) ?? null;
}

/** 取（必要时生成）我的专属邀请码 */
export async function fetchMyInviteCode(): Promise<{ code: string | null; failed: boolean }> {
  const { data, error } = await supabase.rpc('my_invite_code');
  if (!error) {
    const row = firstRow<{ ok?: boolean; code?: string | null }>(data);
    if (row?.code) return { code: row.code, failed: false };
  } else {
    console.error('[referral] my_invite_code RPC failed:', error.code, error.message);
  }

  // Fallback for environments where the RPC migration is not deployed yet.
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return { code: null, failed: true };
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('invite_code')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (profileError) {
    console.error('[referral] profile invite-code fallback failed:', profileError.code, profileError.message);
    return { code: null, failed: true };
  }
  return { code: profile?.invite_code ?? null, failed: !profile?.invite_code };
}

/** 把本机暂存的推荐人邀请码绑到当前账号并发奖 */
export async function bindPendingReferral(): Promise<{ bound: boolean; message: string }> {
  const code = readPendingReferralCode();
  if (!code) return { bound: false, message: '' };
  const { data, error } = await supabase.rpc('referral_bind', { _invite_code: code });
  if (error) {
    console.error('[referral] referral_bind 失败:', error.code, error.message);
    return { bound: false, message: '邀请码核销失败，请稍后重试' };
  }
  const row = firstRow<{ ok?: boolean; message?: string | null }>(data);
  const ok = row?.ok !== false;
  console.log('[referral] bind', { code, ok, message: row?.message });
  if (ok) clearPendingReferralCode();
  return { bound: ok, message: row?.message ?? (ok ? '邀请码已生效' : '邀请码未能生效') };
}

/** 手动填写邀请码（个人中心补录，服务端仍会校验是否新注册账号） */
export async function bindReferralCode(code: string): Promise<{ bound: boolean; message: string }> {
  const { data, error } = await supabase.rpc('referral_bind', { _invite_code: code.trim().toUpperCase() });
  if (error) {
    console.error('[referral] referral_bind 失败:', error.code, error.message);
    return { bound: false, message: '提交失败，请稍后重试' };
  }
  const row = firstRow<{ ok?: boolean; message?: string | null }>(data);
  const ok = row?.ok !== false;
  if (ok) clearPendingReferralCode();
  return { bound: ok, message: row?.message ?? (ok ? '邀请码已生效' : '邀请码未能生效') };
}

export interface UseReferral {
  inviteCode: string | null;
  inviteCodeFailed: boolean;
  stats: ReferralStats | null;
  rewards: ReferralReward[];
  commissions: CommissionRecord[];
  loading: boolean;
  refresh: () => void;
}

/** 个人中心的邀请数据：邀请码 + 统计 + 我的券列表 + 返佣明细 */
export function useReferral(userId: string | null): UseReferral {
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteCodeFailed, setInviteCodeFailed] = useState(false);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [rewards, setRewards] = useState<ReferralReward[]>([]);
  const [commissions, setCommissions] = useState<CommissionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!userId) { setInviteCode(null); setInviteCodeFailed(false); setStats(null); setRewards([]); setCommissions([]); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    void (async () => {
      try {
        const inviteResult = await fetchMyInviteCode();
        if (!alive) return;
        setInviteCode(inviteResult.code);
        setInviteCodeFailed(inviteResult.failed);

        const [{ data: sd, error: se }, { data: rd, error: re }, { data: cd, error: ce }] = await Promise.all([
          supabase.rpc('my_referral_stats'),
          supabase.from('referral_rewards').select('*').eq('inviter_id', userId).order('created_at', { ascending: false }),
          supabase.rpc('my_commission_records'),
        ]);
        if (!alive) return;
        if (se) console.error('[referral] my_referral_stats 失败:', se.code, se.message);
        else {
          const r = firstRow<{ invite_count?: number | string; available_count?: number | string; available_amount?: number | string; used_count?: number | string; total_commission?: number | string; commission_count?: number | string }>(sd);
          const numberOrZero = (value: number | string | null | undefined) => {
            const n = Number(value ?? 0);
            return Number.isFinite(n) ? n : 0;
          };
          setStats({
            inviteCount: numberOrZero(r?.invite_count),
            availableCount: numberOrZero(r?.available_count),
            availableAmount: numberOrZero(r?.available_amount),
            usedCount: numberOrZero(r?.used_count),
            totalCommission: numberOrZero(r?.total_commission),
            commissionCount: numberOrZero(r?.commission_count),
          });
        }
        if (re) console.error('[referral] 读取券列表失败:', re.code, re.message);
        else setRewards((rd ?? []) as ReferralReward[]);
        if (ce) console.error('[referral] my_commission_records 失败:', ce.code, ce.message);
        else setCommissions(((Array.isArray(cd) ? cd : []) as unknown[]).filter((x) => (x as { ok?: boolean })?.ok !== false) as CommissionRecord[]);
      } catch (err) {
        console.error('[referral] 加载邀请数据时发生异常:', err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [userId, nonce]);

  return { inviteCode, inviteCodeFailed, stats, rewards, commissions, loading, refresh };
}

/** 分享链接：带 ?ref= 的首页地址，新用户打开即被归因 */
export function buildShareLink(inviteCode: string | null): string {
  if (!inviteCode) return '';
  const base = `${window.location.origin}/`;
  return `${base}?ref=${inviteCode}`;
}

/** 资料行扩展：邀请相关两列（ProfileRow 未覆盖时按需读取） */
export type ProfileWithInvite = ProfileRow & { invite_code?: string | null; invited_by?: string | null };

/** 结算页使用的可用奖励券（含门槛与面额，抵扣金额由服务端 order_create 复核） */
export interface RewardCoupon {
  code: string;
  amount: number;
  min_amount: number;
}

/** 我的可用奖励券列表（供结算页选券） */
export function useMyRewardCoupons(userId: string | null): { coupons: RewardCoupon[]; loading: boolean } {
  const [coupons, setCoupons] = useState<RewardCoupon[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) { setCoupons([]); return; }
    let alive = true;
    setLoading(true);
    supabase.from('referral_rewards')
      .select('code,amount,min_amount')
      .eq('inviter_id', userId)
      .eq('status', 'available')
      .order('amount', { ascending: false })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) console.error('[referral] 读取可用券失败:', error.code, error.message);
        else setCoupons((data ?? []) as RewardCoupon[]);
        setLoading(false);
      });
    return () => { alive = false; };
  }, [userId]);

  return { coupons, loading };
}

/** 从券列表里挑一张满足门槛且面额最大的；不满足返回 null */
export function pickBestCoupon(coupons: RewardCoupon[], total: number): RewardCoupon | null {
  return coupons.find((c) => total >= c.min_amount) ?? null;
}

/** 活动规则默认模板（后台未自定义 rules_text 时展示） */
export const DEFAULT_REFERRAL_RULES = [
  '把个人中心生成的专属邀请链接发给朋友，对方注册并验证邮箱后，你俩各得一张满减奖励券。',
  '仅注册 24 小时内的新账号可绑定邀请码，每个账号只能被邀请一次，不能自己邀请自己。',
  '好友绑定成功后 30 天内，其购买「参与返佣」标签的商品并完成支付，你将自动获得该订单实付金额对应比例的返佣券（不同商品比例不同，单笔有封顶）。',
  '返佣以奖励券形式发放到「我的奖励券」，下单满门槛即可直接抵扣，无使用次数限制。',
  '同一笔订单只计一次佣金；使用优惠券抵扣后的实付金额才是计佣基数。',
  '通过批量注册小号等方式刷取奖励的，平台有权收回券并取消活动资格。',
  '活动的最终解释权归本站所有，规则调整以后台公告为准。',
];
