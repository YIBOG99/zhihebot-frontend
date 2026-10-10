// 订单交付内容面板：复制全部卡密 / 下载 TXT / 下载 CSV / 充值网址 / 保管警示
// 查单页与个人中心「我的订单」共用，纯行内交互，不使用任何浮层弹窗。
import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Copy, Check, ShieldAlert, FileText, Table2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  orderId: string;
  cardSecret: string;
  /** 商品配置的兑换网址（来自订单快照 redeem_url）；未配置时使用本站默认充值网址 */
  redeemUrl?: string | null;
}

const DEFAULT_REDEEM_URL = 'https://chongzhigpt.cc/';

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
  const blob = new Blob(['\\uFEFF' + content], { type: `${mime};charset=utf-8` });
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
  const cards = cardSecret.split(/\\r?\\n/).map((s) => s.trim()).filter(Boolean);
  const effectiveRedeemUrl = redeemUrl?.trim() || DEFAULT_REDEEM_URL;

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

  const allCards = cards.join('\\n');

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
        <button onClick={() => downloadFile(`卡密_${orderId}.txt`, 'text/plain', `订单号：${orderId}\\n充值网址：${effectiveRedeemUrl}\\n卡密：\\n${allCards}\\n`)}
          className={`${btnBase} border border-border bg-surface text-foreground hover:border-primary/40`}>
          <FileText size={14} /> 下载 TXT
        </button>
        <button onClick={() => downloadFile(`卡密_${orderId}.csv`, 'text/csv', `订单号,充值网址,卡密\\n"${orderId}","${effectiveRedeemUrl}","${cards.join(' | ')}"\\n`)}
          className={`${btnBase} border border-border bg-surface text-foreground hover:border-primary/40`}>
          <Table2 size={14} /> 下载 CSV
        </button>
      </div>

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

      {/* 充值/兑换网址：放在卡密下方；优先使用商品快照配置，否则使用默认网址 */}
      <div className="mt-4 rounded-lg border border-primary/25 bg-primary/5 p-3.5">
        <p className="mb-1 text-xs font-semibold text-muted-foreground">充值网址 / 兑换网址</p>
        <a
          href={effectiveRedeemUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all font-mono text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          {effectiveRedeemUrl}
        </a>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={effectiveRedeemUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${btnBase} bg-primary text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary-hover`}
          >
            <ExternalLink size={14} /> 打开充值网址
          </a>
          <button
            onClick={() => doCopy('url', effectiveRedeemUrl, '充值网址')}
            className={`${btnBase} border border-primary/40 text-primary hover:bg-primary/10`}
          >
            {copiedKey === 'url' ? <Check size={14} /> : <Copy size={14} />}
            {copiedKey === 'url' ? '已复制' : '复制网址'}
          </button>
        </div>
      </div>

      {/* 保管警示 */}
      <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-danger">
        <ShieldAlert size={14} className="shrink-0" />
        充值网址 / 卡密 · 请妥善保管，避免泄露。
      </p>
      <Link to="/tutorials" className="mt-2 inline-block text-xs text-primary hover:underline">不知道怎么用？查看激活教程 →</Link>
    </div>
  );
}
