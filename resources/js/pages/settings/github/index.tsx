import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChartContainer } from '@/components/ui/chart';
import { Heatmap } from '@/components/ui/heatmap';
import {
    PartitionBar,
    PartitionBarSegment,
    PartitionBarSegmentTitle,
    PartitionBarSegmentValue,
} from '@/components/ui/partition-bar';
import { ScrollFade } from '@/components/ui/scroll-fade';
import { destroy, redirect } from '@/routes/github-apps';
import { Form, Head, InfiniteScroll, usePoll } from '@inertiajs/react';
import {
    GitBranch,
    GitCommitHorizontal,
    GitPullRequest,
    MessageSquareText,
    Plus,
    Trash2,
} from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
    Area,
    AreaChart,
    CartesianGrid,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

interface GitHubInstallation {
    id: number;
    installation_id: number;
    account_login: string;
    account_type: string;
    account_name: string | null;
    avatar_url: string | null;
    created_at: string;
}

interface Last24HoursSummary {
    activities: number;
    repos_touched: number;
    prs_updated: number;
    prs_merged: number;
    production_deploys: number | null;
}

interface ActivityChartPoint {
    date: string;
    label: string;
    total: number;
}

interface ActivityHeatmap {
    start_date: string;
    end_date: string;
    total: number;
    data: {
        date: string;
        value: number;
    }[];
}

interface RepositoryActivityPartition {
    repository: string;
    total: number;
}

interface BackgroundControls {
    dotColor: string;
    dotOpacity: number;
    dotSize: number;
    gridSpacing: number;
}

interface ActivityItem {
    id: string;
    type: 'commit' | 'pull_request' | 'review';
    occurred_at: string | null;
    title: string;
    actor: string | null;
    repository: string | null;
    reference: string | null;
    url: string | null;
    state: string | null;
}

interface Paginated<T> {
    data: T[];
}

interface PullRequest {
    id: number;
    number: number;
    title: string;
    state: string;
    draft: boolean;
    author_login: string | null;
    html_url: string;
    opened_at: string | null;
    updated_at_github: string | null;
    merged_at: string | null;
    repository: {
        full_name: string;
    };
}

interface Review {
    id: number;
    state: string;
    author_login: string | null;
    body: string | null;
    html_url: string | null;
    submitted_at: string | null;
    pull_request: {
        number: number;
        title: string;
    };
}

interface Props {
    installations: GitHubInstallation[];
    last24HoursSummary: Last24HoursSummary;
    last7DaysActivity: ActivityChartPoint[];
    activityHeatmap: ActivityHeatmap;
    todayActivityByRepository: RepositoryActivityPartition[];
    activityItems: Paginated<ActivityItem>;
    recentPullRequests: PullRequest[];
    recentReviews: Review[];
    status?: string;
}

