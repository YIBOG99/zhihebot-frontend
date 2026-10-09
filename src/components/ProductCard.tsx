import { Link } from '@tanstack/react-router';
import { Flame } from 'lucide-react';
import type { Product } from '@/lib/types';
import { PRODUCT_PLACEHOLDER } from '@/lib/assets';
import { formatYuan } from '@/lib/utils';

const STOCK_LABEL: Record<string, string> = { many: '库存充足', some: '库存紧张', few: '仅剩少量' };

export function ProductCard({ product }: { product: Product }) {
  const discount = product.original_price && product.original_price > product.price
    ? Math.round((1 - product.price / product.original_price) * 100)
    : null;

  // 价格展示取证：确认小数未被取整（修复 .toFixed(0) 导致 138.99 显示成 138）
  console.log('[ProductCard] price display:', { id: product.id, raw: product.price, shown: formatYuan(product.price) });

  return (
    <Link to="/product/$id" params={{ id: product.id }}
      className="product-card group flex flex-col overflow-hidden rounded-xl border border-border bg-card/80 backdrop-blur-sm">
      {/* Cover */}
      <div className="relative aspect-[16/9] overflow-hidden bg-surface-2">
        <img src={product.cover_url || PRODUCT_PLACEHOLDER} alt={product.title}
          className="cover-img h-full w-full object-cover" loading="lazy" />
        <span className="cover-shine" aria-hidden />
        {product.is_hot && (
          <span className="badge-pulse absolute left-3 top-3 z-[2] inline-flex items-center gap-1 rounded-full bg-danger px-2.5 py-1 text-xs font-semibold text-white">
            <Flame size={11} /> 爆款
          </span>
        )}
        {discount && (
          <span className="absolute right-3 top-3 z-[2] rounded-full bg-gradient-to-r from-primary to-neon-cyan px-2.5 py-1 text-xs font-bold text-primary-foreground shadow-md shadow-primary/30">
            -{discount}%
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-1 flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold leading-snug text-foreground group-hover:text-primary transition-colors">
            {product.title}
          </h3>
          {product.badge && (
            <span className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-muted-foreground">{product.badge}</span>
          )}
        </div>
        {product.subtitle && (
          <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{product.subtitle}</p>
        )}
        <div className="mt-auto flex items-end justify-between">
          <div className="price-tag text-lg">
            <span className="currency">¥</span>
            <span>{formatYuan(product.price)}</span>
            {product.original_price && Number(product.original_price) > Number(product.price) && (
              <span className="original">¥{formatYuan(product.original_price)}</span>
            )}
          </div>
          <span className={`stock-badge ${product.stock_level}`}>{STOCK_LABEL[product.stock_level]}</span>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">已售 {product.sold_base.toLocaleString()}+ 单</p>
      </div>
    </Link>
  );
}
