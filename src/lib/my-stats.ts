// 个人中心数据层：我的订单查询 + 消费统计汇总
import { useEffect, useState } from 'react';
import { supabase } from '@/supabase/client';
import type { OrderRow, ProfileRow } from '@/lib/types';

/** 当前账号的订单列表（RLS 已限制只能读自己的行） */
export function useMyOrders(userId: string | null) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) { setOrders([]); return; }
    let alive = true;
    setLoading(true);
    setErr(null);
    supabase.from('orders').select('*').eq('user_id', userId).order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) { console.error('[useMyOrders]', error.code, error.message); setErr(error.message); }
        else setOrders((data ?? []) as OrderRow[]);
        setLoading(false);
      });
    return () => { alive = false; };
  }, [userId]);

  return { orders, loading, err };
}

/** 当前账号的资料行（含真实邮箱与注册时间） */
export function useMyProfile(userId: string | null) {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) { setProfile(null); return; }
    let alive = true;
    setLoading(true);
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
      .then(async ({ data, error }) => {
        if (!alive) return;
        if (error) console.warn('[useMyProfile] 读取资料失败，回退到会话信息:', error.message);
        let row = (data as ProfileRow | null) ?? null;
        // 老账号的 profiles.email 可能为空（增列前建的档），用 auth.users 权威值兜底展示
        if (!row?.email) {
          const { data: { user }, error: authErr } = await supabase.auth.getUser();
          if (!alive) return;
          if (authErr) console.warn('[useMyProfile] 会话邮箱兜底失败:', authErr.message);
          else if (user?.email) row = { ...(row ?? { id: userId, username: '', avatar_url: null, contact_email: null, contact_phone: null, created_at: '' }), email: user.email };
        }
        console.log('[useMyProfile] uid =', userId, '| profiles.email =', row?.email ?? '(空)');
        setProfile(row);
        setLoading(false);
      });
    return () => { alive = false; };
  }, [userId]);

  return { profile, loading };
}

export interface MyStats {
  /** 已完成订单实付之和 */
  totalSpent: number;
  /** 已完成订单数 */
  doneCount: number;
  /** 待付款订单数 */
  pendingCount: number;
  /** 全部订单数 */
  totalCount: number;
  /** 最近一次下单时间（ISO），无订单为 null */
  lastAt: string | null;
  /** 本月消费 */
  monthSpent: number;
  /** 上月消费 */
  prevMonthSpent: number;
  /** 卡密总数（已完成且带凭证） */
  cardCount: number;
}

const PAID_STATUSES = new Set(['completed']);

/** 由订单列表汇总出消费统计。金额口径：amount - discount_amount（实付）。 */
export function computeMyStats(orders: OrderRow[]): MyStats {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const s: MyStats = {
    totalSpent: 0, doneCount: 0, pendingCount: 0, totalCount: orders.length,
    lastAt: null, monthSpent: 0, prevMonthSpent: 0, cardCount: 0,
  };
  for (const o of orders) {
    if (PAID_STATUSES.has(o.status)) {
      const paid = Math.max(0, Number(o.amount) - Number(o.discount_amount ?? 0));
      s.totalSpent += paid;
      s.doneCount += 1;
      if (o.card_secret) s.cardCount += 1;
      const d = new Date(o.created_at);
      if (d.getFullYear() === y && d.getMonth() === m) s.monthSpent += paid;
      const pm = m === 0 ? 11 : m - 1;
      const py = m === 0 ? y - 1 : y;
      if (d.getFullYear() === py && d.getMonth() === pm) s.prevMonthSpent += paid;
    }
    if (o.status === 'pending_payment') s.pendingCount += 1;
    if (!s.lastAt || new Date(o.created_at) > new Date(s.lastAt)) s.lastAt = o.created_at;
  }
  return s;
}

/** 邮箱脱敏：jasonbo@outlook.com → jas***@outlook.com */
export function maskEmail(email: string | null): string {
  if (!email) return '';
  const at = email.indexOf('@');
  if (at <= 0) return email;
  const name = email.slice(0, at);
  const domain = email.slice(at + 1);
  const head = name.length <= 2 ? name.slice(0, 1) : name.slice(0, 3);
  return `${head}***@${domain}`;
}

/** 是否为平台虚拟域邮箱（老的「用户名 + 密码」账号，未绑定真实邮箱） */
export function isVirtualEmail(email: string | null): boolean {
  return !email || email.endsWith('@meoo.local');
}
