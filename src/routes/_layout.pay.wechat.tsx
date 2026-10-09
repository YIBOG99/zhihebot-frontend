import { createFileRoute } from '@tanstack/react-router';
import { WechatPayPage } from '@/pages/WechatPayPage';
export const Route = createFileRoute('/_layout/pay/wechat')({ component: WechatPayPage });
