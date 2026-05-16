import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChartContainer } from '@/components/ui/chart';
import { Checkbox } from '@/components/ui/checkbox';
import AppearanceToggleTab from '@/components/appearance-tabs';
import SheepIcon from '@/components/sheep-icon';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Heatmap } from '@/components/ui/heatmap';
import {
    PartitionBar,
    PartitionBarSegment,
    PartitionBarSegmentTitle,
    PartitionBarSegmentValue,
} from '@/components/ui/partition-bar';
import { ScrollFade } from '@/components/ui/scroll-fade';
import {
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
    Tooltip as UiTooltip,
} from '@/components/ui/tooltip';
import { destroy, redirect } from '@/routes/github-apps';
import {
    Form,
    Head,
    InfiniteScroll,
    router,
    usePage,
    usePoll,
} from '@inertiajs/react';
import {
    Check,
    GitMerge,
    GitCommitHorizontal,
    GitPullRequest,
    ListChecks,
    MessageSquareText,
    Plus,
    Trash2,
    TrendingDown,
    TrendingUp,
    X,
} from 'lucide-react';
import {
    memo,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
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
    sync_status: 'pending' | 'syncing' | 'complete' | 'failed' | string;
    sync_started_at: string | null;
    sync_finished_at: string | null;
    sync_error: string | null;
    created_at: string;
}

