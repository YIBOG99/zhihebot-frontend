import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Coins, Loader2, AlertTriangle } from 'lucide-react';
import { readSiteSetting, patchSiteSetting, useInvalidateSettings } from '@/lib/queries';

type UsdtConfig = { network?: string; address?: string; note?: string };

/** USDT 独立配置：地址、网络和付款提醒均存于 site_settings.payment.usdt。 */
export function UsdtPayConfigCard() {
  const [network, setNetwork] = useState('TRC20');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const invalidate = useInvalidateSettings();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const payment = await readSiteSetting<{ usdt?: UsdtConfig }>('payment');
        if (!alive) return;
        setNetwork(payment?.usdt?.network || 'TRC20');
        setAddress(payment?.usdt?.address || '');
        setNote(payment?.usdt?.note || '');
      } catch (error) {
        console.error('[UsdtPayConfig] load failed:', error);
        if (alive) toast.error('USDT 配置读取失败，请刷新重试');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  async function save() {
    const nextAddress = address.trim();
    if (nextAddress && !/^[a-zA-Z0-9]{20,120}$/.test(nextAddress)) {
      toast.error('地址格式看起来不正确，请核对后再保存');
      return;
    }
    setSaving(true);
    try {
      await patchSiteSetting('payment', {
        usdt: { network, address: nextAddress, note: note.trim() },
      });
      invalidate();
      toast.success('USDT 收款设置已保存');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'USDT 配置保存失败');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">加载中…</div>;

  return (
    <section className="rounded-xl border border-warning/30 bg-card p-5">
      <p className="mb-1 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
        <Coins size={15} className="text-warning" /> USDT 链上转账
      </p>
      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
        请确保地址和网络与钱包收款设置完全一致。链上转账通常无法撤回；付款后由管理员核实到账再确认订单。
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">网络</label>
          <select value={network} onChange={(e) => setNetwork(e.target.value)}
            className="w-full rounded-lg border border-border bg-input px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none">
            <option value="TRC20">TRC20 · TRON</option>
            <option value="ERC20">ERC20 · Ethereum</option>
            <option value="BEP20">BEP20 · BNB Smart Chain</option>
            <option value="Polygon">Polygon</option>
            <option value="Solana">Solana</option>
            <option value="其他">其他网络（请在须知中说明）</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">USDT 收款地址</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="请输入完整收款地址"
            autoComplete="off" spellCheck={false}
            className="w-full rounded-lg border border-border bg-input px-3.5 py-2.5 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
        </div>
      </div>
      {address.trim() && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
          <p className="text-[11px] leading-relaxed text-warning">请用小额测试确认地址与网络。错误网络可能导致资产永久丢失。</p>
        </div>
      )}
      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">付款须知（选填）</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
          placeholder="只接受所选网络的 USDT，请在转账后保存交易哈希并等待人工核账。"
          className="w-full resize-none rounded-lg border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
      </div>
      <button onClick={save} disabled={saving}
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60">
        {saving && <Loader2 size={14} className="animate-spin" />}
        {saving ? '保存中…' : '保存 USDT 设置'}
      </button>
    </section>
  );
}
