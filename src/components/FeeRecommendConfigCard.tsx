import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Percent, Loader2 } from 'lucide-react';
import { readSiteSetting, patchSiteSetting, useInvalidateSettings } from '@/lib/queries';
import { DEFAULT_FEE_RATE } from '@/lib/wallet';

interface BillingCfg {
  fee_enabled?: boolean; alipay_fee_rate?: number;
}
interface RecommendCfg {
  enabled?: boolean; label?: string; note?: string;
}

const inputCls = 'w-full rounded-lg border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';
const labelCls = 'mb-1.5 block text-xs font-semibold text-muted-foreground';

/**
 * 后台「站点设置」里的渠道手续费 + 优先推荐配置卡。
 * 写入 site_settings.billing 与 site_settings.recommend，前端建单时由服务端读取算定金额。
 */
export function FeeRecommendConfigCard() {
  const [feeEnabled, setFeeEnabled] = useState(true);
  const [rate, setRate] = useState(String(DEFAULT_FEE_RATE));
  const [recEnabled, setRecEnabled] = useState(true);
  const [recLabel, setRecLabel] = useState('优先推荐');
  const [recNote, setRecNote] = useState('推荐使用支付宝付款，到账最快');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const invalidate = useInvalidateSettings();

  // 费率越界提示：服务端会回退默认值，这里同步标红告知店主实际生效口径
  const rateNum = Number(rate);
  const rateInvalid = !Number.isFinite(rateNum) || rateNum < 0 || rateNum > 20;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [billing, recommend] = await Promise.all([
          readSiteSetting<BillingCfg>('billing'),
          readSiteSetting<RecommendCfg>('recommend'),
        ]);
        if (!alive) return;
        if (billing) {
          setFeeEnabled(billing.fee_enabled !== false);
          setRate(String(billing.alipay_fee_rate ?? DEFAULT_FEE_RATE));
        }
        if (recommend) {
          setRecEnabled(recommend.enabled !== false);
          setRecLabel(recommend.label || '优先推荐');
          setRecNote(recommend.note || '推荐使用支付宝付款，到账最快');
        }
      } catch (e) {
        console.error('[FeeRecommend] load failed:', e);
        if (alive) toast.error('手续费配置读取失败，请刷新重试');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  async function save() {
    if (rateInvalid) { toast.error('手续费率需为 0 ~ 20 之间的数字（单位 %）'); return; }
    setSaving(true);
    try {
      await patchSiteSetting('billing', { fee_enabled: feeEnabled, alipay_fee_rate: rateNum });
      await patchSiteSetting('recommend', { enabled: recEnabled, label: recLabel.trim() || '优先推荐', note: recNote.trim() });
      invalidate();
      toast.success('已保存，新订单立即按新费率与推荐文案计算');
    } catch (e) {
      console.error('[FeeRecommend] save failed:', e);
      toast.error(e instanceof Error ? e.message : '保存失败，请稍后再试');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">加载中…</div>;

  return (
    <div className="rounded-xl border border-primary/30 bg-card p-5">
      <p className="mb-1 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
        <Percent size={15} className="text-primary" /> 渠道手续费与支付推荐
      </p>
      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
        三个支付宝通道（支付宝1 在线扫码、支付宝2 个人收款码、支付宝3 人工转账）在商品应付金额基础上按比例加收渠道手续费；账户余额、微信收款、USDT 免手续费。费率与最终金额在你选择支付方式时由服务端一并写入订单，前台显示、支付宝收款、后台记录三者始终一致。
      </p>

      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
        <input type="checkbox" checked={feeEnabled} onChange={(e) => setFeeEnabled(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
        <span className="text-sm text-foreground">{feeEnabled ? '手续费收取中' : '手续费已关闭'}</span>
        <span className="text-[11px] text-muted-foreground">关闭后所有支付方式均按商品原价收款</span>
      </label>

      <div className="mt-4">
        <label className={labelCls}>支付宝类通道手续费率（%）</label>
        <input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" placeholder="4.6"
          className={`${inputCls} ${rateInvalid ? 'border-danger focus:border-danger focus:ring-danger' : ''}`} disabled={!feeEnabled} />
        <p className={`mt-1.5 text-[11px] leading-relaxed ${rateInvalid ? 'text-danger' : 'text-muted-foreground'}`}>
          {rateInvalid
            ? '当前数值超出 0 ~ 20 范围，保存会被拒绝；即使直接写库，服务端也会回退为 4.6% 后再计算。'
            : `示例：应付 ¥100.00 的订单，走支付宝将加收 ¥${(feeEnabled ? (100 * (Number(rate) || 0)) / 100 : 0).toFixed(2)} 手续费，实收 ¥${(100 + (feeEnabled ? 100 * (Number(rate) || 0) / 100 : 0)).toFixed(2)}（四舍五入到分）。`}
        </p>
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
          <input type="checkbox" checked={recEnabled} onChange={(e) => setRecEnabled(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
          <span className="text-sm text-foreground">{recEnabled ? '「优先推荐」角标展示中' : '角标已隐藏'}</span>
          <span className="text-[11px] text-muted-foreground">作用于结算页、续付页与商品详情页的支付宝类通道</span>
        </label>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>角标文字</label>
            <input value={recLabel} onChange={(e) => setRecLabel(e.target.value)} maxLength={8} placeholder="优先推荐" className={inputCls} disabled={!recEnabled} />
          </div>
          <div>
            <label className={labelCls}>支付方式区顶部说明语</label>
            <input value={recNote} onChange={(e) => setRecNote(e.target.value)} maxLength={40} placeholder="推荐使用支付宝付款，到账最快" className={inputCls} disabled={!recEnabled} />
          </div>
        </div>
      </div>

      <button onClick={save} disabled={saving}
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60">
        {saving && <Loader2 size={14} className="animate-spin" />}
        {saving ? '保存中…' : '保存手续费与推荐设置'}
      </button>
    </div>
  );
}
