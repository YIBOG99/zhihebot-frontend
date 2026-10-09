import { createFileRoute } from '@tanstack/react-router';
import { OrderLookupPage } from '@/pages/OrderLookupPage';
export const Route = createFileRoute('/_layout/orders/lookup')({ component: OrderLookupPage });
