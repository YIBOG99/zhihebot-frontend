import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, supabaseUrl, projectUrlId, supabaseConfigured } from '@/supabase/client';
import type { Category, Product, ContentRow, FaqRow, SiteSettings, PaymentChannels, BrandingConfig, DashboardData, BossSalesRow, ProductDraft, BlockedCustomer, SuspectBuyer, RateLimitWhitelistRow, RateLimitBlockRow } from './types';
import { DEMO_CATEGORIES, DEMO_PRODUCTS, DEMO_CONTENTS, DEMO_FAQS, DEMO_SITE_SETTINGS } from './demo-data';

/**
 * 独立商城：默认从本项目 Supabase 读取数据。仅当显式设置 VITE_PUBLIC_SNAPSHOT_MODE=true
 * 时才启用仓库快照预览，避免生产环境误把演示快照当作实时商品、库存与支付配置。
 */
const PUBLIC_SNAPSHOT_MODE = import.meta.env.VITE_PUBLIC_SNAPSHOT_MODE === 'true';


/** Supabase Storage JS 的 .from() 接收 bucket name；迁移创建的公开 bucket 名为 product-images。 */
export const PRODUCT_IMAGE_BUCKET_NAME = 'product-images';
/** Deprecated alias retained for existing imports; this value is a bucket name, not a UUID. */
export const PRODUCT_IMAGE_BUCKET_ID = PRODUCT_IMAGE_BUCKET_NAME;

/** 让前台/后台所有商品相关缓存失效，编辑商品后调用 */
export function useInvalidateShop() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: ['product'] });
    qc.invalidateQueries({ queryKey: ['categories'] });
  };
}

/** Product 行 → 表单草稿（null 一律转空串，便于受控输入） */
export function toProductDraft(p: Record<string, unknown>): ProductDraft {
  const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  return {
    id: str(p.id),
    category_slug: str(p.category_slug),
    badge: str(p.badge),
    title: str(p.title),
    subtitle: str(p.subtitle),
    price: str(p.price),
    original_price: str(p.original_price),
    cover_url: str(p.cover_url),
    redeem_url: str(p.redeem_url),
    stock_level: (p.stock_level === 'some' || p.stock_level === 'few' ? p.stock_level : 'many') as ProductDraft['stock_level'],
    sold_base: str(p.sold_base ?? 0),
    tips_title: str(p.tips_title), tips_body: str(p.tips_body),
    risk_title: str(p.risk_title), risk_body: str(p.risk_body),
    official_title: str(p.official_title), official_body: str(p.official_body),
    support_title: str(p.support_title), support_body: str(p.support_body),
    faq: Array.isArray(p.faq) ? (p.faq as { q: string; a: string }[]).map((x) => ({ q: str(x?.q), a: str(x?.a) })) : [],
    payment_methods: Array.isArray(p.payment_methods) ? (p.payment_methods as string[]) : [],
    is_active: p.is_active !== false,
    is_hot: Boolean(p.is_hot),
    sort_order: str(p.sort_order ?? 0),
    commission_enabled: Boolean((p.commission as Record<string, unknown> | null | undefined)?.enabled),
    commission_mode: ((p.commission as Record<string, unknown> | null | undefined)?.mode === 'fixed' ? 'fixed' : 'rate') as ProductDraft['commission_mode'],
    commission_value: str((p.commission as Record<string, unknown> | null | undefined)?.value ?? 8),
    commission_cap: str((p.commission as Record<string, unknown> | null | undefined)?.cap ?? 50),
  };
}

/** 新建商品的空草稿 */
export function emptyProductDraft(id: string): ProductDraft {
  return toProductDraft({
    id, is_active: true, is_hot: false, stock_level: 'many',
    tips_title: '商品详情', risk_title: '使用提醒', official_title: '风险说明', support_title: '常见问题',
    sold_base: 0, sort_order: 99, price: '',
  });
}

