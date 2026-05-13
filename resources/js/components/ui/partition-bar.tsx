import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import {
    Children,
    createContext,
    type HTMLAttributes,
    isValidElement,
    type ReactElement,
    type ReactNode,
    useContext,
} from 'react';

type PartitionBarContextType = {
    total: number;
    size: VariantProps<typeof partitionBarVariants>['size'];
};

const PartitionBarContext = createContext<PartitionBarContextType | null>(null);

function usePartitionBarContext(): PartitionBarContextType {
    const context = useContext(PartitionBarContext);

    if (!context) {
        throw new Error(
            'usePartitionBarContext must be used within a PartitionBar',
        );
    }

    return context;
}

const partitionBarVariants = cva('flex flex-row', {
    variants: {
        size: {
            sm: 'text-xs',
            md: 'text-sm',
            lg: 'text-md',
        },
    },
    defaultVariants: {
        size: 'md',
    },
});

interface PartitionBarProps
    extends HTMLAttributes<HTMLUListElement>,
        VariantProps<typeof partitionBarVariants> {
    children?:
        | ReactElement<PartitionBarSegmentProps>
        | ReactElement<PartitionBarSegmentProps>[];
    gap?: number;
}

export function PartitionBar({
    children,
    className,
    gap = 1,
    size,
    ...props
}: PartitionBarProps) {
    const total = Children.toArray(children).reduce<number>(
        (sum, child) =>
            isValidElement(child)
                ? sum + ((child.props as PartitionBarSegmentProps).num || 0)
                : sum,
        0,
    );

    return (
        <PartitionBarContext.Provider value={{ total, size }}>
            <ul
                className={cn('w-full', partitionBarVariants({ size }), className)}
                style={{ gap: `${gap * 4}px` }}
                {...props}
            >
                {children}
            </ul>
        </PartitionBarContext.Provider>
    );
}

const partitionBarLineVariants = cva('', {
    variants: {
        variant: {
            default: 'bg-primary',
            secondary: 'bg-primary/60',
            destructive: 'bg-destructive',
            outline: 'border border-input bg-background',
            muted: 'bg-primary/40',
        },
    },
    defaultVariants: {
        variant: 'default',
    },
});

const partitionBarTitleVariants = cva('', {
    variants: {
        variant: {
            default: 'text-primary',
            secondary: 'text-primary/60',
            destructive: 'text-destructive',
            outline: 'text-foreground',
            muted: 'text-primary/40',
        },
    },
    defaultVariants: {
        variant: 'default',
    },
});

interface PartitionBarSegmentProps
    extends HTMLAttributes<HTMLLIElement>,
        VariantProps<typeof partitionBarLineVariants> {
    children?: ReactNode;
    num?: number;
    variant?: VariantProps<typeof partitionBarLineVariants>['variant'];
    alignment?: 'left' | 'center' | 'right';
    barClassName?: string;
}

export function PartitionBarSegment({
    children,
    num = 0,
    variant = 'default',
    alignment = 'center',
    className,
    barClassName,
    ...props
}: PartitionBarSegmentProps) {
    const { total, size } = usePartitionBarContext();
    const widthPercent = total > 0 ? (num / total) * 100 : 0;

    return (
        <li
            className={cn('flex min-w-0 flex-col', className)}
            style={{
                flexBasis: `${widthPercent}%`,
                flexGrow: 0,
                flexShrink: 0,
            }}
            {...props}
        >
            <div
                className={cn(
                    partitionBarLineVariants({ variant }),
                    'w-full shrink-0 rounded-full',
                    size === 'sm' ? 'h-2' : size === 'md' ? 'h-3' : 'h-4',
                    barClassName,
                )}
            />
            <div
                className={cn(
                    partitionBarTitleVariants({ variant }),
                    'flex w-full flex-col whitespace-normal',
                    size === 'sm' ? 'mt-2' : size === 'md' ? 'mt-3' : 'mt-4',
                    alignment === 'left' && 'items-start',
                    alignment === 'center' && 'items-center',
                    alignment === 'right' && 'items-end',
                )}
            >
                {children}
            </div>
        </li>
    );
}

export function PartitionBarSegmentTitle({
    children,
    className,
}: HTMLAttributes<HTMLDivElement>) {
    return <div className={cn('w-fit font-semibold', className)}>{children}</div>;
}

export function PartitionBarSegmentValue({
    children,
    className,
}: HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={cn('w-fit text-[80%] text-muted-foreground', className)}>
            {children}
        </div>
    );
}
