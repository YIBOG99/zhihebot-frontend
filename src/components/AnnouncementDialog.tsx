import { useState, useEffect } from 'react';
import { useLocation } from '@tanstack/react-router';
import { Bell, MessageSquare, Send, AtSign, Mail, Phone, Users, Globe, ShieldCheck, Lock, Info, Check, ExternalLink, Link2, QrCode, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useSiteSettings, useBranding } from '@/lib/queries';
import { BrandLogo } from '@/components/BrandLogo';
import { ChannelQrOverlay } from '@/components/ChannelQrOverlay';
import { isSnoozed, setSnooze } from '@/lib/announcement-snooze';
import { launchChannel } from '@/lib/channel-launch';
import type { AnnouncementConfig, AnnouncementLink, LinkAction } from '@/lib/types';

/** 渠道按钮可选图标（白名单，避免任意字符串映射组件） */
const ICON_MAP: Record<string, LucideIcon> = {
  bell: Bell, chat: MessageSquare, telegram: Send, qq: Users, x: AtSign,
  mail: Mail, phone: Phone, globe: Globe, link: Link2, discord: MessageSquare,
};

/** 未选图标时按动作类型给个贴切的默认图标 */
const ACTION_ICON: Record<LinkAction, LucideIcon> = {
  url: ExternalLink, qq_group: Users, wechat: MessageSquare, tel: Phone, mailto: Mail, qrcode: QrCode,
};

function iconOf(link: AnnouncementLink): LucideIcon {
  const name = link.icon;
  if (name && ICON_MAP[name]) return ICON_MAP[name];
  return ACTION_ICON[link.action ?? 'url'];
}

/** 后台未配置时的兜底文案（取自站点品牌设置） */
function withDefaults(cfg: AnnouncementConfig | undefined, brandName?: string): Required<Pick<AnnouncementConfig, 'title' | 'subtitle' | 'cta_label' | 'snooze_label' | 'snooze_hours'>> & AnnouncementConfig {
  return {
    title: cfg?.title?.trim() || brandName || '欢迎光临',
    subtitle: cfg?.subtitle?.trim() || '请认准官方网址，谨防假冒。',
    cta_label: cfg?.cta_label?.trim() || '好的，我知道了',
    snooze_label: cfg?.snooze_label?.trim() || '24 小时内不再提醒',
    snooze_hours: cfg?.snooze_hours && cfg.snooze_hours > 0 ? cfg.snooze_hours : 24,
    ...cfg,
  };
}

function LinkButton({ link, onQr }: { link: AnnouncementLink; onQr: (l: AnnouncementLink) => void }) {
  const Icon = iconOf(link);
  const action = link.action ?? 'url';
  const cls = 'group flex min-h-[104px] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.11] via-white/[0.025] to-fuchsia-500/[0.06] px-3 py-4 text-center text-sm font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,.04)] transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_8px_28px_rgba(139,92,246,.16)] active:scale-[0.98]';

  // 未配置的外链仍显示为入口卡片，点击时明确提示缺少链接。
  if (action === 'url' && !link.url.trim()) {
    return (
      <button type="button" onClick={() => toast(link.description || '该渠道链接尚未配置')} className={cls}>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/25 bg-primary/[0.12] text-primary transition-transform group-hover:scale-105">
          <Icon size={20} />
        </span>
        <span className="truncate">{link.label}</span>
        {link.description && <span className="text-[11px] font-normal leading-4 text-muted-foreground">{link.description}</span>}
      </button>
    );
  }

  function click() {
    const r = launchChannel(link);
    if (r.notice) toast(r.notice, { duration: 2600 });
    // handled=false → 展示二维码兜底浮层（qrcode 动作、微信、桌面端 QQ 都走这里）
    if (!r.handled) onQr(link);
  }

  return (
    <button type="button" onClick={click} className={cls}>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/25 bg-primary/[0.12] text-primary transition-transform group-hover:scale-105">
        <Icon size={20} />
      </span>
      <span className="truncate">{link.label}</span>
      {link.description && <span className="text-[11px] font-normal leading-4 text-muted-foreground">{link.description}</span>}
    </button>
  );
}