export default function GitHubIndex({
    installations,
    last24HoursSummary,
    last7DaysActivity,
    activityHeatmap,
    todayActivityByRepository,
    activityItems,
    recentPullRequests,
    recentReviews,
    status,
}: Props) {
    const previousActivityIds = useRef<string[] | null>(null);
    const animationTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [newActivityItemIds, setNewActivityItemIds] = useState<Set<string>>(
        () => new Set(),
    );
    const [backgroundControls, setBackgroundControls] = useState({
        dotColor: '#ffffff',
        dotOpacity: 7,
        dotSize: 0.75,
        gridSpacing: 13,
    });

    usePoll(10000, {
        only: [
            'activityItems',
            'last24HoursSummary',
            'last7DaysActivity',
            'activityHeatmap',
            'todayActivityByRepository',
        ],
        reset: ['activityItems'],
        data: { activity: 1 },
    });

    useEffect(() => {
        const currentIds = activityItems.data.map((item) => item.id);
        const previousIds = previousActivityIds.current;

        if (previousIds === null) {
            previousActivityIds.current = currentIds;

            return;
        }

        const previousFirstId = previousIds[0];
        const previousFirstIndex = previousFirstId
            ? currentIds.indexOf(previousFirstId)
            : -1;
        const incomingIds =
            previousFirstIndex > 0
                ? currentIds.slice(0, previousFirstIndex)
                : currentIds.filter((id) => !previousIds.includes(id));

        if (incomingIds.length > 0) {
            setNewActivityItemIds(new Set(incomingIds));

            if (animationTimeout.current !== null) {
                clearTimeout(animationTimeout.current);
            }

            animationTimeout.current = setTimeout(() => {
                setNewActivityItemIds(new Set());
                animationTimeout.current = null;
            }, 1200);
        }

        previousActivityIds.current = currentIds;
    }, [activityItems.data]);

    const backgroundStyle = {
        backgroundImage: `radial-gradient(circle at 1px 1px, color-mix(in oklch, ${backgroundControls.dotColor} ${backgroundControls.dotOpacity}%, transparent) ${backgroundControls.dotSize}px, transparent 0)`,
        backgroundSize: `${backgroundControls.gridSpacing}px ${backgroundControls.gridSpacing}px`,
    };

    return (
        <main
            className="min-h-screen bg-background text-foreground"
            style={backgroundStyle}
        >
            <Head title="Shiplog" />

            <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-10 sm:px-6">
                <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <GitBranch className="h-5 w-5" />
                            <h1 className="font-mono text-2xl font-semibold">
                                Shiplog
                            </h1>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Recent GitHub commits, pull requests, and reviews.
                        </p>
                    </div>

                    <Button asChild size="sm">
                        <a href={redirect.url()}>
                            <Plus className="h-4 w-4" />
                            Connect GitHub
                        </a>
                    </Button>
                </header>

                <BackgroundTuner
                    values={backgroundControls}
                    onChange={setBackgroundControls}
                />

                <div className="space-y-6">
                    {status === 'github-app-connected' && (
                        <StatusMessage variant="success">
                            GitHub account connected successfully.
                        </StatusMessage>
                    )}

                    {status === 'github-app-disconnected' && (
                        <StatusMessage>
                            GitHub account disconnected.
                        </StatusMessage>
                    )}

                    {status === 'github-app-error' && (
                        <StatusMessage variant="error">
                            Failed to connect GitHub account. Please try again.
                        </StatusMessage>
                    )}

                    {installations.length === 0 ? (
                        <EmptyState />
                    ) : (
                        <>
                            <ConnectedAccounts installations={installations} />

                            {last24HoursSummary.activities === 0 && (
                                <StatusMessage>
                                    Connected, but no synced GitHub activity is
                                    stored for the last 24 hours.
                                </StatusMessage>
                            )}

                            <Last24HoursSummaryCards
                                summary={last24HoursSummary}
                            />

                            <TodayRepositoryPartition
                                repositories={todayActivityByRepository}
                            />

                            <Last7DaysActivityChart data={last7DaysActivity} />

                            <ActivityHeatmapPanel heatmap={activityHeatmap} />

                            <section className="min-w-0">
                                <h2 className="mb-3 font-mono text-sm font-semibold">
                                    Last 24 Hours
                                </h2>
                                <ActivityTimeline
                                    items={activityItems.data}
                                    newItemIds={newActivityItemIds}
                                />
                            </section>

                            <section className="grid gap-6 lg:grid-cols-2">
                                <Panel title="Recent Pull Requests">
                                    <div className="divide-y divide-border">
                                        {recentPullRequests.map(
                                            (pullRequest) => (
                                                <PullRequestRow
                                                    key={pullRequest.id}
                                                    pullRequest={pullRequest}
                                                />
                                            ),
                                        )}
                                    </div>
                                </Panel>

                                <Panel title="Recent Reviews">
                                    <div className="divide-y divide-border">
                                        {recentReviews.map((review) => (
                                            <ReviewRow
                                                key={review.id}
                                                review={review}
                                            />
                                        ))}
                                    </div>
                                </Panel>
                            </section>
                        </>
                    )}
                </div>
            </div>
        </main>
    );
}

