import { createFileRoute } from '@tanstack/react-router';
import { CategoryPage } from '@/pages/CategoryPage';
export const Route = createFileRoute('/_layout/category/$slug')({ component: CategoryPage });
