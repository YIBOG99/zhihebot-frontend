import { Link } from '@tanstack/react-router';
import { ChevronRight, BookOpen, PlayCircle, FileText } from 'lucide-react';
import { useContents } from '@/lib/queries';
import type { ContentRow } from '@/lib/types';

const KIND_META: Record<string, { label: string; icon: typeof BookOpen }> = {
  guide:     { label: '选购指南', icon: BookOpen },
  tutorial:  { label: '激活教程', icon: PlayCircle },
  blog:      { label: '博客',     icon: FileText },
};

export function ContentListPage({ kind }: { kind: ContentRow['kind'] }) {
  const { data: contents = [], isLoading } = useContents(kind);
  const meta = KIND_META[kind] ?? { label: kind, icon: FileText };
  const Icon = meta.icon;

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-surface/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground transition-colors">首页</Link>
          <ChevronRight size={12} />
          <span className="text-foreground">{meta.label}</span>
        </div>
      </div>
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
        <div className="mb-8 flex items-center gap-3">
          <div className="glow-frame flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Icon size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">{meta.label}</h1>
            <p className="text-sm text-muted-foreground">共 {contents.length} 篇</p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-2" />)}</div>
        ) : contents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-20 text-center text-muted-foreground text-sm">暂无内容</div>
        ) : (
          <ul className="space-y-4">
            {contents.map((c, i) => (
              <li key={c.slug}>
                <Link to="/content/$slug" params={{ slug: c.slug }}
                  className="group block rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 reveal-up"
                  data-reveal-delay={String(i * 60)}>
                  <h2 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors leading-snug">{c.title}</h2>
                  {c.summary && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground leading-relaxed">{c.summary}</p>}
                  <p className="mt-3 text-[11px] text-muted-foreground">{new Date(c.created_at).toLocaleDateString('zh-CN')}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