interface Last24HoursSummary {
    activities: number;
    activities_change_percent: number;
    activities_change_direction: 'up' | 'down' | 'unchanged';
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

interface PullRequestStatusItem {
    id: number;
    title: string;
    repository: string | null;
    number: number;
    status:
        | 'draft'
        | 'open'
        | 'approved'
        | 'changes requested'
        | 'commented'
        | 'merged today'
        | 'closed'
        | string;
    url: string;
    updated_at: string | null;
    merged_at: string | null;
}

interface PullRequestToReviewItem {
    id: number;
    title: string;
    repository: string | null;
    url: string;
    author: string | null;
    updated_at: string | null;
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

type AccentColor =
    | 'blue'
    | 'pink'
    | 'green'
    | 'red'
    | 'yellow'
    | 'orange'
    | 'brown'
    | 'purple';

const accentPresets: Record<
    AccentColor,
    {
        label: string;
        color: string;
        soft: string;
        border: string;
        shadow: string;
        scale: string[];
    }
> = {
    blue: {
        label: 'Blue',
        color: 'oklch(68.5% 0.169 237.323)',
        soft: 'oklch(68.5% 0.169 237.323 / 0.1)',
        border: 'oklch(68.5% 0.169 237.323 / 0.3)',
        shadow: 'oklch(68.5% 0.169 237.323 / 0.35)',
        scale: [
            'oklch(50% 0.134 242.749)',
            'oklch(58.8% 0.158 241.966)',
            'oklch(68.5% 0.169 237.323)',
            'oklch(82.8% 0.111 230.318)',
        ],
    },
    pink: {
        label: 'Pink',
        color: 'oklch(65.6% 0.241 354.308)',
        soft: 'oklch(65.6% 0.241 354.308 / 0.1)',
        border: 'oklch(65.6% 0.241 354.308 / 0.3)',
        shadow: 'oklch(65.6% 0.241 354.308 / 0.35)',
        scale: [
            'oklch(52.5% 0.223 3.958)',
            'oklch(59.2% 0.249 0.584)',
            'oklch(65.6% 0.241 354.308)',
            'oklch(82.3% 0.12 346.018)',
        ],
    },
    green: {
        label: 'Green',
        color: 'oklch(72.3% 0.219 149.579)',
        soft: 'oklch(72.3% 0.219 149.579 / 0.1)',
        border: 'oklch(72.3% 0.219 149.579 / 0.3)',
        shadow: 'oklch(72.3% 0.219 149.579 / 0.35)',
        scale: [
            'oklch(44.8% 0.119 151.328)',
            'oklch(62.7% 0.194 149.214)',
            'oklch(72.3% 0.219 149.579)',
            'oklch(87.1% 0.15 154.449)',
        ],
    },
    red: {
        label: 'Red',
        color: 'oklch(63.7% 0.237 25.331)',
        soft: 'oklch(63.7% 0.237 25.331 / 0.1)',
        border: 'oklch(63.7% 0.237 25.331 / 0.3)',
        shadow: 'oklch(63.7% 0.237 25.331 / 0.35)',
        scale: [
            'oklch(50.5% 0.213 27.518)',
            'oklch(57.7% 0.245 27.325)',
            'oklch(63.7% 0.237 25.331)',
            'oklch(80.8% 0.114 19.571)',
        ],
    },
    yellow: {
        label: 'Yellow',
        color: 'oklch(85.2% 0.199 91.936)',
        soft: 'oklch(85.2% 0.199 91.936 / 0.1)',
        border: 'oklch(85.2% 0.199 91.936 / 0.3)',
        shadow: 'oklch(85.2% 0.199 91.936 / 0.35)',
        scale: [
            'oklch(68.1% 0.162 75.834)',
            'oklch(79.5% 0.184 86.047)',
            'oklch(85.2% 0.199 91.936)',
            'oklch(90.5% 0.182 98.111)',
        ],
    },
    orange: {
        label: 'Orange',
        color: 'oklch(70.5% 0.213 47.604)',
        soft: 'oklch(70.5% 0.213 47.604 / 0.1)',
        border: 'oklch(70.5% 0.213 47.604 / 0.3)',
        shadow: 'oklch(70.5% 0.213 47.604 / 0.35)',
        scale: [
            'oklch(55.3% 0.195 38.402)',
            'oklch(64.6% 0.222 41.116)',
            'oklch(70.5% 0.213 47.604)',
            'oklch(83.7% 0.128 66.29)',
        ],
    },
    brown: {
        label: 'Brown',
        color: 'oklch(55.3% 0.135 58.071)',
        soft: 'oklch(55.3% 0.135 58.071 / 0.1)',
        border: 'oklch(55.3% 0.135 58.071 / 0.3)',
        shadow: 'oklch(55.3% 0.135 58.071 / 0.35)',
        scale: [
            'oklch(41.2% 0.098 59.32)',
            'oklch(48.9% 0.118 58.812)',
            'oklch(55.3% 0.135 58.071)',
            'oklch(73.1% 0.093 60.61)',
        ],
    },
    purple: {
        label: 'Purple',
        color: 'oklch(62.7% 0.265 303.9)',
        soft: 'oklch(62.7% 0.265 303.9 / 0.1)',
        border: 'oklch(62.7% 0.265 303.9 / 0.3)',
        shadow: 'oklch(62.7% 0.265 303.9 / 0.35)',
        scale: [
            'oklch(49.6% 0.265 301.924)',
            'oklch(55.8% 0.288 302.321)',
            'oklch(62.7% 0.265 303.9)',
            'oklch(82.7% 0.119 306.383)',
        ],
    },
};

interface Paginated<T> {
    data: T[];
    current_page?: number;
    per_page?: number;
    total?: number;
}

function browserDisplayTimezone(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

interface Props extends Record<string, unknown> {
    canManageConnections: boolean;
    installations: GitHubInstallation[];
    selectedInstallationIds: number[];
    aggregationTimezone: string;
    last24HoursSummary: Last24HoursSummary;
    pullRequestStatusItems: PullRequestStatusItem[];
    pullRequestsToReviewItems: PullRequestToReviewItem[];
    last7DaysActivity: ActivityChartPoint[];
    activityHeatmap: ActivityHeatmap;
    todayActivityByRepository: RepositoryActivityPartition[];
    activityItems: Paginated<ActivityItem>;
    status?: string;
}

export default function GitHubIndex({
    canManageConnections = false,
    installations = [],
    selectedInstallationIds: initialSelectedInstallationIds = [],
    aggregationTimezone = 'UTC',
    last24HoursSummary = {
        activities: 0,
        activities_change_percent: 0,
        activities_change_direction: 'unchanged',
        repos_touched: 0,
        prs_updated: 0,
        prs_merged: 0,
        production_deploys: null,
    },
    pullRequestStatusItems = [],
    pullRequestsToReviewItems = [],
    last7DaysActivity = [],
    activityHeatmap = {
        start_date: new Date().toISOString().slice(0, 10),
        end_date: new Date().toISOString().slice(0, 10),
        total: 0,
        data: [],
    },
    todayActivityByRepository = [],
    status,
}: Props) {
    const [selectedInstallationIds, setSelectedInstallationIds] = useState<
        number[]
    >(() => initialSelectedInstallationIds);
    const [accentColor, setAccentColor] = useState<AccentColor>(() => {
        if (typeof window === 'undefined') {
            return 'blue';
        }

        const saved = window.localStorage.getItem('sheep-accent');

        return saved !== null && saved in accentPresets
            ? (saved as AccentColor)
            : 'blue';
    });
    const accent = accentPresets[accentColor];
    const displayTimezone = useMemo(() => browserDisplayTimezone(), []);
    const hasSyncInProgress = installations.some((installation) =>
        ['pending', 'syncing'].includes(installation.sync_status),
    );
    const hasFailedSync = installations.some(
        (installation) => installation.sync_status === 'failed',
    );

    usePoll(10000, {
        only: [
            'installations',
            'last24HoursSummary',
            'pullRequestStatusItems',
            'pullRequestsToReviewItems',
            'last7DaysActivity',
            'activityHeatmap',
            'todayActivityByRepository',
            'activityItems',
        ],
        headers: {
            'X-Inertia-Infinite-Scroll-Merge-Intent': 'prepend',
        },
        data: {
            account_filter: 1,
            selected_installations: selectedInstallationIds,
            timezone: displayTimezone,
            activity: 1,
        },
    });

    useEffect(() => {
        if (aggregationTimezone === displayTimezone) {
            return;
        }

        router.reload({
            only: [
                'aggregationTimezone',
                'last24HoursSummary',
                'pullRequestStatusItems',
                'pullRequestsToReviewItems',
                'last7DaysActivity',
                'activityHeatmap',
                'todayActivityByRepository',
            ],
            data: {
                account_filter: 1,
                selected_installations: selectedInstallationIds,
                timezone: displayTimezone,
            },
        });
    }, [
        aggregationTimezone,
        displayTimezone,
        selectedInstallationIds,
    ]);

    useEffect(() => {
        setSelectedInstallationIds(initialSelectedInstallationIds);
    }, [initialSelectedInstallationIds]);

    const updateAccentColor = (color: AccentColor) => {
        setAccentColor(color);
        window.localStorage.setItem('sheep-accent', color);
    };

    return (
        <main
            className="min-h-screen bg-background [background-image:radial-gradient(circle_at_1px_1px,color-mix(in_oklch,#000000_11%,transparent)_0.75px,transparent_0)] [background-size:13px_13px] text-foreground dark:[background-image:radial-gradient(circle_at_1px_1px,color-mix(in_oklch,#ffffff_8%,transparent)_0.75px,transparent_0)]"
            style={
                {
                    '--sheep-accent': accent.color,
                    '--sheep-accent-soft': accent.soft,
                    '--sheep-accent-border': accent.border,
                    '--sheep-accent-shadow': accent.shadow,
                    '--sheep-accent-1': accent.scale[0],
                    '--sheep-accent-2': accent.scale[1],
                    '--sheep-accent-3': accent.scale[2],
                    '--sheep-accent-4': accent.scale[3],
                } as React.CSSProperties
            }
        >
            <Head />

            <TopNav
                installations={installations}
                selectedInstallationIds={selectedInstallationIds}
                displayTimezone={displayTimezone}
                onSelectedInstallationIdsChange={setSelectedInstallationIds}
                accentColor={accentColor}
                onAccentColorChange={updateAccentColor}
                canManageConnections={canManageConnections}
            />

            <div className="mx-auto flex min-h-screen w-full min-w-0 max-w-6xl flex-col px-4 pt-4 pb-10 sm:px-6">
                <div className="min-w-0 space-y-6">
                    {status === 'github-app-connected' && (
                        <StatusMessage variant="success">
                            GitHub account connected. We are syncing its
                            activity in the background.
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

                    {status === 'github-app-misconfigured' && (
                        <StatusMessage variant="error">
                            GitHub App is not configured on the server. Set
                            GITHUB_APP_NAME to your app&apos;s URL slug in
                            production, then run config:cache.
                        </StatusMessage>
                    )}

                    {installations.length === 0 ? (
                        <EmptyState canManageConnections={canManageConnections} />
                    ) : (
                        <>
                            {hasSyncInProgress && (
                                <StatusMessage>
                                    GitHub sync is running. Keep the queue worker
                                    on while we pull the last month of activity.
                                </StatusMessage>
                            )}

                            {hasFailedSync && (
                                <StatusMessage variant="error">
                                    One GitHub sync failed. The account row shows
                                    the latest error from the queued job.
                                </StatusMessage>
                            )}

                            {last24HoursSummary.activities === 0 && (
                                <StatusMessage>
                                    Connected, but no synced GitHub activity is
                                    stored for the last 24 hours.
                                </StatusMessage>
                            )}

                            <Last24HoursSummaryCards
                                summary={last24HoursSummary}
                                repositories={todayActivityByRepository}
                            />

                            <ActivityDashboardGrid
                                selectedInstallationIds={selectedInstallationIds}
                                displayTimezone={displayTimezone}
                                pullRequests={pullRequestStatusItems}
                                reviewRequests={pullRequestsToReviewItems}
                            />

                            <ActivityChartsGrid
                                last7DaysActivity={last7DaysActivity}
                                activityHeatmap={activityHeatmap}
                            />
                        </>
                    )}
                </div>
            </div>
        </main>
    );
}

function TopNav({
    installations,
    selectedInstallationIds,
    displayTimezone,
    onSelectedInstallationIdsChange,
    accentColor,
    onAccentColorChange,
    canManageConnections,
}: {
    installations: GitHubInstallation[];
    selectedInstallationIds: number[];
    displayTimezone: string;
    onSelectedInstallationIdsChange: (installationIds: number[]) => void;
    accentColor: AccentColor;
    onAccentColorChange: (color: AccentColor) => void;
    canManageConnections: boolean;
}) {
    return (
        <div className="sticky top-0 z-40">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-background via-background/80 to-transparent" />
            <nav className="relative mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
                <a
                    href="/"
                    className="flex items-center gap-2 font-mono text-sm font-semibold"
                >
                    <SheepIcon className="h-8 w-8 shrink-0" />
                    Sheep
                </a>

                <div className="flex items-center gap-5">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-0 font-mono text-xs text-muted-foreground"
                        disabled
                    >
                        Insights
                    </Button>
                    <SettingsDialog
                        accentColor={accentColor}
                        onAccentColorChange={onAccentColorChange}
                    />
                    <AccountsDialog
                        installations={installations}
                        selectedInstallationIds={selectedInstallationIds}
                        displayTimezone={displayTimezone}
                        onSelectedInstallationIdsChange={
                            onSelectedInstallationIdsChange
                        }
                        canManageConnections={canManageConnections}
                    />
                </div>
            </nav>
        </div>
    );
}

function AccountsDialog({
    installations,
    selectedInstallationIds,
    displayTimezone,
    onSelectedInstallationIdsChange,
    canManageConnections,
}: {
    installations: GitHubInstallation[];
    selectedInstallationIds: number[];
    displayTimezone: string;
    onSelectedInstallationIdsChange: (installationIds: number[]) => void;
    canManageConnections: boolean;
}) {
    const selectedInstallationIdSet = useMemo(
        () => new Set(selectedInstallationIds),
        [selectedInstallationIds],
    );
    const reloadDashboard = (nextInstallationIds: number[]) => {
        onSelectedInstallationIdsChange(nextInstallationIds);

        router.reload({
            only: [
                'selectedInstallationIds',
                'aggregationTimezone',
                'activityItems',
                'last24HoursSummary',
                'pullRequestStatusItems',
                'pullRequestsToReviewItems',
                'last7DaysActivity',
                'activityHeatmap',
                'todayActivityByRepository',
            ],
            reset: ['activityItems'],
            data: {
                account_filter: 1,
                selected_installations: nextInstallationIds,
                timezone: displayTimezone,
            },
        });
    };
    const toggleInstallation = (installationId: number, checked: boolean) => {
        const nextInstallationIds = checked
            ? [...selectedInstallationIds, installationId]
            : selectedInstallationIds.filter((id) => id !== installationId);

        reloadDashboard([...new Set(nextInstallationIds)]);
    };

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-0 font-mono text-xs"
                >
                    Accounts
                    {installations.length > 0 && (
                        <span className="ml-1 text-muted-foreground">
                            {installations.length}
                        </span>
                    )}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle className="font-mono">
                        Connected Accounts
                    </DialogTitle>
                    <DialogDescription>
                        GitHub App installations feeding this dashboard.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {installations.length === 0 ? (
                        <div className="rounded-md border border-dashed px-4 py-8 text-center">
                            <SheepIcon className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
                            <p className="font-mono text-sm font-medium">
                                No accounts connected
                            </p>
                        </div>
                    ) : (
                        <ConnectedAccounts
                            installations={installations}
                            selectedInstallationIdSet={selectedInstallationIdSet}
                            onToggleInstallation={toggleInstallation}
                            canManageConnections={canManageConnections}
                        />
                    )}

                    {canManageConnections && (
                        <Button asChild className="w-full" size="sm">
                            <a href={redirect.url()}>
                                <Plus className="h-4 w-4" />
                                Connect GitHub
                            </a>
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

function SettingsDialog({
    accentColor,
    onAccentColorChange,
}: {
    accentColor: AccentColor;
    onAccentColorChange: (color: AccentColor) => void;
}) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-0 font-mono text-xs text-muted-foreground"
                >
                    Settings
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="font-mono">Settings</DialogTitle>
                    <DialogDescription>
                        Adjust the dashboard appearance.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5">
                    <div className="space-y-2">
                        <p className="font-mono text-xs font-medium">
                            Appearance
                        </p>
                        <AppearanceToggleTab />
                    </div>

                    <div className="space-y-2">
                        <p className="font-mono text-xs font-medium">
                            Accent color
                        </p>
                        <div className="grid grid-cols-4 gap-2">
                            {(Object.keys(accentPresets) as AccentColor[]).map(
                                (color) => {
                                    const preset = accentPresets[color];
                                    const isSelected = accentColor === color;

                                    return (
                                        <button
                                            key={color}
                                            type="button"
                                            onClick={() =>
                                                onAccentColorChange(color)
                                            }
                                            className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-left font-mono text-xs transition-colors hover:bg-muted ${isSelected ? 'border-[var(--sheep-accent)] bg-[var(--sheep-accent-soft)] text-foreground' : 'border-border text-muted-foreground'}`}
                                        >
                                            <span
                                                className="h-3 w-3 shrink-0 rounded-full"
                                                style={{
                                                    backgroundColor:
                                                        preset.color,
                                                    boxShadow: `0 0 8px ${preset.shadow}`,
                                                }}
                                            />
                                            {preset.label}
                                        </button>
                                    );
                                },
                            )}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function EmptyState({ canManageConnections }: { canManageConnections: boolean }) {
    return (
        <section className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
            <SheepIcon className="mb-3 h-16 w-16 text-muted-foreground" />
            <p className="font-mono text-sm font-medium">
                No GitHub accounts connected
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
                Connect a GitHub account to start tracking your activity.
            </p>
            {canManageConnections && (
                <Button asChild className="mt-4" size="sm">
                    <a href={redirect.url()}>
                        <Plus className="h-4 w-4" />
                        Connect GitHub
                    </a>
                </Button>
            )}
        </section>
    );
}

function ConnectedAccounts({
    installations,
    selectedInstallationIdSet,
    onToggleInstallation,
    canManageConnections,
}: {
    installations: GitHubInstallation[];
    selectedInstallationIdSet: Set<number>;
    onToggleInstallation: (installationId: number, checked: boolean) => void;
    canManageConnections: boolean;
}) {
    return (
        <ul className="divide-y divide-border rounded-md border">
            {installations.map((installation) => (
                <li
                    key={installation.id}
                    className="flex items-center justify-between gap-4 px-4 py-3"
                >
                    <div className="flex min-w-0 items-center gap-3">
                        <Checkbox
                            checked={selectedInstallationIdSet.has(
                                installation.id,
                            )}
                            onCheckedChange={(checked) =>
                                onToggleInstallation(
                                    installation.id,
                                    checked === true,
                                )
                            }
                            aria-label={`Include ${installation.account_login} activity in dashboard`}
                        />
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
                        <SyncStatusBadge installation={installation} />
                    </div>

                    {canManageConnections && (
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
                    )}
                </li>
            ))}
        </ul>
    );
}

function SyncStatusBadge({
    installation,
}: {
    installation: GitHubInstallation;
}) {
    const status = installation.sync_status;
    const label =
        status === 'complete'
            ? 'synced'
            : status === 'syncing'
              ? 'syncing'
              : status === 'failed'
                ? 'failed'
                : 'pending';
    const title =
        status === 'failed'
            ? (installation.sync_error ?? 'GitHub sync failed')
            : status === 'complete' && installation.sync_finished_at
              ? `Synced ${formatRelativeTime(installation.sync_finished_at)}`
              : undefined;
    const className =
        {
            complete:
                'border-green-500/40 bg-green-500/10 text-green-500 dark:text-green-400',
            syncing:
                'border-sky-500/40 bg-sky-500/10 text-sky-500 dark:text-sky-400',
            pending:
                'border-amber-500/40 bg-amber-500/10 text-amber-500 dark:text-amber-400',
            failed: 'border-destructive/40 bg-destructive/10 text-destructive',
        }[status] ?? 'border-border text-muted-foreground';

    return (
        <Badge
            variant="outline"
            className={`font-mono text-[0.65rem] ${className}`}
            title={title}
        >
            {label}
        </Badge>
    );
}

function Last24HoursSummaryCards({
    summary,
    repositories,
}: {
    summary: Last24HoursSummary;
    repositories: RepositoryActivityPartition[];
}) {

    return (
        <section className="space-y-3">
            <h2 className="font-mono text-sm font-semibold">Last 24h</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <MiniSummaryCard
                    label="activities"
                    value={
                        <span className="inline-flex flex-wrap items-baseline gap-x-1">
                            <span>{summary.activities}</span>
                            <span
                                className={`inline-flex items-center gap-0.5 font-mono text-[0.65rem] font-medium leading-none ${
                                    summary.activities_change_direction ===
                                    'up'
                                        ? 'text-emerald-500'
                                        : summary.activities_change_direction ===
                                            'down'
                                          ? 'text-red-500'
                                          : 'text-muted-foreground'
                                }`}
                            >
                                (
                                {summary.activities_change_direction ===
                                'unchanged'
                                    ? '0%'
                                    : `${summary.activities_change_percent}%`}
                                {summary.activities_change_direction ===
                                'up' ? (
                                    <TrendingUp className="h-2.5 w-2.5" />
                                ) : summary.activities_change_direction ===
                                  'down' ? (
                                    <TrendingDown className="h-2.5 w-2.5" />
                                ) : null}
                                )
                            </span>
                        </span>
                    }
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
            <TodayRepositoryPartition repositories={repositories} />
        </section>
    );
}

function MiniSummaryCard({
    label,
    value,
    muted = false,
}: {
    label: string;
    value: number | string | ReactNode;
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

function PullRequestPanelEmptyState({
    icon,
    children,
}: {
    icon: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <div className="mb-2 text-muted-foreground/50">{icon}</div>
            <p className="max-w-[16rem] font-mono text-xs leading-relaxed text-muted-foreground">
                {children}
            </p>
        </div>
    );
}

function PullRequestStatusPanel({
    pullRequests,
}: {
    pullRequests: PullRequestStatusItem[];
}) {
    return (
        <section className="flex h-52 min-h-0 flex-col gap-3">
            <div className="flex shrink-0 items-end justify-between gap-4">
                <h2 className="font-mono text-sm font-semibold">PR Status</h2>
                <p className="font-mono text-xs text-muted-foreground">
                    {pullRequests.length} total
                </p>
            </div>

            <div className="min-h-0 flex-1">
            {pullRequests.length === 0 ? (
                <PullRequestPanelEmptyState
                    icon={<GitPullRequest className="h-6 w-6" />}
                >
                    No open or recently merged PRs for selected accounts.
                </PullRequestPanelEmptyState>
            ) : (
                <TooltipProvider delayDuration={100}>
                        <ScrollFade
                            axis="vertical"
                            intensity={0.85}
                            className="h-full"
                        >
                    <div className="grid gap-1.5">
                        {pullRequests.map((pullRequest) => (
                            <a
                                key={pullRequest.id}
                                href={pullRequest.url}
                                target="_blank"
                                rel="noreferrer"
                                className="group grid grid-cols-[1rem_minmax(0,1fr)] gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--sheep-accent-soft)]"
                            >
                        <PullRequestStatusIndicator status={pullRequest.status} />

                        <div className="min-w-0">
                            <div className="mb-0.5 flex min-w-0 flex-wrap items-center gap-2">
                                <Badge
                                    variant="outline"
                                    className="h-4 max-w-full rounded-sm border-[var(--sheep-accent-border)] bg-[var(--sheep-accent-soft)] px-1.5 font-mono text-[0.6rem] leading-none text-[var(--sheep-accent)]"
                                    title={
                                        pullRequest.repository ??
                                        'Unknown repo'
                                    }
                                >
                                {pullRequest.repository
                                    ? shortRepositoryName(
                                          pullRequest.repository,
                                      )
                                    : 'Unknown repo'}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                    #{pullRequest.number}
                                    {pullRequest.merged_at
                                        ? ` · ${formatRelativeTime(pullRequest.merged_at)}`
                                        : pullRequest.updated_at
                                          ? ` · ${formatRelativeTime(pullRequest.updated_at)}`
                                          : ''}
                                </span>
                            </div>
                            <p
                                className="line-clamp-1 font-mono text-xs leading-snug font-medium group-hover:underline"
                                title={pullRequest.title}
                            >
                                {pullRequest.title}
                            </p>
                        </div>
                    </a>
                ))}
                    </div>
                        </ScrollFade>
                </TooltipProvider>
            )}
            </div>
        </section>
    );
}

function PullRequestsToReviewPanel({
    reviewRequests,
}: {
    reviewRequests: PullRequestToReviewItem[];
}) {
    return (
        <section className="flex h-52 min-h-0 flex-col gap-3">
            <div className="flex shrink-0 items-end justify-between gap-4">
                <h2 className="font-mono text-sm font-semibold">
                    Pending Reviews
                </h2>
                <p className="font-mono text-xs text-muted-foreground">
                    {reviewRequests.length} total
                </p>
            </div>

            <div className="min-h-0 flex-1">
            {reviewRequests.length === 0 ? (
                <PullRequestPanelEmptyState
                    icon={<ListChecks className="h-6 w-6" />}
                >
                    No open PRs are requesting review from selected accounts.
                </PullRequestPanelEmptyState>
            ) : (
                    <ScrollFade
                        axis="vertical"
                        intensity={0.85}
                        className="h-full"
                    >
                <div className="grid gap-1.5">
                    {reviewRequests.map((pullRequest) => (
                        <a
                            key={pullRequest.id}
                            href={pullRequest.url}
                            target="_blank"
                            rel="noreferrer"
                            className="group block rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--sheep-accent-soft)]"
                        >
                            <div className="mb-0.5 flex min-w-0 flex-wrap items-center gap-2">
                                <Badge
                                    variant="outline"
                                    className="h-4 max-w-full rounded-sm border-[var(--sheep-accent-border)] bg-[var(--sheep-accent-soft)] px-1.5 font-mono text-[0.6rem] leading-none text-[var(--sheep-accent)]"
                                    title={
                                        pullRequest.repository ??
                                        'Unknown repo'
                                    }
                                >
                                    {pullRequest.repository
                                        ? shortRepositoryName(
                                              pullRequest.repository,
                                          )
                                        : 'Unknown repo'}
                                </Badge>
                                <span className="min-w-0 text-xs text-muted-foreground">
                                    {pullRequest.author
                                        ? `By ${pullRequest.author}`
                                        : 'Unknown author'}
                                    {pullRequest.updated_at
                                        ? ` · ${formatRelativeTime(pullRequest.updated_at)}`
                                        : ''}
                                </span>
                            </div>
                            <p
                                className="line-clamp-1 font-mono text-xs leading-snug font-medium group-hover:underline"
                                title={pullRequest.title}
                            >
                                {pullRequest.title}
                            </p>
                        </a>
                    ))}
                </div>
                    </ScrollFade>
            )}
            </div>
        </section>
    );
}

function PullRequestStatusIndicator({ status }: { status: string }) {
    const details = pullRequestStatusDetails(status);

    return (
        <UiTooltip>
            <TooltipTrigger asChild>
                <span
                    aria-label={details.label}
                    className={`mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border ${details.className}`}
                >
                    {details.icon}
                </span>
            </TooltipTrigger>
            <TooltipContent>
                <p className="font-mono text-xs">{details.label}</p>
            </TooltipContent>
        </UiTooltip>
    );
}

function pullRequestStatusDetails(status: string): {
    label: string;
    className: string;
    icon: ReactNode;
} {
    const iconClassName = 'h-2.5 w-2.5';

    if (status === 'approved') {
        return {
            label: 'Approved',
            className:
                'border-emerald-500/50 bg-emerald-500/15 text-emerald-500 shadow-[0_0_6px_rgb(16_185_129_/_0.35)]',
            icon: <Check className={iconClassName} />,
        };
    }

    if (status === 'merged today') {
        return {
            label: 'Merged today',
            className:
                'border-violet-500/50 bg-violet-500/15 text-violet-500 shadow-[0_0_6px_rgb(139_92_246_/_0.35)]',
            icon: <GitMerge className={iconClassName} />,
        };
    }

    if (status === 'closed') {
        return {
            label: 'Closed',
            className:
                'border-red-500/50 bg-red-500/15 text-red-500 shadow-[0_0_6px_rgb(239_68_68_/_0.35)]',
            icon: <X className={iconClassName} />,
        };
    }

    if (status === 'changes requested' || status === 'commented') {
        return {
            label: status === 'changes requested' ? 'Changes requested' : 'Has comments',
            className:
                'border-amber-400/50 bg-amber-400/15 text-amber-400 shadow-[0_0_6px_rgb(251_191_36_/_0.35)]',
            icon: <MessageSquareText className={iconClassName} />,
        };
    }

    if (status === 'draft') {
        return {
            label: 'Draft',
            className:
                'border-muted-foreground/40 bg-muted-foreground/10 text-muted-foreground',
            icon: <GitPullRequest className={iconClassName} />,
        };
    }

    return {
        label: 'Open',
        className:
            'border-[var(--sheep-accent-border)] bg-[var(--sheep-accent-soft)] text-[var(--sheep-accent)] shadow-[0_0_6px_var(--sheep-accent-shadow)]',
        icon: <GitPullRequest className={iconClassName} />,
    };
}

function TodayRepositoryPartition({
    repositories,
}: {
    repositories: RepositoryActivityPartition[];
}) {
    const colors = [
        'bg-[var(--sheep-accent-4)]',
        'bg-[var(--sheep-accent-3)]',
        'bg-[var(--sheep-accent-2)]',
        'bg-[var(--sheep-accent-1)]',
    ];

    return (
        <div>
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
        </div>
    );
}

function ActivityDashboardGrid({
    selectedInstallationIds,
    displayTimezone,
    pullRequests,
    reviewRequests,
}: {
    selectedInstallationIds: number[];
    displayTimezone: string;
    pullRequests: PullRequestStatusItem[];
    reviewRequests: PullRequestToReviewItem[];
}) {
    const prColumnRef = useRef<HTMLDivElement>(null);
    const [feedHeight, setFeedHeight] = useState<number | null>(null);

    useEffect(() => {
        const element = prColumnRef.current;

        if (!element) {
            return;
        }

        const updateFeedHeight = (): void => {
            if (!window.matchMedia('(min-width: 1024px)').matches) {
                setFeedHeight(null);

                return;
            }

            setFeedHeight(element.getBoundingClientRect().height);
        };

        updateFeedHeight();

        const resizeObserver = new ResizeObserver(updateFeedHeight);
        resizeObserver.observe(element);
        window.addEventListener('resize', updateFeedHeight);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', updateFeedHeight);
        };
    }, [pullRequests, reviewRequests]);

    return (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <div
                className="order-3 h-96 min-h-0 min-w-0 shrink-0 overflow-hidden lg:order-1 lg:w-1/2"
                style={
                    feedHeight !== null ? { height: feedHeight } : undefined
                }
            >
                <ActivityFeedPanel
                    selectedInstallationIds={selectedInstallationIds}
                    displayTimezone={displayTimezone}
                />
            </div>

            <div
                ref={prColumnRef}
                className="order-1 flex min-w-0 flex-col gap-6 lg:order-2 lg:w-1/2"
            >
                <div className="min-h-0 flex-1 overflow-hidden">
                    <PullRequestStatusPanel pullRequests={pullRequests} />
                </div>
                <div className="min-h-0 flex-1 overflow-hidden">
                    <PullRequestsToReviewPanel
                        reviewRequests={reviewRequests}
                    />
                </div>
            </div>
        </div>
    );
}

function ActivityChartsGrid({
    last7DaysActivity,
    activityHeatmap,
}: {
    last7DaysActivity: ActivityChartPoint[];
    activityHeatmap: ActivityHeatmap;
}) {
    return (
        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
            <Last7DaysActivityChart data={last7DaysActivity} />
            <ActivityHeatmapPanel heatmap={activityHeatmap} />
        </div>
    );
}

function ActivityFeedPanel({
    selectedInstallationIds,
    displayTimezone,
}: {
    selectedInstallationIds: number[];
    displayTimezone: string;
}) {
    const { activityItems } = usePage<Props>().props;
    const previousActivityIds = useRef<string[] | null>(null);
    const animationTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [newActivityItemIds, setNewActivityItemIds] = useState<Set<string>>(
        () => new Set(),
    );
    const items = useMemo(() => activityItems.data ?? [], [activityItems.data]);

    useEffect(() => {
        const currentIds = items.map((item) => item.id);
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
    }, [items]);

    return (
        <section className="flex h-full min-h-0 flex-col">
            <h2 className="mb-3 shrink-0 font-mono text-sm font-semibold">
                Activity Feed
            </h2>
            <div className="min-h-0 flex-1 overflow-hidden">
                <ActivityTimeline
                    selectedInstallationIds={selectedInstallationIds}
                    displayTimezone={displayTimezone}
                    newItemIds={newActivityItemIds}
                />
            </div>
        </section>
    );
}

function ActivityHeatmapPanel({ heatmap }: { heatmap: ActivityHeatmap }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [cellSize, setCellSize] = useState(13);

    const weekCount = useMemo(() => {
        const start = new Date(`${heatmap.start_date}T00:00:00`);
        const end = new Date(`${heatmap.end_date}T00:00:00`);
        const dayCount =
            Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;

        return Math.ceil((dayCount + start.getDay()) / 7);
    }, [heatmap.end_date, heatmap.start_date]);

    useEffect(() => {
        const element = containerRef.current;

        if (!element) {
            return;
        }

        const updateCellSize = (): void => {
            const gap = 3;
            const labelColumn = 18;
            const availableWidth = element.clientWidth - labelColumn;
            const nextCellSize = Math.floor(
                (availableWidth - gap * (weekCount - 1)) / weekCount,
            );

            setCellSize(Math.max(7, Math.min(13, nextCellSize)));
        };

        updateCellSize();

        const resizeObserver = new ResizeObserver(updateCellSize);
        resizeObserver.observe(element);
        window.addEventListener('resize', updateCellSize);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', updateCellSize);
        };
    }, [weekCount]);

    return (
        <section className="min-w-0 space-y-3">
            <h2 className="font-mono text-sm font-semibold">
                Activity Heatmap
            </h2>

            <div
                ref={containerRef}
                className="min-w-0 rounded-md border bg-background/35 p-3"
            >
                <Heatmap
                    data={heatmap.data}
                    startDate={new Date(`${heatmap.start_date}T00:00:00`)}
                    endDate={new Date(`${heatmap.end_date}T00:00:00`)}
                    colorMode="discrete"
                    colorScale={[
                        'oklch(26.9% 0 0 / 0.72)',
                        'var(--sheep-accent-1)',
                        'var(--sheep-accent-2)',
                        'var(--sheep-accent-3)',
                        'var(--sheep-accent-4)',
                    ]}
                    cellSize={cellSize}
                    gap={3}
                    daysOfTheWeek="single letter"
                    className="w-full font-mono"
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
        <section className="min-w-0 space-y-3">
            <h2 className="font-mono text-sm font-semibold">Last 7 Days</h2>

            <div className="min-w-0 overflow-hidden rounded-md border bg-background/35 p-3">
                <ChartContainer>
                    <AreaChart
                        accessibilityLayer
                        data={data}
                        margin={{ left: 0, right: 4, top: 14, bottom: 0 }}
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
                                    stopColor="var(--sheep-accent)"
                                    stopOpacity={0.46}
                                />
                                <stop
                                    offset="95%"
                                    stopColor="var(--sheep-accent)"
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
                            tickMargin={8}
                            minTickGap={8}
                            tick={{ fontSize: 10 }}
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tickMargin={4}
                            allowDecimals={false}
                            width={24}
                            tick={{ fontSize: 10 }}
                        />
                        <Tooltip
                            cursor={{
                                stroke: 'var(--sheep-accent)',
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
                            stroke="var(--sheep-accent)"
                            strokeWidth={2}
                            fill="url(#activity-total)"
                            dot={{
                                r: 3,
                                fill: 'var(--sheep-accent)',
                                strokeWidth: 0,
                            }}
                            activeDot={{
                                r: 4,
                                fill: 'var(--sheep-accent)',
                                strokeWidth: 0,
                            }}
                        />
                    </AreaChart>
                </ChartContainer>
            </div>
        </section>
    );
}

const ActivityTimeline = function ActivityTimeline({
    selectedInstallationIds,
    displayTimezone,
    newItemIds,
}: {
    selectedInstallationIds: number[];
    displayTimezone: string;
    newItemIds: Set<string>;
}) {
    const { activityItems } = usePage<Props>().props;
    const items = activityItems.data ?? [];
    const infiniteScrollParams = useMemo(
        () => ({
            data: {
                account_filter: 1,
                selected_installations: selectedInstallationIds,
                timezone: displayTimezone,
            },
        }),
        [displayTimezone, selectedInstallationIds],
    );

    if (items.length === 0) {
        return (
            <div className="flex h-full min-h-48 items-center justify-center px-6 py-10 text-center">
                <div>
                    <GitCommitHorizontal className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
                    <p className="font-mono text-sm font-medium">
                        No activity yet
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Commits, pull requests, and reviews will stream in here.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div
            className="relative flex h-full min-h-0 flex-col [--timeline-color:var(--sheep-accent)]"
            style={
                {
                    '--timeline-color': 'var(--sheep-accent)',
                } as React.CSSProperties
            }
        >
            <ScrollFade
                axis="vertical"
                intensity={0.85}
                className="h-full px-3"
            >
                <InfiniteScroll
                    data="activityItems"
                    onlyNext
                    preserveUrl={false}
                    buffer={240}
                    params={infiniteScrollParams}
                    itemsElement="#activity-timeline-items"
                    loading={
                        <p className="py-2 pl-9 text-xs text-muted-foreground">
                            Loading more activity...
                        </p>
                    }
                    next={({ hasMore, fetch, loading }) =>
                        hasMore ? (
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
};

const ActivityTimelineItem = memo(function ActivityTimelineItem({
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
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[0.68rem] leading-none text-muted-foreground">
                        {formatRelativeTime(item.occurred_at)}
                    </span>
                    {item.repository && (
                        <Badge
                            variant="outline"
                            className="h-4 max-w-36 truncate rounded-sm border-[var(--sheep-accent-border)] bg-[var(--sheep-accent-soft)] px-1.5 font-mono text-[0.6rem] leading-none text-[var(--sheep-accent)]"
                            title={item.repository}
                        >
                            {shortRepositoryName(item.repository)}
                        </Badge>
                    )}
                    <Badge
                        variant="outline"
                        className="h-4 rounded-sm border-muted-foreground/25 px-1.5 font-mono text-[0.6rem] leading-none text-muted-foreground"
                    >
                        {activityLabel(item.type)}
                    </Badge>
                </div>
                <p
                    className="line-clamp-1 font-mono text-xs leading-snug font-medium group-hover:line-clamp-none group-hover:underline"
                    title={item.title}
                >
                    {item.title}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.actor ?? 'Unknown'}
                    {item.reference ? ` · ${item.reference}` : ''}
                    {item.state ? ` · ${item.state.toLowerCase()}` : ''} ·{' '}
                    {formatDate(item.occurred_at)}
                </p>
            </div>
        </a>
    );
});

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
            'border-[var(--sheep-accent-border)] bg-[var(--sheep-accent-soft)] text-[var(--sheep-accent)]',
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
