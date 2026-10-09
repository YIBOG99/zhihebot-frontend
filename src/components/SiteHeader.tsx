import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Menu, X, User, LogOut, LayoutDashboard, Search } from 'lucide-react';
import { useCategories, useBranding } from '@/lib/queries';
import { BrandLogo, useBrandName } from '@/components/BrandLogo';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useIsAdmin } from '@/hooks/use-is-admin';
import { supabase } from '@/supabase/client';

const NAV_LINKS = [
  { to: '/guides', label: '选购指南' },
  { to: '/tutorials', label: '激活教程' },
  { to: '/faq', label: '常见问题' },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const { data: categories = [] } = useCategories();
  const { user } = useAuthSession();
  const adminState = useIsAdmin();
  const brandName = useBrandName();
  const { tagline } = useBranding();

  function logout() {
    void supabase.auth.signOut();
    setOpen(false);
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-xl header-glow">
      <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex min-w-0 items-center gap-3" onClick={() => setOpen(false)}>
          <BrandLogo size={48} rounded="lg" />
          <span className="min-w-0">
            <span className="block truncate text-lg font-bold tracking-tight text-foreground sm:text-xl">{brandName}</span>
            <span className="mt-0.5 block truncate text-[9px] font-semibold uppercase tracking-[0.22em] text-muted-foreground sm:text-[10px]">
              {tagline || 'AI MEMBERSHIP & DIGITAL SERVICES'}
            </span>
          </span>
        </Link>

        <nav className="hidden xl:flex items-center gap-1">
          <Link to="/" className="nav-pill">首页</Link>
          {categories.slice(0, 4).map((c) => (
            <Link key={c.slug} to="/category/$slug" params={{ slug: c.slug }} className="nav-pill">{c.name.replace(' 专区','')}</Link>
          ))}
          {NAV_LINKS.map((l) => (
            <Link key={l.to} to={l.to as never} className="nav-pill">{l.label}</Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <Link to="/orders/lookup" className="hidden sm:flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-2 text-sm font-medium text-foreground transition hover:border-primary/40 hover:bg-card">
            <Search size={15} /> 查订单
          </Link>
          {user ? (
            <div className="hidden md:flex items-center gap-2">
              {adminState === 'granted' && (
                <Link to="/admin" title="管理后台" className="flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/15 transition">
                  <LayoutDashboard size={14} /> 后台
                </Link>
              )}
              <Link to="/account" className="flex items-center gap-2 rounded-full border border-border bg-surface py-1.5 pl-1.5 pr-3 text-sm text-foreground hover:border-primary/40 transition-colors">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{user.username.slice(0, 1).toUpperCase()}</span>
                <span className="max-w-[100px] truncate">{user.username}</span>
              </Link>
              <button onClick={logout} title="退出登录" className="rounded-full p-2 text-muted-foreground hover:bg-surface hover:text-danger transition"><LogOut size={15} /></button>
            </div>
          ) : (
            <Link to="/login" className="hidden md:flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary-hover transition">
              <User size={15} /> 登录 / 注册
            </Link>
          )}
          <button
            onClick={() => setOpen(!open)}
            aria-label={open ? '关闭菜单' : '打开菜单'}
            className="rounded-xl p-2.5 text-foreground transition hover:bg-surface xl:hidden"
          >
            {open ? <X size={24} /> : <Menu size={26} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border bg-background px-4 py-3 xl:hidden">
          <div className="grid grid-cols-2 gap-2 pb-3">
            <Link to="/" onClick={() => setOpen(false)} className="mobile-nav-pill">首页</Link>
            {categories.map((c) => (
              <Link key={c.slug} to="/category/$slug" params={{ slug: c.slug }} onClick={() => setOpen(false)} className="mobile-nav-pill">{c.name.replace(' 专区','')}</Link>
            ))}
            {NAV_LINKS.map((l) => (
              <Link key={l.to} to={l.to as never} onClick={() => setOpen(false)} className="mobile-nav-pill">{l.label}</Link>
            ))}
            <Link to="/orders/lookup" onClick={() => setOpen(false)} className="mobile-nav-pill">订单查询</Link>
          </div>
          <div className="flex flex-wrap gap-4 border-t border-border pt-3">
            {user ? (
              <>
                {adminState === 'granted' && <Link to="/admin" onClick={() => setOpen(false)} className="text-sm font-semibold text-primary">后台管理</Link>}
                <Link to="/account" onClick={() => setOpen(false)} className="text-sm font-semibold text-foreground">{user.username} · 个人中心</Link>
                <button onClick={logout} className="text-sm text-muted-foreground">退出登录</button>
              </>
            ) : (
              <Link to="/login" onClick={() => setOpen(false)} className="text-sm font-semibold text-foreground">登录 / 注册</Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
