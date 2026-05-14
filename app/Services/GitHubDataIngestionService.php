<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\GitHubAppInstallation;
use App\Models\GitHubCommit;
use App\Models\GitHubPullRequest;
use App\Models\GitHubPullRequestReview;
use App\Models\GitHubRepository;
use Carbon\CarbonImmutable;

final readonly class GitHubDataIngestionService
{
    /**
     * @param  array<string, mixed>  $payload
     */
    public function upsertRepository(GitHubAppInstallation $installation, array $payload): GitHubRepository
    {
        /** @var array{login?: string} $owner */
        $owner = is_array($payload['owner'] ?? null) ? $payload['owner'] : [];

        return GitHubRepository::query()->updateOrCreate(
            ['github_id' => $payload['id']],
            [
                'github_app_installation_id' => $installation->id,
                'name' => $payload['name'],
                'full_name' => $payload['full_name'],
                'owner_login' => $owner['login'] ?? str((string) $payload['full_name'])->before('/')->toString(),
                'private' => $payload['private'] ?? false,
                'default_branch' => $payload['default_branch'] ?? null,
                'html_url' => $payload['html_url'] ?? 'https://github.com/'.$payload['full_name'],
                'pushed_at' => $this->date($payload['pushed_at'] ?? null),
            ],
        );
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public function upsertCommit(GitHubRepository $repository, array $payload): GitHubCommit
    {
        /** @var array<string, mixed> $commit */
        $commit = is_array($payload['commit'] ?? null) ? $payload['commit'] : [];
        /** @var array<string, mixed> $author */
        $author = is_array($commit['author'] ?? null) ? $commit['author'] : [];
        /** @var array<string, mixed> $githubAuthor */
        $githubAuthor = is_array($payload['author'] ?? null) ? $payload['author'] : [];

        return GitHubCommit::query()->updateOrCreate(
            ['sha' => $payload['sha']],
            [
                'github_repository_id' => $repository->id,
                'message' => $commit['message'] ?? $payload['message'] ?? null,
                'author_login' => $githubAuthor['login'] ?? $payload['author']['username'] ?? null,
                'author_name' => $author['name'] ?? $payload['author']['name'] ?? null,
                'author_email' => $author['email'] ?? $payload['author']['email'] ?? null,
                'authored_at' => $this->date($author['date'] ?? $payload['timestamp'] ?? null),
                'html_url' => $payload['html_url'] ?? $payload['url'] ?? null,
                'payload' => $payload,
            ],
        );
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public function upsertPullRequest(GitHubRepository $repository, array $payload): GitHubPullRequest
    {
        /** @var array<string, mixed> $user */
        $user = is_array($payload['user'] ?? null) ? $payload['user'] : [];

        return GitHubPullRequest::query()->updateOrCreate(
            ['github_id' => $payload['id']],
            [
                'github_repository_id' => $repository->id,
                'number' => $payload['number'],
                'title' => $payload['title'],
                'state' => $payload['state'],
                'draft' => $payload['draft'] ?? false,
                'author_login' => $user['login'] ?? null,
                'html_url' => $payload['html_url'],
                'opened_at' => $this->date($payload['created_at'] ?? null),
                'updated_at_github' => $this->date($payload['updated_at'] ?? null),
                'closed_at' => $this->date($payload['closed_at'] ?? null),
                'merged_at' => $this->date($payload['merged_at'] ?? null),
                'payload' => $payload,
            ],
        );
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public function upsertPullRequestReview(GitHubPullRequest $pullRequest, array $payload): GitHubPullRequestReview
    {
        /** @var array<string, mixed> $user */
        $user = is_array($payload['user'] ?? null) ? $payload['user'] : [];

        return GitHubPullRequestReview::query()->updateOrCreate(
            ['github_id' => $payload['id']],
            [
                'github_pull_request_id' => $pullRequest->id,
                'state' => $payload['state'],
                'author_login' => $user['login'] ?? null,
                'body' => $payload['body'] ?? null,
                'html_url' => $payload['html_url'] ?? null,
                'submitted_at' => $this->date($payload['submitted_at'] ?? null),
                'payload' => $payload,
            ],
        );
    }

    private function date(mixed $value): ?string
    {
        if (! is_string($value) || $value === '') {
            return null;
        }

        return CarbonImmutable::parse($value)->utc()->toDateTimeString();
    }
}
