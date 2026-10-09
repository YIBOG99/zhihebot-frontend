import { createFileRoute, Outlet } from '@tanstack/react-router';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { AnnouncementDialog } from '@/components/AnnouncementDialog';
import { SiteAnnouncementBar } from '@/components/SiteAnnouncementBar';

export const Route = createFileRoute('/_layout')({
  component: () => (
    <div className="storefront-shell min-h-screen">
      <SiteAnnouncementBar />
      <SiteHeader />
      <Outlet />
      <SiteFooter />
      <AnnouncementDialog />
    </div>
  ),
});
