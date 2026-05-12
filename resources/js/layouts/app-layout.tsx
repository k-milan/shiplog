import { Breadcrumbs } from '@/components/breadcrumbs';
import { type BreadcrumbItem } from '@/types';
import { type ReactNode } from 'react';

interface AppLayoutProps {
    children: ReactNode;
    breadcrumbs?: BreadcrumbItem[];
}

export default ({ children, breadcrumbs, ...props }: AppLayoutProps) => (
    <main
        className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8"
        {...props}
    >
        <div className="mx-auto w-full max-w-5xl space-y-6">
            {breadcrumbs && breadcrumbs.length > 0 && (
                <Breadcrumbs breadcrumbs={breadcrumbs} />
            )}
            {children}
        </div>
    </main>
);
