// 管理员角色判定：会话级缓存 + 三态（loading/granted/denied），查询失败不得误判为无权限
import { useEffect, useState } from 'react';
import { supabase } from '@/supabase/client';
import { useAuthSession } from '@/hooks/use-auth-session';

export type AdminState = 'loading' | 'granted' | 'denied';

// 同一会话内只查一次，避免组件重挂载反复请求 user_roles
const cache = new Map<string, boolean>();

export function useIsAdmin(): AdminState {
  const { user, loading } = useAuthSession();
  const [state, setState] = useState<AdminState>('loading');

  useEffect(() => {
    if (loading) return;
    if (!user) { setState('denied'); return; }

    const cached = cache.get(user.id);
    if (cached !== undefined) { setState(cached ? 'granted' : 'denied'); return; }

    let mounted = true;
    async function check() {
      try {
        const { data, error } = await supabase.rpc('has_role', { _user_id: user!.id, _role: 'admin' });
        if (!mounted) return;
        if (error) {
          // 查询本身失败：结论未知，保持 loading 不误判为无权限（避免误踢出后台）
          console.warn('[useIsAdmin] has_role 查询失败:', error.message);
          setState('loading');
          return;
        }
        // RPC 正常返回：data 可能是 false（明确非管理员），必须落定而非继续 loading
        const granted = Boolean(data);
        cache.set(user!.id, granted);
        setState(granted ? 'granted' : 'denied');
      } catch (e) {
        console.warn('[useIsAdmin] has_role 异常:', e);
        if (mounted) setState('loading');
      }
    }
    check();
    return () => { mounted = false; };
  }, [loading, user?.id]);

  return state;
}
