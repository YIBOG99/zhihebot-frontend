import { createFileRoute } from '@tanstack/react-router';
import { ContentListPage } from '@/pages/ContentListPage';
export const Route = createFileRoute('/_layout/blog')({
  component: () => <ContentListPage kind="blog" />,
});
