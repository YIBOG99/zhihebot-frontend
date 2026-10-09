// 渠道按钮的 App 深链拉起：QQ 加群 / 加微信。
// 原理：网页无法「替用户扫码」，只能靠 URL Scheme 直接告诉 App 打开目标页；
// scheme 被浏览器拦截或 App 未安装时，由调用方展示二维码浮层兜底。
import type { AnnouncementLink } from './types';

/** 粗判是否手机环境（scheme 只在手机上可能成功，桌面端直接走二维码） */
export function isMobileDevice(): boolean {
  return /android|iphone|ipad|ipod|harmony/i.test(navigator.userAgent);
}

/** iOS 系设备（iPhone/iPad/iPod）。iOS Safari 禁止 iframe 静默拉起 scheme，必须 location.href */
export function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** 从 url 里提取 Telegram 用户名（t.me/xxx），失败返回空串 */
function tgUsername(url: string): string {
  const m = url.trim().match(/t\.me\/([A-Za-z0-9_]{3,})/);
  return m ? m[1] : '';
}

/**
 * 拉起自定义 scheme。
 * iOS Safari 会拦截 iframe 方式的 scheme 跳转（表现为"点了没反应"），必须用 location.href；
 * Android Chrome 系用 location.href 同样可行，统一走 href 最简单可靠。
 */
function jumpScheme(src: string): void {
  window.location.href = src;
}

export interface LaunchResult {
  /** 已发起跳转/拉起，无需兜底 */
  handled: boolean;
  /** 建议展示的提示文案（toast） */
  notice?: string;
}

/**
 * 按动作类型尝试拉起对应 App。
 * 返回 handled=false 时调用方应展示二维码浮层（有图）或复制账号（无图）。
 */
export function launchChannel(link: AnnouncementLink): LaunchResult {
  const action = link.action ?? 'url';
  const accountId = (link.account_id ?? '').trim();
  const mobile = isMobileDevice();

  switch (action) {
    case 'qq_group': {
      // join_key 是群主在 qun.qq.com/join.html 生成的加群密钥（iPhone/Android 代码里同一串 key，通用）；
      // account_id 存的是 QQ 群号，仅用于展示与复制。腾讯不支持仅凭群号免密加群。
      const key = (link.join_key ?? '').replace(/\s/g, '');
      if (!key) {
        console.log('[channel-launch] qq_group 未配置加群 key，走二维码兜底');
        return { handled: false, notice: '尚未配置加群密钥，请先长按二维码加群' };
      }
      if (mobile) {
        // iOS 用 mqqapi://、Android 用 mqqopensdkapi://，均带 key 直达「申请加群」页
        const inner = `http://qm.qq.com/cgi-bin/qm/qr?from=app&jump_from=webapi&k=${key}`;
        const deep = isIOS() ? `mqqapi://card/show_pslcard?src_type=internal&version=1&uin=${accountId || ''}&key=${key}&card_type=group&source=external`
          : `mqqopensdkapi://bizAgent/qm/qr?url=${encodeURIComponent(inner)}`;
        console.log('[channel-launch] qq_group 拉起', { ios: isIOS(), hasKey: true, deep });
        jumpScheme(deep);
        return { handled: false, notice: '正在打开 QQ…若没弹出确认，请长按识别二维码加群' };
      }
      // 桌面端：scheme 基本被浏览器拦截，直接展示二维码让顾客用手机扫
      console.log('[channel-launch] qq_group 桌面端走二维码兜底', { hasKey: true });
      return { handled: false, notice: '电脑端请长按或截图二维码，用手机 QQ 扫码加群' };
    }
    case 'wechat': {
      // 硬事实：微信官方未开放「网页拉起→直达加好友页」的能力。weixin:// 只能到微信首页；
      // 带个人码票据的链接在外部浏览器一律被重定向到微信下载页，只有微信「扫一扫」才认这个码。
      // 因此这里不再做无意义的 weixin:// 跳转（只会把用户甩到微信首页更懵），
      // 直接留在本页弹二维码浮层 + 微信号一键复制，并给出最短路径指引。
      console.log('[channel-launch] wechat 拉起加好友不可行，走二维码+复制兜底', { hasId: !!accountId, hasQr: !!(link.qr_url ?? '') });
      if (mobile) {
        return { handled: false, notice: '微信不支持从网页直达加好友：请长按二维码识别，或复制微信号后到微信搜索添加' };
      }
      return { handled: false, notice: '请用微信扫一扫下方二维码，或复制微信号到微信搜索添加' };
    }
    case 'tel': {
      if (!accountId) return { handled: false, notice: '店主尚未配置电话号码' };
      window.location.href = `tel:${accountId}`;
      return { handled: true };
    }
    case 'mailto': {
      const addr = accountId || link.url.trim();
      if (!addr) return { handled: false, notice: '店主尚未配置邮箱地址' };
      window.location.href = `mailto:${addr}`;
      return { handled: true };
    }
    case 'qrcode': {
      return { handled: false, notice: '' };
    }
    default: {
      // 普通外链：Telegram 链接在手机上优先换 tg:// 直拉客户端
      const u = link.url.trim();
      if (!u) return { handled: false, notice: '店主尚未配置该渠道链接' };
      const tg = tgUsername(u);
      if (tg && mobile) {
        jumpScheme(`tg://resolve?domain=${tg}`);
        // 同时留一条 http 兜底，浏览器拦 scheme 时用户仍可手动跳
        window.open(u, '_blank', 'noopener');
        return { handled: true };
      }
      window.open(u, '_blank', 'noopener');
      return { handled: true };
    }
  }
}

/** 一键复制（沿用项目既有 clipboard 范式），返回是否成功 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
