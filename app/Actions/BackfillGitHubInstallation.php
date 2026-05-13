<?php

declare(strict_types=1);

namespace App\Actions;

use App\Models\GitHubAppInstallation;
use App\Models\GitHubPullRequest;
use App\Models\GitHubRepository;
use App\Services\GitHubDataIngestionService;
use App\Services\GitHubInstallationTokenService;
use Carbon\CarbonImmutable;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;

final readonly class BackfillGitHubInstallation
{
    public function __construct(
        private GitHubInstallationTokenService $tokenService,
        private GitHubDataIngestionService $ingestion,
    ) {}

    public function handle(GitHubAppInstallation $installation, ?CarbonImmutable $since = null): void
    {
        $since ??= CarbonImmutable::now()->subMonth();

        $client = $this->client($this->tokenService->tokenFor($installation));

        foreach ($this->pages($client, 'https://api.github.com/installation/repositories') as $page) {
            /** @var array<int, array<string, mixed>> $repositories */
            $repositories = is_array($page['repositories'] ?? null) ? $page['repositories'] : [];

            foreach ($repositories as $repositoryPayload) {
                $repository = $this->ingestion->upsertRepository($installation, $repositoryPayload);

                $this->backfillCommits($client, $repository, $since);
                $this->backfillPullRequests($client, $repository, $since);
            }
        }
    }

    /**
     * @param  array<int, array<string, mixed>>  $repositories
     */
    public function handleRepositories(GitHubAppInstallation $installation, array $repositories, ?CarbonImmutable $since = null): void
    {
        $since ??= CarbonImmutable::now()->subMonth();

        if ($repositories === []) {
            return;
        }

        $client = $this->client($this->tokenService->tokenFor($installation));

        foreach ($repositories as $repositoryPayload) {
            $repository = $this->ingestion->upsertRepository($installation, $repositoryPayload);

            $this->backfillCommits($client, $repository, $since);
            $this->backfillPullRequests($client, $repository, $since);
        }
    }

    private function backfillCommits(PendingRequest $client, GitHubRepository $repository, CarbonImmutable $since): void
    {
        $url = "https://api.github.com/repos/{$repository->full_name}/commits";

        foreach ($this->pages($client, $url, ['since' => $since->toIso8601String()]) as $commits) {
            if (! is_array($commits)) {
                continue;
            }

            foreach ($commits as $commitPayload) {
                if (is_array($commitPayload) && isset($commitPayload['sha'])) {
                    $this->ingestion->upsertCommit($repository, $commitPayload);
                }
            }
        }
    }

    private function backfillPullRequests(PendingRequest $client, GitHubRepository $repository, CarbonImmutable $since): void
    {
        $url = "https://api.github.com/repos/{$repository->full_name}/pulls";

        foreach ($this->pages($client, $url, [
            'state' => 'all',
            'sort' => 'updated',
            'direction' => 'desc',
        ]) as $pullRequests) {
            if (! is_array($pullRequests)) {
                continue;
            }

            foreach ($pullRequests as $pullRequestPayload) {
                if (! is_array($pullRequestPayload) || ! isset($pullRequestPayload['id'], $pullRequestPayload['number'])) {
                    continue;
                }

                $updatedAt = CarbonImmutable::parse($pullRequestPayload['updated_at']);

                if ($updatedAt->lt($since)) {
                    return;
                }

                $pullRequest = $this->ingestion->upsertPullRequest($repository, $pullRequestPayload);
                $this->backfillPullRequestReviews($client, $repository, $pullRequest);
            }
        }
    }

    private function backfillPullRequestReviews(PendingRequest $client, GitHubRepository $repository, GitHubPullRequest $pullRequest): void
    {
        $url = "https://api.github.com/repos/{$repository->full_name}/pulls/{$pullRequest->number}/reviews";

        foreach ($this->pages($client, $url) as $reviews) {
            if (! is_array($reviews)) {
                continue;
            }

            foreach ($reviews as $reviewPayload) {
                if (is_array($reviewPayload) && isset($reviewPayload['id'])) {
                    $this->ingestion->upsertPullRequestReview($pullRequest, $reviewPayload);
                }
            }
        }
    }

    private function client(string $token): PendingRequest
    {
        return Http::withToken($token)
            ->connectTimeout(10)
            ->timeout(30)
            ->retry(2, 500)
            ->withHeaders([
                'Accept' => 'application/vnd.github+json',
                'X-GitHub-Api-Version' => '2022-11-28',
            ]);
    }

    /**
     * @return iterable<array<mixed>>
     */
    private function pages(PendingRequest $client, string $url, array $query = []): iterable
    {
        $page = 1;

        do {
            $response = $client->get($url, [
                ...$query,
                'per_page' => 100,
                'page' => $page,
            ]);

            if (! $response->successful()) {
                return;
            }

            $payload = $response->json();

            if (! is_array($payload) || $payload === []) {
                return;
            }

            yield $payload;

            $count = isset($payload['repositories']) && is_array($payload['repositories'])
                ? count($payload['repositories'])
                : count($payload);

            $page++;
        } while ($count === 100);
    }
}
