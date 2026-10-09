import { Info, AlertTriangle, ShieldAlert, Headphones } from 'lucide-react';
import type { Product } from '@/lib/types';

const BLOCKS = [
  { key: 'tips',    icon: Info,          cls: 'tips',    titleKey: 'tips_title' as const,    bodyKey: 'tips_body' as const },
  { key: 'risk',    icon: AlertTriangle, cls: 'risk',    titleKey: 'risk_title' as const,    bodyKey: 'risk_body' as const },
  { key: 'official',icon: ShieldAlert,   cls: 'official',titleKey: 'official_title' as const,bodyKey: 'official_body' as const },
  { key: 'support', icon: Headphones,    cls: 'support', titleKey: 'support_title' as const, bodyKey: 'support_body' as const },
];

export function ClauseBlocks({ product }: { product: Product }) {
  return (
    <div className="space-y-4">
      {BLOCKS.map(({ icon: Icon, cls, titleKey, bodyKey }) => {
        const body = product[bodyKey];
        if (!body) return null;
        return (
          <div key={cls} className={`clause-block ${cls}`}>
            <div className="mb-2 flex items-center gap-2.5">
              <span className="clause-icon-badge">
                <Icon size={14} strokeWidth={2.2} />
              </span>
              <span className="clause-title text-xs font-semibold uppercase tracking-wider">
                {product[titleKey]}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-foreground/85">{body}</p>
          </div>
        );
      })}
    </div>
  );
}
