import { createFileRoute } from '@tanstack/react-router';
import { AlipayReturnPage } from '@/pages/AlipayReturnPage';

export const Route = createFileRoute('/_layout/pay/return')({
  component: AlipayReturnPage,
});