function EmptyState() {
    return (
        <section className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
            <GitBranch className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-mono text-sm font-medium">
                No GitHub accounts connected
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
                Connect a GitHub account to start tracking your activity.
            </p>
            <Button asChild className="mt-4" size="sm">
                <a href={redirect.url()}>
                    <Plus className="h-4 w-4" />
                    Connect GitHub
                </a>
            </Button>
        </section>
    );
}

function BackgroundTuner({
    values,
    onChange,
}: {
    values: BackgroundControls;
    onChange: (values: BackgroundControls) => void;
}) {
    const update = <Key extends keyof BackgroundControls>(
        key: Key,
        value: BackgroundControls[Key],
    ) => {
        onChange({ ...values, [key]: value });
    };

    return (
        <section className="mb-6 rounded-md border bg-background/60 p-3">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h2 className="font-mono text-sm font-semibold">
                        Background Tuner
                    </h2>
                    <p className="text-xs text-muted-foreground">
                        Adjust the page grid and use the values below.
                    </p>
                </div>
                <code className="rounded bg-muted px-2 py-1 font-mono text-[0.68rem] text-muted-foreground">
                    {`color ${values.dotColor} / opacity ${values.dotOpacity}% / dot ${values.dotSize}px / spacing ${values.gridSpacing}px`}
                </code>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="space-y-1">
                    <span className="font-mono text-[0.68rem] text-muted-foreground">
                        dot color
                    </span>
                    <div className="flex items-center gap-2">
                        <input
                            type="color"
                            value={values.dotColor}
                            onChange={(event) =>
                                update('dotColor', event.target.value)
                            }
                            className="h-8 w-10 rounded border border-border bg-transparent"
                        />
                        <span className="font-mono text-xs">
                            {values.dotColor}
                        </span>
                    </div>
                </label>

                <BackgroundSlider
                    label="opacity"
                    value={values.dotOpacity}
                    min={1}
                    max={18}
                    step={1}
                    suffix="%"
                    onChange={(value) => update('dotOpacity', value)}
                />

                <BackgroundSlider
                    label="dot size"
                    value={values.dotSize}
                    min={0.4}
                    max={1.4}
                    step={0.05}
                    suffix="px"
                    onChange={(value) => update('dotSize', value)}
                />

                <BackgroundSlider
                    label="spacing"
                    value={values.gridSpacing}
                    min={8}
                    max={24}
                    step={1}
                    suffix="px"
                    onChange={(value) => update('gridSpacing', value)}
                />
            </div>
        </section>
    );
}

function BackgroundSlider({
    label,
    value,
    min,
    max,
    step,
    suffix,
    onChange,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    suffix: string;
    onChange: (value: number) => void;
}) {
    return (
        <label className="space-y-1">
            <span className="flex items-center justify-between gap-2 font-mono text-[0.68rem] text-muted-foreground">
                {label}
                <span>
                    {value}
                    {suffix}
                </span>
            </span>
            <input
                type="range"
                value={value}
                min={min}
                max={max}
                step={step}
                onChange={(event) => onChange(Number(event.target.value))}
                className="h-2 w-full accent-green-500"
            />
        </label>
    );
}

