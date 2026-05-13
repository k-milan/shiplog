import { cn } from '@/lib/utils';
import { type HTMLAttributes, type ReactNode } from 'react';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from './tooltip';

export type HeatmapValue = {
    date: string;
    value: number;
};

export type HeatmapData = HeatmapValue[];

type InterpolationModes = 'linear' | 'sqrt' | 'log';

type ColorOptions =
    | {
          colorMode: 'discrete';
          colorScale?: string[];
          customColorMap?: (
              value: number,
              max: number,
              colorCount: number,
          ) => number;
      }
    | {
          colorMode: 'interpolate';
          maxColor?: string;
          minColor?: string;
          interpolation?: InterpolationModes;
      };

type HeatmapProps = HTMLAttributes<HTMLDivElement> &
    ColorOptions & {
        data: HeatmapData;
        startDate: Date;
        endDate: Date;
        cellSize?: number;
        gap?: number;
        daysOfTheWeek?: 'all' | 'MWF' | 'none' | 'single letter';
        displayStyle?: 'squares' | 'bubbles';
        dateDisplayFunction?: (date: Date) => ReactNode;
        valueDisplayFunction?: (value: number) => ReactNode;
    };

const defaultIntensityColors = [
    '#f0fdf4',
    '#bbf7d0',
    '#86efac',
    '#22c55e',
    '#166534',
];

const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getAllDays(start: string, end: string): string[] {
    const days: string[] = [];
    const current = new Date(`${start}T00:00:00`);
    const endDate = new Date(`${end}T00:00:00`);

    while (current <= endDate) {
        days.push(formatLocalDate(current));
        current.setDate(current.getDate() + 1);
    }

    return days;
}

function padToWeekStart(days: string[]): (string | null)[] {
    const firstDay = new Date(`${days[0]}T00:00:00`).getDay();

    return [...new Array(firstDay).fill(null), ...days];
}

function chunkByWeek(days: (string | null)[]): (string | null)[][] {
    const weeks: (string | null)[][] = [];

    for (let index = 0; index < days.length; index += 7) {
        weeks.push(days.slice(index, index + 7));
    }

    return weeks;
}

function getMonthLabel(week: (string | null)[]) {
    const lastDay = [...week].reverse().find(Boolean);

    return lastDay
        ? new Date(`${lastDay}T00:00:00`).toLocaleString(undefined, {
              month: 'short',
          })
        : null;
}

function defaultColorMap(value: number, max: number, colorCount: number) {
    if (colorCount <= 0 || max <= 0 || value <= 0) {
        return 0;
    }

    return Math.min(
        Math.max(Math.ceil((value / max) * (colorCount - 1)), 0),
        colorCount - 1,
    );
}

function interpolateRgb(
    value: number,
    max: number,
    minColor: string,
    maxColor: string,
    scale: InterpolationModes,
) {
    if (value <= 0 || max <= 0) {
        return minColor;
    }

    let ratio = value / max;

    if (scale === 'sqrt') {
        ratio = Math.sqrt(ratio);
    }

    if (scale === 'log') {
        ratio = Math.log10(value + 1) / Math.log10(max + 1);
    }

    ratio = Math.min(Math.max(ratio, 0), 1);

    const start = {
        r: parseInt(minColor.slice(1, 3), 16),
        g: parseInt(minColor.slice(3, 5), 16),
        b: parseInt(minColor.slice(5, 7), 16),
    };
    const end = {
        r: parseInt(maxColor.slice(1, 3), 16),
        g: parseInt(maxColor.slice(3, 5), 16),
        b: parseInt(maxColor.slice(5, 7), 16),
    };

    const r = Math.round(start.r + (end.r - start.r) * ratio);
    const g = Math.round(start.g + (end.g - start.g) * ratio);
    const b = Math.round(start.b + (end.b - start.b) * ratio);

    return `rgb(${r}, ${g}, ${b})`;
}

function DaysOfTheWeekIndicator({
    daysOfTheWeekOption,
    fontSize,
}: {
    daysOfTheWeekOption: 'all' | 'MWF' | 'none' | 'single letter';
    fontSize: number;
}) {
    if (daysOfTheWeekOption === 'none') {
        return null;
    }

    return weekDays.map((day, index) =>
        daysOfTheWeekOption === 'MWF' && ![1, 3, 5].includes(index) ? (
            <div
                key={day}
                style={{ gridRow: index + 2, gridColumn: 1 }}
            />
        ) : (
            <div
                key={day}
                className="flex items-center justify-end text-muted-foreground"
                style={{
                    gridRow: index + 2,
                    gridColumn: 1,
                    fontSize,
                }}
            >
                {daysOfTheWeekOption === 'single letter'
                    ? day.charAt(0)
                    : day}
            </div>
        ),
    );
}

function ValueIndicator({
    cellSize,
    displayStyle,
    value,
    maxValue,
    color,
    style,
    ...htmlProps
}: HTMLAttributes<HTMLDivElement> & {
    cellSize: number;
    displayStyle: 'squares' | 'bubbles';
    value: number;
    maxValue: number;
    color: string;
}) {
    if (displayStyle === 'bubbles') {
        const minScale = 0.3;
        const scale = maxValue > 0 ? value / maxValue : 0;
        const finalSize = cellSize * (minScale + (1 - minScale) * scale);

        return (
            <div
                className="flex items-center justify-center"
                style={style}
                {...htmlProps}
            >
                <span
                    className="rounded-full transition-colors"
                    style={{
                        width: finalSize,
                        height: finalSize,
                        backgroundColor: color,
                    }}
                />
            </div>
        );
    }

    return (
        <div
            className="rounded-[4px] transition-colors"
            style={{
                backgroundColor: color,
                ...style,
            }}
            {...htmlProps}
        />
    );
}