/** 生成候选商品 ID：分类前缀 + 随机串 */
export function genProductId(categorySlug: string): string {
  const prefix = (categorySlug || 'misc').replace(/[^a-z0-9]/gi, '').slice(0, 12);
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${rand}`;
}

/** 草稿校验：返回字段级错误映射，空对象表示通过 */
export function validateProductDraft(d: ProductDraft): Record<string, string> {
  const e: Record<string, string> = {};
  if (!d.id.trim()) e.id = '商品 ID 不能为空';
  else if (!/^[a-zA-Z0-9_-]{2,64}$/.test(d.id.trim())) e.id = 'ID 仅允许字母、数字、下划线、短横线（2-64 位）';
  if (!d.title.trim()) e.title = '商品名称不能为空';
  const price = Number(d.price);
  if (!d.price.trim() || Number.isNaN(price) || price <= 0) e.price = '请填写正确的售价（大于 0 的数字）';
  if (d.original_price.trim()) {
    const op = Number(d.original_price);
    if (Number.isNaN(op) || op <= 0) e.original_price = '原价需为大于 0 的数字，或留空';
    else if (op < price) e.original_price = '原价不应低于售价';
  }
  if (!Number.isInteger(Number(d.sold_base)) || Number(d.sold_base) < 0) e.sold_base = '已售基数需为非负整数';
  if (!Number.isInteger(Number(d.sort_order))) e.sort_order = '排序需为整数';
  if (d.commission_enabled) {
    const cv = Number(d.commission_value);
    if (!Number.isFinite(cv) || cv <= 0) e.commission_value = '返佣数值需为大于 0 的数字';
    const cc = Number(d.commission_cap);
    if (!Number.isFinite(cc) || cc <= 0) e.commission_cap = '单笔封顶需为大于 0 的数字';
  }
  d.faq.forEach((f, i) => {
    if (!f.q.trim() || !f.a.trim()) e[`faq_${i}`] = `第 ${i + 1} 条问答不能留空`;
  });
  return e;
}

/** 草稿 → products 行更新载荷（数值/JSONB 字段在此转换） */
export function draftToPayload(d: ProductDraft): Record<string, unknown> {
  const nz = (v: string) => (v.trim() === '' ? null : v.trim());
  return {
    category_slug: nz(d.category_slug),
    badge: nz(d.badge),
    title: d.title.trim(),
    subtitle: nz(d.subtitle),
    price: Number(d.price),
    original_price: nz(d.original_price) === null ? null : Number(d.original_price),
    cover_url: nz(d.cover_url),
    redeem_url: nz(d.redeem_url),
    stock_level: d.stock_level,
    sold_base: Number(d.sold_base) || 0,
    tips_title: d.tips_title.trim() || '商品详情',
    tips_body: nz(d.tips_body),
    risk_title: d.risk_title.trim() || '使用提醒',
    risk_body: nz(d.risk_body),
    official_title: d.official_title.trim() || '风险说明',
    official_body: nz(d.official_body),
    support_title: d.support_title.trim() || '常见问题',
    support_body: nz(d.support_body),
    faq: d.faq.filter((f) => f.q.trim() && f.a.trim()).map((f) => ({ q: f.q.trim(), a: f.a.trim() })),
    payment_methods: d.payment_methods,
    is_active: d.is_active,
    is_hot: d.is_hot,
    sort_order: Number(d.sort_order) || 0,
    commission: d.commission_enabled
      ? { enabled: true, mode: d.commission_mode, value: Number(d.commission_value), cap: Number(d.commission_cap) }
      : { enabled: false },
    updated_at: new Date().toISOString(),
  };
}

/** 保存商品编辑（走 RLS admins_write_products）。失败时抛带原因的 Error */
export async function saveProduct(id: string, draft: ProductDraft): Promise<void> {
  const { error } = await supabase.from('products').update(draftToPayload(draft) as never).eq('id', id);
  if (error) {
    console.error('[saveProduct] failed:', error.code, error.message);
    throw new Error(`${error.code ?? ''} ${error.message}`.trim());
  }
  console.log('[saveProduct] ok, id =', id);
}

/** 新增商品。先查重再插入，避免主键冲突报晦涩错误 */
export async function createProduct(draft: ProductDraft): Promise<void> {
  const id = draft.id.trim();
  const { data: exist, error: qErr } = await supabase.from('products').select('id').eq('id', id).maybeSingle();
  if (qErr) throw new Error(`${qErr.code ?? ''} ${qErr.message}`.trim());
  if (exist) throw new Error(`商品 ID「${id}」已存在，请换一个`);
  const { error } = await supabase.from('products').insert({ id, ...draftToPayload(draft) } as never);
  if (error) {
    console.error('[createProduct] failed:', error.code, error.message);
    throw new Error(`${error.code ?? ''} ${error.message}`.trim());
  }
  console.log('[createProduct] ok, id =', id);
}

/** 订单操作 RPC 结果：PostgREST 对 TABLE(ok,message) 的 ok 列序列化不可靠，
 *  故只以「有无传输层 error」判定受理与否，message 原样透出（见 AGENTS.md 教训） */
export interface OrderRpcResult { ok: boolean; message: string }

export async function callOrderRpc(fn: 'order_confirm_payment' | 'order_close' | 'order_manual_deliver' | 'order_customer_cancel', orderId: string): Promise<OrderRpcResult> {
  const { data, error } = await supabase.rpc(fn, { _order_id: orderId });
  if (error) {
    console.error(`[callOrderRpc:${fn}] transport error:`, error.code, error.message);
    return { ok: false, message: `${error.code ?? ''} ${error.message}`.trim() };
  }
  // order_close 已改为标量 TEXT 返回（NULL=成功，非 NULL=错误文案），彻底绕开布尔列序列化问题
  if (typeof data === 'string') {
    console.log(`[callOrderRpc:${fn}] order=${orderId} scalar result =`, JSON.stringify(data));
    return data === '' ? { ok: true, message: '操作已完成' } : { ok: false, message: data };
  }
  if (data === null || data === undefined) {
    console.log(`[callOrderRpc:${fn}] order=${orderId} scalar NULL → 成功`);
    return { ok: true, message: '操作已完成' };
  }
  const row = (Array.isArray(data) ? data[0] : data) as { ok?: boolean; message?: string } | undefined;
  console.log(`[callOrderRpc:${fn}] order=${orderId} raw row =`, JSON.stringify(row));
  // 其余 TABLE(ok,message) 函数：服务端明确回 ok=false 才判失败；字段丢失视为已受理并透出原文案
  if (row?.ok === false) return { ok: false, message: row.message || '操作未完成，请刷新后重试' };
  return { ok: true, message: row?.message || '操作已完成' };
}


export interface AlipayPayResult {
  ok?: boolean;
  /** alipay_qr = 当面付扫码；alipay_page = 电脑网站支付收银台 */
  channel?: 'alipay_qr' | 'alipay_page';
  qr_code?: string | null;
  pay_url?: string | null;
  amount?: number;
  paid?: boolean;
  status?: string;
  card_secret?: string | null;
  message?: string;
  error?: string;
  /** CHANNEL_UNAVAILABLE 时网关返回的原始签约错误码，便于排查 */
  detail?: string;
}

/** 调用支付宝 Edge Function（create 出码 / query 对账）。失败时抛错或返回带 error 的结果 */
export async function callAlipayPay(action: 'create' | 'query', orderId: string): Promise<AlipayPayResult> {
  const session = (await supabase.auth.getSession()).data.session;
  const res = await fetch(`${supabaseUrl}/functions/v1/alipay-pay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'OneDay-App-Id': projectUrlId,
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ action, order_id: orderId }),
  });
  return (await res.json()) as AlipayPayResult;
}

