// 参与返佣的商品列表：展示每个商品的返佣方式（比例/固定）、数值与单笔封顶，风格对齐 InviteCard
import { Link } from '@tanstack/react-router';
import { Coins, Loader2 } from 'lucide-react';
import { useProducts, useSiteSettings } from '@/lib/queries';
import { formatYuan } from '@/lib/utils';

/** products.commission JSONB 形状（与计佣引擎 process_order_commission 的解析口径一致） */
interface CommissionCfg {
  enabled?: boolean;
  mode?: string;
  value?: number | string;
  cap?: number | string;
  min_amount?: number | string;
}

interface Row {
  id: string;
  title: string;
  price: number;
  coverUrl: string | null;
  mode: 'rate' | 'fixed';
  value: number;
  cap: number;
  min: number;
}

export function CommissionProductList() {
  const { data: products, isLoading } = useProducts();
  const { data: settings } = useSiteSettings();
  const referralCfg = settings?.referral as
    | { commission_enabled?: boolean; default_mode?: string; default_value?: number | string; default_cap?: number | string; min_amount?: number | string }
    | undefined;
  // 全局返佣开关关闭时不展示列表（与服务端 g_enabled=false 即停发佣金的行为一致）
  const globalOn = referralCfg?.commission_enabled !== false;

  if (!globalOn) return null;

  const rows: Row[] = ((products ?? []) as unknown as Array<Record<string, unknown>>)
    .map((p) => {
      const c = p.commission as CommissionCfg | null | undefined;
      if (c?.enabled !== true) return null; // opt-in：未单独开启返佣的商品不参与计佣
      return {
        id: String(p.id),
        title: String(p.title ?? ''),
        price: Number(p.price ?? 0),
        coverUrl: (p.cover_url as string | null) ?? null,
        mode: (c.mode === 'fixed' ? 'fixed' : 'rate') as Row['mode'],
        value: Number(c.value ?? referralCfg?.default_value ?? 8),
        cap: Number(c.cap ?? referralCfg?.default_cap ?? 50),
        min: Number(c.min_amount ?? referralCfg?.min_amount ?? 30),
      };
    })
    .filter((r): r is Row => r !== null);

  console.log('[CommissionProductList] globalOn =', globalOn, '| products =', (products ?? []).length, '| 参与返佣 =', rows.length, rows.map((r) => r.id));

  return (
    <div className="mt-4">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Coins size={13} /> 参与返佣的商品
      </p>

      {isLoading && (
        <p className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-[11px] text-muted-foreground">
          <Loader2 size={12} className="animate-spin" /> 加载中…
        </p>
      )}

      {!isLoading && rows.length === 0 && (
        <p className="rounded-lg border border-dashed border-border bg-surface px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          暂无参与返佣的商品，店主上架后会自动出现在这里。
        </p>
      )}

      {!isLoading && rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link to="/product/$id" params={{ id: r.id }}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2 transition-colors hover:border-primary/40">
                <div className="flex min-w-0 items-center gap-2.5">
                  {r.coverUrl ? (
                    <img src={r.coverUrl} alt={r.title} loading="lazy"
                      className="h-10 w-10 shrink-0 rounded-md border border-border object-cover" />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 text-muted-foreground">
                      <Coins size={15} />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-xs text-foreground">{r.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      售价 ¥{formatYuan(r.price)}
                      {r.mode === 'rate' && r.min > 0 ? ` · 实付满 ¥${formatYuan(r.min)} 起返` : ''}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold tabular-nums text-warning">
                    {r.mode === 'rate' ? `返 ${r.value}%` : `返 ¥${formatYuan(r.value)}`}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">单笔最高 ¥{formatYuan(r.cap)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!isLoading && rows.length > 0 && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          好友通过你的邀请链接注册后，在有效期内购买以上商品并完成支付，你将自动获得对应金额的返佣券。
        </p>
      )}
    </div>
  );
}