export function Heatmap(props: HeatmapProps) {
    const {
        data,
        startDate,
        endDate,
        cellSize = 20,
        daysOfTheWeek = 'MWF',
        gap = 4,
        displayStyle = 'squares',
        valueDisplayFunction,
        dateDisplayFunction,
        className,
    } = props;
    const valueByDate = new Map<string, number>(
        data.map(({ date, value }) => [date, value]),
    );
    const days = getAllDays(formatLocalDate(startDate), formatLocalDate(endDate));
    const weeks = chunkByWeek(padToWeekStart(days));
    const maxValue = Math.max(...data.map((item) => item.value), 0);
    const monthLabels = weeks.map((week, index) => {
        const label = getMonthLabel(week);
        const previousLabel = index > 0 ? getMonthLabel(weeks[index - 1]) : null;

        return label !== previousLabel ? label : null;
    });
    const fontSize = Math.min(16, cellSize);
    const { safeProps, getCellColor } = resolveColorOptions(
        props,
        maxValue,
    );

    return (
        <div
            role="grid"
            aria-label="Activity Heatmap"
            className={cn('grid', className)}
            style={{
                gap,
                gridTemplateColumns: `max-content repeat(${weeks.length}, ${cellSize}px)`,
                gridTemplateRows: `repeat(8, ${cellSize}px)`,
            }}
            {...safeProps}
        >
            <DaysOfTheWeekIndicator
                daysOfTheWeekOption={daysOfTheWeek}
                fontSize={fontSize}
            />

            {weeks.map((_, index) => (
                <div
                    key={`header-${index}`}
                    className="flex items-end text-muted-foreground"
                    style={{ gridColumn: index + 2, gridRow: 1, fontSize }}
                >
                    {monthLabels[index]}
                </div>
            ))}

            <TooltipProvider>
                {weeks.map((week, weekIndex) =>
                    week.map((day, dayIndex) => {
                        if (!day) {
                            return (
                                <div
                                    key={`empty-${weekIndex}-${dayIndex}`}
                                    style={{
                                        gridColumn: weekIndex + 2,
                                        gridRow: dayIndex + 2,
                                    }}
                                />
                            );
                        }

                        const value = Math.max(0, valueByDate.get(day) ?? 0);
                        const displayDate = new Date(`${day}T00:00:00`);

                        return (
                            <Tooltip key={day}>
                                <TooltipTrigger asChild>
                                    <ValueIndicator
                                        id={`heatmap-cell-${day}`}
                                        tabIndex={0}
                                        aria-label={`${day}: ${value} activit${value === 1 ? 'y' : 'ies'}`}
                                        cellSize={cellSize}
                                        displayStyle={displayStyle}
                                        value={value}
                                        maxValue={maxValue}
                                        color={getCellColor(value)}
                                        style={{
                                            gridColumn: weekIndex + 2,
                                            gridRow: dayIndex + 2,
                                        }}
                                    />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <div className="text-xs">
                                        <div>
                                            {dateDisplayFunction
                                                ? dateDisplayFunction(
                                                      displayDate,
                                                  )
                                                : displayDate.toDateString()}
                                        </div>
                                        <div className="text-muted-foreground">
                                            {valueDisplayFunction
                                                ? valueDisplayFunction(value)
                                                : `${value} activit${value === 1 ? 'y' : 'ies'}`}
                                        </div>
                                    </div>
                                </TooltipContent>
                            </Tooltip>
                        );
                    }),
                )}
            </TooltipProvider>
        </div>
    );
}

function resolveColorOptions(
    props: HeatmapProps,
    maxValue: number,
) {
    if (props.colorMode === 'interpolate') {
        return {
            safeProps: getSafeProps(props),
            getCellColor: (value: number) =>
                interpolateRgb(
                    value,
                    maxValue,
                    props.minColor ?? '#1f2937',
                    props.maxColor ?? '#22c55e',
                    props.interpolation ?? 'linear',
                ),
        };
    }

    const colors =
        props.colorScale && props.colorScale.length > 0
            ? props.colorScale
            : defaultIntensityColors;
    const colorMap = props.customColorMap ?? defaultColorMap;

    return {
        safeProps: getSafeProps(props),
        getCellColor: (value: number) =>
            colors[colorMap(value, maxValue, colors.length)],
    };
}

function getSafeProps(props: HeatmapProps) {
    const safeProps = { ...props } as Record<string, unknown>;

    for (const key of [
        'data',
        'startDate',
        'endDate',
        'cellSize',
        'daysOfTheWeek',
        'gap',
        'displayStyle',
        'valueDisplayFunction',
        'dateDisplayFunction',
        'className',
        'colorMode',
        'customColorMap',
        'colorScale',
        'minColor',
        'maxColor',
        'interpolation',
    ]) {
        delete safeProps[key];
    }

    return safeProps as HTMLAttributes<HTMLDivElement>;
}

function formatLocalDate(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}
