// 支付宝「打开 App 直接到付款页」的深链构造。
// 原理：个人收款码图片无法程序化付款，只有收款链接（https://qr.alipay.com/xxx）能唤起 App。
// ⚠️ 踩过的坑：`startapp?appId=60000152&url=<收款链接>` 会被当成小程序页面校验域名 →
//    「暂未找到此功能」。改用网页容器 appId=20000067 直接加载收款链接即可正常渲染付款页。
// ⚠️ 微信内置浏览器会拦截自定义 scheme，必须提示用户右上角「在浏览器打开」。

/** 已知图片托管域名：命中即按图片处理（与 QrExpiryFrame 判定口径保持一致） */
const IMAGE_HOST = /(^|\/\/)([^/]*\.)?(meoo\.host|alicdn\.com|aliyuncs\.com|myqcloud\.com|oss-cn-)/i;

/**
 * 判断配置值是「收款链接」（可唤起支付宝）还是「图片地址」（只能扫）。
 * ⚠️ 存储桶图片地址形如 `https://xxx.database.meoo.xyz/storage/v1/object/...`，
 * 路径里没有扩展名、也不在上面的图床域名表内——必须先用「是否指向本站存储桶」排除，
 * 否则会被误判成收款链接，前台凭空画出一张顾客扫不出的假码。
 */
export function isAlipayPayLink(v: string): boolean {
  const s = v.trim();
  if (!/^https?:\/\//i.test(s)) return false;
  if (IMAGE_HOST.test(s)) return false;
  if (/\.database\.meoo\.xyz|\/storage\/v1\//i.test(s)) return false;
  let url: URL;
  try { url = new URL(s); } catch { return false; }
  // Only allow known Alipay payment-link hosts. A generic website URL must never be
  // wrapped in an Alipay deep link and presented to customers as a payment code.
  const host = url.hostname.toLowerCase();
  const trustedAlipayHost = host === 'qr.alipay.com'
    || host === 'render.alipay.com'
    || host === 'mobilecodec.alipay.com';
  if (!trustedAlipayHost) return false;
  const path = url.pathname;
  return !/\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(path);
}

/**
 * 由收款链接拼出支付宝 App 深链；非收款链接返回 null。
 * appId=20000067 是支付宝的「网页打开」容器（小程序容器 60000152 会校验域名导致打不开），
 * url= 直接放收款链接，App 内识别 qr.alipay.com 后自行渲染成转账付款页。
 */
export function alipayDeepLink(payLink: string): string | null {
  const s = payLink.trim();
  if (!isAlipayPayLink(s)) return null;
  const deep = `alipays://platformapi/startapp?appId=20000067&url=${encodeURIComponent(s)}`;
  console.log('[alipay-deeplink] built', { host: new URL(s).hostname });
  return deep;
}

/** 粗判手机环境（scheme 只在手机上可能成功） */
function isMobile(): boolean {
  return /android|iphone|ipad|ipod|harmony/i.test(navigator.userAgent);
}

/** 是否运行在微信内置浏览器（会拦截 alipays:// scheme） */
export function isWeChatBrowser(): boolean {
  return /micromessenger/i.test(navigator.userAgent);
}

export interface AlipayJumpResult {
  /** 已发起跳转 */
  handled: boolean;
  /** 需要给用户的提示文案（toast 或行内提示） */
  notice?: string;
}

/**
 * 尝试唤起支付宝 App 直达付款页。
 * ⚠️ 只有收款链接才能直达付款页。曾经存在「传空串 → 只唤起 App 首页」的降级路径
 *    （ALIPAY_APP_HOME），实测顾客会被丢在空白/首页上完全不知道下一步做什么，
 *    属于误导性的假动作按钮，已彻底移除——非收款链接一律 handled:false + 行内提示。
 * - 微信内：不尝试跳转（必然被拦），直接返回引导文案；
 * - 桌面端：scheme 基本无效，返回提示让顾客用手机操作；
 * - 手机端其他浏览器：location.href 跳转，App 未安装时浏览器会停在当前页，附提示兜底。
 */
export function jumpToAlipayApp(payLink: string): AlipayJumpResult {
  const deep = alipayDeepLink(payLink);
  console.log('[alipay-deeplink] jump requested', { supportedLink: Boolean(deep) });
  if (!deep) return { handled: false, notice: '当前收款码是图片形式，暂时无法一键跳转，请截图后用支付宝扫一扫。' };
  if (isWeChatBrowser()) {
    return { handled: false, notice: '微信内无法直接打开支付宝，请点击右上角「···」选择「在浏览器打开」后再点此按钮。' };
  }
  if (!isMobile()) {
    return { handled: false, notice: '电脑端无法唤起支付宝 App，请用手机的收款链接页面扫码或跳转。' };
  }
  console.log('[alipay-deeplink] attempting app handoff');
  window.location.href = deep;
  return { handled: true, notice: '正在打开支付宝…若未弹出，请确认已安装支付宝 App。' };
}