/* ── 客户黑名单：拉黑 / 解除 / 名单 / 可疑买家统计 ── */

/** 黑名单 RPC 结果（customer_block / customer_unblock 标量 TEXT 返回：NULL=成功） */
export interface BlockRpcResult { ok: boolean; message: string }

async function callBlockRpc(fn: 'customer_block' | 'customer_unblock', args: Record<string, unknown>): Promise<BlockRpcResult> {
  const { data, error } = await supabase.rpc(fn, args as never);
  if (error) {
    console.error(`[callBlockRpc:${fn}] transport error:`, error.code, error.message);
    return { ok: false, message: `${error.code ?? ''} ${error.message}`.trim() };
  }
  // 标量 TEXT：NULL / '' 视为成功，非空即错误文案
  if (data === null || data === undefined || data === '') {
    console.log(`[callBlockRpc:${fn}] 成功`);
    return { ok: true, message: '操作已完成' };
  }
  const msg = String(Array.isArray(data) ? (data[0] ?? '') : data);
  console.log(`[callBlockRpc:${fn}] 返回 =`, JSON.stringify(msg));
  return msg === '' ? { ok: true, message: '操作已完成' } : { ok: false, message: msg };
}

/** 手动拉黑某个联系方式（邮箱/手机号），服务端自动归一化并去重 */
export async function blockCustomer(contactType: 'email' | 'phone', contactValue: string, reason?: string): Promise<BlockRpcResult> {
  return callBlockRpc('customer_block', { _contact_type: contactType, _contact_value: contactValue, _reason: reason ?? null });
}

