import { Link, useParams } from '@tanstack/react-router';
import { ChevronRight, ShoppingCart, ShieldCheck, Clock, Zap } from 'lucide-react';
import { useProduct, useCategories, useProducts } from '@/lib/queries';
import { ClauseBlocks } from '@/components/ClauseBlocks';
import { ProductCard } from '@/components/ProductCard';
import { PRODUCT_PLACEHOLDER } from '@/lib/assets';
import { formatYuan } from '@/lib/utils';

const STOCK_LABEL: Record<string, string> = { many: '库存充足，可立即发货', some: '库存紧张，建议尽快下单', few: '仅剩少量，售完即止' };

export function ProductDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { data: product, isLoading, error } = useProduct(id);
  const { data: categories = [] } = useCategories();

  // 诊断日志：确认路由参数与数据加载结果（排查"点商品没反应"）
  console.log('[ProductDetail] id =', id, '| loading =', isLoading, '| error =', error?.message ?? null, '| found =', !!product);

  if (isLoading) return (
    <div className="mx-auto max-w-7xl px-4 py-20">
      <div className="h-64 animate-pulse rounded-xl bg-surface-2" />
    </div>
  );
  if (!product) return (
    <div className="mx-auto max-w-7xl px-4 py-24 text-center text-muted-foreground">
      商品不存在或已下架。<Link to="/" className="text-primary underline ml-1">返回首页</Link>
    </div>
  );

  const category = categories.find((c) => c.slug === product.category_slug);
  // 价格展示取证：确认小数未被取整（修复 .toFixed(0) 导致 138.99 显示成 138）
  console.log('[ProductDetail] price display:', { id: product.id, raw: product.price, shown: formatYuan(product.price), original: formatYuan(product.original_price ?? 0) });
  const discount = product.original_price && Number(product.original_price) > Number(product.price)
    ? Math.round((1 - Number(product.price) / Number(product.original_price)) * 100) : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Breadcrumb */}
      <div className="border-b border-border bg-surface/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 sm:px-6 lg:px-8 py-3 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground transition-colors">首页</Link>
          <ChevronRight size={12} />
          {category && (<>
            <Link to="/category/$slug" params={{ slug: category.slug }} className="hover:text-foreground transition-colors">{category.name}</Link>
            <ChevronRight size={12} />
          </>)}
          <span className="text-foreground truncate max-w-[200px]">{product.title}</span>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          {/* Left: cover */}
          <div className="reveal-left">
            <div className="glow-frame overflow-hidden rounded-2xl border border-border bg-surface-2">
              <img src={product.cover_url || PRODUCT_PLACEHOLDER} alt={product.title} className="w-full aspect-[16/9] object-cover" />
            </div>
            {/* Trust strip */}
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                { icon: ShieldCheck, label: '正规渠道凭证' },
                { icon: Zap, label: '核账后自动发卡' },
                { icon: Clock, label: '全程时间线留痕' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card p-3 text-center">
                  <Icon size={16} className="text-primary" />
                  <span className="text-[11px] text-muted-foreground leading-tight">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: info + CTA */}
          <div className="reveal-right">
            {product.badge && (
              <span className="mb-3 inline-block rounded-full bg-surface-3 px-3 py-1 text-xs text-muted-foreground">{product.badge}</span>
            )}
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight text-foreground">{product.title}</h1>
            {product.subtitle && <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{product.subtitle}</p>}

            {/* Price box */}
            <div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-5">
              <div className="flex items-end gap-3">
                <div className="price-tag text-4xl">
                  <span className="currency">¥</span>
                  <span>{formatYuan(product.price)}</span>
                </div>
                {product.original_price && Number(product.original_price) > Number(product.price) && (
                  <span className="pb-1 text-base text-muted-foreground line-through">¥{formatYuan(product.original_price)}</span>
                )}
                {discount && (
                  <span className="mb-1 rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-white">省 {discount}%</span>
                )}
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                <span className={`stock-badge ${product.stock_level}`}>{STOCK_LABEL[product.stock_level]}</span>
                <span>已售 {product.sold_base.toLocaleString()}+ 单</span>
              </div>
            </div>

            {/* CTA */}
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/checkout/$id" params={{ id: product.id }}
                className="btn-sheen inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-3.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary-hover hover:shadow-primary/40 active:scale-[0.98]">
                <ShoppingCart size={16} /> 立即下单
              </Link>
              <Link to="/tutorials"
                className="inline-flex items-center gap-2 rounded-xl border border-border px-6 py-3.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
                查看激活教程
              </Link>
            </div>

            {/* Clause blocks */}
            <div className="mt-10">
              <ClauseBlocks product={product} />
            </div>
          </div>
        </div>

        {/* Related products */}
        {category && (
          <section className="mt-16 border-t border-border pt-10">
            <h2 className="mb-6 text-lg font-bold text-foreground">同类推荐</h2>
            <RelatedProducts categorySlug={category.slug} excludeId={product.id} />
          </section>
        )}
      </div>
    </div>
  );
}

function RelatedProducts({ categorySlug, excludeId }: { categorySlug: string; excludeId: string }) {
  const { data: all = [] } = useProducts(categorySlug);
  const related = all.filter((p) => p.id !== excludeId).slice(0, 3);
  if (related.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {related.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