function ConnectedAccounts({
    installations,
}: {
    installations: GitHubInstallation[];
}) {
    return (
        <Panel title="Connected Accounts">
            <ul className="divide-y divide-border">
                {installations.map((installation) => (
                    <li
                        key={installation.id}
                        className="flex items-center justify-between gap-4 px-4 py-3"
                    >
                        <div className="flex min-w-0 items-center gap-3">
                            <Avatar className="h-8 w-8">
                                <AvatarImage
                                    src={installation.avatar_url ?? undefined}
                                    alt={installation.account_login}
                                />
                                <AvatarFallback>
                                    {installation.account_login
                                        .slice(0, 2)
                                        .toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                                <p className="truncate font-mono text-sm leading-none font-medium">
                                    {installation.account_name ??
                                        installation.account_login}
                                </p>
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                    @{installation.account_login}
                                </p>
                            </div>
                            <Badge variant="secondary" className="text-xs">
                                {installation.account_type}
                            </Badge>
                        </div>

                        <Form
                            {...destroy.form({
                                installation: installation.id,
                            })}
                        >
                            {({ processing }) => (
                                <Button
                                    type="submit"
                                    variant="ghost"
                                    size="sm"
                                    disabled={processing}
                                    className="text-destructive hover:text-destructive"
                                >
                                    <Trash2 className="h-4 w-4" />
                                    <span className="sr-only">Disconnect</span>
                                </Button>
                            )}
                        </Form>
                    </li>
                ))}
            </ul>
        </Panel>
    );
}

function Last24HoursSummaryCards({ summary }: { summary: Last24HoursSummary }) {
    return (
        <section className="space-y-3">
            <h2 className="font-mono text-sm font-semibold">Last 24h</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <MiniSummaryCard
                    label="activities"
                    value={summary.activities}
                />
                <MiniSummaryCard
                    label="repos touched"
                    value={summary.repos_touched}
                />
                <MiniSummaryCard
                    label="PRs updated"
                    value={summary.prs_updated}
                />
                <MiniSummaryCard
                    label="PRs merged"
                    value={summary.prs_merged}
                />
                <MiniSummaryCard
                    label="production deploys"
                    value={
                        summary.production_deploys === null
                            ? 'TBA'
                            : summary.production_deploys
                    }
                    muted={summary.production_deploys === null}
                />
            </div>
        </section>
    );
}

function MiniSummaryCard({
    label,
    value,
    muted = false,
}: {
    label: string;
    value: number | string;
    muted?: boolean;
}) {
    return (
        <div className="rounded-md border bg-background/35 px-3 py-2">
            <p
                className={`font-mono text-lg leading-none font-semibold ${muted ? 'text-muted-foreground' : ''}`}
            >
                {value}
            </p>
            <p className="mt-1 font-mono text-[0.68rem] text-muted-foreground">
                {label}
            </p>
        </div>
    );
}

function TodayRepositoryPartition({
    repositories,
}: {
    repositories: RepositoryActivityPartition[];
}) {
    const total = repositories.reduce(
        (sum, repository) => sum + repository.total,
        0,
    );
    const colors = [
        'bg-green-300',
        'bg-green-400',
        'bg-green-500',
        'bg-emerald-500',
        'bg-lime-400',
        'bg-teal-400',
    ];

    return (
        <section className="space-y-3">
            <div className="flex items-end justify-between gap-4">
                <div>
                    <h2 className="font-mono text-sm font-semibold">
                        Today By Repository
                    </h2>
                    <p className="text-xs text-muted-foreground">
                        Total activity per repository today
                    </p>
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                    {total} total
                </p>
            </div>

            {repositories.length === 0 ? (
                <div className="rounded-md border bg-background/35 px-3 py-3 text-xs text-muted-foreground">
                    No repository activity recorded today.
                </div>
            ) : (
                <div className="rounded-md border bg-background/35 p-3">
                    <PartitionBar size="sm" gap={1}>
                        {repositories.map((repository, index) => (
                            <PartitionBarSegment
                                key={repository.repository}
                                num={repository.total}
                                alignment={index === 0 ? 'left' : 'center'}
                                barClassName={colors[index % colors.length]}
                            >
                                <PartitionBarSegmentTitle className="max-w-28 truncate font-mono text-[0.68rem] text-foreground">
                                    {shortRepositoryName(repository.repository)}
                                </PartitionBarSegmentTitle>
                                <PartitionBarSegmentValue className="font-mono">
                                    {repository.total}
                                </PartitionBarSegmentValue>
                            </PartitionBarSegment>
                        ))}
                    </PartitionBar>
                </div>
            )}
        </section>
    );
}

function ActivityHeatmapPanel({ heatmap }: { heatmap: ActivityHeatmap }) {
    return (
        <section className="space-y-3">
            <div className="flex items-end justify-between gap-4">
                <div>
                    <h2 className="font-mono text-sm font-semibold">
                        Activity Heatmap
                    </h2>
                    <p className="text-xs text-muted-foreground">
                        Daily activity over the last 12 weeks
                    </p>
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                    {heatmap.total} total
                </p>
            </div>

            <div className="overflow-x-auto rounded-md border bg-background/35 p-3">
                <Heatmap
                    data={heatmap.data}
                    startDate={new Date(`${heatmap.start_date}T00:00:00`)}
                    endDate={new Date(`${heatmap.end_date}T00:00:00`)}
                    colorMode="discrete"
                    colorScale={[
                        'oklch(26.9% 0 0 / 0.72)',
                        'oklch(44.8% 0.119 151.328)',
                        'oklch(62.7% 0.194 149.214)',
                        'oklch(72.3% 0.219 149.579)',
                        'oklch(87.1% 0.15 154.449)',
                    ]}
                    cellSize={13}
                    gap={3}
                    daysOfTheWeek="single letter"
                    className="w-max font-mono"
                    valueDisplayFunction={(value) =>
                        `${value} activit${value === 1 ? 'y' : 'ies'}`
                    }
                    dateDisplayFunction={(date) =>
                        new Intl.DateTimeFormat(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                        }).format(date)
                    }
                />
            </div>
        </section>
    );
}

