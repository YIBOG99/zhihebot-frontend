import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Image as ImageIcon, Link2, Loader2, Wand2 } from 'lucide-react';
import { ImageUploadField } from '@/components/ImageUploadField';
import { decodeQrFromImage } from '@/lib/qr-decode';

/**
 * 收款码来源选择器：上传图片 / 填写链接 / 从已传图片提取纯码。
 * - image：存 CDN 图片地址（带支付宝 logo、头像）
 * - link：存收款链接本身（如 https://qr.alipay.com/xxx），前台用 qrcode 库生成无 logo 纯黑白码
 * - 「提取」按钮：在浏览器本地解码已上传的图片（jsQR + canvas，不发任何第三方请求），
 *   成功后自动切到 link 模式并填入解出的链接——解决支付宝个人收钱码页面不提供复制链接入口的问题。
 * value 始终是字符串，两种来源共用同一字段，存储结构不变。
 */
export function QrSourceField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const looksLikeLink = /^https?:\/\//i.test(value.trim()) && !/\.(png|jpe?g|gif|webp|svg|avif|bmp)(\?|#|$)/i.test(value.trim());
  const [mode, setMode] = useState<'image' | 'link'>(looksLikeLink ? 'link' : 'image');
  // 管理后台异步加载已保存的链接时，同步切换到链接输入模式；图片上传值不触发切换。
  useEffect(() => { if (looksLikeLink) setMode('link'); }, [looksLikeLink]);
  const [decoding, setDecoding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function decodeFromFile(file: File) {
    setDecoding(true);
    try {
      const text = await decodeQrFromImage(file);
      if (!text) {
        toast.error('没能识别出二维码内容，换一张更清晰的截图再试');
        return;
      }
      onChange(text);
      setMode('link');
      toast.success('已提取收款链接，保存后前台即显示无图案的纯二维码');
    } catch (e) {
      console.error('[QrSourceField] decode failed', e);
      toast.error(e instanceof Error ? e.message : '识别失败，请重试');
    } finally {
      setDecoding(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function decodeCurrentImage() {
    if (!value.trim()) {
      toast.error('请先上传收款码图片');
      return;
    }
    setDecoding(true);
    try {
      const text = await decodeQrFromImage(value.trim());
      if (!text) {
        toast.error('这张图里没识别出二维码，可改用下方「选一张本地图片识别」');
        return;
      }
      onChange(text);
      setMode('link');
      toast.success('已提取收款链接，保存后前台即显示无图案的纯二维码');
    } catch (e) {
      console.error('[QrSourceField] decode current image failed', e);
      toast.error('该图片无法在本地读取（跨域限制），请用下方「选一张本地图片识别」');
    } finally {
      setDecoding(false);
    }
  }

  return (
    <div>
      <div className="mb-2 inline-flex rounded-lg border border-border bg-surface-2 p-0.5">
        {(
          [
            { key: 'image' as const, label: '上传收款码图片', icon: ImageIcon },
            { key: 'link' as const, label: '填写收款链接', icon: Link2 },
          ]
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setMode(t.key)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              mode === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {mode === 'image' ? (
        <ImageUploadField value={value} onChange={onChange} />
      ) : (
        <>
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="例如 https://qr.alipay.com/baxxxxxxxxxxxxxxx"
            spellCheck={false}
            className="w-full rounded-lg border border-border bg-input px-3.5 py-2.5 font-mono text-sm text-foreground placeholder:font-sans placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {value.trim() && !/^https?:\/\//i.test(value.trim()) && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-danger">需以 http:// 或 https:// 开头，否则无法生成二维码。</p>
          )}
        </>
      )}

      {/* 提取工具行：支付宝个人收钱码不给复制链接，就在这里把图片里的码扫出来 */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={decodeCurrentImage}
          disabled={decoding || !value.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-info/40 bg-info/10 px-3 py-2 text-xs font-semibold text-info transition-colors hover:bg-info/20 disabled:opacity-50"
        >
          {decoding ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
          从当前配置提取收款链接
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={decoding}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          选一张本地图片识别
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) decodeFromFile(f);
          }}
        />
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
        识别全部在你手机/电脑的浏览器本地完成，图片不会传给任何第三方网站。
      </p>
    </div>
  );
}
