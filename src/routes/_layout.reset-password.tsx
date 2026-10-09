import { createFileRoute } from '@tanstack/react-router';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';

export const Route = createFileRoute('/_layout/reset-password')({ component: ResetPasswordPage });
