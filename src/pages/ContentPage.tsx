import { useParams, Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { useContent } from '@/lib/queries';

// 极简 Markdown → HTML（仅支持标题/列表/表格/引用/粗体/hr）
function md2html(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inUl = false, inOl = false, inTable = false;
  const closeLists = () => { if (inUl) { out.push('</ul>'); inUl = false; } if (inOl) { out.push('</ol>'); inOl = false; } };
  const closeTable = () => { if (inTable) { out.push('</tbody></table>'); inTable = false; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('|')) {
      if (!inTable) { closeLists(); out.push('<table><thead><tr>'); inTable = true; }
      else if (/^\|[\s\-|]+\|$/.test(line)) { out.push('</tr></thead><tbody>'); continue; }
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      const tag = inTable && out[out.length - 1]?.includes('<tbody>') ? 'td' : 'th';
      out.push(`<tr>${cells.map((c) => `<${tag}>${inline(c)}</${tag}>`).join('')}</tr>`);
      continue;
    }
    closeTable();
    if (line.startsWith('# ')) { closeLists(); out.push(`<h1>${inline(line.slice(2))}</h1>`); }
    else if (line.startsWith('## ')) { closeLists(); out.push(`<h2>${inline(line.slice(3))}</h2>`); }
    else if (line.startsWith('### ')) { closeLists(); out.push(`<h3>${inline(line.slice(4))}</h3>`); }
    else if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inUl) { closeLists(); out.push('<ul>'); inUl = true; }
      out.push(`<li>${inline(line.slice(2))}</li>`);
    } else if (/^\d+\.\s/.test(line)) {
      if (!inOl) { closeLists(); out.push('<ol>'); inOl = true; }
      out.push(`<li>${inline(line.replace(/^\d+\.\s/, ''))}</li>`);
    } else if (line.startsWith('> ')) { closeLists(); out.push(`<blockquote>${inline(line.slice(2))}</blockquote>`); }
    else if (line === '---') { closeLists(); out.push('<hr />'); }
    else if (line === '') { closeLists(); }
    else { closeLists(); out.push(`<p>${inline(line)}</p>`); }
  }
  closeLists(); closeTable();
  return out.join('\n');
}
function inline(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

export function ContentPage() {
  const { slug } = useParams({ strict: false }) as { slug: string };
  const { data: content, isLoading } = useContent(slug);

  if (isLoading) return <div className="mx-auto max-w-3xl px-4 py-20"><div className="h-64 animate-pulse rounded-xl bg-surface-2" /></div>;
  if (!content) return (
    <div className="mx-auto max-w-3xl px-4 py-24 text-center text-muted-foreground">
      内容不存在。<Link to="/" className="text-primary underline ml-1">返回首页</Link>
    </div>
  );

  const KIND_LABEL: Record<string, string> = { guide: '选购指南', tutorial: '激活教程', blog: '博客', policy: '政策', about: '关于' };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-surface/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground transition-colors">首页</Link>
          <ChevronRight size={12} />
          <span className="text-foreground">{KIND_LABEL[content.kind] ?? content.kind}</span>
        </div>
      </div>
      <article className="mx-auto max-w-3xl px-4 sm:px-6 py-10">
        <p className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">{KIND_LABEL[content.kind]}</p>
        <h1 className="text-2xl sm:text-3xl font-bold leading-tight text-foreground mb-4">{content.title}</h1>
        {content.summary && <p className="mb-8 text-sm text-muted-foreground leading-relaxed border-l-2 border-primary/30 pl-4">{content.summary}</p>}
        {content.body && (
          <div className="prose-dark" dangerouslySetInnerHTML={{ __html: md2html(content.body) }} />
        )}
      </article>
    </div>
  );
}
