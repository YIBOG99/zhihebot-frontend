import { createFileRoute } from '@tanstack/react-router';
import { AlipayManualPayPage } from '@/pages/AlipayManualPayPage';

export const Route = createFileRoute('/_layout/pay/alipay-manual')({ component: AlipayManualPayPage });
