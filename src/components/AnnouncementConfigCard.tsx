import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Megaphone, Plus, Trash2, Loader2, BellOff } from 'lucide-react';
import { readSiteSetting, patchSiteSetting, useInvalidateSettings } from '@/lib/queries';
import { clearSnooze } from '@/lib/announcement-snooze';
import { ImageUploadField } from '@/components/ImageUploadField';
import type { AnnouncementConfig, AnnouncementLink, LinkAction } from '@/lib/types';

/** 动作类型：决定顾客点击按钮时发生什么 */
const ACTION_OPTIONS: { value: LinkAction; label: string; hint: string }[] = [
  { value: 'url', label: '普通外链', hint: '新窗口打开下方链接（官网、Telegram 邀请链接等）' },
  { value: 'qq_group', label: 'QQ 群 · 自动拉起', hint: '手机端点按唤起 QQ 到加群页。QQ 群号用于展示/复制；加群密钥 key 在 qun.qq.com/join.html 选群后从「iPhone代码」或「Android代码」里复制（两串通用），没有 key 只能靠扫二维码' },
  { value: 'wechat', label: '微信 · 二维码+复制', hint: '微信官方禁止网页直达加好友页：点按后弹出二维码（顾客长按识别）并自动复制微信号，附「粘贴搜索」指引' },
  { value: 'tel', label: '拨打电话', hint: '手机点按直接拨号；填电话号码' },
  { value: 'mailto', label: '发送邮件', hint: '点按打开邮件客户端；填邮箱地址' },
  { value: 'qrcode', label: '仅展示二维码', hint: '点按弹出二维码浮层（适合 Telegram 加群码等）' },
];

const ICON_OPTIONS = [
  { value: '', label: '跟随动作类型' },
  { value: 'bell', label: '铃铛 · 通知群' },
  { value: 'chat', label: '气泡 · 交流群' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'qq', label: 'QQ / 群组' },
  { value: 'x', label: 'X（推特）' },
  { value: 'mail', label: '邮箱' },
  { value: 'phone', label: '电话' },
  { value: 'globe', label: '网址' },
];

const inputCls = 'w-full rounded-lg border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors';
const labelCls = 'mb-1.5 block text-xs font-semibold text-muted-foreground';

