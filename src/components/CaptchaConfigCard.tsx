import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { readSiteSetting, patchSiteSetting, useInvalidateSettings } from '@/lib/queries';

interface CaptchaCfg {
  enabled?: boolean; max_orders?: number; cap_window_seconds?: number; cap_window_unit?: 'seconds' | 'minutes';
  auto_whitelist_enabled?: boolean; auto_whitelist_threshold?: number;
}

/** 频控窗口单位：与服务端 cap_window_unit 取值一一对应（非法值服务端回退 seconds） */
const UNIT_OPTIONS = [
  { id: 'seconds', label: '秒' },
  { id: 'minutes', label: '分钟' },
] as const;

type UnitId = (typeof UNIT_OPTIONS)[number]['id'];

/** 后台「站点设置」里的人机校验配置卡，写入 site_settings.captcha */
export function CaptchaConfigCard() {
  const [enabled, setEnabled] = useState(true);
  const [maxOrders, setMaxOrders] = useState('3');
  const [windowSeconds, setWindowSeconds] = useState('15');
  const [unit, setUnit] = useState<UnitId>('seconds');
  const [autoWl, setAutoWl] = useState(true);
  const [autoThr, setAutoThr] = useState('1');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const invalidate = useInvalidateSettings();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cfg = await readSiteSetting<CaptchaCfg>('captcha');
        if (!alive || !cfg) return;
        setEnabled(cfg.enabled !== false);
        setMaxOrders(String(cfg.max_orders ?? 3));
        setWindowSeconds(String(cfg.cap_window_seconds ?? 15));
        setUnit(cfg.cap_window_unit === 'minutes' ? 'minutes' : 'seconds');
        setAutoWl(cfg.auto_whitelist_enabled !== false);
        setAutoThr(String(cfg.auto_whitelist_threshold ?? 1));
      } catch (e) {
        console.error('[CaptchaConfig] load failed:', e);
        if (alive) toast.error('人机校验配置读取失败，请刷新重试');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  async function save() {
    const mo = Number(maxOrders);
    const wl = Number(windowSeconds);
    if (!Number.isInteger(mo) || mo < 0) { toast.error('频控单数需为非负整数（0 表示不限）'); return; }
    if (!Number.isInteger(wl) || wl < 1) { toast.error(`频控时间窗需为正整数${unit === 'minutes' ? '分钟' : '秒'}`); return; }
    const at = Number(autoThr);
    if (autoWl && (!Number.isInteger(at) || at < 1)) { toast.error('自动加白达标单数需为正整数（至少 1 单）'); return; }
    setSaving(true);
    try {
      await patchSiteSetting('captcha', {
        enabled, max_orders: mo, cap_window_seconds: wl, cap_window_unit: unit,
        auto_whitelist_enabled: autoWl, auto_whitelist_threshold: autoWl ? at : undefined,
      });
      invalidate();
      toast.success(enabled ? '人机校验已开启，新订单立即生效' : '人机校验已关闭');
    } catch (e) {
      console.error('[CaptchaConfig] save failed:', e);
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
        <ShieldCheck size={15} className="text-primary" /> 下单人机校验
      </p>
      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
        顾客提交订单前须照抄输入一串随机验证码；验证码由服务端生成、库里只存摘要，每提交一次即更换新码。同时限制同一联系方式在时间窗内的待付款订单数量，用于过滤机器批量下单后恶意退款。
      </p>

      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
        <span className="text-sm text-foreground">{enabled ? '校验开启中' : '校验已关闭'}</span>
        <span className="text-[11px] text-muted-foreground">关闭后下单不再校验验证码，频控同时失效</span>
      </label>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>时间窗内最多订单数（0 为不限）</label>
          <input value={maxOrders} onChange={(e) => setMaxOrders(e.target.value)} inputMode="numeric" placeholder="3" className={inputCls} disabled={!enabled} />
        </div>
        <div>
          <label className={labelCls}>频控时间窗</label>
          <div className="flex gap-2">
            <input value={windowSeconds} onChange={(e) => setWindowSeconds(e.target.value)} inputMode="numeric" placeholder="15" className={`${inputCls} min-w-0 flex-1`} disabled={!enabled} />
            <div className="flex shrink-0 items-center rounded-lg border border-border bg-input p-0.5">
              {UNIT_OPTIONS.map((u) => (
                <button key={u.id} type="button" disabled={!enabled} onClick={() => setUnit(u.id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    unit === u.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}>{u.label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-surface px-4 py-3">
        <label className="flex cursor-pointer items-center gap-3">
          <input type="checkbox" checked={autoWl} onChange={(e) => setAutoWl(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
          <span className="text-sm text-foreground">累计付款达标自动加入频控白名单</span>
        </label>
        <div className={`mt-2.5 flex items-center gap-2 ${autoWl ? '' : 'opacity-50'}`}>
          <span className="text-xs text-muted-foreground">同一联系方式累计付款成功满</span>
          <input value={autoThr} onChange={(e) => setAutoThr(e.target.value)} inputMode="numeric" placeholder="1"
            disabled={!autoWl}
            className="w-16 rounded-lg border border-border bg-input px-2 py-1 text-center text-xs text-foreground focus:border-primary focus:outline-none disabled:cursor-not-allowed" />
          <span className="text-xs text-muted-foreground">单即自动豁免次数限制</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          只统计<b className="text-foreground">真实付到款</b>的订单（含已收款待发货），余额充值单不计入；邮箱与手机号各自独立判定。
          关闭后不再自动加入，但<b className="text-foreground">已在名单里的记录保持有效</b>；你在「频控」页手动移除过的联系方式，系统不会再加回来。
        </p>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        当前规则：<b className="text-foreground">仅对游客/未登录下单</b>生效——同一联系方式在
        <span className="font-semibold text-foreground"> {windowSeconds || '?'} {unit === 'minutes' ? '分钟' : '秒'}</span> 内最多
        <span className="font-semibold text-foreground"> {Number(maxOrders) > 0 ? ` ${maxOrders} 笔` : ' 不限'}</span> 订单，超出即拦截，到点自动放行。
        <b className="text-foreground">顾客登录后下单不受次数限制</b>；
        {autoWl
          ? <>成交满 <span className="font-semibold text-foreground">{Number(autoThr) >= 1 ? autoThr : '1'}</span> 单的顾客会被<b className="text-foreground">自动加入白名单</b>，无需手工录入。</>
          : <>自动加白已关闭，需要豁免的游客请到后台「频控」页手动加白名单。</>}
        把单数上限填 0 即可完全关闭频控（验证码校验仍保留）。
      </p>

      <button onClick={save} disabled={saving}
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60">
        {saving && <Loader2 size={14} className="animate-spin" />}
        {saving ? '保存中…' : '保存人机校验设置'}
      </button>
    </div>
  );
}
