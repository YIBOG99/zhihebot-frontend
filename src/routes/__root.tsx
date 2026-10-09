// 根布局：Provider 放这里；页面路由在 src/routes/ 下单独建文件，勿堆进 index.tsx
import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { Link, Outlet, createRootRouteWithContext, useRouterState } from '@tanstack/react-router';
import { trackVisit } from '@/lib/track-visit';
import { FaviconSync } from '@/components/FaviconSync';

function NotFoundComponent() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="font-mono text-6xl font-bold text-primary/40">404</p>
      <h1 className="text-xl font-semibold text-foreground">页面不存在</h1>
      <p className="text-sm text-muted-foreground">你访问的地址可能已失效或尚未上线。</p>
      <Link to="/" className="mt-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover transition-colors">
        返回首页
      </Link>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const errorMessage = error instanceof Error ? error.message : '发生了未知错误';
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold text-foreground">加载出错了</h1>
      <p className="max-w-md text-sm text-muted-foreground">{error?.message || '发生了未知错误'}</p>
      <button onClick={reset} className="mt-2 rounded-xl border border-border px-6 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        重试
      </button>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => { trackVisit(); }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <FaviconSync />
      <Outlet />
      <Toaster theme="dark" position="top-center" richColors />
    </QueryClientProvider>
  );
}
