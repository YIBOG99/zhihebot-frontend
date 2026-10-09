// 首页公告弹窗「N 小时内不再提醒」的本机记忆：只存一个到期时间戳，不含任何敏感信息
const KEY = 'zh_announce_snooze_until';

/** 读取静默到期时间戳；隐私模式或数据异常时按「未静默」处理 */
function readUntil(): number | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** 当前是否处于「不再提醒」有效期内 */
export function isSnoozed(): boolean {
  const until = readUntil();
  if (until === null) return false;
  if (Date.now() < until) return true;
  // 已过期顺手清掉，避免脏数据长期驻留
  clearSnooze();
  return false;
}

/** 写入静默时长（小时），非法值按 24 小时兜底 */
export function setSnooze(hours: number): void {
  const h = Number.isFinite(hours) && hours > 0 ? hours : 24;
  try {
    localStorage.setItem(KEY, String(Date.now() + h * 3600_000));
  } catch {
    /* 隐私模式写入失败则本次会话后仍会弹出，不影响主流程 */
  }
}

export function clearSnooze(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** 剩余静默小时数（向上取整），未静默返回 0 —— 后台展示用 */
export function snoozeRemainingHours(): number {
  const until = readUntil();
  if (until === null || Date.now() >= until) return 0;
  return Math.ceil((until - Date.now()) / 3600_000);
}
