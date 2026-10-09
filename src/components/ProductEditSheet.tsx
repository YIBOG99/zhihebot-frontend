// 商品编辑/新增抽屉：分组覆盖 products 全部可编辑字段，保存走 RLS admins_write_products
import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { ImageUploadField } from '@/components/ImageUploadField';
import {
  createProduct, saveProduct, validateProductDraft,
} from '@/lib/queries';
import type { Category, ProductDraft } from '@/lib/types';

const STOCK_OPTIONS = [
  { value: 'many', label: '充足' },
  { value: 'some', label: '一般' },
  { value: 'few', label: '紧张' },
] as const;

/** 商品级支付方式白名单（与 pay-channels.ts 的 PAY_CHANNELS 一一对应，漏项即「后台能勾但前台无入口」） */
const PAYMENT_OPTIONS = [
  { value: 'balance', label: '账户余额支付' },
  { value: 'alipay', label: '支付宝1（收款码/链接·人工核账）' },
  { value: 'alipay_qr', label: '支付宝2（个人收款码）' },
  { value: 'alipay_manual', label: '支付宝3（人工转账）' },
  { value: 'wechat', label: '微信收款' },
  { value: 'usdt', label: 'USDT' },
] as const;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** null = 新增模式 */
  initial: ProductDraft | null;
  categories: Category[];
  isNew: boolean;
  onSaved: (draft: ProductDraft, isNew: boolean) => Promise<void> | void;
}

/** 统一小控件样式（避免默认 shadcn 观感，贴合深色后台密度） */
const fieldCls = 'w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none transition-colors';
const labelCls = 'mb-1.5 block text-xs font-medium text-muted-foreground';
const errCls = 'mt-1 text-[11px] text-danger';

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-border pt-5 first:border-0 first:pt-0">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">{title}</h3>
      {children}
    </section>
  );
}

