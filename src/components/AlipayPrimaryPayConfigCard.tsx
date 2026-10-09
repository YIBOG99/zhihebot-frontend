import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { QrCode, Loader2, AlertCircle } from 'lucide-react';
import { QrSourceField } from '@/components/QrSourceField';
import { isAlipayPayLink } from '@/lib/alipay-deeplink';
import { readSiteSetting, patchSiteSetting, useInvalidateSettings } from '@/lib/queries';

interface AlipayPrimaryCfg { qr_url?: string; pay_url?: string; name?: string; note?: string }

/** 支付宝1 独立收款码配置；与支付宝2、支付宝3相互独立。 */
export function AlipayPrimaryPayConfigCard() {
  const [qrUrl, setQrUrl] = useState('');
  const [payUrl, setPayUrl] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const invalidate = useInvalidateSettings();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const payment = await readSiteSetting<{ alipay_primary?: AlipayPrimaryCfg }>('payment');
        if (!alive) return;
        const c = payment?.alipay_primary ?? {};
        setQrUrl(c.qr_url ?? '');
        setPayUrl(c.pay_url ?? '');
        setName(c.name ?? '');
        setNote(c.note ?? '');
      } catch (e) {
        console.error('[AlipayPrimaryPayConfig] load failed:', e);
        if (alive) toast.error('支付宝1配置读取失败，请刷新重试');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  async function save() {
    if (payUrl.trim() && !isAlipayPayLink(payUrl.trim())) {
      toast.error('支付宝付款链接必须是有效的支付宝收款链接；普通网页地址不能用于深链唤起。请清空该字段并保留收款码，或核对链接。');
      return;
    }
    setSaving(true);
    try {
      await patchSiteSetting('payment', {
        alipay_primary: { qr_url: qrUrl.trim(), pay_url: payUrl.trim(), name: name.trim(), note: note.trim() },
      });
      invalidate();
      toast.success('支付宝1收款设置已保存');
    } catch (e) {
      console.error('[AlipayPrimaryPayConfig] save failed:', e);
      toast.error(e instanceof Error ? e.message : '保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">加载中…</div>;

  return (
    <section className="rounded-xl border border-info/30 bg-card p-5">
      <p className="mb-1 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
        <QrCode size={15} className="text-info" /> 支付宝1 · 深链优先收款码
      </p>
      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
        单独配置支付宝1的收款码或收款链接，不影响支付宝2、支付宝3。若二维码内包含可访问的支付宝收款链接，可使用下方本地识别工具提取；前台手机浏览器会尝试唤起支付宝。只上传图片时仍可扫码付款，但不能保证一键进入付款页。
      </p>

      <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">支付宝1收款码 / 收款链接</label>
      <QrSourceField value={qrUrl} onChange={setQrUrl} />
      {!qrUrl.trim() && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
          <AlertCircle size={13} className="mt-0.5 shrink-0 text-warning" />
          <p className="text-[11px] leading-relaxed text-warning">尚未配置收款码或图片，前台不会显示支付宝1通道。</p>
        </div>
      )}

      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">支付宝付款链接（选填，优先用于手机唤起）</label>
        <input value={payUrl} onChange={(e) => setPayUrl(e.target.value)} placeholder="https://qr.alipay.com/..."
          inputMode="url" autoComplete="url" spellCheck={false}
          className="w-full rounded-lg border border-border bg-input px-3.5 py-2.5 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
          仅可信支付宝收款链接可触发深链；二维码图片仍用于收银页展示。未填写时会尝试识别上方字段是否为支付宝链接。
        </p>
      </div>

      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">收款方名称</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：收款方名称"
          className="w-full rounded-lg border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
      </div>

      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">付款须知（选填）</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="请按页面显示的金额付款，并备注订单号。"
          className="w-full resize-none rounded-lg border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
      </div>

      <button onClick={save} disabled={saving}
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60">
        {saving && <Loader2 size={14} className="animate-spin" />}
        {saving ? '保存中…' : '保存支付宝1设置'}
      </button>
    </section>
  );
}
