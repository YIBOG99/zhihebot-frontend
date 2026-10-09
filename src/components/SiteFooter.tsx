import { Link } from '@tanstack/react-router';
import { BrandLogo, useBrandName } from '@/components/BrandLogo';

const FOOTER_LINKS = [
  {
    title: '商品分类',
    links: [
      { to: '/category/chatgpt', label: 'ChatGPT 专区' },
      { to: '/category/claude', label: 'Claude 专区' },
      { to: '/category/grok', label: 'Grok 专区' },
      { to: '/category/coding', label: 'AI 编程工具' },
    ],
  },
  {
    title: '购买指南',
    links: [
      { to: '/content/chatgpt-recharge', label: 'ChatGPT 充值总指南' },
      { to: '/content/chatgpt-pro-5x-20x-buying-guide', label: 'Pro 5X / 20X 怎么选' },
      { to: '/content/claude-max-5x-20x-guide', label: 'Claude Max 怎么选' },
      { to: '/content/grok-super-monthly-recharge', label: 'Grok Super 充值说明' },
    ],
  },
  {
    title: '帮助中心',
    links: [
      { to: '/guides', label: '全部选购指南' },
      { to: '/tutorials', label: '激活教程' },
      { to: '/content/ai-membership-auto-delivery-guide', label: '自动发货查收说明' },
      { to: '/content/recharge-not-received', label: '充值不到账怎么办' },
      { to: '/faq', label: '常见问题' },
      { to: '/orders/lookup', label: '订单查询' },
    ],
  },
  {
    title: '网站信息',
    links: [
      { to: '/content/about-us', label: '关于智核' },
      { to: '/content/terms', label: '服务条款' },
      { to: '/content/privacy', label: '隐私政策' },
      { to: '/content/disclaimer', label: '第三方平台免责声明' },
    ],
  },
];

export function SiteFooter() {
  const brandName = useBrandName();
  return (
    <footer className="border-t border-border bg-surface/80 backdrop-blur-sm mt-20">
      <div className="hr-glow -mt-px" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
          {/* Brand */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <BrandLogo size={28} rounded="full" />
              <span className="font-semibold text-sm">{brandName}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              海外 AI 订阅正规渠道<br />自动发卡 · 订单可查 · 售后有保障
            </p>
            <p className="mt-3 text-xs text-muted-foreground">营业时间：每日 09:00 – 24:00</p>
            <p className="mt-2 text-xs text-muted-foreground">微信：<span className="font-mono text-foreground">zhihe-service</span></p>
            <p className="mt-1 text-xs text-muted-foreground">QQ：<span className="font-mono text-foreground">88001234</span></p>
            <p className="mt-1 text-xs text-muted-foreground">邮箱：<span className="break-all text-foreground">support@zhihe.shop</span></p>
          </div>
          {FOOTER_LINKS.map((col) => (
            <div key={col.title}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{col.title}</h3>
              <ul className="space-y-2">
                {col.links.map((l) => (
                  <li key={l.to}>
                    <Link to={l.to as never} className="story-link text-sm text-muted-foreground hover:text-foreground transition-colors">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border pt-6">
          <p className="text-xs text-muted-foreground">© 2026 智核商店 ZhiHe. All rights reserved.</p>
          <p className="text-xs text-muted-foreground">本站仅销售数字权益兑换凭证，与所涉品牌无官方隶属关系。</p>
        </div>
      </div>
    </footer>
  );
}
