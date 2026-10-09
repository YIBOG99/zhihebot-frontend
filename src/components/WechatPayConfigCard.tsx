import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { MessageCircle, Loader2 } from 'lucide-react';
import { ImageUploadField } from '@/components/ImageUploadField';
import { readSiteSetting, patchSiteSetting, useInvalidateSettings } from '@/lib/queries';

interface WechatCfg { qr_url?: string; account_name?: string; note?: string }

/** 后台「站点设置」里的微信收款可视化卡片：上传收款码 + 收款人昵称，写入 site_settings.payment.wechat */
export function WechatPayConfigCard() {
  const [qrUrl, setQrUrl] = useState('');
  const [accountName, setAccountName] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const invalidate = useInvalidateSettings();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const payment = await readSiteSetting<{ wechat?: WechatCfg }>('payment');
        if (!alive) return;
        const w = payment?.wechat ?? {};
        setQrUrl(w.qr_url ?? '');
        setAccountName(w.account_name ?? '');
        setNote(w.note ?? '');
      } catch (e) {
        console.error('[WechatPayConfig] load failed:', e);
        if (alive) toast.error('微信收款配置读取失败，请刷新重试');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  async function save() {
    setSaving(true);
    try {
      // 只覆盖 wechat 子对象，patchSiteSetting 内部与现有 value 浅合并，不动 alipay/usdt
      await patchSiteSetting('payment', { wechat: { qr_url: qrUrl.trim(), account_name: accountName.trim(), note: note.trim() } });
      invalidate();
      toast.success('微信收款设置已保存，前台立即生效');
    } catch (e) {
      console.error('[WechatPayConfig] save failed:', e);
      toast.error(e instanceof Error ? e.message : '保存失败，请稍后再试');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">加载中…</div>;

  return (
    <div className="rounded-xl border border-success/30 bg-card p-5">
      <p className="mb-1 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
        <MessageCircle size={15} className="text-success" /> 微信收款码
      </p>
      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
        上传你的微信收款码图片，顾客在结算页选择「微信收款码」后会跳转到独立页面展示这张码。以后换码只需在这里重新上传。
      </p>

      <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">收款码图片</label>
      <ImageUploadField value={qrUrl} onChange={setQrUrl} />

      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">收款方名称（显示在收款码下方）</label>
        <input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="例如：智核数字服务"
          className="w-full rounded-lg border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
      </div>

      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">付款须知（选填）</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="例如：转账请备注订单号后 6 位"
          className="w-full rounded-lg border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
      </div>

      {!qrUrl.trim() && (
        <p className="mt-3 text-[11px] text-warning">尚未上传收款码，前台微信收款页会提示顾客改用其它支付方式。</p>
      )}

      <button onClick={save} disabled={saving}
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60">
        {saving && <Loader2 size={14} className="animate-spin" />}
        {saving ? '保存中…' : '保存微信收款设置'}
      </button>
    </div>
  );
}
