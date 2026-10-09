/**
 * TanStack Router 实例。
 *
 * 路由约定：
 * - 页面文件放 src/routes/，用 createFileRoute 定义
 * - src/routeTree.gen.ts 由 Vite 插件（@tanstack/router-plugin）在 dev/build 时自动更新（勿手改）
 * - 根布局见 src/routes/__root.tsx；首页占位见 src/routes/index.tsx（须整体替换）
 */
import { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { scrollToTopNow } from './lib/utils';

/**
 * 滚动策略：进入新页面一律回到顶端，不再恢复上一页的滚动位置。
 *
 * 原配置 scrollRestoration:true 会把每个页面的滚动位置存进缓存并在渲染后回填，
 * 于是从商品页/结算页（已往下滚过）跳到收款页时停在页面中间，必须手动拉回顶部。
 *
 * 本版本（router-core 1.171）没有 shouldScrollToTop 选项，只有两个可用旋钮：
 * - scrollRestoration 传函数：返回 false 会在 onRendered 里提前 return，连归零都不做，
 *   所以必须恒为 true，让库自带的 scrollTo(0,0) 生效；
 * - getScrollRestorationKey：默认按 location.state.__TSR_key 取缓存位置。
 *   注意 __TSR_key 在「同一路由换查询参数」（如结算页→收款页 ?order=xxx）时保持不变，
 *   这正是停在页面中段的根因，所以 key 改成随 href 变化，旧位置永远命中不到。
 * 代价：前进/后退不再恢复原位（浏览器原生恢复已被库置为 manual），属可接受取舍。
 */
const scrollRestorationGate = () => true;

/**
 * 兜底归零统一用 lib/utils.ts 的 scrollToTopNow：
 * 显式 behavior:'instant' + scrollingElement/documentElement/body 三轴同时置零，
 * 覆盖 iOS WKWebView / 微信内置浏览器里文档滚动轴挂在 body 的情况。
 */

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: scrollRestorationGate,
    getScrollRestorationKey: (location) => location.href,
    defaultPreloadStaleTime: 0,
  });

  // 取证日志：确认线上跑的是「进页面即回顶」这套策略，而非旧的按 history key 恢复
  console.log('[Router] scroll policy', {
    gate: typeof router.options.scrollRestoration,
    keyByHref: router.options.getScrollRestorationKey?.({
      href: '/pay/alipay-manual?order=X',
    } as never),
  });

  // 兜底必须挂在 onRendered 之后：库自己的归零/恢复也在这个事件里完成，
  // 若挂更早的事件（如 onBeforeRouteMount），组件还没挂载，归零会被后续渲染覆盖。
  // rAF 之外再补一次 setTimeout：后台标签 / WKWebView 里 rAF 可能长时间不触发，
  // 双通道保证归零一定执行（scrollToTopNow 幂等，重复调用无副作用）。
  router.subscribe('onRendered', (event) => {
    if (event.pathChanged || event.hrefChanged) {
      console.log('[Router] force top after render ->', event.toLocation.href);
      requestAnimationFrame(() => scrollToTopNow());
      setTimeout(() => scrollToTopNow(), 60);
    }
  });

  return router;
};
