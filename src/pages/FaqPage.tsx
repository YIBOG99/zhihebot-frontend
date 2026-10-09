import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ChevronDown, HelpCircle } from 'lucide-react';
import { useFaqs } from '@/lib/queries';

export function FaqPage() {
  const { data: faqs = [], isLoading } = useFaqs();
  const [openId, setOpenId] = useState<string | null>(null);

  const groups = faqs.reduce<Record<string, typeof faqs>>((acc, f) => {
    (acc[f.group_name] ??= []).push(f);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-surface/80 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl px-4 py-3 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">首页</Link> / 常见问题
        </div>
      </div>
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10">
        <div className="mb-8 flex items-center gap-3">
          <div className="glow-frame flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <HelpCircle size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">常见问题</h1>
            <p className="text-sm text-muted-foreground">下单前先看这里，能解决 90% 的疑问</p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-2" />)}</div>
        ) : (
          Object.entries(groups).map(([group, items]) => (
            <div key={group} className="mb-8">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{group}</h2>
              <ul className="space-y-2">
                {items.map((f) => {
                  const isOpen = openId === f.id;
                  return (
                    <li key={f.id} className="rounded-xl border border-border bg-card overflow-hidden">
                      <button onClick={() => setOpenId(isOpen ? null : f.id)}
                        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
                        <span className="text-sm font-medium text-foreground">{f.question}</span>
                        <ChevronDown size={15} className={`shrink-0 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isOpen && (
                        <div className="border-t border-border px-5 py-4">
                          <p className="text-sm leading-relaxed text-muted-foreground">{f.answer}</p>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}

        <div className="mt-4 rounded-xl border border-border bg-surface p-5 text-center">
          <p className="text-sm text-muted-foreground">没找到答案？</p>
          <p className="mt-1 text-sm text-foreground">微信 <span className="font-mono text-primary">zhihe-service</span> · QQ <span className="font-mono text-primary">88001234</span></p>
        </div>
      </div>
    </div>
  );
}