/** 解除拉黑（软删除，保留历史） */
export async function unblockCustomer(id: string): Promise<BlockRpcResult> {
  return callBlockRpc('customer_unblock', { _id: id });
}

/** 生效中的黑名单列表（RLS 仅 admin 可读） */
export function useBlockedCustomers(enabled = true) {
  return useQuery({
    queryKey: ['blocked-customers'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('blocked_customers').select('*').eq('is_active', true).order('created_at', { ascending: false });
      if (error) {
        console.error('[useBlockedCustomers] load failed:', error.code, error.message);
        throw error;
      }
      return (data ?? []) as BlockedCustomer[];
    },
  });
}

/** 可疑买家统计：未支付数或总单数达到阈值的联系方式（SECURITY DEFINER RPC，仅 admin） */
export function useSuspectBuyers(threshold: number, enabled = true) {
  return useQuery({
    queryKey: ['suspect-buyers', threshold],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_suspect_buyers', { _threshold: Math.max(1, Math.floor(threshold) || 5) });
      if (error) {
        console.error('[useSuspectBuyers] rpc failed:', error.code, error.message);
        throw error;
      }
      return (data ?? []) as SuspectBuyer[];
    },
  });
}

/** 让黑名单与可疑买家缓存失效（拉黑/解除后调用） */
export function useInvalidateBlocklist() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['blocked-customers'] });
    qc.invalidateQueries({ queryKey: ['suspect-buyers'] });
  };
}

/* ── 下单频控：白名单管理 + 拦截记录看板 ── */

/** 白名单 RPC 结果（rate_limit_whitelist_add / _remove 标量 TEXT 返回：NULL=成功） */
async function callWhitelistRpc(fn: 'rate_limit_whitelist_add' | 'rate_limit_whitelist_remove', args: Record<string, unknown>): Promise<BlockRpcResult> {
  const { data, error } = await supabase.rpc(fn, args as never);
  if (error) {
    console.error(`[callWhitelistRpc:${fn}] transport error:`, error.code, error.message);
    return { ok: false, message: `${error.code ?? ''} ${error.message}`.trim() };
  }
  if (data === null || data === undefined || data === '') return { ok: true, message: '操作已完成' };
  const msg = String(Array.isArray(data) ? (data[0] ?? '') : data);
  return msg === '' ? { ok: true, message: '操作已完成' } : { ok: false, message: msg };
}

