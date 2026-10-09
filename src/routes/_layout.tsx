import { createFileRoute, Outlet } from '@tanstack/react-router';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { AnnouncementDialog } from '@/components/AnnouncementDialog';
import { AiAssistantWidget } from '@/components/AiAssistantWidget';
import { SiteAnnouncementBar } from '@/components/SiteAnnouncementBar';

export const Route = createFileRoute('/_layout')({
  component: () => (
    <div className="storefront-shell min-h-screen">
      <SiteAnnouncementBar />
      <SiteHeader />
      <Outlet />
      <SiteFooter />
      <AnnouncementDialog />
      {/* AI 客服浮层：只在前台布局内渲染，/admin、/boss 是独立顶层路由故天然不显示 */}
      <AiAssistantWidget />
    </div>
  ),
});
