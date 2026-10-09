import { createFileRoute } from '@tanstack/react-router';
import { AuthCallbackPage } from '@/pages/AuthCallbackPage';

export const Route = createFileRoute('/_layout/auth/callback')({ component: AuthCallbackPage });
