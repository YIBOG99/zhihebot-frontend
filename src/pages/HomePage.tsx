import { Link } from '@tanstack/react-router';
import { ArrowRight, CheckCircle2, ChevronRight, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { useProducts, useContents, useCategories } from '@/lib/queries';
import { ProductCard } from '@/components/ProductCard';

const TRUST_ITEMS = [
  { icon: ShieldCheck, title: '商品信息透明', desc: '价格、库存、交付方式公开展示' },
  { icon: CheckCircle2, title: '订单可追踪', desc: '订单号查询，发货状态全程可查' },
  { icon: Zap, title: '到账后发货', desc: '核账完成后自动分配对应卡密' },
  { icon: Sparkles, title: '售后规则清晰', desc: '激活失败可按规则申请换发' },
];

function ProductSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="aspect-[1.62] animate-pulse bg-surface-2" />
          <div className="space-y-3 p-5">
            <div className="h-5 w-2/3 animate-pulse rounded bg-surface-2" />
            <div className="h-4 w-full animate-pulse rounded bg-surface-2" />
            <div className="h-7 w-1/3 animate-pulse rounded bg-surface-2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function HomePage() {
  const { data: products = [], isLoading: loadingProducts } = useProducts();
  const { data: guides = [], isLoading: loadingGuides } = useContents('guide');
  const { data: categories = [] } = useCategories();

  const hot = products.filter((p) => p.is_hot).slice(0, 3);
  const allProducts = products;

  return (
    <main className="min-h-screen bg-background">
      <section className="relative overflow-hidden border-b border-border">
        <div className="home-glow home-glow-a" />
        <div className="home-glow home-glow-b" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-16 pt-16 sm:px-6 sm:pb-20 sm:pt-20 lg:grid-cols-[1.08fr_.92fr] lg:px-8 lg:pb-24 lg:pt-24">
          <div className="relative z-10 max-w-4xl">
            <div className="hero-kicker">
              <span className="hero-kicker-dot" />
              智核数字商品 · 全天候在线
            </div>
            <h1 className="mt-5 max-w-4xl text-[42px] font-black leading-[1.08] tracking-[-0.045em] text-foreground sm:text-6xl lg:text-[76px]">
              把数字好物，
              <br />
              <span className="hero-gradient-text">简单选、安心用。</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
              精选数字权益与实用工具，商品信息、库存、价格和订单状态清晰可查。轻松选购，付款后按商品交付规则快速获取。
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/category/chatgpt" className="home-primary-btn">
                查看商品 <ArrowRight size={18} />
              </Link>
              <Link to="/orders/lookup" className="home-secondary-btn">
                查询订单
              </Link>
            </div>

            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span>✓ 商品信息透明</span>
              <span>✓ 订单可追踪</span>
              <span>✓ 售后规则清晰</span>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
              <Link to="/guides" className="hover:text-foreground transition">购买说明</Link>
              <span>·</span>
              <Link to="/faq" className="hover:text-foreground transition">售后 FAQ</Link>
              <span>·</span>
              <Link to="/tutorials" className="hover:text-foreground transition">已有卡密？直接充值</Link>
            </div>
          </div>
          <div className="hero-orbit-scene relative mx-auto hidden w-full max-w-[520px] lg:block" aria-hidden="true">
            <div className="orbit-ring orbit-ring-outer" />
            <div className="orbit-ring orbit-ring-inner" />
            <div className="orbit-core">
              <div className="orbit-core-mark"><Sparkles size={32} /></div>
              <span className="mt-4 block text-xs font-bold uppercase tracking-[0.28em] text-primary">ZHIHE / DIGITAL</span>
              <span className="mt-2 block text-2xl font-black tracking-tight text-foreground">下一代数字商店</span>
              <span className="mt-2 block text-sm text-muted-foreground">简单 · 清晰 · 可信赖</span>
            </div>
            <div className="orbit-float orbit-float-top"><span className="orbit-float-icon"><ShieldCheck size={17} /></span><span><b>安全选购</b><small>信息清晰可查</small></span><i /></div>
            <div className="orbit-float orbit-float-right"><span className="orbit-float-icon"><Zap size={17} /></span><span><b>快速交付</b><small>订单状态可追踪</small></span><i /></div>
            <div className="orbit-float orbit-float-bottom"><span className="orbit-float-icon"><CheckCircle2 size={17} /></span><span><b>流程透明</b><small>售后规则明确</small></span><i /></div>
            <div className="orbit-coordinate orbit-coordinate-a">35°41' N / 139°41' E</div>
            <div className="orbit-coordinate orbit-coordinate-b">SYSTEM ONLINE <span /></div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-surface">
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-y divide-border sm:grid-cols-4 sm:divide-y-0">
          {TRUST_ITEMS.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="px-5 py-6 sm:px-6">
              <Icon size={20} className="text-primary" />
              <h3 className="mt-3 text-sm font-bold text-foreground">{title}</h3>
              <p className="mt-1.5 text-xs leading-6 text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-[0_18px_60px_rgba(35,43,80,.06)] sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-primary"><Sparkles size={14} /> Smart Shopping</div>
            <h2 className="mt-2 text-xl font-bold text-foreground sm:text-2xl">先选方向，再挑档位</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">ChatGPT 通用创作、Claude 长文与代码、Grok 实时资讯、Gemini 生态办公、Codex / Cursor AI 编程，一页看完。</p>
          </div>
          <div className="flex flex-wrap gap-2 sm:max-w-sm sm:justify-end">
            {categories.map((c) => (
              <Link key={c.slug} to="/category/$slug" params={{ slug: c.slug }} className="category-chip">{c.name.replace(' 专区', '')}</Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-14 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <div className="eyebrow">Popular Picks</div>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-foreground sm:text-3xl">本周爆款</h2>
            <p className="mt-1 text-sm text-muted-foreground">下单人数多、反馈稳定的几个档位</p>
          </div>
          <Link to="/category/chatgpt" className="hidden items-center gap-1 text-sm font-semibold text-primary sm:flex">全部商品 <ChevronRight size={15} /></Link>
        </div>
        {loadingProducts ? <ProductSkeleton /> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{hot.map((p) => <ProductCard key={p.id} product={p} />)}</div>}
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-14 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <div className="eyebrow">All Products</div>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-foreground sm:text-3xl">全部商品</h2>
          </div>
          <Link to="/faq" className="hidden items-center gap-1 text-sm font-semibold text-primary sm:flex">购买前先看 FAQ <ChevronRight size={15} /></Link>
        </div>
        {loadingProducts ? <ProductSkeleton /> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{allProducts.map((p) => <ProductCard key={p.id} product={p} />)}</div>}
      </section>

      <section className="border-t border-border bg-surface">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <div className="eyebrow">Guides</div>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-foreground sm:text-3xl">选购指南</h2>
              <p className="mt-1 text-sm text-muted-foreground">先想清楚要什么，再决定买哪个</p>
            </div>
            <Link to="/guides" className="hidden items-center gap-1 text-sm font-semibold text-primary sm:flex">更多文章 <ChevronRight size={15} /></Link>
          </div>
          {loadingGuides ? <ProductSkeleton /> : (
            <div className="grid gap-4 md:grid-cols-3">
              {guides.slice(0, 3).map((g) => (
                <Link key={g.slug} to="/content/$slug" params={{ slug: g.slug }} className="guide-card">
                  <div className="guide-icon"><Zap size={16} /></div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Guide</div>
                    <h3 className="mt-2 text-sm font-bold leading-6 text-foreground">{g.title}</h3>
                    {g.summary && <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">{g.summary}</p>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