/** 全站首页公告弹窗：内容全部来自 site_settings.announcement，店主后台可随时改 */
export function AnnouncementDialog() {
  const { data, isPending } = useSiteSettings();
  const pathname = useLocation({ select: (location) => location.pathname });
  const [open, setOpen] = useState(false);
  const [snooze, setSnoozeChecked] = useState(false);
  const [qrLink, setQrLink] = useState<AnnouncementLink | null>(null);

  // 设置到位后判定一次是否该弹；关闭弹窗不重置，避免同会话内反复打扰
  useEffect(() => {
    if (pathname !== '/') { setOpen(false); return; }
    if (isPending || !data) return;
    const cfg = data.announcement;
    if (!cfg || cfg.enabled === false || isSnoozed()) return;
    const timer = window.setTimeout(() => setOpen(true), 1800);
    return () => window.clearTimeout(timer);
  }, [isPending, data, pathname]);

  // 自绘遮罩没有 Radix 的 RemoveScroll，必须自己锁背景：
  // 否则顾客在弹窗里滑动会滚到公告背后的页面，关掉后停在莫名位置。
  useEffect(() => {
    if (!open && !qrLink) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    console.log('[Announcement] body scroll locked', { open, qr: Boolean(qrLink) });
    return () => {
      document.body.style.overflow = prev;
      console.log('[Announcement] body scroll released');
    };
  }, [open, qrLink]);

  if (!data) return null;
  const cfg = withDefaults(data.announcement, data.brand?.name);
  const links = (cfg.links ?? []).filter((l) => l.label.trim());
  const hasBlue = Boolean(cfg.official_url?.trim() || cfg.security_note?.trim());
  const hasWarn = Boolean(cfg.warning_note?.trim());

  function confirm() {
    if (snooze) setSnooze(cfg.snooze_hours ?? 24);
    setOpen(false);
  }

  return (
    <>
      {/* 自绘遮罩而非 shadcn Dialog：需要禁止点遮罩关闭，强制用户看清内容 */}
      {open && (
        <div className="popup-holo-backdrop fixed inset-0 z-[100] flex items-end justify-center overflow-y-auto bg-[#02050d]/85 p-0 backdrop-blur-xl sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={cfg.title}>
          <div className="popup-holo-panel relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-primary/30 bg-surface p-6 shadow-[0_0_80px_rgba(77,229,255,.14),0_0_28px_rgba(84,242,194,.12)] sm:rounded-3xl">
            <div className="mb-5 flex items-center justify-center gap-2">
              <span className="h-px w-8 bg-gradient-to-r from-transparent to-primary/70" />
              <span className="rounded-full border border-primary/30 bg-primary/[0.08] px-3 py-1 text-[9px] font-bold uppercase tracking-[0.24em] text-primary">ZHIHE // SYSTEM NOTICE</span>
              <span className="h-px w-8 bg-gradient-to-l from-transparent to-primary/70" />
            </div>
            {/* LOGO + 标题 */}
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-4">
                <span className="absolute -inset-3 rounded-full bg-gradient-to-tr from-primary/40 via-sky-500/30 to-fuchsia-500/40 blur-md" />
                <BrandLogo size={64} rounded="full" className="relative" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">{cfg.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{cfg.subtitle}</p>
            </div>

            {/* 蓝色提示条：官方地址 + 防骗 */}
            {hasBlue && (
              <div className="mt-6 space-y-2.5 rounded-2xl border-l-[3px] border-primary bg-primary/[0.06] p-4">
                {cfg.official_url?.trim() && (
                  <p className="flex items-start gap-2.5 text-sm leading-relaxed">
                    <ShieldCheck size={16} className="mt-0.5 shrink-0 text-primary" />
                    <span className="text-muted-foreground">官方地址：<span className="font-semibold text-primary">{cfg.official_url}</span></span>
                  </p>
                )}
                {cfg.security_note?.trim() && (
                  <p className="flex items-start gap-2.5 text-sm leading-relaxed">
                    <Lock size={16} className="mt-0.5 shrink-0 text-primary" />
                    <span className="font-medium text-foreground">{cfg.security_note}</span>
                  </p>
                )}
              </div>
            )}

            {/* 粉色警示条 */}
            {hasWarn && (
              <div className="mt-4 rounded-2xl border-l-[3px] border-danger bg-danger/[0.07] p-4">
                <p className="flex items-start gap-2.5 text-sm font-medium leading-relaxed text-danger">
                  <Info size={16} className="mt-0.5 shrink-0" />
                  <span>{cfg.warning_note}</span>
                </p>
              </div>
            )}

            {/* 渠道按钮 */}
            {links.length > 0 && (
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {links.map((l, i) => <LinkButton key={`${l.label}-${i}`} link={l} onQr={setQrLink} />)}
              </div>
            )}

            {/* 确认 */}
            <button onClick={confirm}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary-hover active:scale-[0.98]">
              <Check size={16} /> {cfg.cta_label}
            </button>

            <label className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-muted-foreground transition-colors hover:text-foreground">
              <input type="checkbox" checked={snooze} onChange={(e) => setSnoozeChecked(e.target.checked)}
                className="h-4 w-4 shrink-0 accent-[oklch(0.7_0.15_160)]" />
              {cfg.snooze_label}
            </label>
          </div>
        </div>
      )}
      {/* 二维码兜底浮层：叠在公告弹窗之上 */}
      {qrLink && <ChannelQrOverlay link={qrLink} onClose={() => setQrLink(null)} />}
    </>
  );
}
