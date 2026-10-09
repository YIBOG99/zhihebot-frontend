import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { QrCode, Loader2, AlertCircle } from 'lucide-react';
import { QrSourceField } from '@/components/QrSourceField';
import { readSiteSetting, patchSiteSetting, useInvalidateSettings } from '@/lib/queries';

interface AlipayQrCfg { qr_url?: string; name?: string; note?: string }

/** 后台「站点设置」里的支付宝扫码转账（个人经营码）配置卡。
 *  写入 site_settings.payment.alipay_qr，浅合并不动 alipay / wechat / usdt 子对象。 */
export function AlipayQrPayConfigCard() {
  const [qrUrl, setQrUrl] = useState('');
  const [qrSourceValid, setQrSourceValid] = useState(true);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const invalidate = useInvalidateSettings();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const payment = await readSiteSetting<{ alipay_qr?: AlipayQrCfg }>('payment');
        if (!alive) return;
        const c = payment?.alipay_qr ?? {};
        setQrUrl(c.qr_url ?? '');
        setName(c.name ?? '');
        setNote(c.note ?? '');
      } catch (e) {
        console.error('[AlipayQrPayConfig] load failed:', e);
        if (alive) toast.error('支付宝扫码转账配置读取失败，请刷新重试');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  async function save() {
    if (!qrSourceValid) {
      toast.error('请填写有效的支付宝收款链接，或切回上传收款码图片；普通网页 URL 不能作为收款码链接。');
      return;
    }
    setSaving(true);
    try {
      await patchSiteSetting('payment', { alipay_qr: { qr_url: qrUrl.trim(), name: name.trim(), note: note.trim() } });
      invalidate();
      toast.success('支付宝扫码转账设置已保存，前台立即生效');
    } catch (e) {
      console.error('[AlipayQrPayConfig] save failed:', e);
      toast.error(e instanceof Error ? e.message : '保存失败，请稍后再试');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">加载中…</div>;

  return (
    <div className="rounded-xl border border-info/30 bg-card p-5">
      <p className="mb-1 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
        <QrCode size={15} className="text-info" /> 支付宝扫码转账（个人经营码）
      </p>
      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
        顾客选择该方式后跳转到独立收银页，扫描你上传的支付宝收款码，在支付宝里进入「给个人付款」页面按金额转账。
        钱直接到你的个人支付宝账户，<b className="text-foreground">无需开放平台签约</b>；但也<b className="text-danger">无法自动识别到账</b>，需要你在订单列表人工确认收款后发卡。
      </p>

      <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">支付宝收款码</label>
      <QrSourceField value={qrUrl} onChange={setQrUrl} onValidityChange={setQrSourceValid} />
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
        想要<b className="text-foreground">中间没有头像、纯黑白的干净二维码</b>（和 daituai.cc 一样）：先切到「上传收款码图片」把支付宝「收钱」页保存的那张码传上来，
        再点下面的<b className="text-foreground">「从当前配置提取收款链接」</b>——浏览器会本地读出码里那串 <span className="font-mono">https://qr.alipay.com/…</span> 并自动填好，
        保存后前台就变成无图案的纯码。若识别失败，用「选一张本地图片识别」再试一次。
      </p>

      {!qrUrl.trim() && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
          <AlertCircle size={13} className="mt-0.5 shrink-0 text-warning" />
          <p className="text-[11px] leading-relaxed text-warning">尚未上传收款码，前台该通道会提示顾客改用其它支付方式。</p>
        </div>
      )}

      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">收款方名称（显示在二维码下方，便于顾客核对）</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：张三"
          className="w-full rounded-lg border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
      </div>

      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">付款须知（选填）</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="例如：工作日 10 分钟内核账发卡，超时未到账请联系客服并提供转账凭证。"
          className="w-full rounded-lg border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
      </div>

      <button onClick={save} disabled={saving}
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60">
        {saving && <Loader2 size={14} className="animate-spin" />}
        {saving ? '保存中…' : '保存支付宝扫码转账设置'}
      </button>
    </div>
  );
}
