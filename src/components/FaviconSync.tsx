// 浏览器标签页图标跟随全站 LOGO：index.html 无静态 icon，故运行时注入唯一 link[rel=icon]
import { useEffect } from 'react';
import { useBranding } from '@/lib/queries';
import { APP_ICON } from '@/lib/assets';

export function FaviconSync() {
  const { logo_url } = useBranding();

  useEffect(() => {
    const url = logo_url?.trim() || APP_ICON; // 未配置 LOGO 时回退系统能量核心图标
    let el = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!el) {
      el = document.createElement('link');
      el.rel = 'icon';
      document.head.appendChild(el);
    }
    el.href = url;
  }, [logo_url]);

  return null;
}