function Last7DaysActivityChart({ data }: { data: ActivityChartPoint[] }) {
    return (
        <section className="space-y-3">
            <div className="flex items-end justify-between gap-4">
                <div>
                    <h2 className="font-mono text-sm font-semibold">
                        Last 7 Days
                    </h2>
                    <p className="text-xs text-muted-foreground">
                        Total activity per day
                    </p>
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                    {data.reduce((sum, point) => sum + point.total, 0)} total
                </p>
            </div>

            <div className="rounded-md border bg-background/35 p-3">
                <ChartContainer>
                    <AreaChart
                        accessibilityLayer
                        data={data}
                        margin={{ left: 0, right: 8, top: 14, bottom: 0 }}
                    >
                        <defs>
                            <linearGradient
                                id="activity-total"
                                x1="0"
                                x2="0"
                                y1="0"
                                y2="1"
                            >
                                <stop
                                    offset="5%"
                                    stopColor="oklch(72.3% 0.219 149.579)"
                                    stopOpacity={0.46}
                                />
                                <stop
                                    offset="95%"
                                    stopColor="oklch(72.3% 0.219 149.579)"
                                    stopOpacity={0.04}
                                />
                            </linearGradient>
                        </defs>
                        <CartesianGrid
                            vertical={false}
                            stroke="currentColor"
                            strokeDasharray="4 8"
                            className="text-border"
                        />
                        <XAxis
                            dataKey="label"
                            axisLine={false}
                            tickLine={false}
                            tickMargin={10}
                            tick={{ fontSize: 11 }}
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tickMargin={8}
                            allowDecimals={false}
                            width={28}
                            tick={{ fontSize: 11 }}
                        />
                        <Tooltip
                            cursor={{
                                stroke: 'oklch(72.3% 0.219 149.579)',
                                strokeOpacity: 0.32,
                            }}
                            content={({ active, payload, label }) => {
                                if (!active || !payload?.length) {
                                    return null;
                                }

                                return (
                                    <div className="rounded-md border bg-background px-3 py-2 shadow-sm">
                                        <p className="font-mono text-xs font-medium">
                                            {label}
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {payload[0].value} activities
                                        </p>
                                    </div>
                                );
                            }}
                        />
                        <Area
                            type="monotone"
                            dataKey="total"
                            stroke="oklch(72.3% 0.219 149.579)"
                            strokeWidth={2}
                            fill="url(#activity-total)"
                            dot={{
                                r: 3,
                                fill: 'oklch(72.3% 0.219 149.579)',
                                strokeWidth: 0,
                            }}
                            activeDot={{
                                r: 4,
                                fill: 'oklch(72.3% 0.219 149.579)',
                                strokeWidth: 0,
                            }}
                        />
                    </AreaChart>
                </ChartContainer>
            </div>
        </section>
    );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="overflow-hidden rounded-lg border">
            <div className="border-b px-4 py-3">
                <h2 className="font-mono text-sm font-semibold">{title}</h2>
            </div>
            {children}
        </section>
    );
}

