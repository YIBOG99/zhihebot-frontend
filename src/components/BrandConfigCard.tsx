import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { ImageIcon, Loader2 } from 'lucide-react';
import { ImageUploadField } from '@/components/ImageUploadField';
import { BrandLogo } from '@/components/BrandLogo';
import { readSiteSetting, patchSiteSetting, useInvalidateSettings } from '@/lib/queries';
import type { BrandingConfig } from '@/lib/types';

const inputCls = 'w-full rounded-lg border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors';
const labelCls = 'mb-1.5 block text-xs font-semibold text-muted-foreground';

/** 全站品牌设置：LOGO 与店名一处上传，顶栏/页脚/登录页/公告弹窗/标签页图标同步生效 */
export function BrandConfigCard() {
  const [cfg, setCfg] = useState<BrandingConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const invalidate = useInvalidateSettings();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const v = await readSiteSetting<BrandingConfig>('branding');
        if (alive) setCfg(v ?? {});
      } catch (e) {
        console.error('[BrandConfig] load failed:', e);
        if (alive) toast.error('品牌设置读取失败，请刷新重试');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  async function save() {
    setSaving(true);
    try {
      await patchSiteSetting('branding', {
        logo_url: (cfg.logo_url ?? '').trim(),
        name: (cfg.name ?? '').trim(),
        tagline: (cfg.tagline ?? '').trim(),
      } as Record<string, unknown>);
      invalidate();
      toast.success('品牌设置已保存，全站 LOGO 与标签页图标立即同步');
    } catch (e) {
      console.error('[BrandConfig] save failed:', e);
      toast.error(e instanceof Error ? e.message : '保存失败，请稍后再试');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">加载中…</div>;

  return (
    <div className="rounded-xl border border-primary/30 bg-card p-5">
      <p className="mb-1 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
        <ImageIcon size={15} className="text-primary" /> 品牌与 LOGO
      </p>
      <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
        这里换一次 LOGO，网站顶栏、页脚、登录页、首页公告弹窗和浏览器标签页图标会<b className="text-foreground">同时更新</b>，无需分别配置。
      </p>

      {/* 当前效果预览 */}
      <div className="mb-5 flex items-center gap-3 rounded-lg border border-border bg-input/40 px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg">
          <BrandLogo size={32} />
        </span>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full">
          <BrandLogo size={28} rounded="full" />
        </span>
        <span className="truncate text-sm font-semibold text-foreground">{cfg.name?.trim() || '智核'}</span>
        {cfg.tagline?.trim() && <span className="hidden truncate text-xs text-muted-foreground sm:inline">{cfg.tagline}</span>}
        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">实际显示效果</span>
      </div>

      <div className="space-y-4">
        <div>
          <label className={labelCls}>LOGO 图片</label>
          <ImageUploadField value={cfg.logo_url ?? ''} onChange={(v) => setCfg((s) => ({ ...s, logo_url: v }))} />
          {!cfg.logo_url?.trim() && (
            <p className="mt-2 text-[11px] text-warning">尚未上传 LOGO，全站暂用文字占位图标；上传后自动替换。</p>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            建议使用<b className="text-foreground">正方形透明底 PNG</b>，尺寸不低于 200×200；过小的图在顶栏会发虚。支持 JPG/PNG/WebP，≤ 5 MB。
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>店名</label>
            <input className={inputCls} value={cfg.name ?? ''} onChange={(e) => setCfg((s) => ({ ...s, name: e.target.value }))} placeholder="例如：智核" />
          </div>
          <div>
            <label className={labelCls}>顶栏短副标</label>
            <input className={inputCls} value={cfg.tagline ?? ''} onChange={(e) => setCfg((s) => ({ ...s, tagline: e.target.value }))} placeholder="例如：AI 会员自助充值" />
          </div>
        </div>
      </div>

      <button onClick={save} disabled={saving}
        className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60">
        {saving && <Loader2 size={14} className="animate-spin" />}
        {saving ? '保存中…' : '保存品牌设置'}
      </button>
    </div>
  );
}
