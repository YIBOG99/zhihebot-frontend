import { useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { ChevronRight, ArrowRight } from 'lucide-react';
import { useProducts, useCategories } from '@/lib/queries';
import { ProductCard } from '@/components/ProductCard';

export function CategoryPage() {
  const { slug } = useParams({ strict: false }) as { slug: string };
  const { data: categories = [] } = useCategories();
  const { data: products = [], isLoading } = useProducts(slug);
  const category = categories.find((c) => c.slug === slug);

  return (
    <div className="min-h-screen bg-background">
      {/* Breadcrumb */}
      <div className="border-b border-border bg-surface/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 sm:px-6 lg:px-8 py-3 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground transition-colors">首页</Link>
          <ChevronRight size={12} />
          <span className="text-foreground">{category?.name ?? slug}</span>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{category?.name ?? slug}</h1>
            {category?.description && (
              <p className="mt-1.5 text-sm text-muted-foreground">{category.description}</p>
            )}
          </div>
          {/* Category tabs */}
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <Link key={c.slug} to="/category/$slug" params={{ slug: c.slug }}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  c.slug === slug
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                }`}>
                {c.name}
              </Link>
            ))}
          </div>
        </div>

        {/* Products grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-surface-2" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-muted-foreground">该分类下暂无商品</p>
            <Link to="/" className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
              返回首页 <ArrowRight size={14} />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p, i) => (
              <div key={p.id} className="reveal-up" data-reveal-delay={String(i * 60)}>
                <ProductCard product={p} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
