import { createFileRoute } from '@tanstack/react-router';
import { BossPage } from '@/pages/BossPage';

export const Route = createFileRoute('/boss')({
  component: BossPage,
});
