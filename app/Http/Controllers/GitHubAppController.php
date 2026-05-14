<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Actions\ConnectGitHubApp;
use App\Actions\DisconnectGitHubApp;
use App\Contracts\GitHubAppTokenContract;
use App\Jobs\BackfillGitHubInstallationJob;
use App\Models\GitHubAppInstallation;
use App\Models\GitHubCommit;
use App\Models\GitHubPullRequest;
use App\Models\GitHubPullRequestReview;
use Carbon\CarbonImmutable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

final readonly class GitHubAppController
{
    public function __construct(
        private ConnectGitHubApp $connectGitHubApp,
        private DisconnectGitHubApp $disconnectGitHubApp,
        private GitHubAppTokenContract $tokenService,
    ) {}

    public function index(Request $request): Response
    {
        $installations = GitHubAppInstallation::query()
            ->orderBy('account_login')
            ->get(['id', 'installation_id', 'account_login', 'account_type', 'account_name', 'avatar_url', 'sync_status', 'sync_started_at', 'sync_finished_at', 'sync_error', 'created_at']);
        $selectedInstallationIds = $this->selectedInstallationIds($request, $installations->pluck('id')->all());
        $selectedActorLogins = $this->selectedActorLogins($selectedInstallationIds);
        $displayTimezone = $this->displayTimezone($request);

        return Inertia::render('settings/github/index', [
            'installations' => $installations,
            'selectedInstallationIds' => $selectedInstallationIds,
            'aggregationTimezone' => $displayTimezone,
            'last24HoursSummary' => $this->last24HoursSummary($selectedInstallationIds, $selectedActorLogins),
            'pullRequestStatusItems' => $this->pullRequestStatusItems($selectedInstallationIds, $displayTimezone),
            'pullRequestsToReviewItems' => $this->pullRequestsToReviewItems($selectedInstallationIds),
            'last7DaysActivity' => $this->last7DaysActivity($selectedInstallationIds, $selectedActorLogins, $displayTimezone),
            'activityHeatmap' => $this->activityHeatmap($selectedInstallationIds, $selectedActorLogins, $displayTimezone),
            'todayActivityByRepository' => $this->todayActivityByRepository($selectedInstallationIds, $selectedActorLogins, $displayTimezone),
            'activityItems' => Inertia::scroll($this->activityItems(
                $selectedInstallationIds,
                $selectedActorLogins,
                $this->activityPage($request),
            ))
                ->append('data', 'id'),
        ]);
    }

    public function redirect(): RedirectResponse
    {
        $appName = config('github.app_name');

        if (! is_string($appName) || $appName === '') {
            Log::error('GitHub App redirect failed: GITHUB_APP_NAME is not configured.');

            return to_route('github-apps.index')
                ->with('status', 'github-app-misconfigured');
        }

        return redirect("https://github.com/apps/{$appName}/installations/new");
    }

    public function callback(Request $request): RedirectResponse
    {
        $installationId = $request->integer('installation_id');
        $setupAction = $request->string('setup_action')->toString();

        if ($setupAction === 'delete' || $installationId === 0) {
            return to_route('github-apps.index')
                ->with('status', 'github-app-removed');
        }

        $installationData = $this->fetchInstallationData($installationId);

        if ($installationData === null) {
            return to_route('github-apps.index')
                ->with('status', 'github-app-error');
        }

        $installation = $this->connectGitHubApp->handle($installationData);
        $installation->forceFill([
            'sync_status' => 'pending',
            'sync_started_at' => null,
            'sync_finished_at' => null,
            'sync_error' => null,
        ])->save();

        BackfillGitHubInstallationJob::dispatch($installation->id);

        return to_route('github-apps.index')
            ->with('status', 'github-app-connected');
    }

    public function destroy(GitHubAppInstallation $installation): RedirectResponse
    {
        $this->disconnectGitHubApp->handle($installation);

        return to_route('github-apps.index')
            ->with('status', 'github-app-disconnected');
    }

    /**
     * @return array{installation_id: int, account_login: string, account_type: string, account_name: string|null, avatar_url: string|null}|null
     */
    private function fetchInstallationData(int $installationId): ?array
    {
        try {
            $response = Http::connectTimeout(10)
                ->timeout(30)
                ->retry(2, 500, throw: false)
                ->withHeaders([
                    'Authorization' => 'Bearer '.$this->tokenService->generateAppToken(),
                    'Accept' => 'application/vnd.github+json',
                    'X-GitHub-Api-Version' => '2022-11-28',
                ])->get("https://api.github.com/app/installations/{$installationId}");
        } catch (ConnectionException $exception) {
            Log::warning('Failed to fetch GitHub installation data.', [
                'installation_id' => $installationId,
                'exception' => $exception->getMessage(),
            ]);

            return null;
        }

        if (! $response->successful()) {
            Log::warning('GitHub installation data request was not successful.', [
                'installation_id' => $installationId,
                'status' => $response->status(),
            ]);

            return null;
        }

        /** @var array{id: int, account: array{login: string, type: string, name: string|null, avatar_url: string|null}} $data */
        $data = $response->json();

        return [
            'installation_id' => $data['id'],
            'account_login' => $data['account']['login'],
            'account_type' => $data['account']['type'],
            'account_name' => $data['account']['name'] ?? null,
            'avatar_url' => $data['account']['avatar_url'] ?? null,
        ];
    }

    /**
     * @return LengthAwarePaginator<int, array{id: string, type: string, occurred_at: string|null, title: string, actor: string|null, repository: string|null, reference: string|null, url: string|null, state: string|null}>
     */
    private function activityItems(array $installationIds, array $actorLogins, int $page): LengthAwarePaginator
    {
        $pageName = 'activity';
        $perPage = 10;

        $commits = DB::table('github_commits as commits')
            ->join('github_repositories as repositories', 'repositories.id', '=', 'commits.github_repository_id')
            ->whereIn('repositories.github_app_installation_id', $installationIds)
            ->whereIn('commits.author_login', $actorLogins)
            ->select([
                'commits.id as source_id',
                DB::raw("'commit' as type"),
                'commits.authored_at as occurred_at',
                'commits.message as title',
                DB::raw('coalesce(commits.author_login, commits.author_name) as actor'),
                'repositories.full_name as repository',
                'commits.sha as reference',
                'commits.html_url as url',
                DB::raw('null as state'),
            ]);

        $pullRequests = DB::table('github_pull_requests as pull_requests')
            ->join('github_repositories as repositories', 'repositories.id', '=', 'pull_requests.github_repository_id')
            ->whereIn('repositories.github_app_installation_id', $installationIds)
            ->whereIn('pull_requests.author_login', $actorLogins)
            ->select([
                'pull_requests.id as source_id',
                DB::raw("'pull_request' as type"),
                DB::raw('coalesce(pull_requests.merged_at, pull_requests.updated_at_github, pull_requests.opened_at) as occurred_at'),
                'pull_requests.title as title',
                'pull_requests.author_login as actor',
                'repositories.full_name as repository',
                DB::raw("('#' || pull_requests.number) as reference"),
                'pull_requests.html_url as url',
                DB::raw("case when pull_requests.merged_at is not null then 'merged' else pull_requests.state end as state"),
            ]);

        $reviews = DB::table('github_pull_request_reviews as reviews')
            ->join('github_pull_requests as pull_requests', 'pull_requests.id', '=', 'reviews.github_pull_request_id')
            ->join('github_repositories as repositories', 'repositories.id', '=', 'pull_requests.github_repository_id')
            ->whereIn('repositories.github_app_installation_id', $installationIds)
            ->whereIn('reviews.author_login', $actorLogins)
            ->select([
                'reviews.id as source_id',
                DB::raw("'review' as type"),
                'reviews.submitted_at as occurred_at',
                'pull_requests.title as title',
                'reviews.author_login as actor',
                'repositories.full_name as repository',
                DB::raw("('#' || pull_requests.number) as reference"),
                'reviews.html_url as url',
                'reviews.state as state',
            ]);

        $feed = $commits
            ->unionAll($pullRequests)
            ->unionAll($reviews);

        return DB::query()
            ->fromSub($feed, 'activity')
            ->whereNotNull('occurred_at')
            ->orderByDesc('occurred_at')
            ->orderByDesc('source_id')
            ->paginate($perPage, ['*'], $pageName, $page)
            ->through(fn (object $item): array => [
                'id' => "{$item->type}-{$item->source_id}",
                'type' => $item->type,
                'occurred_at' => $this->timestampJson($item->occurred_at),
                'title' => $item->type === 'commit'
                    ? Str::of($item->title ?? 'Commit')->before("\n")->toString()
                    : ($item->title ?? 'Pull request review'),
                'actor' => $item->actor,
                'repository' => $item->repository,
                'reference' => $item->type === 'commit'
                    ? Str::of((string) $item->reference)->limit(7, '')->toString()
                    : $item->reference,
                'url' => $item->url,
                'state' => $item->state,
            ]);
    }

    /**
     * @return list<array{id: int, title: string, repository: string|null, number: int, status: string, url: string, updated_at: string|null, merged_at: string|null}>
     */
    private function pullRequestStatusItems(array $installationIds, string $displayTimezone): array
    {
        $today = $this->todayStart($displayTimezone);
        $tomorrow = $today->addDay();
        $authorLogins = GitHubAppInstallation::query()
            ->whereIn('id', $installationIds)
            ->pluck('account_login')
            ->all();

        if ($authorLogins === []) {
            return [];
        }

        return GitHubPullRequest::query()
            ->with([
                'repository:id,full_name',
                'reviews:id,github_pull_request_id,state,submitted_at',
            ])
            ->whereIn('author_login', $authorLogins)
            ->whereHas('repository', fn ($query) => $query->whereIn('github_app_installation_id', $installationIds))
            ->where(function ($query) use ($today, $tomorrow): void {
                $query
                    ->where('draft', true)
                    ->orWhere(function ($query): void {
                        $query
                            ->where('state', 'open')
                            ->where('draft', false);
                    })
                    ->orWhere(function ($query) use ($today, $tomorrow): void {
                        $query
                            ->where('merged_at', '>=', $this->utcBoundary($today))
                            ->where('merged_at', '<', $this->utcBoundary($tomorrow));
                    });
            })
            ->orderByRaw('merged_at is null desc')
            ->orderByDesc(DB::raw('coalesce(merged_at, updated_at_github, opened_at)'))
            ->limit(12)
            ->get(['id', 'github_repository_id', 'number', 'title', 'state', 'draft', 'html_url', 'updated_at_github', 'merged_at'])
            ->map(fn (GitHubPullRequest $pullRequest): array => [
                'id' => $pullRequest->id,
                'title' => $pullRequest->title,
                'repository' => $pullRequest->repository?->full_name,
                'number' => $pullRequest->number,
                'status' => $this->pullRequestDisplayStatus($pullRequest),
                'url' => $pullRequest->html_url,
                'updated_at' => $this->timestampJson($pullRequest->getRawOriginal('updated_at_github')),
                'merged_at' => $this->timestampJson($pullRequest->getRawOriginal('merged_at')),
            ])
            ->all();
    }

    private function pullRequestDisplayStatus(GitHubPullRequest $pullRequest): string
    {
        if ($pullRequest->merged_at !== null) {
            return 'merged today';
        }

        if ($pullRequest->state === 'closed') {
            return 'closed';
        }

        if ($pullRequest->draft) {
            return 'draft';
        }

        $latestReviewState = $pullRequest->reviews
            ->sortByDesc(fn (GitHubPullRequestReview $review): mixed => $review->submitted_at)
            ->first()?->state;

        return match ($latestReviewState) {
            'APPROVED' => 'approved',
            'CHANGES_REQUESTED' => 'changes requested',
            'COMMENTED' => 'commented',
            default => 'open',
        };
    }

    /**
     * @return list<array{id: int, title: string, repository: string|null, number: int, url: string, author: string|null, updated_at: string|null}>
     */
    private function pullRequestsToReviewItems(array $installationIds): array
    {
        $reviewerLogins = GitHubAppInstallation::query()
            ->whereIn('id', $installationIds)
            ->pluck('account_login')
            ->all();

        if ($reviewerLogins === []) {
            return [];
        }

        return GitHubPullRequest::query()
            ->with('repository:id,full_name')
            ->where('state', 'open')
            ->whereHas('repository', fn ($query) => $query->whereIn('github_app_installation_id', $installationIds))
            ->orderByDesc(DB::raw('coalesce(updated_at_github, opened_at)'))
            ->get(['id', 'github_repository_id', 'number', 'title', 'author_login', 'html_url', 'updated_at_github', 'opened_at', 'payload'])
            ->filter(fn (GitHubPullRequest $pullRequest): bool => $this->pullRequestRequestsReviewFrom($pullRequest, $reviewerLogins))
            ->take(12)
            ->map(fn (GitHubPullRequest $pullRequest): array => [
                'id' => $pullRequest->id,
                'title' => $pullRequest->title,
                'repository' => $pullRequest->repository?->full_name,
                'number' => $pullRequest->number,
                'url' => $pullRequest->html_url,
                'author' => $pullRequest->author_login,
                'updated_at' => $this->timestampJson(
                    $pullRequest->getRawOriginal('updated_at_github') ?? $pullRequest->getRawOriginal('opened_at'),
                ),
            ])
            ->values()
            ->all();
    }

    /**
     * @param  list<string>  $reviewerLogins
     */
    private function pullRequestRequestsReviewFrom(GitHubPullRequest $pullRequest, array $reviewerLogins): bool
    {
        $payload = is_array($pullRequest->payload) ? $pullRequest->payload : [];
        $requestedReviewers = is_array($payload['requested_reviewers'] ?? null)
            ? $payload['requested_reviewers']
            : [];

        foreach ($requestedReviewers as $reviewer) {
            if (is_array($reviewer) && in_array($reviewer['login'] ?? null, $reviewerLogins, true)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return array{
     *     activities: int,
     *     activities_change_percent: int,
     *     activities_change_direction: 'up'|'down'|'unchanged',
     *     repos_touched: int,
     *     prs_updated: int,
     *     prs_merged: int,
     *     production_deploys: int|null
     * }
     */
    private function last24HoursSummary(array $installationIds, array $actorLogins): array
    {
        $now = CarbonImmutable::now('UTC');
        $since = $now->subDay();
        $previousSince = $now->subDays(2);

        $activities = $this->activityCountBetween($installationIds, $actorLogins, $since, $now);
        $previousActivities = $this->activityCountBetween($installationIds, $actorLogins, $previousSince, $since);

        $commitRepositoryIds = GitHubCommit::query()
            ->whereHas('repository', fn ($query) => $query->whereIn('github_app_installation_id', $installationIds))
            ->whereIn('author_login', $actorLogins)
            ->where('authored_at', '>=', $since)
            ->where('authored_at', '<', $now)
            ->pluck('github_repository_id');

        $pullRequests = GitHubPullRequest::query()
            ->whereHas('repository', fn ($query) => $query->whereIn('github_app_installation_id', $installationIds))
            ->whereIn('author_login', $actorLogins)
            ->where(function ($query) use ($since, $now): void {
                $query
                    ->where(function ($query) use ($since, $now): void {
                        $query
                            ->where('updated_at_github', '>=', $since)
                            ->where('updated_at_github', '<', $now);
                    })
                    ->orWhere(function ($query) use ($since, $now): void {
                        $query
                            ->where('opened_at', '>=', $since)
                            ->where('opened_at', '<', $now);
                    })
                    ->orWhere(function ($query) use ($since, $now): void {
                        $query
                            ->where('merged_at', '>=', $since)
                            ->where('merged_at', '<', $now);
                    });
            })
            ->get(['id', 'github_repository_id', 'merged_at']);

        $reviews = GitHubPullRequestReview::query()
            ->with('pullRequest:id,github_repository_id')
            ->whereHas('pullRequest.repository', fn ($query) => $query->whereIn('github_app_installation_id', $installationIds))
            ->whereIn('author_login', $actorLogins)
            ->where('submitted_at', '>=', $since)
            ->where('submitted_at', '<', $now)
            ->get(['id', 'github_pull_request_id']);

        $reviewRepositoryIds = $reviews
            ->map(fn (GitHubPullRequestReview $review): ?int => $review->pullRequest?->github_repository_id)
            ->filter();

        return [
            'activities' => $activities,
            ...$this->activityChangeMeta($activities, $previousActivities),
            'repos_touched' => $commitRepositoryIds
                ->concat($pullRequests->pluck('github_repository_id'))
                ->concat($reviewRepositoryIds)
                ->unique()
                ->count(),
            'prs_updated' => $pullRequests->count(),
            'prs_merged' => $pullRequests->whereNotNull('merged_at')->count(),
            'production_deploys' => null,
        ];
    }

    private function activityCountBetween(
        array $installationIds,
        array $actorLogins,
        CarbonImmutable $since,
        CarbonImmutable $until,
    ): int {
        $commitCount = GitHubCommit::query()
            ->whereHas('repository', fn ($query) => $query->whereIn('github_app_installation_id', $installationIds))
            ->whereIn('author_login', $actorLogins)
            ->where('authored_at', '>=', $since)
            ->where('authored_at', '<', $until)
            ->count();

        $pullRequestCount = GitHubPullRequest::query()
            ->whereHas('repository', fn ($query) => $query->whereIn('github_app_installation_id', $installationIds))
            ->whereIn('author_login', $actorLogins)
            ->where(function ($query) use ($since, $until): void {
                $query
                    ->where(function ($query) use ($since, $until): void {
                        $query
                            ->where('updated_at_github', '>=', $since)
                            ->where('updated_at_github', '<', $until);
                    })
                    ->orWhere(function ($query) use ($since, $until): void {
                        $query
                            ->where('opened_at', '>=', $since)
                            ->where('opened_at', '<', $until);
                    })
                    ->orWhere(function ($query) use ($since, $until): void {
                        $query
                            ->where('merged_at', '>=', $since)
                            ->where('merged_at', '<', $until);
                    });
            })
            ->count();

        $reviewCount = GitHubPullRequestReview::query()
            ->whereHas('pullRequest.repository', fn ($query) => $query->whereIn('github_app_installation_id', $installationIds))
            ->whereIn('author_login', $actorLogins)
            ->where('submitted_at', '>=', $since)
            ->where('submitted_at', '<', $until)
            ->count();

        return $commitCount + $pullRequestCount + $reviewCount;
    }

    /**
     * @return array{
     *     activities_change_percent: int,
     *     activities_change_direction: 'up'|'down'|'unchanged'
     * }
     */
    private function activityChangeMeta(int $current, int $previous): array
    {
        if ($current === $previous) {
            return [
                'activities_change_percent' => 0,
                'activities_change_direction' => 'unchanged',
            ];
        }

        if ($previous === 0) {
            return [
                'activities_change_percent' => 100,
                'activities_change_direction' => 'up',
            ];
        }

        $percent = (int) round(abs($current - $previous) / $previous * 100);

        return [
            'activities_change_percent' => $percent,
            'activities_change_direction' => $current > $previous ? 'up' : 'down',
        ];
    }

    /**
     * @return list<array{date: string, label: string, total: int}>
     */
    private function last7DaysActivity(array $installationIds, array $actorLogins, string $displayTimezone): array
    {
        $start = $this->todayStart($displayTimezone)->subDays(6);
        $startUtc = $this->utcBoundary($start);
        $days = collect(range(0, 6))
            ->map(fn (int $offset): CarbonImmutable => $start->addDays($offset));

        $commits = GitHubCommit::query()
            ->whereHas('repository', fn ($query) => $query->whereIn('github_app_installation_id', $installationIds))
            ->whereIn('author_login', $actorLogins)
            ->where('authored_at', '>=', $startUtc)
            ->get(['authored_at'])
            ->map(fn (GitHubCommit $commit): ?string => $this->dateStringInTimezone($commit->getRawOriginal('authored_at'), $displayTimezone))
            ->filter()
            ->countBy();

        $pullRequests = GitHubPullRequest::query()
            ->whereHas('repository', fn ($query) => $query->whereIn('github_app_installation_id', $installationIds))
            ->whereIn('author_login', $actorLogins)
            ->where(function ($query) use ($startUtc): void {
                $query
                    ->where('updated_at_github', '>=', $startUtc)
                    ->orWhere('opened_at', '>=', $startUtc)
                    ->orWhere('merged_at', '>=', $startUtc);
            })
            ->get(['opened_at', 'updated_at_github', 'merged_at'])
            ->map(fn (GitHubPullRequest $pullRequest): ?string => $this->dateStringInTimezone(
                $pullRequest->getRawOriginal('merged_at')
                    ?? $pullRequest->getRawOriginal('updated_at_github')
                    ?? $pullRequest->getRawOriginal('opened_at'),
                $displayTimezone,
            ))
            ->filter()
            ->countBy();

        $reviews = GitHubPullRequestReview::query()
            ->whereHas('pullRequest.repository', fn ($query) => $query->whereIn('github_app_installation_id', $installationIds))
            ->whereIn('author_login', $actorLogins)
            ->where('submitted_at', '>=', $startUtc)
            ->get(['submitted_at'])
            ->map(fn (GitHubPullRequestReview $review): ?string => $this->dateStringInTimezone($review->getRawOriginal('submitted_at'), $displayTimezone))
            ->filter()
            ->countBy();

        return $days
            ->map(fn (CarbonImmutable $day): array => [
                'date' => $day->toDateString(),
                'label' => $day->format('M j'),
                'total' => (int) (($commits[$day->toDateString()] ?? 0) + ($pullRequests[$day->toDateString()] ?? 0) + ($reviews[$day->toDateString()] ?? 0)),
            ])
            ->values()
            ->all();
    }

    /**
     * @return array{start_date: string, end_date: string, total: int, data: list<array{date: string, value: int}>}
     */
    private function activityHeatmap(array $installationIds, array $actorLogins, string $displayTimezone): array
    {
        $start = $this->todayStart($displayTimezone)->subMonths(6)->addDay();
        $end = $this->todayStart($displayTimezone);
        $startUtc = $this->utcBoundary($start);
        $days = collect(range(0, $start->diffInDays($end)))
            ->map(fn (int $offset): CarbonImmutable => $start->addDays($offset));

        $commits = GitHubCommit::query()
            ->whereHas('repository', fn ($query) => $query->whereIn('github_app_installation_id', $installationIds))
            ->whereIn('author_login', $actorLogins)
            ->where('authored_at', '>=', $startUtc)
            ->get(['authored_at'])
            ->map(fn (GitHubCommit $commit): ?string => $this->dateStringInTimezone($commit->getRawOriginal('authored_at'), $displayTimezone))
            ->filter()
            ->countBy();

        $pullRequests = GitHubPullRequest::query()
            ->whereHas('repository', fn ($query) => $query->whereIn('github_app_installation_id', $installationIds))
            ->whereIn('author_login', $actorLogins)
            ->where(function ($query) use ($startUtc): void {
                $query
                    ->where('updated_at_github', '>=', $startUtc)
                    ->orWhere('opened_at', '>=', $startUtc)
                    ->orWhere('merged_at', '>=', $startUtc);
            })
            ->get(['opened_at', 'updated_at_github', 'merged_at'])
            ->map(fn (GitHubPullRequest $pullRequest): ?string => $this->dateStringInTimezone(
                $pullRequest->getRawOriginal('merged_at')
                    ?? $pullRequest->getRawOriginal('updated_at_github')
                    ?? $pullRequest->getRawOriginal('opened_at'),
                $displayTimezone,
            ))
            ->filter()
            ->countBy();

        $reviews = GitHubPullRequestReview::query()
            ->whereHas('pullRequest.repository', fn ($query) => $query->whereIn('github_app_installation_id', $installationIds))
            ->whereIn('author_login', $actorLogins)
            ->where('submitted_at', '>=', $startUtc)
            ->get(['submitted_at'])
            ->map(fn (GitHubPullRequestReview $review): ?string => $this->dateStringInTimezone($review->getRawOriginal('submitted_at'), $displayTimezone))
            ->filter()
            ->countBy();

        $data = $days
            ->map(fn (CarbonImmutable $day): array => [
                'date' => $day->toDateString(),
                'value' => (int) (($commits[$day->toDateString()] ?? 0) + ($pullRequests[$day->toDateString()] ?? 0) + ($reviews[$day->toDateString()] ?? 0)),
            ])
            ->values();

        return [
            'start_date' => $start->toDateString(),
            'end_date' => $end->toDateString(),
            'total' => $data->sum('value'),
            'data' => $data->all(),
        ];
    }

    /**
     * @return list<array{repository: string, total: int}>
     */
    private function todayActivityByRepository(array $installationIds, array $actorLogins, string $displayTimezone): array
    {
        $start = $this->todayStart($displayTimezone);
        $end = $start->addDay();
        $startUtc = $this->utcBoundary($start);
        $endUtc = $this->utcBoundary($end);

        $commits = GitHubCommit::query()
            ->with('repository:id,full_name')
            ->whereHas('repository', fn ($query) => $query->whereIn('github_app_installation_id', $installationIds))
            ->whereIn('author_login', $actorLogins)
            ->where('authored_at', '>=', $startUtc)
            ->where('authored_at', '<', $endUtc)
            ->get(['id', 'github_repository_id', 'authored_at'])
            ->map(fn (GitHubCommit $commit): ?string => $commit->repository?->full_name)
            ->filter();

        $pullRequests = GitHubPullRequest::query()
            ->with('repository:id,full_name')
            ->whereHas('repository', fn ($query) => $query->whereIn('github_app_installation_id', $installationIds))
            ->whereIn('author_login', $actorLogins)
            ->where(function ($query) use ($startUtc, $endUtc): void {
                $query
                    ->whereBetween('updated_at_github', [$startUtc, $endUtc])
                    ->orWhereBetween('opened_at', [$startUtc, $endUtc])
                    ->orWhereBetween('merged_at', [$startUtc, $endUtc]);
            })
            ->get(['id', 'github_repository_id', 'opened_at', 'updated_at_github', 'merged_at'])
            ->map(fn (GitHubPullRequest $pullRequest): ?string => $pullRequest->repository?->full_name)
            ->filter();

        $reviews = GitHubPullRequestReview::query()
            ->with('pullRequest.repository:id,full_name')
            ->whereHas('pullRequest.repository', fn ($query) => $query->whereIn('github_app_installation_id', $installationIds))
            ->whereIn('author_login', $actorLogins)
            ->where('submitted_at', '>=', $startUtc)
            ->where('submitted_at', '<', $endUtc)
            ->get(['id', 'github_pull_request_id', 'submitted_at'])
            ->map(fn (GitHubPullRequestReview $review): ?string => $review->pullRequest?->repository?->full_name)
            ->filter();

        return $commits
            ->concat($pullRequests)
            ->concat($reviews)
            ->countBy()
            ->map(fn (int $total, string $repository): array => [
                'repository' => $repository,
                'total' => $total,
            ])
            ->sortByDesc('total')
            ->values()
            ->all();
    }

    /**
     * @param  list<int>  $availableInstallationIds
     * @return list<int>
     */
    private function selectedInstallationIds(Request $request, array $availableInstallationIds): array
    {
        if (! $request->has('selected_installations') && ! $request->boolean('account_filter')) {
            return $availableInstallationIds;
        }

        return collect((array) $request->input('selected_installations', []))
            ->map(fn (mixed $id): int => (int) $id)
            ->intersect($availableInstallationIds)
            ->values()
            ->all();
    }

    /**
     * @param  list<int>  $installationIds
     * @return list<string>
     */
    private function selectedActorLogins(array $installationIds): array
    {
        return GitHubAppInstallation::query()
            ->whereIn('id', $installationIds)
            ->pluck('account_login')
            ->filter()
            ->values()
            ->all();
    }

    private function activityPage(Request $request): int
    {
        $partialData = collect(explode(',', (string) $request->header('X-Inertia-Partial-Data')))
            ->map(fn (string $prop): string => mb_trim($prop));

        if (! $partialData->contains('activityItems')) {
            return 1;
        }

        return max(1, $request->integer('activity', 1));
    }

    private function displayTimezone(Request $request): string
    {
        $timezone = $request->string('timezone')->toString();

        if ($timezone !== '' && in_array($timezone, timezone_identifiers_list(), true)) {
            return $timezone;
        }

        return (string) config('app.timezone');
    }

    private function todayStart(string $timezone): CarbonImmutable
    {
        return CarbonImmutable::now($timezone)->startOfDay();
    }

    private function utcBoundary(CarbonImmutable $date): CarbonImmutable
    {
        return $date->setTimezone('UTC');
    }

    private function dateStringInTimezone(mixed $value, string $timezone): ?string
    {
        if (! is_string($value) || $value === '') {
            return null;
        }

        return CarbonImmutable::parse($value, 'UTC')
            ->setTimezone($timezone)
            ->toDateString();
    }

    private function timestampJson(mixed $value): ?string
    {
        if (! is_string($value) || $value === '') {
            return null;
        }

        return CarbonImmutable::parse($value, 'UTC')->toJSON();
    }
}
