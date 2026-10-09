import { createFileRoute } from '@tanstack/react-router';
import { CheckoutPage } from '@/pages/CheckoutPage';
export const Route = createFileRoute('/_layout/checkout/$id')({ component: CheckoutPage });
