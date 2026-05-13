import { cn } from '@/lib/utils';
import { type ReactElement } from 'react';
import { ResponsiveContainer } from 'recharts';

function ChartContainer({
    children,
    className,
}: {
    children: ReactElement;
    className?: string;
}) {
    return (
        <div data-slot="chart" className={cn('h-56 w-full', className)}>
            <ResponsiveContainer width="100%" height="100%">
                {children}
            </ResponsiveContainer>
        </div>
    );
}

export { ChartContainer };
