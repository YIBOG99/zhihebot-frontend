// 下单频控的前端配套：识别服务端拦截文案 → 提供按钮上可直接显示的倒计时秒数。
// ⚠️ 设计口径：秒数**以服务端文案为准**，不读 site_settings.captcha.cap_window_seconds。
//    原因：顾客被拦的那一刻，配置值可能已被店主改过；只有 RPC 回传的「请 N 秒后再试」
//    才是本次真实需要等待的时长。文案解析失败才回退到配置值 / 15 秒默认值。
import { useEffect, useState } from 'react';

/** 与服务端 format('短时间内下单次数过多，请 %s 秒后再试') 保持同一关键词 */
const RATE_LIMIT_KEYWORD = '下单次数过多';

/** 兜底等待秒数（与服务端 cap_window_seconds 缺省值一致） */
export const RATE_LIMIT_FALLBACK_SECONDS = 15;

/** 这条错误文案是不是频控拦截 */
export function isRateLimitedMessage(msg?: string | null): boolean {
  return !!msg && msg.includes(RATE_LIMIT_KEYWORD);
}

/**
 * 从拦截文案里抠出**真实等待秒数**。服务端文案有两种单位：
 * 「请 15 秒后再试」 / 「请 5 分钟后再试」（取决于后台 cap_window_unit）。
 * ⚠️ 倒计时一律按秒驱动，所以分钟必须 ×60 换算；解析不到返回 null 交由调用方兜底。
 */
export function parseRateLimitSeconds(msg?: string | null): number | null {
  if (!msg || !isRateLimitedMessage(msg)) return null;
  const sec = msg.match(/(\d+)\s*秒/);
  if (sec) return clampSeconds(Number(sec[1]));
  const min = msg.match(/(\d+)\s*分钟/);
  if (min) return clampSeconds(Number(min[1]) * 60);
  return null;
}

/** 与服务端同口径夹紧：1 ~ 3600 秒 */
function clampSeconds(n: number): number | null {
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(3600, Math.floor(n));
}

/**
 * 频控倒计时：传入目标时刻（epoch ms，0 表示未在倒计时），每秒回传剩余秒数。
 * 归零后自动停止定时器并把 state 清成 0，调用方据此恢复按钮可点。
 */
export function useCountdownSeconds(targetAt: number): number {
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (!targetAt) {
      setLeft(0);
      return;
    }
    const tick = () => {
      const secs = Math.max(0, Math.ceil((targetAt - Date.now()) / 1000));
      setLeft(secs);
      return secs;
    };
    if (tick() === 0) return;
    const t = setInterval(() => {
      if (tick() === 0) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [targetAt]);

  return left;
}

/** 把剩余秒数渲染成按钮文案（超过 1 分钟改读「分:秒」，避免按钮上出现 300 这种大数字） */
export function rateLimitButtonLabel(secs: number): string {
  return secs >= 60 ? `请稍后 ${fmtMinSec(secs)} 再提交` : `请稍后 ${secs} 秒再提交`;
}

/** 5 分 00 秒 / 42 秒 */
export function fmtMinSec(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  return `${m} 分 ${String(s % 60).padStart(2, '0')} 秒`;
}

/**
 * 解析失败时的兜底秒数：优先用后台配置值 × 单位倍率，其次 15 秒默认值。
 * 服务端 cap_window_unit ∈ seconds/minutes，非法值回退 seconds，这里保持同一口径。
 */
export function fallbackRateLimitSeconds(configured?: number | null, unit?: string | null): number {
  const n = Number(configured);
  if (!Number.isFinite(n) || n < 1) return RATE_LIMIT_FALLBACK_SECONDS;
  const secs = String(unit ?? '').toLowerCase() === 'minutes' ? n * 60 : n;
  return Math.min(3600, Math.floor(secs));
}
