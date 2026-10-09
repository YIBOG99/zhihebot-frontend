/**
 * 买家本机记忆：把「查询密码」与联系方式存在浏览器 localStorage，
 * 首次下单设置后，后续下单/查单自动带出，无需每单重设。
 *
 * 安全说明：只存 SHA-256 摘要（不存明文），且仅保存在本机浏览器；
 * 换设备或清缓存后自然回退为手输流程。
 */

const KEY = 'zh_buyer_v1';

export interface BuyerInfo {
  /** 查询密码的 SHA-256 摘要 */
  pwHash: string;
  /** 掩码展示用的原文长度（不存原文） */
  pwLen: number;
  email: string;
  phone: string;
}

export function loadBuyerInfo(): BuyerInfo | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<BuyerInfo>;
    if (!v || typeof v.pwHash !== 'string' || v.pwHash.length !== 64) return null;
    return { pwHash: v.pwHash, pwLen: Number(v.pwLen) || 0, email: v.email ?? '', phone: v.phone ?? '' };
  } catch {
    return null; // 隐私模式 / 数据损坏：静默降级为手输
  }
}

export function saveBuyerInfo(info: Omit<BuyerInfo, 'pwLen'> & { password: string }): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      pwHash: info.pwHash, pwLen: info.password.length, email: info.email, phone: info.phone,
    } satisfies BuyerInfo));
  } catch { /* 存储不可用时忽略，不影响下单 */ }
}

export function clearBuyerInfo(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** 供查单页复用：SHA-256（hex） */
export async function hashPassword(pw: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
