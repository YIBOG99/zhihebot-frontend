// 收款码容器：正常态显示绿框二维码；过期后整张码去色压暗，中央盖「已过期」。
// 纯行内渲染，不使用任何浮层（微信内置浏览器里浮层点击不可靠）。
import { useEffect, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { isAlipayPayLink } from '@/lib/alipay-deeplink';

/**
 * 判断配置值是「收款链接」还是「图片地址」。
 * 判定口径统一收口在 `src/lib/alipay-deeplink.ts` 的 `isAlipayPayLink()`：
 * ⚠️ CDN / 存储桶图片地址普遍带 ?auth_key=… 签名或路径无扩展名，只看结尾后缀会误判成收款链接。
 */
const isPayLink = isAlipayPayLink;

export function QrExpiryFrame({
  src,
  alt,
  expired = false,
  caption,
  footer,
}: {
  /** 店主配置的收款码：既可以是图片 URL，也可以是一段收款链接（后者由前端生成无 logo 的纯码） */
  src: string;
  alt: string;
  /** 是否已过期：为真时加遮罩并显示「已过期」 */
  expired?: boolean;
  /** 二维码下方一行说明（如长按识别提示） */
  caption?: ReactNode;
  /** 卡片底部附加内容（如收款方名称） */
  footer?: ReactNode;
}) {
  /** 收款链接 → 前端生成的纯二维码 dataURL；图片地址则直接沿用原值 */
  const [genSrc, setGenSrc] = useState<string | null>(null);
  const asLink = isPayLink(src);

  useEffect(() => {
    if (!asLink) return;
    let alive = true;
    QRCode.toDataURL(src.trim(), { margin: 1, width: 440, errorCorrectionLevel: 'M', color: { dark: '#000000ff', light: '#ffffffff' } })
      .then((url) => { if (alive) setGenSrc(url); })
      .catch((e) => console.warn('[QrExpiryFrame] generate qr from link failed', e));
    return () => { alive = false; };
  }, [src, asLink]);

  // 配置的是链接但还没生成完 / 生成失败时，先不渲染破图
  if (asLink && !genSrc) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="mx-auto flex h-[280px] w-full max-w-[280px] items-center justify-center rounded-xl bg-white text-xs text-muted-foreground ring-1 ring-black/5">
          二维码生成中…
        </div>
      </div>
    );
  }

  const finalSrc = asLink ? genSrc! : src;

  return (
    <div
      className={`rounded-2xl border p-6 transition-colors ${
        expired ? 'border-danger/40 bg-surface' : 'border-success bg-card qr-frame-green shadow-sm'
      }`}
    >
      <div className="relative mx-auto w-full max-w-[280px]">
        <img
          src={finalSrc}
          alt={alt}
          className={`block h-auto w-full rounded-xl bg-white p-3 ring-1 ring-black/5 transition-all duration-500 ${
            expired ? 'opacity-25 grayscale' : ''
          }`}
        />
        {expired && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
            <span className="rounded-lg border-2 border-danger bg-white px-4 py-1.5 text-base font-bold tracking-widest text-danger">
              已过期
            </span>
            <span className="text-[11px] font-medium text-danger">二维码已失效</span>
          </div>
        )}
      </div>
      {footer}
      {caption && (
        <p className={`mt-4 text-center text-sm leading-relaxed ${expired ? 'font-semibold text-danger' : 'text-muted-foreground'}`}>
          {caption}
        </p>
      )}
    </div>
  );
}