export function ProductEditSheet({ open, onOpenChange, initial, categories, isNew, onSaved }: Props) {
  const [d, setD] = useState<ProductDraft | null>(initial);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // 每次打开重新灌入初始值，避免残留上次未保存的编辑
  useEffect(() => { if (open) { setD(initial); setErrs({}); } }, [open, initial]);

  if (!d) return null;
  const set = <K extends keyof ProductDraft>(k: K, v: ProductDraft[K]) => setD((p) => (p ? { ...p, [k]: v } : p));
  const err = (k: string) => errs[k] ? <p className={errCls}>{errs[k]}</p> : null;

  async function submit() {
    if (!d) return;
    const e = validateProductDraft(d);
    setErrs(e);
    if (Object.keys(e).length > 0) {
      toast.error(`还有 ${Object.keys(e).length} 处需要修正`);
      return;
    }
    setSaving(true);
    try {
      if (isNew) await createProduct(d);
      else await saveProduct(d.id, d);
      toast.success(isNew ? '商品已创建' : '商品已保存');
      await onSaved(d, isNew);
      onOpenChange(false);
    } catch (e2) {
      toast.error(e2 instanceof Error ? e2.message : '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto border-border bg-surface p-0 sm:max-w-xl">
        <SheetHeader className="sticky top-0 z-10 border-b border-border bg-surface/95 px-6 py-4 backdrop-blur">
          <SheetTitle className="text-base text-foreground">{isNew ? '新增商品' : `编辑 · ${d.title || d.id}`}</SheetTitle>
          <SheetDescription className="text-xs">改动立即对前台生效，历史订单展示不受影响。</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-6 py-6">
          <Group title="基础信息">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>商品 ID{!isNew && '（不可修改）'}</label>
                <input className={fieldCls} value={d.id} disabled={!isNew} onChange={(e) => set('id', e.target.value)} />
                {err('id')}
              </div>
              <div>
                <label className={labelCls}>所属分类</label>
                <select className={fieldCls} value={d.category_slug} onChange={(e) => set('category_slug', e.target.value)}>
                  <option value="">未分类</option>
                  {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>商品名称 *</label>
              <input className={fieldCls} value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="如 ChatGPT Plus 月卡" />
              {err('title')}
            </div>
            <div>
              <label className={labelCls}>副标题</label>
              <input className={fieldCls} value={d.subtitle} onChange={(e) => set('subtitle', e.target.value)} placeholder="一句话卖点" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className={labelCls}>售价 ¥ *</label>
                <input className={fieldCls} inputMode="decimal" value={d.price} onChange={(e) => set('price', e.target.value)} />
                {err('price')}
              </div>
              <div>
                <label className={labelCls}>原价 ¥</label>
                <input className={fieldCls} inputMode="decimal" value={d.original_price} onChange={(e) => set('original_price', e.target.value)} placeholder="留空不显示" />
                {err('original_price')}
              </div>
              <div>
                <label className={labelCls}>已售基数</label>
                <input className={fieldCls} inputMode="numeric" value={d.sold_base} onChange={(e) => set('sold_base', e.target.value)} />
                {err('sold_base')}
              </div>
              <div>
                <label className={labelCls}>排序值</label>
                <input className={fieldCls} inputMode="numeric" value={d.sort_order} onChange={(e) => set('sort_order', e.target.value)} />
                {err('sort_order')}
              </div>
            </div>
          </Group>

          <Group title="展示与状态">
            <div>
              <label className={labelCls}>详情图 / 封面图</label>
              <ImageUploadField value={d.cover_url} onChange={(url) => set('cover_url', url)} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>兑换网址</label>
                <input className={fieldCls} value={d.redeem_url} onChange={(e) => set('redeem_url', e.target.value)} placeholder="如 https://chatgpt.com ，留空则交付页不显示" />
              </div>
              <div>
                <label className={labelCls}>角标文案</label>
                <input className={fieldCls} value={d.badge} onChange={(e) => set('badge', e.target.value)} placeholder="如 本周爆款" />
              </div>
              <div>
                <label className={labelCls}>库存档位</label>
                <select className={fieldCls} value={d.stock_level} onChange={(e) => set('stock_level', e.target.value as ProductDraft['stock_level'])}>
                  {STOCK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-5 pt-1">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={d.is_active} onChange={(e) => set('is_active', e.target.checked)} className="h-4 w-4 accent-primary" />
                上架销售
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={d.is_hot} onChange={(e) => set('is_hot', e.target.checked)} className="h-4 w-4 accent-primary" />
                标记热销
              </label>
            </div>
          </Group>

          <Group title="支付方式">
            <div className="flex flex-wrap gap-4">
              {PAYMENT_OPTIONS.map((o) => {
                const on = d.payment_methods.includes(o.value);
                return (
                  <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                    <input type="checkbox" checked={on} className="h-4 w-4 accent-primary"
                      onChange={(e) => set('payment_methods', e.target.checked
                        ? [...d.payment_methods, o.value]
                        : d.payment_methods.filter((x) => x !== o.value))} />
                    {o.label}
                  </label>
                );
              })}
            </div>
            {d.payment_methods.length === 0 && <p className={errCls}>未勾选任何支付方式，前台将不显示收款方式区块</p>}
          </Group>

          <Group title="详情页文案">
            {([
              ['tips', '商品详情'], ['risk', '使用提醒'], ['official', '风险说明'], ['support', '常见问题'],
            ] as const).map(([prefix, def]) => (
              <div key={prefix} className="space-y-1.5">
                <input className={fieldCls} value={d[`${prefix}_title` as 'tips_title']} onChange={(e) => set(`${prefix}_title` as 'tips_title', e.target.value)} placeholder={`${def}标题`} />
                <textarea rows={3} className={`${fieldCls} resize-none`} value={d[`${prefix}_body` as 'tips_body']}
                  onChange={(e) => set(`${prefix}_body` as 'tips_body', e.target.value)} placeholder={`${def}正文，可多行`} />
              </div>
            ))}
          </Group>

          <Group title="消费返佣">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-4 py-3">
              <input type="checkbox" checked={d.commission_enabled} onChange={(e) => set('commission_enabled', e.target.checked)} className="h-4 w-4 accent-primary" />
              <span className="text-sm text-foreground">该商品参与好友消费返佣</span>
              <span className="text-[11px] text-muted-foreground">不勾选则好友买它不产生任何返佣</span>
            </label>
            {d.commission_enabled && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className={labelCls}>返佣方式</label>
                  <select className={fieldCls} value={d.commission_mode} onChange={(e) => set('commission_mode', e.target.value === 'fixed' ? 'fixed' : 'rate')}>
                    <option value="rate">按实付金额比例</option>
                    <option value="fixed">固定金额券</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{d.commission_mode === 'rate' ? '比例（%）' : '券面额（元）'}</label>
                  <input className={fieldCls} inputMode="decimal" value={d.commission_value} onChange={(e) => set('commission_value', e.target.value)} placeholder="8" />
                  {err('commission_value')}
                </div>
                <div>
                  <label className={labelCls}>单笔封顶（元）</label>
                  <input className={fieldCls} inputMode="decimal" value={d.commission_cap} onChange={(e) => set('commission_cap', e.target.value)} placeholder="50" />
                  {err('commission_cap')}
                </div>
              </div>
            )}
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              说明：仅当邀请人在后台开启了返佣计佣、且下单好友是其邀请的新客户时才生效；返佣以奖励券形式自动发放给邀请人。
            </p>
          </Group>

          <Group title="商品问答 FAQ">
            {d.faq.length === 0 && <p className="text-xs text-muted-foreground">暂无问答，点下方按钮添加。</p>}
            {d.faq.map((f, i) => (
              <div key={i} className="space-y-1.5 rounded-xl border border-border bg-card p-3">
                <div className="flex items-start gap-2">
                  <input className={fieldCls} value={f.q} placeholder={`第 ${i + 1} 问`}
                    onChange={(e) => set('faq', d.faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} />
                  <button type="button" onClick={() => set('faq', d.faq.filter((_, j) => j !== i))}
                    className="mt-2 shrink-0 text-muted-foreground transition-colors hover:text-danger" aria-label="删除该问答">
                    <Trash2 size={15} />
                  </button>
                </div>
                <textarea rows={2} className={`${fieldCls} resize-none`} value={f.a} placeholder="答案"
                  onChange={(e) => set('faq', d.faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} />
                {err(`faq_${i}`)}
              </div>
            ))}
            <button type="button" onClick={() => set('faq', [...d.faq, { q: '', a: '' }])}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary">
              <Plus size={13} /> 添加一条问答
            </button>
          </Group>
        </div>

        {/* 底部操作条：移动端常驻可见 */}
        <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-border bg-surface/95 px-6 py-4 backdrop-blur">
          <button type="button" onClick={() => !saving && onOpenChange(false)}
            className="rounded-lg border border-border px-5 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50">
            取消
          </button>
          <button type="button" onClick={submit} disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60">
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? '保存中…' : isNew ? '创建商品' : '保存修改'}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