function ActivityTimeline({
    items,
    newItemIds,
}: {
    items: ActivityItem[];
    newItemIds: Set<string>;
}) {
    return (
        <div
            className="relative [--timeline-color:theme(colors.green.500)]"
            style={
                {
                    '--timeline-color': 'oklch(72.3% 0.219 149.579)',
                } as React.CSSProperties
            }
        >
            <ScrollFade
                axis="vertical"
                intensity={0.85}
                className="max-h-[34rem] px-3"
            >
                <InfiniteScroll
                    data="activityItems"
                    onlyNext
                    buffer={240}
                    itemsElement="#activity-timeline-items"
                    loading={
                        <p className="py-2 pl-9 text-xs text-muted-foreground">
                            Loading more activity...
                        </p>
                    }
                    next={({ hasMore, fetch, loading, manualMode }) =>
                        hasMore && manualMode ? (
                            <div className="py-2 pl-9">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={loading}
                                    onClick={() => fetch()}
                                >
                                    Load more activity
                                </Button>
                            </div>
                        ) : null
                    }
                >
                    <ol id="activity-timeline-items" className="relative py-1">
                        {items.map((item, index) => (
                            <ActivityTimelineItem
                                key={item.id}
                                item={item}
                                isLast={index === items.length - 1}
                                isNew={newItemIds.has(item.id)}
                            />
                        ))}
                    </ol>
                </InfiniteScroll>
            </ScrollFade>
        </div>
    );
}

function ActivityTimelineItem({
    item,
    isLast,
    isNew,
}: {
    item: ActivityItem;
    isLast: boolean;
    isNew: boolean;
}) {
    return (
        <a
            href={item.url ?? undefined}
            className={`group grid grid-cols-[1.25rem_minmax(0,1fr)] gap-3 ${isNew ? 'animate-activity-enter' : ''}`}
            target="_blank"
            rel="noreferrer"
        >
            <div className="relative flex justify-center">
                {!isLast && (
                    <span className="absolute top-[1.125rem] bottom-[-0.75rem] w-px bg-[var(--timeline-color)] opacity-75 shadow-[0_0_3px_var(--timeline-color)]" />
                )}
                <span className="relative mt-1 flex h-4 w-4 items-center justify-center rounded-full border border-[var(--timeline-color)] bg-background text-[var(--timeline-color)] shadow-[0_0_5px_var(--timeline-color)] transition-transform group-hover:scale-105">
                    {activityIcon(item.type)}
                </span>
            </div>
            <div className="pb-3">
                <p className="mb-0.5 font-mono text-[0.68rem] leading-none text-muted-foreground">
                    {formatRelativeTime(item.occurred_at)}
                </p>
                <p
                    className="line-clamp-1 font-mono text-xs leading-snug font-medium group-hover:line-clamp-none group-hover:underline"
                    title={item.title}
                >
                    {item.title}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    {activityLabel(item.type)}
                    {item.repository ? ` · ${item.repository}` : ''} ·{' '}
                    {item.actor ?? 'Unknown'}
                    {item.reference ? ` · ${item.reference}` : ''}
                    {item.state ? ` · ${item.state.toLowerCase()}` : ''} ·{' '}
                    {formatDate(item.occurred_at)}
                </p>
            </div>
        </a>
    );
}

