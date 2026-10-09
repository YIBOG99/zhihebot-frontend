import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 金额展示：整数不带小数（138 → "138"），有小数时保留两位（138.99 → "138.99"）。
 * 全站金额一律走这里，禁止再写 .toFixed(0) —— 那会把 138.99 显示成 138。
 */
export function formatYuan(value: number | string | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/**
 * 瞬时回到页面顶端（无任何动画）。
 *
 * 为什么不能只写 window.scrollTo(0,0)：
 * - 必须显式 behavior:'instant'，否则一旦有 CSS smooth 就会变成 1 秒以上的慢动画；
 * - iOS WKWebView / 微信内置浏览器里文档滚动轴可能挂在 body 而非 html，
 *   所以 scrollingElement、documentElement、body 三个对象都要置零才保险。
 *
 * 使用场景：① 路由切换后回顶（router.tsx 订阅里调用）；
 * ② **同一路由内用 state 切换整块视图**（如结算页提交订单成功后换成收款信息屏）——
 * 这种跳转 href 没变，路由的 onRendered 根本不会触发，必须在 setState 处手动调用。
 */
export function scrollToTopNow(): void {
  try {
    const de = document.documentElement;
    const prev = de.style.scrollBehavior;
    de.style.scrollBehavior = 'auto';
    const se = document.scrollingElement ?? de;
    se.scrollTop = 0;
    de.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (prev) de.style.scrollBehavior = prev;
    else de.style.removeProperty('scroll-behavior');
    console.log('[scroll] instant top done, y=', Math.round(window.scrollY));
  } catch {
    /* 取不到 DOM 的环境直接忽略，绝不影响业务流程 */
  }
}
