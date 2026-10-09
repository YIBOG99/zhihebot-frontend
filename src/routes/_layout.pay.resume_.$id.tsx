import { createFileRoute } from '@tanstack/react-router';
import { PayResumePage } from '@/pages/PayResumePage';

export const Route = createFileRoute('/_layout/pay/resume_/$id')({ component: PayResumePage });