/** 把邮箱/手机号加入频控白名单（服务端归一化并去重，命中即跳过下单次数限制） */
export async function addRateLimitWhitelist(contactType: 'email' | 'phone', contactValue: string, note?: string): Promise<BlockRpcResult> {
  return callWhitelistRpc('rate_limit_whitelist_add', { _contact_type: contactType, _contact_value: contactValue, _note: note ?? null });
}

/** 从白名单移除（软删除，保留历史） */
export async function removeRateLimitWhitelist(id: string): Promise<BlockRpcResult> {
  return callWhitelistRpc('rate_limit_whitelist_remove', { _id: id });
}

/** 生效中的频控白名单列表（RLS 仅 admin 可读） */
export function useRateLimitWhitelist(enabled = true) {
  return useQuery({
    queryKey: ['rate-limit-whitelist'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('rate_limit_whitelist').select('*').eq('is_active', true).order('created_at', { ascending: false });
      if (error) {
        console.error('[useRateLimitWhitelist] load failed:', error.code, error.message);
        throw error;
      }
      return (data ?? []) as RateLimitWhitelistRow[];
    },
  });
}

/** 最近被频控拦截的记录（RLS 仅 admin 可读，用于判断误伤） */
export function useRateLimitBlocks(limit = 50, enabled = true) {
  return useQuery({
    queryKey: ['rate-limit-blocks', limit],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('rate_limit_blocks').select('*').order('blocked_at', { ascending: false }).limit(limit);
      if (error) {
        console.error('[useRateLimitBlocks] load failed:', error.code, error.message);
        throw error;
      }
      return (data ?? []) as RateLimitBlockRow[];
    },
  });
}

/** 让白名单与拦截记录缓存失效（增删后调用；拦截记录新增时也需刷新才能看到最新一条） */
export function useInvalidateRateLimit() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['rate-limit-whitelist'] });
    qc.invalidateQueries({ queryKey: ['rate-limit-blocks'] });
  };
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      if (PUBLIC_SNAPSHOT_MODE || !supabaseConfigured) return DEMO_CATEGORIES;
      try {
        const { data, error } = await supabase.from('categories').select('*').order('sort_order');
        if (error) throw error;
        const remote = (data ?? []) as Category[];
        return remote.length ? remote : DEMO_CATEGORIES;
      } catch (error) {
        console.warn('[useCategories] remote failed, falling back to exported snapshot:', error);
        return DEMO_CATEGORIES;
      }
    },
    staleTime: 60_000,
  });
}

export function useProducts(categorySlug?: string) {
  return useQuery({
    queryKey: ['products', categorySlug ?? 'all'],
    queryFn: async () => {
      if (PUBLIC_SNAPSHOT_MODE || !supabaseConfigured) return categorySlug ? DEMO_PRODUCTS.filter((p) => p.category_slug === categorySlug) : DEMO_PRODUCTS;
      try {
        let q = supabase.from('products').select('*').eq('is_active', true).order('sort_order');
        if (categorySlug) q = q.eq('category_slug', categorySlug);
        const { data, error } = await q;
        if (error) throw error;
        const remote = (data ?? []) as unknown as Product[];
        // A fresh standalone Supabase project may not have been seeded yet.
        // Keep the storefront usable until the admin imports the catalog snapshot.
        if (remote.length === 0) return categorySlug ? DEMO_PRODUCTS.filter((p) => p.category_slug === categorySlug) : DEMO_PRODUCTS;
        return remote;
      } catch (error) {
        console.warn('[useProducts] remote failed, falling back to exported snapshot:', error);
        return categorySlug ? DEMO_PRODUCTS.filter((p) => p.category_slug === categorySlug) : DEMO_PRODUCTS;
      }
    },
    staleTime: 60_000,
  });
}

