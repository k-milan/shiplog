import { cn } from '@/lib/utils';
import {
    type ReactNode,
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';

type ScrollAxis = 'horizontal' | 'vertical' | 'both';

interface ScrollFadeProps {
    children: ReactNode;
    className?: string;
    hideScrollbar?: boolean;
    axis?: ScrollAxis;
    intensity?: number;
}

export function ScrollFade({
    children,
    className,
    hideScrollbar = true,
    axis = 'horizontal',
    intensity = 1,
}: ScrollFadeProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const contentRef = useRef<HTMLDivElement | null>(null);
    const [showLeft, setShowLeft] = useState(false);
    const [showRight, setShowRight] = useState(false);
    const [showTop, setShowTop] = useState(false);
    const [showBottom, setShowBottom] = useState(false);
    const fadeIntensity = Math.min(Math.max(intensity, 0), 1);

    const checkScroll = useCallback(() => {
        const element = containerRef.current;

        if (!element) {
            return;
        }

        const {
            scrollLeft,
            scrollTop,
            scrollWidth,
            scrollHeight,
            clientWidth,
            clientHeight,
        } = element;

        if (axis === 'horizontal' || axis === 'both') {
            setShowLeft(scrollLeft > 0);
            setShowRight(
                Math.ceil(scrollLeft + clientWidth) <
                    Math.floor(scrollWidth - 1),
            );
        }

        if (axis === 'vertical' || axis === 'both') {
            setShowTop(scrollTop > 0);
            setShowBottom(
                Math.ceil(scrollTop + clientHeight) <
                    Math.floor(scrollHeight - 1),
            );
        }
    }, [axis]);

    useLayoutEffect(() => {
        requestAnimationFrame(checkScroll);
    }, [checkScroll]);

    useEffect(() => {
        const container = containerRef.current;

        if (!container) {
            return;
        }

        const onScroll = () => checkScroll();
        const resizeObserver = new ResizeObserver(() => checkScroll());
        const resizeFrame = requestAnimationFrame(checkScroll);

        container.addEventListener('scroll', onScroll, { passive: true });
        resizeObserver.observe(container);

        if (contentRef.current) {
            resizeObserver.observe(contentRef.current);
        }

        window.addEventListener('resize', onScroll);

        return () => {
            container.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onScroll);
            resizeObserver.disconnect();
            cancelAnimationFrame(resizeFrame);
        };
    }, [checkScroll]);

    return (
        <div className="relative">
            <div
                ref={containerRef}
                className={cn(
                    hideScrollbar &&
                        '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
                    axis === 'horizontal' &&
                        'w-full overflow-x-auto overflow-y-hidden',
                    axis === 'vertical' &&
                        'h-full overflow-y-auto overflow-x-hidden',
                    axis === 'both' && 'overflow-auto',
                    className,
                )}
            >
                <div
                    ref={contentRef}
                    className={cn(
                        axis === 'horizontal' && 'w-fit min-w-full',
                        axis === 'vertical' && 'h-fit min-h-full',
                        axis === 'both' && 'h-fit min-h-full w-fit min-w-full',
                    )}
                >
                    {children}
                </div>
            </div>

            {(axis === 'horizontal' || axis === 'both') && showLeft && (
                <div
                    aria-hidden
                    className="pointer-events-none absolute top-0 left-0 z-10 h-full w-10"
                    style={{
                        opacity: fadeIntensity,
                        background:
                            'linear-gradient(to right, var(--background), transparent)',
                    }}
                />
            )}

            {(axis === 'horizontal' || axis === 'both') && showRight && (
                <div
                    aria-hidden
                    className="pointer-events-none absolute top-0 right-0 z-10 h-full w-10"
                    style={{
                        opacity: fadeIntensity,
                        background:
                            'linear-gradient(to left, var(--background), transparent)',
                    }}
                />
            )}

            {(axis === 'vertical' || axis === 'both') && showTop && (
                <div
                    aria-hidden
                    className="pointer-events-none absolute top-0 left-0 z-10 h-10 w-full"
                    style={{
                        opacity: fadeIntensity,
                        background:
                            'linear-gradient(to bottom, var(--background), transparent)',
                    }}
                />
            )}

            {(axis === 'vertical' || axis === 'both') && showBottom && (
                <div
                    aria-hidden
                    className="pointer-events-none absolute bottom-0 left-0 z-10 h-10 w-full"
                    style={{
                        opacity: fadeIntensity,
                        background:
                            'linear-gradient(to top, var(--background), transparent)',
                    }}
                />
            )}
        </div>
    );
}
