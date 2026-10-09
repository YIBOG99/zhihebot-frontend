import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Gift, Loader2 } from 'lucide-react';
import { readSiteSetting, patchSiteSetting, useInvalidateSettings } from '@/lib/queries';

interface ReferralCfg {
  enabled?: boolean; reward_amount?: number; min_amount?: number; max_reward_count?: number;
  commission_enabled?: boolean; commission_window_days?: number;
  default_mode?: 'rate' | 'fixed'; default_value?: number; default_cap?: number;
  rules_text?: string;
}

/** 后台「站点设置」里的邀请有礼配置卡，写入 site_settings.referral */
export function ReferralConfigCard() {
  const [enabled, setEnabled] = useState(true);
  const [amount, setAmount] = useState('5');
  const [minAmount, setMinAmount] = useState('30');
  const [maxCount, setMaxCount] = useState('20');
  const [commEnabled, setCommEnabled] = useState(true);
  const [windowDays, setWindowDays] = useState('30');
  const [defaultMode, setDefaultMode] = useState<'rate' | 'fixed'>('rate');
  const [defaultValue, setDefaultValue] = useState('8');
  const [defaultCap, setDefaultCap] = useState('50');
  const [rulesText, setRulesText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const invalidate = useInvalidateSettings();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cfg = await readSiteSetting<ReferralCfg>('referral');
        if (!alive || !cfg) return;
        setEnabled(cfg.enabled !== false);
        setAmount(String(cfg.reward_amount ?? 5));
        setMinAmount(String(cfg.min_amount ?? 30));
        setMaxCount(String(cfg.max_reward_count ?? 20));
        setCommEnabled(cfg.commission_enabled !== false);
        setWindowDays(String(cfg.commission_window_days ?? 30));
        setDefaultMode(cfg.default_mode === 'fixed' ? 'fixed' : 'rate');
        setDefaultValue(String(cfg.default_value ?? 8));
        setDefaultCap(String(cfg.default_cap ?? 50));
        setRulesText(cfg.rules_text ?? '');
      } catch (e) {
        console.error('[ReferralConfig] load failed:', e);
        if (alive) toast.error('邀请奖励配置读取失败，请刷新重试');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  async function save() {
    const amt = Number(amount);
    const min = Number(minAmount);
    const max = Number(maxCount);
    if (!Number.isFinite(amt) || amt <= 0) { toast.error('券面额需为大于 0 的数字'); return; }
    if (!Number.isFinite(min) || min < 0) { toast.error('使用门槛需为不小于 0 的数字'); return; }
    if (!Number.isInteger(max) || max < 1) { toast.error('每人最多可得张数需为正整数'); return; }
    const wd = Number(windowDays);
    if (!Number.isInteger(wd) || wd < 1) { toast.error('返佣有效期需为正整数天'); return; }
    const dv = Number(defaultValue);
    if (!Number.isFinite(dv) || dv <= 0) { toast.error('默认返佣数值需为大于 0 的数字'); return; }
    const dc = Number(defaultCap);
    if (!Number.isFinite(dc) || dc <= 0) { toast.error('单笔封顶需为大于 0 的数字'); return; }
    setSaving(true);
    try {
      await patchSiteSetting('referral', {
        enabled, reward_amount: amt, min_amount: min, max_reward_count: max,
        commission_enabled: commEnabled, commission_window_days: wd,
        default_mode: defaultMode, default_value: dv, default_cap: dc,
        rules_text: rulesText.trim() || undefined,
      });
      invalidate();
      toast.success('邀请奖励设置已保存，新发出的券立即按新规则生效');
    } catch (e) {
      console.error('[ReferralConfig] save failed:', e);
      toast.error(e instanceof Error ? e.message : '保存失败，请稍后再试');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">加载中…</div>;

  const inputCls = 'w-full rounded-lg border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';
  const labelCls = 'mb-1.5 block text-xs font-semibold text-muted-foreground';

  return (
    <div className="rounded-xl border border-primary/30 bg-card p-5">
      <p className="mb-1 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
        <Gift size={15} className="text-primary" /> 邀请好友返券
      </p>
      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
        顾客在个人中心会拿到专属邀请链接与邀请码；其好友注册后，双方各得一张满减券，下单时可直接抵扣。此处设置券的面额与门槛。
      </p>

      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
        <span className="text-sm text-foreground">{enabled ? '活动进行中' : '活动已关闭'}</span>
        <span className="text-[11px] text-muted-foreground">关闭后新的邀请码将无法核销发奖</span>
      </label>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={labelCls}>单张券面额（元）</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="5" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>使用门槛（满多少元）</label>
          <input value={minAmount} onChange={(e) => setMinAmount(e.target.value)} inputMode="decimal" placeholder="30" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>每人最多可得张数</label>
          <input value={maxCount} onChange={(e) => setMaxCount(e.target.value)} inputMode="numeric" placeholder="20" className={inputCls} />
        </div>
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <p className="mb-1 text-sm font-semibold text-foreground">好友消费返佣</p>
        <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
          被邀请的好友在有效期内购买「参与返佣」的商品并完成支付后，自动给邀请人发一张返佣券。此处设置全局参数；具体哪些商品参与、比例多少，在商品编辑里单独勾选。
        </p>
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
          <input type="checkbox" checked={commEnabled} onChange={(e) => setCommEnabled(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
          <span className="text-sm text-foreground">{commEnabled ? '返佣计佣开启' : '返佣计佣已关闭'}</span>
          <span className="text-[11px] text-muted-foreground">关闭后即使商品勾选了返佣也不发放</span>
        </label>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelCls}>返佣有效期（绑定后天数）</label>
            <input value={windowDays} onChange={(e) => setWindowDays(e.target.value)} inputMode="numeric" placeholder="30" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>商品未单独设置时的默认方式</label>
            <select value={defaultMode} onChange={(e) => setDefaultMode(e.target.value === 'fixed' ? 'fixed' : 'rate')} className={inputCls}>
              <option value="rate">按实付金额比例</option>
              <option value="fixed">固定金额券</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>{defaultMode === 'rate' ? '默认比例（%）' : '默认券面额（元）'}</label>
            <input value={defaultValue} onChange={(e) => setDefaultValue(e.target.value)} inputMode="decimal" placeholder="8" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>单笔返佣封顶（元）</label>
            <input value={defaultCap} onChange={(e) => setDefaultCap(e.target.value)} inputMode="decimal" placeholder="50" className={inputCls} />
          </div>
        </div>
        <div className="mt-4">
          <label className={labelCls}>活动规则文案（个人中心展示，一行一条；留空用系统默认）</label>
          <textarea rows={5} value={rulesText} onChange={(e) => setRulesText(e.target.value)}
            placeholder={'把邀请链接发给朋友，对方注册后你俩各得一张满减券…'}
            className={`${inputCls} resize-none`} />
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        防刷说明：仅注册 24 小时内的新账号可绑定邀请人，且每个账号只能被邀请一次；同一笔订单只计一次佣金。这些限制由服务端强制校验，改前端无效。
      </p>

      <button onClick={save} disabled={saving}
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60">
        {saving && <Loader2 size={14} className="animate-spin" />}
        {saving ? '保存中…' : '保存邀请与返佣设置'}
      </button>
    </div>
  );
}