export function useProduct(id: string) {
  const queryClient = useQueryClient();

  // Reuse the catalog already rendered on the previous page. This makes the
  // detail view paint immediately while React Query refreshes stale data in the background.
  const cachedProduct = queryClient.getQueriesData<Product[]>({ queryKey: ['products'] })
    .map(([, products]) => products?.find((product) => product.id === id))
    .find((product): product is Product => Boolean(product));
  const localProduct = DEMO_PRODUCTS.find((product) => product.id === id);
  const initialProduct = cachedProduct ?? localProduct;

  return useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      if (PUBLIC_SNAPSHOT_MODE || !supabaseConfigured) return localProduct;
      try {
        const { data, error } = await supabase.from('products').select('*').eq('id', id).single();
        if (error) throw error;
        return data as unknown as Product;
      } catch (error) {
        console.warn(`[useProduct] remote failed for ${id}, using cached product when available:`, error);
        return initialProduct;
      }
    },
    enabled: !!id,
    initialData: initialProduct,
    initialDataUpdatedAt: cachedProduct ? Date.now() : undefined,
    staleTime: 60_000,
  });
}

export function useContents(kind?: ContentRow['kind']) {
  return useQuery({
    queryKey: ['contents', kind ?? 'all'],
    queryFn: async () => {
      const local = kind ? DEMO_CONTENTS.filter((c) => c.kind === kind) : DEMO_CONTENTS;
      if (PUBLIC_SNAPSHOT_MODE || !supabaseConfigured) return local;
      try {
        let q = supabase.from('contents').select('*').eq('published', true).order('sort_order');
        if (kind) q = q.eq('kind', kind);
        const { data, error } = await q;
        if (error) throw error;
        const remote = (data ?? []) as ContentRow[];
        return remote.length ? remote : local;
      } catch (error) {
        console.warn('[useContents] remote failed, falling back to exported snapshot:', error);
        return local;
      }
    },
    staleTime: 60_000,
  });
}

export function useContent(slug: string) {
  return useQuery({
    queryKey: ['content', slug],
    queryFn: async () => {
      const local = DEMO_CONTENTS.find((c) => c.slug === slug);
      if (PUBLIC_SNAPSHOT_MODE || !supabaseConfigured) return local;
      try {
        const { data, error } = await supabase.from('contents').select('*').eq('slug', slug).single();
        if (error) throw error;
        return data as ContentRow;
      } catch (error) {
        console.warn(`[useContent] remote failed for ${slug}, falling back to exported snapshot:`, error);
        return local;
      }
    },
    enabled: !!slug,
    staleTime: 60_000,
  });
}

export function useFaqs() {
  return useQuery({
    queryKey: ['faqs'],
    queryFn: async () => {
      if (PUBLIC_SNAPSHOT_MODE) return DEMO_FAQS;
      try {
        const { data, error } = await supabase.from('faqs').select('*').order('sort_order');
        if (error) throw error;
        return data as FaqRow[];
      } catch (error) {
        console.warn('[useFaqs] remote failed, falling back to exported snapshot:', error);
        return DEMO_FAQS;
      }
    },
    staleTime: 60_000,
  });
}

export function useSiteSettings() {
  return useQuery({
    queryKey: ['site-settings'],
    queryFn: async () => {
      if (PUBLIC_SNAPSHOT_MODE) return DEMO_SITE_SETTINGS;
      try {
        const { data, error } = await supabase.from('site_settings').select('*');
        if (error) throw error;
        const result: Record<string, unknown> = {};
        for (const row of data ?? []) result[row.key] = row.value;
        return result as unknown as SiteSettings;
      } catch (error) {
        console.warn('[useSiteSettings] remote failed, falling back to exported snapshot:', error);
        return DEMO_SITE_SETTINGS;
      }
    },
    staleTime: 60_000,
  });
}

/** 读取单个 site_settings key 的 value（管理员可视化编辑用） */
export async function readSiteSetting<T = Record<string, unknown>>(key: string): Promise<T | null> {
  const { data, error } = await supabase.from('site_settings').select('value').eq('key', key).maybeSingle();
  if (error) {
    console.error('[readSiteSetting] failed:', error.code, error.message);
    throw new Error(`${error.code ?? ''} ${error.message}`.trim());
  }
  return (data?.value ?? null) as T | null;
}

