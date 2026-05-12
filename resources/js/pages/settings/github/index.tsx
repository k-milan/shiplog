import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { destroy, redirect } from '@/routes/github-apps';
import { Form, Head, InfiniteScroll } from '@inertiajs/react';
import {
    GitBranch,
    GitCommitHorizontal,
    GitPullRequest,
    MessageSquareText,
    Plus,
    Trash2,
} from 'lucide-react';
import { type ReactNode } from 'react';

interface GitHubInstallation {
    id: number;
    installation_id: number;
    account_login: string;
    account_type: string;
    account_name: string | null;
    avatar_url: string | null;
    created_at: string;
}

interface Summary {
    repositories: number;
    commits: number;
    pull_requests: number;
    reviews: number;
}

interface Repository {
    id: number;
    full_name: string;
    private: boolean;
    default_branch: string | null;
    html_url: string;
    pushed_at: string | null;
    commits_count: number;
    pull_requests_count: number;
}

interface Commit {
    id: number;
    sha: string;
    message: string | null;
    author_login: string | null;
    author_name: string | null;
    authored_at: string | null;
    html_url: string | null;
    repository: {
        full_name: string;
    };
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
    summary: Summary;
    repositories: Repository[];
    recentCommits: Paginated<Commit>;
    recentPullRequests: PullRequest[];
    recentReviews: Review[];
    status?: string;
}

export default function GitHubIndex({
    installations,
    summary,
    repositories,
    recentCommits,
    recentPullRequests,
    recentReviews,
    status,
}: Props) {
    const hasData =
        summary.repositories > 0 ||
        summary.commits > 0 ||
        summary.pull_requests > 0 ||
        summary.reviews > 0;

    return (
        <main className="min-h-screen bg-background text-foreground [background-image:radial-gradient(circle_at_1px_1px,color-mix(in_oklch,var(--foreground)_22%,transparent)_1px,transparent_0)] [background-size:13px_13px]">
            <Head title="Shiplog" />

            <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col bg-background/45 px-4 py-10 backdrop-blur-[0.5px] sm:px-6">
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

                            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <MetricCard
                                    icon={<GitBranch className="h-4 w-4" />}
                                    label="Repositories"
                                    value={summary.repositories}
                                />
                                <MetricCard
                                    icon={
                                        <GitCommitHorizontal className="h-4 w-4" />
                                    }
                                    label="Commits"
                                    value={summary.commits}
                                />
                                <MetricCard
                                    icon={
                                        <GitPullRequest className="h-4 w-4" />
                                    }
                                    label="Pull Requests"
                                    value={summary.pull_requests}
                                />
                                <MetricCard
                                    icon={
                                        <MessageSquareText className="h-4 w-4" />
                                    }
                                    label="Reviews"
                                    value={summary.reviews}
                                />
                            </section>

                            {!hasData && (
                                <StatusMessage>
                                    Connected, but no synced GitHub activity is
                                    stored yet.
                                </StatusMessage>
                            )}

                            <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
                                <Panel title="Repositories">
                                    <div className="divide-y divide-border">
                                        {repositories.map((repository) => (
                                            <RepositoryRow
                                                key={repository.id}
                                                repository={repository}
                                            />
                                        ))}
                                    </div>
                                </Panel>

                                <section className="min-w-0">
                                    <h2 className="mb-3 font-mono text-sm font-semibold">
                                        Recent Commits
                                    </h2>
                                    <CommitTimeline
                                        commits={recentCommits.data}
                                    />
                                </section>
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

function MetricCard({
    icon,
    label,
    value,
}: {
    icon: ReactNode;
    label: string;
    value: number;
}) {
    return (
        <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
                {icon}
                {label}
            </div>
            <p className="mt-3 font-mono text-3xl font-semibold tabular-nums">
                {value}
            </p>
        </div>
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

function RepositoryRow({ repository }: { repository: Repository }) {
    return (
        <a
            href={repository.html_url}
            className="block px-4 py-3 hover:bg-muted/40"
            target="_blank"
            rel="noreferrer"
        >
            <div className="flex items-center justify-between gap-3">
                <p className="truncate font-mono text-sm font-medium">
                    {repository.full_name}
                </p>
                <Badge variant="outline" className="text-xs">
                    {repository.private ? 'Private' : 'Public'}
                </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
                {repository.commits_count} commits ·{' '}
                {repository.pull_requests_count} PRs ·{' '}
                {repository.default_branch ?? 'branch unknown'}
            </p>
        </a>
    );
}

function CommitTimeline({ commits }: { commits: Commit[] }) {
    return (
        <div
            className="relative [--timeline-color:theme(colors.green.500)]"
            style={
                {
                    '--timeline-color': 'oklch(72.3% 0.219 149.579)',
                } as React.CSSProperties
            }
        >
            <ScrollArea className="max-h-[34rem] px-3 [mask-image:linear-gradient(to_bottom,black_calc(100%-4rem),transparent)]">
                <InfiniteScroll
                    data="recentCommits"
                    onlyNext
                    buffer={240}
                    itemsElement="#commit-timeline-items"
                    loading={
                        <p className="py-2 pl-9 text-xs text-muted-foreground">
                            Loading more commits...
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
                                    Load more commits
                                </Button>
                            </div>
                        ) : null
                    }
                >
                    <ol id="commit-timeline-items" className="relative py-1">
                        {commits.map((commit, index) => (
                            <CommitTimelineItem
                                key={commit.id}
                                commit={commit}
                                isLast={index === commits.length - 1}
                            />
                        ))}
                    </ol>
                </InfiniteScroll>
            </ScrollArea>
        </div>
    );
}

function CommitTimelineItem({
    commit,
    isLast,
}: {
    commit: Commit;
    isLast: boolean;
}) {
    return (
        <a
            href={commit.html_url ?? undefined}
            className="group grid grid-cols-[1.25rem_minmax(0,1fr)] gap-3"
            target="_blank"
            rel="noreferrer"
        >
            <div className="relative flex justify-center">
                {!isLast && (
                    <span className="absolute top-[1.125rem] bottom-[-0.75rem] w-px bg-[var(--timeline-color)] opacity-75 shadow-[0_0_3px_var(--timeline-color)]" />
                )}
                <span className="relative mt-1 flex h-4 w-4 items-center justify-center rounded-full border border-[var(--timeline-color)] bg-background text-[var(--timeline-color)] shadow-[0_0_5px_var(--timeline-color)] transition-transform group-hover:scale-105">
                    <GitCommitHorizontal className="h-2.5 w-2.5" />
                </span>
            </div>
            <div className="pb-3">
                <p className="mb-0.5 font-mono text-[0.68rem] leading-none text-muted-foreground">
                    {formatRelativeTime(commit.authored_at)}
                </p>
                <p
                    className="line-clamp-1 font-mono text-xs leading-snug font-medium group-hover:line-clamp-none group-hover:underline"
                    title={commit.message ?? 'Commit'}
                >
                    {commit.message ?? 'Commit'}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    {commit.repository.full_name} ·{' '}
                    {commit.author_login ?? commit.author_name ?? 'Unknown'} ·{' '}
                    {shortSha(commit.sha)} · {formatDate(commit.authored_at)}
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

function shortSha(sha: string) {
    return sha.slice(0, 7);
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
    const absoluteSeconds = Math.abs(diffInSeconds);
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
