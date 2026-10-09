import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { AlertCircle, Wallet } from 'lucide-react';
import { readSiteSetting, patchSiteSetting, useInvalidateSettings } from '@/lib/queries';
import { QrSourceField } from '@/components/QrSourceField';

type AlipayCfg = { account?: string; name?: string; note?: string; qr_url?: string };

/** 支付宝3配置：收款码、收款账号、户名和付款须知。
 *  写入 site_settings.payment.alipay，不影响 wechat / usdt 子对象。 */
export function AlipayManualPayConfigCard() {
  const [qrUrl, setQrUrl] = useState('');
  const [qrSourceValid, setQrSourceValid] = useState(true);
  const [account, setAccount] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const invalidate = useInvalidateSettings();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const v = await readSiteSetting<{ alipay?: AlipayCfg }>('payment');
        if (!alive) return;
        const a = v?.alipay ?? {};
        setQrUrl(a.qr_url ?? '');
        setAccount(a.account ?? '');
        setName(a.name ?? '');
        setNote(a.note ?? '');
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
      // patchSiteSetting 为浅合并：整体覆盖 payment.alipay，其余通道原样保留
      await patchSiteSetting('payment', {
        alipay: { qr_url: qrUrl.trim(), account: account.trim(), name: name.trim(), note: note.trim() },
      });
      invalidate();
      toast.success('支付宝3设置已保存，前台立即生效');
    } catch (e) {
      console.error('[AlipayManualPayConfig] save failed:', e);
      toast.error('保存失败，请稍后再试');
    }
    setSaving(false);
  }

  if (loading) return <div className="py-6 text-center text-xs text-muted-foreground">加载中…</div>;

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-1 flex items-center gap-2">
        <Wallet size={15} className="text-info" />
        <h3 className="text-sm font-semibold text-foreground">支付宝3 · 账号/收款码备用通道</h3>
      </div>
      <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
        在线收款审核期间用它兜底营业。买家下单后进入独立收款页，看到你的收款二维码，同时仍可复制收款账号自行转账。
      </p>

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">支付宝收款二维码</label>
          <QrSourceField value={qrUrl} onChange={setQrUrl} onValidityChange={setQrSourceValid} />
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            上传支付宝 App「收款码」页面截图（建议正方形、清晰无遮挡），买家在收款页可直接扫码付款。
            想启用<b className="text-foreground">「打开支付宝立即付款」一键跳转</b>：切到「收款链接」并填入
            <span className="font-mono"> https://qr.alipay.com/… </span>（可用下方本地识别按钮从图片里提取）。
          </p>
          {!qrUrl && (
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
              <AlertCircle size={13} className="mt-0.5 shrink-0 text-warning" />
              <p className="text-[11px] leading-relaxed text-warning">尚未上传收款码，买家只能复制账号转账。</p>
            </div>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">收款账号（手机号 / 邮箱）</label>
          <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="13800000000"
            className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:border-info focus:outline-none" />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">收款方户名</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="张三"
            className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:border-info focus:outline-none" />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">付款须知（展示在收款页底部）</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
            placeholder="例如：工作日 10 分钟内核账发卡，超时未到账请联系客服并提供转账凭证。"
            className="w-full resize-none rounded-lg border border-border bg-input px-3 py-2 text-sm leading-relaxed text-foreground focus:border-info focus:outline-none" />
        </div>

        <button onClick={save} disabled={saving}
          className="rounded-lg bg-primary px-5 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60">
          {saving ? '保存中…' : '保存设置'}
        </button>
      </div>
    </section>
  );
}