/** 局部更新某个 site_settings key（RLS admins_write_settings 放行管理员）。
 *  patch 与库中现有 value 浅合并，避免覆盖同 key 下的其它通道配置 */
export async function patchSiteSetting(key: string, patch: Record<string, unknown>): Promise<void> {
  const current = (await readSiteSetting<Record<string, unknown>>(key)) ?? {};
  const merged = { ...current, ...patch };
  const { error } = await supabase.from('site_settings')
    .upsert({ key, value: merged as never, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) {
    console.error('[patchSiteSetting] failed:', error.code, error.message);
    throw new Error(`${error.code ?? ''} ${error.message}`.trim());
  }
  console.log('[patchSiteSetting] ok, key =', key);
}

/** 让站点设置缓存失效（改完收款配置后调用，前台立即读到新值） */
export function useInvalidateSettings() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['site-settings'] });
}

/** 全站品牌设置（LOGO/店名）。复用 site-settings 缓存，保存后一次 invalidate 即全站同步 */
export function useBranding(): BrandingConfig {
  const { data } = useSiteSettings();
  return data?.branding ?? {};
}

/** 管理端数据看板：近 N 天日活/收款序列 + 今日/累计标量（SECURITY DEFINER RPC） */
export function useAdminDashboard(days = 30) {
  return useQuery({
    queryKey: ['admin-dashboard', days],
    // Keep the overview fresh while the admin is watching it; focus refetch also
    // picks up payments confirmed in another tab or by an automated payment callback.
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_dashboard', { _days: days });
      if (error) throw error;
      return data as unknown as DashboardData;
    },
  });
}

/* ── 老板看板（/boss）：走 boss-api Edge Function，BOSS_KEY 口令校验 ── */

export class BossAuthError extends Error {
  constructor() { super('口令不正确'); this.name = 'BossAuthError'; }
}

async function callBoss<T extends Record<string, unknown>>(key: string, action: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${supabaseUrl}/functions/v1/boss-api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'OneDay-App-Id': projectUrlId },
    body: JSON.stringify({ action, key, ...params }),
  });
  const data = (await res.json()) as T & { error?: string };
  if (res.status === 401 || data.error === 'INVALID_KEY') throw new BossAuthError();
  if (!res.ok || data.error) throw new Error((data.message as string) ?? data.error ?? '请求失败');
  return data;
}

/** 口令有效性探测：拉 1 天数据即完成 verify（401 即口令错误） */
export async function callBossProbe(key: string): Promise<void> {
  await callBoss<Record<string, unknown>>(key, 'dashboard', { days: 1 });
}

export function useBossDashboard(key: string | null, days = 30) {
  return useQuery({
    queryKey: ['boss-dashboard', days],
    enabled: !!key,
    refetchInterval: 60_000,
    queryFn: () => callBoss<DashboardData & Record<string, unknown>>(key!, 'dashboard', { days }),
  });
}

export function useBossSales(key: string | null, days = 30) {
  return useQuery({
    queryKey: ['boss-sales', days],
    enabled: !!key,
    refetchInterval: 120_000,
    queryFn: async () => {
      const r = await callBoss<{ sales: BossSalesRow[] } & Record<string, unknown>>(key!, 'sales', { days });
      return r.sales ?? [];
    },
  });
}

export function useBossOrders(key: string | null, filters: { status: string; range: string; q: string }) {
  return useQuery({
    queryKey: ['boss-orders', filters.status, filters.range, filters.q],
    enabled: !!key,
    queryFn: async () => {
      const r = await callBoss<{ orders: unknown[] } & Record<string, unknown>>(key!, 'orders', filters);
      return r.orders ?? [];
    },
  });
}
