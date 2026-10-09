// 商品图片输入控件：外链填写 + 本地选图上传（必须 ArrayBuffer，见 meoo-cloud storage 规范）
import { useRef, useState } from 'react';
import { decode } from 'base64-arraybuffer';
import { ImagePlus, Loader2, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/supabase/client';
import { PRODUCT_IMAGE_BUCKET_NAME } from '@/lib/queries';

const MAX_BYTES = 5 * 1024 * 1024;

interface Props {
  value: string;
  onChange: (url: string) => void;
}

export function ImageUploadField({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  function pickFile() {
    if (!uploading) inputRef.current?.click();
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // 允许连续选同一文件
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('只能选择图片文件'); return; }
    if (file.size > MAX_BYTES) { toast.error(`图片过大（${(file.size / 1024 / 1024).toFixed(1)} MB），上限 5 MB`); return; }

    const reader = new FileReader();
    reader.onerror = () => toast.error('读取文件失败，请重试');
    reader.onload = async () => {
      const base64 = String(reader.result).split(',')[1];
      if (!base64) { toast.error('图片数据为空，请换一张试试'); return; }
      setUploading(true);
      try {
        const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
        const path = `products/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { data, error } = await supabase.storage
          .from(PRODUCT_IMAGE_BUCKET_NAME)
          .upload(path, decode(base64), { contentType: file.type, upsert: false });
        if (error) { console.error('[ImageUploadField] upload failed:', error.message); throw new Error(error.message); }
        const { data: pub } = supabase.storage.from(PRODUCT_IMAGE_BUCKET_NAME).getPublicUrl(data.path);
        onChange(pub.publicUrl);
        console.log('[ImageUploadField] uploaded ->', pub.publicUrl);
        toast.success('图片已上传');
      } catch (err) {
        toast.error(`上传失败：${err instanceof Error ? err.message : '未知错误'}`);
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        {/* 预览 */}
        <button type="button" onClick={pickFile} disabled={uploading}
          className="group relative h-[76px] w-[114px] shrink-0 overflow-hidden rounded-xl border border-border bg-input transition-colors hover:border-primary/60">
          {value ? (
            <img src={value} alt="商品图预览" className="h-full w-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0.25'; }} />
          ) : (
            <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground group-hover:text-primary transition-colors">
              <ImagePlus size={16} />
              <span className="text-[10px]">选图上传</span>
            </span>
          )}
          {uploading && (
            <span className="absolute inset-0 flex items-center justify-center bg-background/70">
              <Loader2 size={18} className="animate-spin text-primary" />
            </span>
          )}
        </button>

        {/* URL 输入 */}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="relative">
            <Link2 size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="或直接粘贴图片链接 https://…"
              className="w-full rounded-lg border border-border bg-input py-2 pl-8 pr-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <button type="button" onClick={pickFile} disabled={uploading} className="text-primary hover:underline disabled:opacity-50">
              {uploading ? '上传中…' : '本地上传'}
            </button>
            {value && (
              <button type="button" onClick={() => onChange('')} className="hover:text-danger transition-colors">清除图片</button>
            )}
            <span>支持 JPG/PNG，≤ 5 MB</span>
          </div>
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
    </div>
  );
}
