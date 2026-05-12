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
use App\Models\GitHubRepository;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
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
            'summary' => [
                'repositories' => GitHubRepository::query()->count(),
                'commits' => GitHubCommit::query()->count(),
                'pull_requests' => GitHubPullRequest::query()->count(),
                'reviews' => GitHubPullRequestReview::query()->count(),
            ],
            'repositories' => GitHubRepository::query()
                ->withCount(['commits', 'pullRequests'])
                ->orderByDesc('pushed_at')
                ->limit(8)
                ->get(['id', 'full_name', 'private', 'default_branch', 'html_url', 'pushed_at']),
            'recentCommits' => Inertia::scroll(
                GitHubCommit::query()
                    ->with('repository:id,full_name')
                    ->orderByDesc('authored_at')
                    ->paginate(10, ['id', 'github_repository_id', 'sha', 'message', 'author_login', 'author_name', 'authored_at', 'html_url'], 'commits')
            ),
            'recentPullRequests' => GitHubPullRequest::query()
                ->with('repository:id,full_name')
                ->orderByDesc('updated_at_github')
                ->limit(8)
                ->get(['id', 'github_repository_id', 'number', 'title', 'state', 'draft', 'author_login', 'html_url', 'opened_at', 'updated_at_github', 'merged_at']),
            'recentReviews' => GitHubPullRequestReview::query()
                ->with('pullRequest:id,github_repository_id,number,title')
                ->orderByDesc('submitted_at')
                ->limit(8)
                ->get(['id', 'github_pull_request_id', 'state', 'author_login', 'body', 'html_url', 'submitted_at']),
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
}
