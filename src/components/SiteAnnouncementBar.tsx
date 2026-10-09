import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { X } from 'lucide-react';
import { useSiteSettings } from '@/lib/queries';

const STORAGE_KEY = 'zhihe-launch-bar-dismissed';

export function SiteAnnouncementBar() {
  const { data: settings } = useSiteSettings();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  });

  if (dismissed) return null;

  const announcement = settings?.announcement;
  const official = announcement?.official_url;
  const security = announcement?.security_note;

  return (
    <div className="site-announcement-bar border-b border-white/5 bg-[#14182b] text-white">
      <div className="mx-auto flex min-h-11 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2 text-xs sm:text-sm">
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.8)]" />
          <span className="truncate font-medium">智核商店已上线，支持在线下单与订单查询</span>
          {(official || security) && (
            <span className="hidden md:inline truncate text-white/55">· {security || `官方地址：${official}`}</span>
          )}
          <Link to="/orders/lookup" className="hidden sm:inline shrink-0 text-white/70 underline-offset-2 hover:text-white hover:underline">查订单</Link>
        </div>
        <button
          type="button"
          aria-label="关闭公告"
          onClick={() => { try { localStorage.setItem(STORAGE_KEY, '1'); } catch {} setDismissed(true); }}
          className="shrink-0 rounded-full p-1 text-white/50 transition hover:bg-white/10 hover:text-white"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
