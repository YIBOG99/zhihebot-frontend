// 订单交付内容面板：复制全部卡密 / 下载 TXT / 下载 CSV / 兑换网址单独复制 / 保管警示
// 查单页与个人中心「我的订单」共用，纯行内交互，不使用任何浮层弹窗。
import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Copy, Check, Download, ShieldAlert, FileText, Table2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  orderId: string;
  cardSecret: string;
  /** 商品配置的兑换网址（来自订单快照 redeem_url），为空则不渲染该行 */
  redeemUrl?: string | null;
}

/** 兼容微信内置浏览器等 clipboard API 受限环境的复制兜底 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/** 触发浏览器下载（前端 Blob 生成，不经后端） */
function downloadFile(filename: string, mime: string, content: string) {
  const blob = new Blob(['\uFEFF' + content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const btnBase = 'inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition-all active:scale-[0.97]';

export function DeliveryPanel({ orderId, cardSecret, redeemUrl }: Props) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  // 一单多卡按换行拆分；当前自动发货为一单一卡，逻辑天然兼容未来扩展
  const cards = cardSecret.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

  async function doCopy(key: string, text: string, label: string) {
    const ok = await copyText(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
      toast.success(`${label}已复制`);
    } else {
      toast.error('复制失败，请长按选中后手动复制');
    }
  }

  const allCards = cards.join('\n');

  return (
    <div className="rounded-xl border border-primary/30 bg-card p-5">
      <p className="mb-4 text-sm font-bold text-foreground">交付内容</p>

      {/* 操作按钮组 */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={() => doCopy('all', allCards, '全部卡密')}
          className={`${btnBase} ${copiedKey === 'all' ? 'bg-success text-success-foreground' : 'bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary-hover'}`}>
          {copiedKey === 'all' ? <Check size={14} /> : <Copy size={14} />}
          {copiedKey === 'all' ? '已复制' : '复制全部卡密'}
        </button>
        <button onClick={() => downloadFile(`卡密_${orderId}.txt`, 'text/plain', `订单号：${orderId}\n兑换网址：${redeemUrl ?? '无'}\n卡密：\n${allCards}\n`)}
          className={`${btnBase} border border-border bg-surface text-foreground hover:border-primary/40`}>
          <FileText size={14} /> 下载 TXT
        </button>
        <button onClick={() => downloadFile(`卡密_${orderId}.csv`, 'text/csv', `订单号,兑换网址,卡密\n"${orderId}","${redeemUrl ?? ''}","${cards.join(' | ')}"\n`)}
          className={`${btnBase} border border-border bg-surface text-foreground hover:border-primary/40`}>
          <Table2 size={14} /> 下载 CSV
        </button>
      </div>

      {/* 兑换网址 */}
      {redeemUrl && (
        <div className="mb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="mb-1 text-xs text-muted-foreground">兑换网站</p>
              <p className="break-all font-mono text-sm text-primary">{redeemUrl}</p>
            </div>
            <button onClick={() => doCopy('url', redeemUrl, '兑换网址')}
              className={`shrink-0 rounded-lg border px-3.5 py-2 text-xs font-bold transition-colors ${
                copiedKey === 'url'
                  ? 'border-success/50 text-success'
                  : 'border-primary/40 text-primary hover:bg-primary/10'}`}>
              {copiedKey === 'url' ? '已复制' : '复制网址'}
            </button>
          </div>
        </div>
      )}

      {/* 卡密列表 */}
      <p className="mb-1.5 text-xs text-muted-foreground">卡密{cards.length > 1 ? `（共 ${cards.length} 条）` : ''}</p>
      <div className="space-y-2">
        {cards.map((c, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-background px-3.5 py-3">
            {cards.length > 1 && <span className="shrink-0 text-xs font-bold text-muted-foreground">#{i + 1}</span>}
            <code className="flex-1 break-all font-mono text-sm font-semibold tracking-wide text-foreground">{c}</code>
            <button onClick={() => doCopy(`card${i}`, c, '卡密')} title="复制该卡密"
              className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground">
              {copiedKey === `card${i}` ? <Check size={15} className="text-success" /> : <Copy size={15} />}
            </button>
          </div>
        ))}
      </div>

      {/* 保管警示 */}
      <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-danger">
        <ShieldAlert size={14} className="shrink-0" />
        兑换地址 / 卡密 · 请妥善保管，避免泄露。
      </p>
      <Link to="/tutorials" className="mt-2 inline-block text-xs text-primary hover:underline">不知道怎么用？查看激活教程 →</Link>
    </div>
  );
}
