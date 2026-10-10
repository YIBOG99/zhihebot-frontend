// 日活埋点：每浏览器生成持久 visitor_id，服务端按上海时区日历日去重。
// 只记录随机访客 ID 和已登录用户 ID，不收集 IP 或设备指纹。
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
    // 隐私模式等拿不到 localStorage：使用会话内随机 ID，失败不影响页面。
    return `tmp${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  }
}

let initialized = false;

/** 静默上报访问；重复上报由数据库唯一键去重，不阻断页面功能。 */
export function trackVisit(): void {
  if (initialized) return;
  initialized = true;
  const visitorId = getVisitorId();

  const report = () => {
    void supabase.rpc('stat_track_visit', { _visitor_id: visitorId }).then(({ error }) => {
      if (error) console.warn('[track-visit] report failed:', error.message);
    });
  };

  // 首次记访客；Auth 恢复/登录后再上报一次，让同一天的登录用户数也能正确去重。
  report();
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') report();
  });

  // Root layout is mounted for the lifetime of the app; keep the subscription alive.
  void subscription;
}
