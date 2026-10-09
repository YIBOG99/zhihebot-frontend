// 日活埋点：每浏览器生成持久 visitor_id，页面加载后静默上报一次（服务端按日去重）。
import { supabase } from '@/supabase/client';

const KEY = 'zh_visitor_id';

function getVisitorId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id || !/^[A-Za-z0-9-]{8,64}$/.test(id)) {
      id = (crypto.randomUUID?.() ?? `v${Date.now()}${Math.random().toString(36).slice(2, 10)}`).replace(/[^A-Za-z0-9-]/g, '');
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // 隐私模式等拿不到 localStorage：用会话内随机 id，仍能贡献当日 DAU 近似值
    return `tmp${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  }
}

let tracked = false;

/** fire-and-forget 上报访问；失败静默，绝不影响页面功能 */
export function trackVisit(): void {
  if (tracked) return;
  tracked = true;
  const visitorId = getVisitorId();
  supabase.rpc('stat_track_visit', { _visitor_id: visitorId }).then(({ error }) => {
    if (error) console.warn('[track-visit] report failed:', error.message);
    else console.log('[track-visit] reported visitor', visitorId.slice(0, 8));
  });
}
