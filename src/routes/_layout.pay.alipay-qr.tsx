import { createFileRoute } from '@tanstack/react-router';
import { AlipayQrPayPage } from '@/pages/AlipayQrPayPage';

export const Route = createFileRoute('/_layout/pay/alipay-qr')({ component: AlipayQrPayPage });
