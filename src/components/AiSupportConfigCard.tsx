import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Bot, Loader2, Plus, Trash2 } from 'lucide-react';
import { readSiteSetting, patchSiteSetting, useInvalidateSettings } from '@/lib/queries';
import type { AiSupportConfig, AiKnowledgeItem } from '@/lib/types';

const inputCls = 'w-full rounded-lg border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';
const labelCls = 'mb-1.5 block text-xs font-semibold text-muted-foreground';

/** 后台「站点设置」里的 AI 客服配置卡：开关、话术、快捷提问、自定义知识库，写入 site_settings.ai_support */
export function AiSupportConfigCard() {
  const [cfg, setCfg] = useState<AiSupportConfig>({});
  const [quick, setQuick] = useState<string[]>([]);
  const [knowledge, setKnowledge] = useState<AiKnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const invalidate = useInvalidateSettings();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const v = await readSiteSetting<AiSupportConfig>('ai_support');
        if (!alive) return;
        setCfg(v ?? {});
        setQuick(v?.quick_questions?.length ? v.quick_questions : []);
        setKnowledge((v?.knowledge ?? []).filter((k) => k && (k.q || k.a)));
      } catch (e) {
        console.error('[AiSupportConfig] load failed:', e);
        if (alive) toast.error('AI 客服配置读取失败，请刷新重试');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  async function save() {
    setSaving(true);
    try {
      // 只覆盖 ai_support 这一个 key，其它站点设置不受影响
      await patchSiteSetting('ai_support', {
        enabled: cfg.enabled !== false,
        display_name: (cfg.display_name ?? '').trim(),
        greeting: (cfg.greeting ?? '').trim(),
        human_note: (cfg.human_note ?? '').trim(),
        system_prompt_extra: (cfg.system_prompt_extra ?? '').trim(),
        quick_questions: quick.map((q) => q.trim()).filter(Boolean).slice(0, 6),
        knowledge: knowledge.filter((k) => k.q.trim() && k.a.trim()).map((k) => ({ q: k.q.trim(), a: k.a.trim() })).slice(0, 40),
      });
      invalidate();
      console.log('[AiSupportConfig] saved', { quick: quick.length, knowledge: knowledge.length });
      toast.success('AI 客服设置已保存，前台立即生效');
    } catch (e) {
      console.error('[AiSupportConfig] save failed:', e);
      toast.error(e instanceof Error ? e.message : '保存失败，请稍后再试');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">加载中…</div>;

  const enabled = cfg.enabled !== false;

  return (
    <div className="rounded-xl border border-primary/30 bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="mb-1 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
            <Bot size={15} className="text-primary" /> AI 在线客服
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            顾客在任意页面右下角向 AI 提问，回答依据本站真实的商品与价格、FAQ、教程、支付规则生成。你在这里补充的问答会一并作为知识来源。
          </p>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={enabled} onChange={(e) => setCfg((c) => ({ ...c, enabled: e.target.checked }))}
            className="h-4 w-4 accent-[oklch(0.7_0.15_160)]" />
          {enabled ? '已启用' : '已关闭'}
        </label>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>客服显示名</label>
          <input value={cfg.display_name ?? ''} onChange={(e) => setCfg((c) => ({ ...c, display_name: e.target.value }))}
            placeholder="AI 在线客服" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>转人工引导语（AI 不确定时说这句）</label>
          <input value={cfg.human_note ?? ''} onChange={(e) => setCfg((c) => ({ ...c, human_note: e.target.value }))}
            placeholder="这个问题我不太确定，建议联系人工客服确认～" className={inputCls} />
        </div>
      </div>

      <div className="mt-4">
        <label className={labelCls}>开场白</label>
        <textarea value={cfg.greeting ?? ''} onChange={(e) => setCfg((c) => ({ ...c, greeting: e.target.value }))} rows={2}
          placeholder="留空则使用系统默认开场白" className={`${inputCls} resize-none`} />
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs font-semibold text-muted-foreground">快捷提问（最多 6 条，留空用默认）</label>
          {quick.length < 6 && (
            <button type="button" onClick={() => setQuick((q) => [...q, ''])}
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
              <Plus size={11} /> 添加
            </button>
          )}
        </div>
        <div className="space-y-2">
          {quick.map((q, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={q} onChange={(e) => setQuick((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={`第 ${i + 1} 条问题，如「支持哪些支付方式？」`} className={inputCls} />
              <button type="button" onClick={() => setQuick((arr) => arr.filter((_, j) => j !== i))}
                className="shrink-0 rounded-lg border border-white/10 p-2 text-muted-foreground transition-colors hover:border-danger/50 hover:text-danger">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {!quick.length && <p className="text-[11px] text-muted-foreground">未填写时前台展示系统默认的 4 条热门问题。</p>}
        </div>
      </div>

      <div className="mt-4">
        <label className={labelCls}>业务补充说明（可选，追加在 AI 的规则之后）</label>
        <textarea value={cfg.system_prompt_extra ?? ''} onChange={(e) => setCfg((c) => ({ ...c, system_prompt_extra: e.target.value }))} rows={3}
          placeholder="例如：本店 Pro 系列均为月付订阅，不支持年付；Grok 需美区账号激活。注意不要写与退款政策冲突的内容。"
          className={`${inputCls} resize-none`} />
        <p className="mt-1 text-[11px] text-muted-foreground">安全条款（不编造价格、不索要密码、不提供收款账号）由系统固定下发，此处无法覆盖。</p>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs font-semibold text-muted-foreground">自定义知识库 Q&amp;A（最多 40 条）</label>
          {knowledge.length < 40 && (
            <button type="button" onClick={() => setKnowledge((k) => [...k, { q: '', a: '' }])}
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
              <Plus size={11} /> 添加问答
            </button>
          )}
        </div>
        <div className="space-y-2">
          {knowledge.map((k, i) => (
            <div key={i} className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-2">
                  <input value={k.q} onChange={(e) => setKnowledge((arr) => arr.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))}
                    placeholder="问题，如「可以开发票吗？」" className={inputCls} />
                  <textarea value={k.a} onChange={(e) => setKnowledge((arr) => arr.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))}
                    rows={2} placeholder="标准答案" className={`${inputCls} resize-none`} />
                </div>
                <button type="button" onClick={() => setKnowledge((arr) => arr.filter((_, j) => j !== i))}
                  className="shrink-0 rounded-lg border border-white/10 p-2 text-muted-foreground transition-colors hover:border-danger/50 hover:text-danger">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
          {!knowledge.length && <p className="text-[11px] text-muted-foreground">FAQ 页已有的问答会自动被 AI 引用，这里只需补充 FAQ 之外的内容。</p>}
        </div>
      </div>

      {!enabled && (
        <p className="mt-4 rounded-lg border border-warning/30 bg-warning/[0.07] px-3 py-2 text-[11px] text-warning">
          关闭后前台客服气泡会隐藏，已有会话也无法继续发送。
        </p>
      )}

      <button onClick={save} disabled={saving}
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60">
        {saving && <Loader2 size={14} className="animate-spin" />}
        {saving ? '保存中…' : '保存 AI 客服设置'}
      </button>
    </div>
  );
}
