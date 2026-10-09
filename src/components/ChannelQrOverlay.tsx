import { useEffect, useState } from 'react';
import { X, Copy, Check } from 'lucide-react';
import type { AnnouncementLink } from '@/lib/types';
import { copyText } from '@/lib/channel-launch';

interface Props {
  link: AnnouncementLink;
  onClose: () => void;
}

/**
 * 渠道二维码兜底浮层：scheme 拉不起 / 桌面端时展示。
 * 叠在公告弹窗（z-100）之上，故用 z-[110]；自绘遮罩与项目弹窗范式一致。
 */
export function ChannelQrOverlay({ link, onClose }: Props) {
  const qr = link.qr_url?.trim();
  const account = link.account_id?.trim();

  // 与公告弹窗一致：自绘遮罩需自行锁定背景滚动，避免滑二维码时把背后页面一起拖走
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 p-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={link.label} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xs rounded-2xl border border-white/10 bg-surface p-5 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">{link.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {qr ? '长按二维码识别，或截图后打开 App 扫一扫' : '店主尚未上传二维码，可复制账号手动添加'}
            </p>
          </div>
          <button onClick={onClose} aria-label="关闭" className="shrink-0 rounded-lg border border-white/10 p-1.5 text-muted-foreground transition-colors hover:text-foreground">
            <X size={14} />
          </button>
        </div>

        {qr ? (
          // 白底容器保证任何配色的二维码都可扫（深色底上对比度会失效）
          <div className="mx-auto flex max-w-[240px] items-center justify-center rounded-xl bg-white p-3">
            <img src={qr} alt={`${link.label} 二维码`} className="h-auto w-full object-contain" />
          </div>
        ) : null}

        {account && (
          <CopyRow label={link.action === 'wechat' ? '微信号' : link.action === 'qq_group' ? 'QQ 群号' : '联系方式'} value={account} autoCopy={link.action === 'wechat'} />
        )}

        {link.action === 'wechat' && (
          <p className="mt-3 rounded-lg border border-primary/25 bg-primary/[0.06] px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            微信官方不支持从网页直接跳到加好友页，扫码是唯一直达方式。若二维码识别不了：微信号已自动复制，打开微信 → 右上角「+」→ 添加朋友 → 粘贴搜索即可。
          </p>
        )}
      </div>
    </div>
  );
}

function CopyRow({ label, value, autoCopy }: { label: string; value: string; autoCopy?: boolean }) {
  // 微信场景：浮层一出现就把微信号写进剪贴板（顾客点按钮的手势还在有效期内），
  // 省掉「手动输入微信号」这一步；失败静默，界面上仍有复制按钮兜底。
  useEffect(() => {
    if (!autoCopy || !value) return;
    let alive = true;
    copyText(value).then((ok) => console.log('[ChannelQrOverlay] 自动复制微信号', { ok }));
    return () => { alive = false; void alive; };
  }, [autoCopy, value]);
  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 ${value ? 'mt-3' : ''}`}>
      <span className="min-w-0 truncate text-sm text-foreground">
        <span className="mr-2 text-xs text-muted-foreground">{label}</span>{value}
      </span>
      <CopyButton value={value} />
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button
      onClick={async () => { if (await copyText(value)) { setCopied(true); setTimeout(() => setCopied(false), 1500); } }}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-primary/40 px-2 py-1 text-xs text-primary transition-colors hover:bg-primary/10">
      {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? '已复制' : '复制'}
    </button>
  );
}