function PullRequestRow({ pullRequest }: { pullRequest: PullRequest }) {
    return (
        <a
            href={pullRequest.html_url}
            className="block px-4 py-3 hover:bg-muted/40"
            target="_blank"
            rel="noreferrer"
        >
            <div className="flex items-start justify-between gap-3">
                <p className="line-clamp-2 font-mono text-sm font-medium">
                    #{pullRequest.number} {pullRequest.title}
                </p>
                <Badge variant="secondary" className="shrink-0 text-xs">
                    {pullRequest.merged_at ? 'merged' : pullRequest.state}
                </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
                {pullRequest.repository.full_name} ·{' '}
                {pullRequest.author_login ?? 'Unknown'} ·{' '}
                {formatDate(pullRequest.updated_at_github)}
            </p>
        </a>
    );
}

function ReviewRow({ review }: { review: Review }) {
    return (
        <a
            href={review.html_url ?? undefined}
            className="block px-4 py-3 hover:bg-muted/40"
            target="_blank"
            rel="noreferrer"
        >
            <div className="flex items-start justify-between gap-3">
                <p className="line-clamp-2 font-mono text-sm font-medium">
                    #{review.pull_request.number} {review.pull_request.title}
                </p>
                <Badge variant="secondary" className="shrink-0 text-xs">
                    {review.state.toLowerCase()}
                </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
                {review.author_login ?? 'Unknown'} ·{' '}
                {formatDate(review.submitted_at)}
            </p>
        </a>
    );
}

function StatusMessage({
    children,
    variant = 'neutral',
}: {
    children: ReactNode;
    variant?: 'neutral' | 'success' | 'error';
}) {
    const className = {
        neutral: 'border-border text-muted-foreground',
        success:
            'border-green-200 text-green-700 dark:border-green-900 dark:text-green-400',
        error: 'border-destructive/30 text-destructive',
    }[variant];

    return (
        <div
            className={`rounded-md border px-3 py-2 text-sm font-medium ${className}`}
        >
            {children}
        </div>
    );
}

function activityIcon(type: ActivityItem['type']) {
    const className = 'h-2.5 w-2.5';

    if (type === 'pull_request') {
        return <GitPullRequest className={className} />;
    }

    if (type === 'review') {
        return <MessageSquareText className={className} />;
    }

    return <GitCommitHorizontal className={className} />;
}

function activityLabel(type: ActivityItem['type']) {
    if (type === 'pull_request') {
        return 'Pull request';
    }

    if (type === 'review') {
        return 'Review';
    }

    return 'Commit';
}

function shortRepositoryName(repository: string) {
    return repository.split('/').at(-1) ?? repository;
}

function formatDate(value: string | null) {
    if (value === null) {
        return 'Unknown date';
    }

    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    }).format(new Date(value));
}

function formatRelativeTime(value: string | null) {
    if (value === null) {
        return 'Unknown time';
    }

    const diffInSeconds = Math.round(
        (new Date(value).getTime() - Date.now()) / 1000,
    );
    const divisions = [
        { amount: 60, unit: 'second' },
        { amount: 60, unit: 'minute' },
        { amount: 24, unit: 'hour' },
        { amount: 7, unit: 'day' },
        { amount: 4.34524, unit: 'week' },
        { amount: 12, unit: 'month' },
        { amount: Number.POSITIVE_INFINITY, unit: 'year' },
    ] as const;

    let duration = diffInSeconds;

    for (const division of divisions) {
        if (Math.abs(duration) < division.amount) {
            return new Intl.RelativeTimeFormat(undefined, {
                numeric: 'auto',
            }).format(Math.round(duration), division.unit);
        }

        duration /= division.amount;
    }
}
