// AI 客服前端封装：流式调用 ai-support Edge Function + 会话本机持久化 + 访客标识
import { supabase, supabaseUrl, supabaseAnonKey, projectUrlId } from '@/supabase/client';
import type { AiSupportConfig } from './types';

export const AI_SUPPORT_FUNCTION = 'ai-support';
/** 模型目录不可用时的兜底默认（首选，实际以 GET /models 返回的 defaultModel 为准） */
export const DEFAULT_MODEL = 'qwen3.6-plus';
/** 单条用户输入上限（服务端也会再截断一次） */
export const MAX_INPUT_LEN = 500;
/** 本机最多保留的消息条数 */
const MAX_STORED = 50;

const LS_SESSION = 'zh_ai_chat_v1';
const LS_VISITOR = 'zh_visitor_id_v1';
const LS_OPEN = 'zh_ai_chat_open_v1';

export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  /** 出错消息带 error 标记，渲染成可重试样式 */
  error?: boolean;
}

/* ── 安全读写 localStorage（隐私模式会抛异常） ── */
function lsGet(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* 忽略 */ }
}
function lsDel(key: string) {
  try { window.localStorage.removeItem(key); } catch { /* 忽略 */ }
}

/** 访客标识：用于服务端限流，不含任何个人信息 */
export function getVisitorId(): string {
  const saved = lsGet(LS_VISITOR);
  if (saved && saved.length >= 8) return saved;
  const id = `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  lsSet(LS_VISITOR, id);
  return id;
}

/* ── 会话持久化 ── */
export function loadSession(): { messages: ChatMsg[]; model: string } {
  const raw = lsGet(LS_SESSION);
  if (!raw) return { messages: [], model: DEFAULT_MODEL };
  try {
    const parsed = JSON.parse(raw) as { messages?: ChatMsg[]; model?: string };
    const messages = Array.isArray(parsed.messages)
      ? parsed.messages
        .filter((m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
        .slice(-MAX_STORED)
      : [];
    return { messages, model: parsed.model?.trim() || DEFAULT_MODEL };
  } catch {
    return { messages: [], model: DEFAULT_MODEL };
  }
}

export function saveSession(messages: ChatMsg[], model: string) {
  lsSet(LS_SESSION, JSON.stringify({ messages: messages.slice(-MAX_STORED), model }));
}

export function clearSession() {
  lsDel(LS_SESSION);
}

export function isPanelOpenPref(): boolean {
  return lsGet(LS_OPEN) === '1';
}
export function setPanelOpenPref(open: boolean) {
  lsSet(LS_OPEN, open ? '1' : '0');
}

/* ── 模型目录（失败不阻塞聊天，沿用 skill 的兜底策略） ── */
export const FALLBACK_MODELS = ['qwen3.6-plus', 'kimi-k2.5', 'deepseek-v3.2'];

/**
 * 拉取平台当前可用文本模型列表。
 * 注意：目录里的模型可能随时下线，因此始终保留 DEFAULT_MODEL 作为首选可选项。
 */
export async function fetchModelCatalog(): Promise<{ models: string[]; defaultModel: string | null } | null> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/${AI_SUPPORT_FUNCTION}`, {
      method: 'GET',
      headers: { apikey: supabaseAnonKey, 'OneDay-App-Id': projectUrlId },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { models?: unknown; defaultModel?: unknown };
    if (!Array.isArray(data.models)) return null;
    const list = data.models.filter((m): m is string => typeof m === 'string' && !!m.trim());
    const dm = typeof data.defaultModel === 'string' && data.defaultModel.trim() ? data.defaultModel.trim() : null;
    // 合并去重：默认模型永远排在最前，保证即使目录变化也不会选到空值
    const merged = [DEFAULT_MODEL, ...(dm ? [dm] : []), ...list].filter((v, i, a) => a.indexOf(v) === i);
    return { models: merged.length ? merged : FALLBACK_MODELS, defaultModel: dm };
  } catch {
    return null;
  }
}

/* ── 流式对话 ── */
export interface StreamOptions {
  model?: string;
  signal?: AbortSignal;
}

/** 错误码 → 中文可读提示 */
export function supportErrorMessage(code: string, fallback: string): string {
  switch (code) {
    case 'RATE_LIMIT_MIN': return '提问太快啦，稍等十几秒再问～';
    case 'RATE_LIMIT_DAY': return '今天提问次数已达上限，如需帮助请联系人工客服。';
    case 'SUPPORT_DISABLED': return '在线客服已下线，请联系人工客服。';
    case 'AI_UNAVAILABLE': return '客服服务正在准备中，请稍后再试。';
    default: return fallback;
  }
}

/**
 * 向 AI 客服发起一轮提问，增量回调渲染。
 * 返回完整文本；用户主动停止时返回已生成部分（不抛错）。
 */
export async function requestSupportStream(
  messages: ChatMsg[],
  onChunk: (delta: string, full: string) => void,
  options: StreamOptions = {},
): Promise<string> {
  const { model = DEFAULT_MODEL, signal } = options;
  const session = (await supabase.auth.getSession()).data.session;

  // apikey 是 Supabase 网关对 Edge Function 的必需头（anon key），缺失会被网关直接拒绝
  const res = await fetch(`${supabaseUrl}/functions/v1/${AI_SUPPORT_FUNCTION}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      'OneDay-App-Id': projectUrlId,
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({
      messages: messages.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })),
      model,
      visitor_id: getVisitorId(),
      stream: true,
    }),
    signal,
  });

  console.log('[ai-support] response', { status: res.status, ok: res.ok });

  if (!res.ok) {
    let code = '';
    let message = `客服暂时繁忙（${res.status}）`;
    try {
      const data = (await res.json()) as { error?: string; message?: string };
      code = data.error ?? '';
      message = data.message || message;
    } catch { /* 非 JSON 响应体 */ }
    throw new Error(supportErrorMessage(code, message));
  }
  if (!res.body) throw new Error('当前浏览器不支持流式回复，请更换浏览器或联系人工客服');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (payload === '[DONE]') return full;
        try {
          const json = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            full += delta;
            onChunk(delta, full);
          }
        } catch { /* 忽略被截断的行 */ }
      }
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return full;
    throw err;
  }
  return full;
}

/** 配置缺省值（店主未进后台保存过时也能正常工作） */
export function withAiDefaults(cfg: AiSupportConfig | undefined, brandName?: string): Required<Pick<AiSupportConfig, 'display_name' | 'greeting' | 'quick_questions' | 'human_note'>> & AiSupportConfig {
  const name = cfg?.display_name?.trim() || 'AI 在线客服';
  return {
    enabled: cfg?.enabled !== false,
    display_name: name,
    greeting: cfg?.greeting?.trim()
      || `你好，我是${brandName?.trim() ? `${brandName.trim()} 的` : ''}${name}。商品、价格、支付、发货、激活问题都可以直接问我，我会依据本站实际信息回答。`,
    quick_questions: (cfg?.quick_questions ?? []).map((q) => q.trim()).filter(Boolean).slice(0, 6).length
      ? (cfg!.quick_questions as string[]).map((q) => q.trim()).filter(Boolean).slice(0, 6)
      : ['ChatGPT Plus 现在多少钱？', '付款后多久能拿到卡密？', '支持哪些支付方式？', '忘记查询密码怎么办？'],
    human_note: cfg?.human_note?.trim() || '这个问题我不太确定，建议联系人工客服确认～',
    ...cfg,
  };
}