/** 首页公告弹窗的可视化编辑器，写入 site_settings.announcement */
export function AnnouncementConfigCard() {
  const [cfg, setCfg] = useState<AnnouncementConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const invalidate = useInvalidateSettings();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const v = await readSiteSetting<AnnouncementConfig>('announcement');
        if (alive) setCfg(v ?? {});
      } catch (e) {
        console.error('[AnnouncementConfig] load failed:', e);
        if (alive) toast.error('公告设置读取失败，请刷新重试');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const set = <K extends keyof AnnouncementConfig>(k: K, v: AnnouncementConfig[K]) => setCfg((s) => ({ ...s, [k]: v }));

  function patchLink(i: number, p: Partial<AnnouncementLink>) {
    setCfg((s) => ({ ...s, links: (s.links ?? []).map((l, idx) => (idx === i ? { ...l, ...p } : l)) }));
  }
  function addLink() {
    setCfg((s) => ({ ...s, links: [...(s.links ?? []), { label: '', url: '', icon: '', action: 'url' }] }));
  }
  function removeLink(i: number) {
    setCfg((s) => ({ ...s, links: (s.links ?? []).filter((_, idx) => idx !== i) }));
  }

  async function save() {
    // 每个按钮必须有名称；普通外链必须填地址；拉起类动作必须填对应账号/群号
    const bad = (cfg.links ?? []).find((l) => !l.label.trim());
    if (bad) { toast.error('有渠道按钮没填名称，请补齐或删除该按钮'); return; }
    const missUrl = (cfg.links ?? []).some((l) => ((l.action ?? 'url') === 'url' && !l.url.trim()));
    if (missUrl) { toast.error('「普通外链」类型的按钮需要填写跳转链接'); return; }
    const missId = (cfg.links ?? []).some((l) => ['wechat', 'tel'].includes(l.action ?? '') && !(l.account_id ?? '').trim());
    if (missId) { toast.error('微信 / 电话 类型的按钮需要填写微信号或电话号码'); return; }
    const noQr = (cfg.links ?? []).some((l) => l.action === 'qrcode' && !(l.qr_url ?? '').trim());
    if (noQr) { toast.error('「仅展示二维码」类型的按钮需要先上传二维码图片'); return; }
    // qq_group 允许不填 key（只弹二维码），但保存时留日志，方便排查"为什么没拉起"
    console.log('[AnnouncementConfig] save links', (cfg.links ?? []).map((l) => ({ label: l.label, action: l.action, account_id: l.account_id, join_key_len: (l.join_key ?? '').trim().length })));
    setSaving(true);
    try {
      const cleaned: AnnouncementConfig = {
        ...cfg,
        links: (cfg.links ?? []).map((l) => ({
          label: l.label.trim(),
          url: l.url.trim(),
          icon: l.icon || undefined,
          action: l.action || undefined,
          account_id: l.account_id?.trim() || undefined,
          join_key: l.join_key?.trim() || undefined,
          qr_url: l.qr_url?.trim() || undefined,
        })),
      };
      await patchSiteSetting('announcement', cleaned as Record<string, unknown>);
      invalidate();
      toast.success('公告弹窗设置已保存，顾客下次打开首页即生效');
    } catch (e) {
      console.error('[AnnouncementConfig] save failed:', e);
      toast.error(e instanceof Error ? e.message : '保存失败，请稍后再试');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">加载中…</div>;

  const links = cfg.links ?? [];

  return (
    <div className="rounded-xl border border-primary/30 bg-card p-5">
      <p className="mb-1 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
        <Megaphone size={15} className="text-primary" /> 首页公告弹窗
      </p>
      <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
        顾客打开网站时首先看到的提示窗，可放 LOGO、官方网址、防骗提醒和各渠道联系入口。改完点底部保存即生效。
      </p>

      {/* 开关 + 本机预览辅助 */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-input/50 px-4 py-3">
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
          <input type="checkbox" checked={cfg.enabled !== false} onChange={(e) => set('enabled', e.target.checked)}
            className="h-4 w-4 accent-[oklch(0.7_0.15_160)]" />
          开启公告弹窗
        </label>
        <button onClick={() => { clearSnooze(); toast.success('已清除本机的「不再提醒」，刷新页面即可预览弹窗'); }}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary">
          <BellOff size={12} /> 我这边不弹了？点此恢复本机预览
        </button>
      </div>

      <div className="space-y-4">
        <div className="rounded-lg border border-dashed border-border bg-input/30 px-4 py-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            弹窗 LOGO <b className="text-foreground">跟随上方「品牌与 LOGO」设置</b>，此处不再单独配置 —— 在品牌卡片里换一次，网站和弹窗同时更新。
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>店名 / 标题</label>
            <input className={inputCls} value={cfg.title ?? ''} onChange={(e) => set('title', e.target.value)} placeholder="例如：智核" />
          </div>
          <div>
            <label className={labelCls}>副标题</label>
            <input className={inputCls} value={cfg.subtitle ?? ''} onChange={(e) => set('subtitle', e.target.value)} placeholder="例如：请认准官方网址，谨防假冒。" />
          </div>
        </div>

        <div>
          <label className={labelCls}>官方网址（蓝色提示条第一行）</label>
          <input className={inputCls} value={cfg.official_url ?? ''} onChange={(e) => set('official_url', e.target.value)} placeholder="例如：zhihe.shop" />
        </div>

        <div>
          <label className={labelCls}>防骗说明（蓝色提示条第二行）</label>
          <textarea className={`${inputCls} resize-none`} rows={2} value={cfg.security_note ?? ''} onChange={(e) => set('security_note', e.target.value)}
            placeholder="例如：客服只通过首页展示的联系方式处理，谨防被骗。" />
        </div>

        <div>
          <label className={labelCls}>下单警示（粉色提示条，选填）</label>
          <textarea className={`${inputCls} resize-none`} rows={2} value={cfg.warning_note ?? ''} onChange={(e) => set('warning_note', e.target.value)}
            placeholder="例如：下单前请看清商品介绍，有问题请先联系客服。" />
        </div>

        {/* 渠道按钮 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className={`${labelCls} mb-0`}>渠道按钮（按顺序从上到下排列）</label>
            <button onClick={addLink} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary">
              <Plus size={12} /> 添加按钮
            </button>
          </div>
          {links.length === 0 && <p className="text-xs text-muted-foreground">暂无按钮，点右上角「添加按钮」新建。</p>}
          <div className="space-y-2.5">
            {links.map((l, i) => {
              const act = l.action ?? 'url';
              const opt = ACTION_OPTIONS.find((o) => o.value === act);
              return (
                <div key={i} className="rounded-lg border border-border bg-input/40 p-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_1.2fr_auto_auto]">
                    <input className={inputCls} value={l.label} onChange={(e) => patchLink(i, { label: e.target.value })} placeholder="按钮文案" />
                    <select className={`${inputCls} sm:w-52`} value={act} onChange={(e) => patchLink(i, { action: e.target.value as LinkAction })}>
                      {ACTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <select className={`${inputCls} sm:w-36`} value={l.icon ?? ''} onChange={(e) => patchLink(i, { icon: e.target.value })}>
                      {ICON_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <button onClick={() => removeLink(i)} title="删除该按钮"
                      className="flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-danger hover:text-danger">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {opt && <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{opt.hint}</p>}
                  {act === 'qq_group' ? (
                    <>
                      <input className={`${inputCls} mt-2`} value={l.account_id ?? ''} onChange={(e) => patchLink(i, { account_id: e.target.value })} placeholder="QQ 群号，如 907104860（展示给顾客复制用）" />
                      <input className={`${inputCls} mt-2`} value={l.join_key ?? ''} onChange={(e) => patchLink(i, { join_key: e.target.value })} placeholder="加群密钥 key，如 nHCirTItlbbWvY6z…（qun.qq.com/join.html 生成，iPhone/Android 通用）" />
                    </>
                  ) : null}
                  {act === 'wechat' || act === 'tel' ? (
                    <input className={`${inputCls} mt-2`} value={l.account_id ?? ''} onChange={(e) => patchLink(i, { account_id: e.target.value })}
                      placeholder={act === 'wechat' ? '微信号，如 zhihe_kefu（顾客可复制）' : '电话号码，如 +8613800000000'} />
                  ) : null}
                  {act === 'mailto' ? (
                    <input className={`${inputCls} mt-2`} value={l.account_id ?? ''} onChange={(e) => patchLink(i, { account_id: e.target.value })} placeholder="邮箱地址，如 kefu@example.com" />
                  ) : null}
                  {act === 'url' ? (
                    <input className={`${inputCls} mt-2`} value={l.url} onChange={(e) => patchLink(i, { url: e.target.value })} placeholder="跳转链接 https://…" />
                  ) : (
                    <input className={`${inputCls} mt-2`} value={l.url} onChange={(e) => patchLink(i, { url: e.target.value })} placeholder="备用网页链接（选填，二维码也打不开时可跳这里）" />
                  )}
                  {act !== 'url' && act !== 'mailto' && (
                    <div className="mt-2.5">
                      <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">二维码图片（兜底展示用）</p>
                      <ImageUploadField value={l.qr_url ?? ''} onChange={(v) => patchLink(i, { qr_url: v })} />
                      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                        {act === 'qq_group' ? '不填 key 也能保存，但手机端点按钮只会弹二维码；填了 key 才能一键拉起 QQ 直达加群页。二维码供电脑端或拉起失败时扫码，建议一并上传。'
                          : act === 'wechat' ? '微信无法从网页直达加好友页，此二维码是主要方式 —— 请务必上传个人/客服微信的二维码。'
                          : '点击按钮后弹出这张二维码，顾客长按识别或截图再扫。'}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={labelCls}>确认按钮文案</label>
            <input className={inputCls} value={cfg.cta_label ?? ''} onChange={(e) => set('cta_label', e.target.value)} placeholder="好的，我知道了" />
          </div>
          <div>
            <label className={labelCls}>勾选框文案</label>
            <input className={inputCls} value={cfg.snooze_label ?? ''} onChange={(e) => set('snooze_label', e.target.value)} placeholder="24 小时内不再提醒" />
          </div>
          <div>
            <label className={labelCls}>静默时长（小时）</label>
            <input className={inputCls} type="number" min={1} max={720} value={cfg.snooze_hours ?? 24}
              onChange={(e) => set('snooze_hours', Number(e.target.value))} />
          </div>
        </div>
      </div>

      <button onClick={save} disabled={saving}
        className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60">
        {saving && <Loader2 size={14} className="animate-spin" />}
        {saving ? '保存中…' : '保存公告弹窗设置'}
      </button>
    </div>
  );
}
