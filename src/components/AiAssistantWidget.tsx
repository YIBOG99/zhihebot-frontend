// 全站 AI 客服浮层：右下角气泡 + 聊天面板（流式输出、停止生成、转人工复用联系方式浮层）。
// 紧耦合子组件（消息气泡、快捷提问、输入区）全部内联本文件。
import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { Bot, X, Send, Square, Headset, Trash2, Sparkles, RefreshCw, ChevronDown } from 'lucide-react';
import { useSiteSettings } from '@/lib/queries';
import { ChannelQrOverlay } from '@/components/ChannelQrOverlay';
import { launchChannel } from '@/lib/channel-launch';
import { BrandLogo } from '@/components/BrandLogo';
import {
  requestSupportStream, loadSession, saveSession, clearSession,
  isPanelOpenPref, setPanelOpenPref, fetchModelCatalog, withAiDefaults,
  MAX_INPUT_LEN, FALLBACK_MODELS,
  type ChatMsg,
} from '@/lib/ai-support';
import type { AnnouncementLink } from '@/lib/types';

export function AiAssistantWidget() {
  const { data: settings } = useSiteSettings();
  const cfg = withAiDefaults(settings?.ai_support, settings?.brand?.name);

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [model, setModel] = useState(FALLBACK_MODELS[0]);
  const [models, setModels] = useState<string[]>(FALLBACK_MODELS);
  const [qrLink, setQrLink] = useState<AnnouncementLink | null>(null);
  const [unread, setUnread] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const initedRef = useRef(false);

  // 首次挂载：恢复本机会话；无历史则播开场白
  useEffect(() => {
    if (initedRef.current) return;
    initedRef.current = true;
    const s = loadSession();
    setModel(s.model);
    if (s.messages.length) {
      setMessages(s.messages);
    } else if (cfg.greeting) {
      setMessages([{ role: 'assistant', content: cfg.greeting }]);
    }
    setOpen(isPanelOpenPref());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  // 模型目录异步刷新，失败保留旧列表且不阻塞发送；首次拉到目录时采用平台默认模型
  useEffect(() => {
    let alive = true;
    void fetchModelCatalog().then((c) => {
      if (!alive || !c) return;
      setModels(c.models);
      if (c.defaultModel && c.models.includes(c.defaultModel)) {
        // 仅当用户未在本机会话里显式选过模型时才跟随平台默认
        const stored = loadSession();
        if (stored.model === FALLBACK_MODELS[0]) setModel(c.defaultModel);
      }
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 会话落盘
  useEffect(() => {
    if (messages.length) saveSession(messages, model);
  }, [messages, model]);

  // 新消息滚到底
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(async (text: string) => {
    const q = text.trim().slice(0, MAX_INPUT_LEN);
    if (!q || streaming) return;
    setInput('');
    const next: ChatMsg[] = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let acc = '';

    try {
      await requestSupportStream(
        next.map((m) => ({ role: m.role, content: m.content })),
        (_delta, full) => {
          acc = full;
          setMessages([...next, { role: 'assistant', content: full }]);
        },
        { model, signal: controller.signal },
      );
      if (!acc.trim()) {
        setMessages([...next, { role: 'assistant', content: cfg.human_note, error: true }]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '客服暂时繁忙，请稍后重试';
      console.error('[AiAssistant] stream failed:', msg);
      setMessages([...next, { role: 'assistant', content: msg, error: true }]);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [messages, model, streaming, cfg.human_note]);

  /** 重试：丢掉末尾的错误回复，重发最后一条用户提问 */
  function retryLast() {
    const idx = [...messages].reverse().findIndex((m) => m.role === 'user');
    if (idx < 0) return;
    const userPos = messages.length - 1 - idx;
    const trimmed = messages.slice(0, userPos);
    const question = messages[userPos].content;
    setMessages(trimmed);
    setTimeout(() => void send(question), 0);
  }

  function resetChat() {
    clearSession();
    setMessages(cfg.greeting ? [{ role: 'assistant', content: cfg.greeting }] : []);
    console.log('[AiAssistant] session cleared');
  }

  function toggle(v: boolean) {
    setOpen(v);
    setPanelOpenPref(v);
    if (v) setUnread(false);
  }

  if (cfg.enabled === false) return null;

  // 「转人工」优先走 QQ 群（与公告弹窗同一套 announcement.links 配置，不另造一份联系方式 UI）。
  // 微信官方不支持从网页直达加好友，体验远差于 QQ 带密钥直达加群页，故这里只取 qq_group。
  const humanLink = (settings?.announcement?.links ?? []).find((l) => l.action === 'qq_group' && l.label.trim());

  function openHuman() {
    if (!humanLink) {
      toast('店主尚未在公告里配置 QQ 交流群，请稍后再试');
      return;
    }
    setQrLink(humanLink);
    const r = launchChannel(humanLink);
    if (r.notice) toast(r.notice);
  }

  return (
    <>
      {open && (
        <div className="fixed inset-x-0 bottom-0 z-[95] flex justify-center px-0 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:px-0">
          <div className="chat-panel flex h-[78vh] w-full max-w-none flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-surface shadow-[0_-14px_60px_-18px_oklch(0_0_0/0.8)] sm:h-[min(560px,80vh)] sm:w-[380px] sm:rounded-2xl">
            {/* 头部 */}
            <div className="flex shrink-0 items-center gap-3 border-b border-white/8 bg-gradient-to-r from-primary/[0.14] to-transparent px-4 py-3">
              <div className="relative">
                <BrandLogo size={30} rounded="full" />
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-success" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{cfg.display_name}</p>
                <p className="text-[11px] text-muted-foreground">依据本站商品与规则回答 · 秒回</p>
              </div>
              <button onClick={openHuman} title="加入 QQ 交流群联系人工"
                className="shrink-0 rounded-lg border border-white/12 p-1.5 text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary">
                <Headset size={15} />
              </button>
              <button onClick={resetChat} title="清空对话"
                className="shrink-0 rounded-lg border border-white/12 p-1.5 text-muted-foreground transition-colors hover:border-danger/50 hover:text-danger">
                <Trash2 size={15} />
              </button>
              <button onClick={() => toggle(false)} aria-label="收起客服"
                className="shrink-0 rounded-lg border border-white/12 p-1.5 text-muted-foreground transition-colors hover:text-foreground">
                <X size={15} />
              </button>
            </div>

            {/* 消息流 */}
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.map((m, i) => (
                <Bubble key={`${i}-${m.role}`} msg={m} name={cfg.display_name} onRetry={retryLast} canRetry={streaming === false && m.error === true && i === messages.length - 1} />
              ))}
              {streaming && messages[messages.length - 1]?.role !== 'assistant' && <TypingDots />}
            </div>

            {/* 快捷提问 */}
            {messages.length <= 1 && !streaming && (
              <div className="shrink-0 border-t border-white/6 px-4 py-3">
                {cfg.quick_questions.length > 0 && (
                  <>
                    <p className="mb-2 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><Sparkles size={11} className="text-primary" /> 大家都在问</p>
                    <div className="flex flex-wrap gap-2">
                      {cfg.quick_questions.map((q) => (
                        <button key={q} onClick={() => void send(q)}
                          className="rounded-full border border-white/12 bg-white/[0.03] px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground">
                          {q}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {humanLink && (
                  <button onClick={openHuman}
                    className={`inline-flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-primary ${cfg.quick_questions.length ? 'mt-2.5' : ''}`}>
                    <Headset size={11} /> AI 解决不了？加入「{humanLink.label}」找人工
                  </button>
                )}
              </div>
            )}

            {/* 输入区 */}
            <div className="shrink-0 border-t border-white/8 px-4 py-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value.slice(0, MAX_INPUT_LEN))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void send(input);
                    }
                  }}
                  rows={1}
                  placeholder="描述你的问题，例如「Claude Pro 怎么激活」"
                  className="max-h-28 min-h-[42px] flex-1 resize-none rounded-xl border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {streaming ? (
                  <button onClick={() => abortRef.current?.abort()} title="停止生成"
                    className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-danger/40 text-danger transition-colors hover:bg-danger/10">
                    <Square size={15} />
                  </button>
                ) : (
                  <button onClick={() => void send(input)} disabled={!input.trim()} title="发送"
                    className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-all hover:bg-primary-hover active:scale-95 disabled:opacity-40">
                    <Send size={15} />
                  </button>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <ChevronDown size={10} className="-rotate-90" />
                  <select value={model} onChange={(e) => setModel(e.target.value)}
                    className="cursor-pointer appearance-none bg-transparent text-[10px] text-muted-foreground outline-none hover:text-foreground">
                    {(models.includes(model) ? models : [model, ...models]).map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
                <p className="text-[10px] leading-relaxed text-muted-foreground/70">内容由 AI 依据本站资料生成，资金操作请以人工客服确认为准</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 悬浮气泡 */}
      {!open && (
        <button onClick={() => toggle(true)} aria-label="打开在线客服"
          className="group fixed bottom-5 right-5 z-[95] inline-flex items-center gap-2 rounded-full border border-primary/40 bg-surface py-2.5 pl-2.5 pr-4 shadow-[0_10px_36px_-10px_oklch(0.6_0.15_160/0.5)] transition-all hover:border-primary hover:bg-primary/[0.08] active:scale-95">
          <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-primary to-primary/60 text-primary-foreground">
            <Bot size={17} />
            {unread && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-danger" />}
          </span>
          <span className="text-xs font-semibold text-foreground">在线咨询</span>
        </button>
      )}

      {qrLink && <ChannelQrOverlay link={qrLink} onClose={() => setQrLink(null)} />}
    </>
  );
}

function Bubble({ msg, name, onRetry, canRetry }: { msg: ChatMsg; name: string; onRetry: () => void; canRetry: boolean }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] ${isUser ? '' : 'w-full'}`}>
        {!isUser && (
          <p className="mb-1 text-[10px] text-muted-foreground/70">{name}</p>
        )}
        <div className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'rounded-br-md bg-primary text-primary-foreground'
            : msg.error
              ? 'rounded-bl-md border border-warning/30 bg-warning/[0.07] text-warning'
              : 'rounded-bl-md border border-white/8 bg-white/[0.04] text-foreground'
        }`}>
          {msg.content}
        </div>
        {canRetry && (
          <button onClick={onRetry}
            className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-primary">
            <RefreshCw size={11} /> 重试
          </button>
        )}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex justify-start">
      <div className="inline-flex items-center gap-1 rounded-2xl rounded-bl-md border border-white/8 bg-white/[0.04] px-3.5 py-3">
        {[0, 1, 2].map((i) => (
          <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" style={{ animationDelay: `${i * 160}ms` }} />
        ))}
      </div>
    </div>
  );
}
