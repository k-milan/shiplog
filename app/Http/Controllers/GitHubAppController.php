<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Actions\BackfillGitHubInstallation;
use App\Actions\ConnectGitHubApp;
use App\Actions\DisconnectGitHubApp;
use App\Contracts\GitHubAppTokenContract;
use App\Models\GitHubAppInstallation;
use App\Models\GitHubCommit;
use App\Models\GitHubPullRequest;
use App\Models\GitHubPullRequestReview;
use Carbon\CarbonImmutable;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

final readonly class GitHubAppController
{
    public function __construct(
        private ConnectGitHubApp $connectGitHubApp,
        private BackfillGitHubInstallation $backfillGitHubInstallation,
        private DisconnectGitHubApp $disconnectGitHubApp,
        private GitHubAppTokenContract $tokenService,
    ) {}

    public function index(): Response
    {
        return Inertia::render('settings/github/index', [
            'installations' => GitHubAppInstallation::query()
                ->orderBy('account_login')
                ->get(['id', 'installation_id', 'account_login', 'account_type', 'account_name', 'avatar_url', 'created_at']),
            'last24HoursSummary' => $this->last24HoursSummary(),
            'last7DaysActivity' => $this->last7DaysActivity(),
            'activityHeatmap' => $this->activityHeatmap(),
            'todayActivityByRepository' => $this->todayActivityByRepository(),
            'activityItems' => Inertia::scroll($this->activityItems()),
        ]);
    }

    public function redirect(): RedirectResponse
    {
        $appName = config('github.app_name');

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
        $this->backfillGitHubInstallation->handle($installation);

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
        $response = Http::withHeaders([
            'Authorization' => 'Bearer '.$this->tokenService->generateAppToken(),
            'Accept' => 'application/vnd.github+json',
            'X-GitHub-Api-Version' => '2022-11-28',
        ])->get("https://api.github.com/app/installations/{$installationId}");

        if (! $response->successful()) {
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
    private function activityItems(): LengthAwarePaginator
    {
        $since = CarbonImmutable::now()->subDay();
        $pageName = 'activity';
        $perPage = 12;
        $page = LengthAwarePaginator::resolveCurrentPage($pageName);

        $commits = GitHubCommit::query()
            ->with('repository:id,full_name')
            ->where('authored_at', '>=', $since)
            ->get(['id', 'github_repository_id', 'sha', 'message', 'author_login', 'author_name', 'authored_at', 'html_url'])
            ->map(fn (GitHubCommit $commit): array => [
                'id' => "commit-{$commit->id}",
                'type' => 'commit',
                'occurred_at' => $commit->authored_at?->toJSON(),
                'title' => Str::of($commit->message ?? 'Commit')->before("\n")->toString(),
                'actor' => $commit->author_login ?? $commit->author_name,
                'repository' => $commit->repository?->full_name,
                'reference' => Str::of($commit->sha)->limit(7, '')->toString(),
                'url' => $commit->html_url,
                'state' => null,
            ]);

        $pullRequests = GitHubPullRequest::query()
            ->with('repository:id,full_name')
            ->where(function ($query) use ($since): void {
                $query
                    ->where('updated_at_github', '>=', $since)
                    ->orWhere('opened_at', '>=', $since)
                    ->orWhere('merged_at', '>=', $since);
            })
            ->get(['id', 'github_repository_id', 'number', 'title', 'state', 'author_login', 'html_url', 'opened_at', 'updated_at_github', 'merged_at'])
            ->map(fn (GitHubPullRequest $pullRequest): array => [
                'id' => "pull-request-{$pullRequest->id}",
                'type' => 'pull_request',
                'occurred_at' => ($pullRequest->merged_at ?? $pullRequest->updated_at_github ?? $pullRequest->opened_at)?->toJSON(),
                'title' => $pullRequest->title,
                'actor' => $pullRequest->author_login,
                'repository' => $pullRequest->repository?->full_name,
                'reference' => "#{$pullRequest->number}",
                'url' => $pullRequest->html_url,
                'state' => $pullRequest->merged_at ? 'merged' : $pullRequest->state,
            ]);

        $reviews = GitHubPullRequestReview::query()
            ->with('pullRequest.repository:id,full_name')
            ->where('submitted_at', '>=', $since)
            ->get(['id', 'github_pull_request_id', 'state', 'author_login', 'html_url', 'submitted_at'])
            ->map(fn (GitHubPullRequestReview $review): array => [
                'id' => "review-{$review->id}",
                'type' => 'review',
                'occurred_at' => $review->submitted_at?->toJSON(),
                'title' => $review->pullRequest?->title ?? 'Pull request review',
                'actor' => $review->author_login,
                'repository' => $review->pullRequest?->repository?->full_name,
                'reference' => $review->pullRequest ? "#{$review->pullRequest->number}" : null,
                'url' => $review->html_url,
                'state' => $review->state,
            ]);

        $items = $commits
            ->concat($pullRequests)
            ->concat($reviews)
            ->sortByDesc('occurred_at')
            ->values();

        return new LengthAwarePaginator(
            $items->forPage($page, $perPage)->values(),
            $items->count(),
            $perPage,
            $page,
            [
                'path' => request()->url(),
                'pageName' => $pageName,
            ],
        );
    }

    /**
     * @return array{activities: int, repos_touched: int, prs_updated: int, prs_merged: int, production_deploys: int|null}
     */
    private function last24HoursSummary(): array
    {
        $since = CarbonImmutable::now()->subDay();

        $commitRepositoryIds = GitHubCommit::query()
            ->where('authored_at', '>=', $since)
            ->pluck('github_repository_id');

        $pullRequests = GitHubPullRequest::query()
            ->where(function ($query) use ($since): void {
                $query
                    ->where('updated_at_github', '>=', $since)
                    ->orWhere('opened_at', '>=', $since)
                    ->orWhere('merged_at', '>=', $since);
            })
            ->get(['id', 'github_repository_id', 'merged_at']);

        $reviews = GitHubPullRequestReview::query()
            ->with('pullRequest:id,github_repository_id')
            ->where('submitted_at', '>=', $since)
            ->get(['id', 'github_pull_request_id']);

        $reviewRepositoryIds = $reviews
            ->map(fn (GitHubPullRequestReview $review): ?int => $review->pullRequest?->github_repository_id)
            ->filter();

        return [
            'activities' => $commitRepositoryIds->count() + $pullRequests->count() + $reviews->count(),
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

    /**
     * @return list<array{date: string, label: string, total: int}>
     */
    private function last7DaysActivity(): array
    {
        $start = CarbonImmutable::now()->startOfDay()->subDays(6);
        $days = collect(range(0, 6))
            ->map(fn (int $offset): CarbonImmutable => $start->addDays($offset));

        $commits = GitHubCommit::query()
            ->where('authored_at', '>=', $start)
            ->get(['authored_at'])
            ->map(fn (GitHubCommit $commit): ?string => $commit->authored_at?->toDateString())
            ->filter()
            ->countBy();

        $pullRequests = GitHubPullRequest::query()
            ->where(function ($query) use ($start): void {
                $query
                    ->where('updated_at_github', '>=', $start)
                    ->orWhere('opened_at', '>=', $start)
                    ->orWhere('merged_at', '>=', $start);
            })
            ->get(['opened_at', 'updated_at_github', 'merged_at'])
            ->map(fn (GitHubPullRequest $pullRequest): ?string => ($pullRequest->merged_at ?? $pullRequest->updated_at_github ?? $pullRequest->opened_at)?->toDateString())
            ->filter()
            ->countBy();

        $reviews = GitHubPullRequestReview::query()
            ->where('submitted_at', '>=', $start)
            ->get(['submitted_at'])
            ->map(fn (GitHubPullRequestReview $review): ?string => $review->submitted_at?->toDateString())
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
    private function activityHeatmap(): array
    {
        $start = CarbonImmutable::now()->startOfDay()->subDays(83);
        $end = CarbonImmutable::now()->startOfDay();
        $days = collect(range(0, $start->diffInDays($end)))
            ->map(fn (int $offset): CarbonImmutable => $start->addDays($offset));

        $commits = GitHubCommit::query()
            ->where('authored_at', '>=', $start)
            ->get(['authored_at'])
            ->map(fn (GitHubCommit $commit): ?string => $commit->authored_at?->toDateString())
            ->filter()
            ->countBy();

        $pullRequests = GitHubPullRequest::query()
            ->where(function ($query) use ($start): void {
                $query
                    ->where('updated_at_github', '>=', $start)
                    ->orWhere('opened_at', '>=', $start)
                    ->orWhere('merged_at', '>=', $start);
            })
            ->get(['opened_at', 'updated_at_github', 'merged_at'])
            ->map(fn (GitHubPullRequest $pullRequest): ?string => ($pullRequest->merged_at ?? $pullRequest->updated_at_github ?? $pullRequest->opened_at)?->toDateString())
            ->filter()
            ->countBy();

        $reviews = GitHubPullRequestReview::query()
            ->where('submitted_at', '>=', $start)
            ->get(['submitted_at'])
            ->map(fn (GitHubPullRequestReview $review): ?string => $review->submitted_at?->toDateString())
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
    private function todayActivityByRepository(): array
    {
        $start = CarbonImmutable::now()->startOfDay();
        $end = $start->addDay();

        $commits = GitHubCommit::query()
            ->with('repository:id,full_name')
            ->where('authored_at', '>=', $start)
            ->where('authored_at', '<', $end)
            ->get(['id', 'github_repository_id', 'authored_at'])
            ->map(fn (GitHubCommit $commit): ?string => $commit->repository?->full_name)
            ->filter();

        $pullRequests = GitHubPullRequest::query()
            ->with('repository:id,full_name')
            ->where(function ($query) use ($start, $end): void {
                $query
                    ->whereBetween('updated_at_github', [$start, $end])
                    ->orWhereBetween('opened_at', [$start, $end])
                    ->orWhereBetween('merged_at', [$start, $end]);
            })
            ->get(['id', 'github_repository_id', 'opened_at', 'updated_at_github', 'merged_at'])
            ->map(fn (GitHubPullRequest $pullRequest): ?string => $pullRequest->repository?->full_name)
            ->filter();

        $reviews = GitHubPullRequestReview::query()
            ->with('pullRequest.repository:id,full_name')
            ->where('submitted_at', '>=', $start)
            ->where('submitted_at', '<', $end)
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
}
