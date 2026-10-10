// 邀请有礼：专属链接 + 邀请码 + 奖励券列表 + 返佣记录 + 活动规则 + 补录他人邀请码
import { useState } from 'react';
import { Copy, Check, Gift, Share2, Loader2, Ticket, ScrollText, ChevronDown, Coins } from 'lucide-react';
import { toast } from 'sonner';
import type { UseReferral } from '@/lib/referral';
import { bindReferralCode, buildShareLink, DEFAULT_REFERRAL_RULES } from '@/lib/referral';
import { useSiteSettings } from '@/lib/queries';
import { CommissionProductList } from '@/components/account/CommissionProductList';
import { formatYuan } from '@/lib/utils';

interface Props { referral: UseReferral; }

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch { return false; }
  }
}

export function InviteCard({ referral }: Props) {
  const { inviteCode, stats, rewards, commissions, loading, refresh } = referral;
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [inputCode, setInputCode] = useState('');
  const [binding, setBinding] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  /** 后台可自定义规则文案（site_settings.referral.rules_text，按行拆分）；缺省用内置模板 */
  const { data: settings } = useSiteSettings();
  const rulesText = (settings?.referral as { rules_text?: string } | undefined)?.rules_text?.trim();
  const ruleItems = rulesText ? rulesText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : DEFAULT_REFERRAL_RULES;

  const link = buildShareLink(inviteCode);
  const bound = stats?.inviteCount ?? 0;

  async function doCopy(key: string, value: string) {
    if (!value) return;
    if (await copyText(value)) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 1600);
    } else {
      toast.error('复制失败，请长按文字手动复制');
    }
  }

  async function handleBind(e: React.FormEvent) {
    e.preventDefault();
    const code = inputCode.trim().toUpperCase();
    if (code.length < 4) { toast.error('请输入完整的邀请码'); return; }
    setBinding(true);
    const r = await bindReferralCode(code);
    setBinding(false);
    if (r.bound) {
      toast.success(r.message || '邀请码已生效');
      setInputCode('');
      refresh();
    } else {
      toast.error(r.message || '邀请码未能生效');
    }
  }

  return (
    <section className="glow-frame rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Gift size={17} className="text-primary" /> 邀请好友返券
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            把下方链接发给朋友，对方注册后你俩各得一张满减券；券在下单时直接抵扣。
          </p>
        </div>
        {loading && <Loader2 size={16} className="mt-1 shrink-0 animate-spin text-muted-foreground" />}
      </div>

      {/* 专属链接 */}
      <div className="mt-4 space-y-3">
        <div className="rounded-xl border border-border bg-surface p-3">
          <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">我的专属邀请链接</p>
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{link || '生成中…'}</span>
            <button onClick={() => doCopy('link', link)} disabled={!link} title="复制链接"
              className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 disabled:opacity-50">
              {copiedKey === 'link' ? <Check size={13} className="text-success" /> : <><Share2 size={12} className="mr-1 inline" />复制</>}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3">
          <div>
            <p className="text-[11px] text-muted-foreground">我的邀请码（也可手动告知好友）</p>
            <p className="mt-0.5 font-mono text-xl font-bold tracking-[0.2em] text-primary">{inviteCode || (loading ? '邀请码加载中…' : inviteCodeFailed ? '邀请码加载失败' : '暂无邀请码')}</p>
            {!loading && !inviteCode && <button type="button" onClick={refresh} className="mt-1 text-xs text-primary underline underline-offset-2">点击重试</button>}
          </div>
          <button onClick={() => doCopy('code', inviteCode ?? '')} disabled={!inviteCode}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50">
            {copiedKey === 'code' ? <><Check size={13} /> 已复制</> : <><Copy size={13} /> 复制邀请码</>}
          </button>
        </div>
      </div>

      {/* 战绩 */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: '成功邀请', value: String(bound), tone: 'text-foreground' },
          { label: '可用券', value: String(stats?.availableCount ?? 0), tone: 'text-primary' },
          { label: '券余额', value: `¥${formatYuan(stats?.availableAmount ?? 0)}`, tone: 'text-success' },
          { label: '累计返佣', value: `¥${formatYuan(stats?.totalCommission ?? 0)}`, tone: 'text-warning' },
        ].map((it) => (
          <div key={it.label} className="stat-glow rounded-xl border border-border bg-surface/60 p-3 text-center">
            <p className="text-[11px] text-muted-foreground">{it.label}</p>
            <p className={`mt-1 text-lg font-bold tabular-nums ${it.tone}`}>{it.value}</p>
          </div>
        ))}
      </div>

      {/* 我的券 */}
      {rewards.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Ticket size={13} /> 我的奖励券
          </p>
          <ul className="space-y-2">
            {rewards.slice(0, 6).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-surface px-3 py-2">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-foreground">{r.code}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">满 ¥{formatYuan(r.min_amount)} 可用 · {new Date(r.created_at).toLocaleDateString('zh-CN')}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="price-tag text-base"><span className="currency">¥</span>{formatYuan(r.amount)}</span>
                  {r.status === 'available' ? (
                    <button onClick={() => doCopy(`c_${r.id}`, r.code)} title="复制券码"
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground">
                      {copiedKey === `c_${r.id}` ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                    </button>
                  ) : (
                    <span className="rounded-full bg-muted/20 px-2 py-0.5 text-[11px] text-muted-foreground">已使用</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {rewards.length > 6 && <p className="mt-2 text-[11px] text-muted-foreground">仅展示最近 6 张，共 {rewards.length} 张。</p>}
        </div>
      )}

      {/* 我的返佣记录 */}
      {commissions.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Coins size={13} /> 好友消费返佣
          </p>
          <ul className="space-y-2">
            {commissions.slice(0, 6).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs text-foreground">
                    {c.friend_name ?? '好友'} 购买了「{c.product_title ?? '商品'}」
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    实付 ¥{Number(c.base_amount).toFixed(2)} · {new Date(c.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {c.status === 'granted' ? (
                    <span className="price-tag text-base"><span className="currency">¥</span>{Number(c.reward_amount).toFixed(2)}</span>
                  ) : (
                    <span className="rounded-full bg-muted/20 px-2 py-0.5 text-[11px] text-muted-foreground">已达券数上限</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {commissions.length >= 20 && <p className="mt-2 text-[11px] text-muted-foreground">仅展示最近 20 条返佣记录。</p>}
        </div>
      )}

      {/* 活动规则折叠区 */}
      <div className="mt-4 border-t border-border pt-3">
        <button type="button" onClick={() => setRulesOpen((v) => !v)} aria-expanded={rulesOpen}
          className="flex w-full items-center justify-between gap-2 text-left text-xs font-semibold text-foreground transition-colors hover:text-primary">
          <span className="flex items-center gap-1.5">
            <ScrollText size={13} className="text-primary" /> 活动规则
          </span>
          <ChevronDown size={14} className={`shrink-0 text-muted-foreground transition-transform duration-200 ${rulesOpen ? 'rotate-180' : ''}`} />
        </button>
        {rulesOpen && (
          <ol className="mt-2.5 space-y-1.5 pl-1">
            {ruleItems.map((r, i) => (
              <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-muted-foreground">
                <span className="shrink-0 font-mono text-primary">{i + 1}.</span>
                <span>{r}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* 参与返佣的商品列表（放在活动规则之后） */}
      <CommissionProductList />

      {/* 补录他人邀请码 */}
      {bound === 0 && (
        <form onSubmit={handleBind} className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
          <div className="min-w-[160px] flex-1">
            <label className="mb-1.5 block text-[11px] text-muted-foreground">我是被朋友介绍来的，填写 TA 的邀请码</label>
            <input value={inputCode} onChange={(e) => setInputCode(e.target.value.toUpperCase())} placeholder="8 位邀请码"
              maxLength={16}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 font-mono text-sm uppercase text-foreground placeholder:normal-case placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <button type="submit" disabled={binding || !inputCode.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60">
            {binding && <Loader2 size={12} className="animate-spin" />} 领取
          </button>
        </form>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        说明：仅注册 24 小时内的新账号可绑定邀请人，每人只能被邀请一次；奖励券由店主在后台设置面额与门槛。
      </p>
    </section>
  );
}
