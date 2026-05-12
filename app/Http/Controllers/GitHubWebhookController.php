<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\GitHubAppInstallation;
use App\Models\GitHubPullRequest;
use App\Services\GitHubDataIngestionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final readonly class GitHubWebhookController
{
    public function __construct(private GitHubDataIngestionService $ingestion) {}

    public function __invoke(Request $request): JsonResponse
    {
        if (! $this->hasValidSignature($request)) {
            return response()->json(['message' => 'Invalid signature.'], 401);
        }

        $event = (string) $request->header('X-GitHub-Event');
        /** @var array<string, mixed> $payload */
        $payload = $request->json()->all();

        match ($event) {
            'ping' => null,
            'push' => $this->handlePush($payload),
            'pull_request' => $this->handlePullRequest($payload),
            'pull_request_review' => $this->handlePullRequestReview($payload),
            default => null,
        };

        return response()->json(['ok' => true]);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function handlePush(array $payload): void
    {
        $installation = $this->installationFromPayload($payload);

        if ($installation === null || ! is_array($payload['repository'] ?? null)) {
            return;
        }

        /** @var array<string, mixed> $repositoryPayload */
        $repositoryPayload = $payload['repository'];
        $repository = $this->ingestion->upsertRepository($installation, $repositoryPayload);

        /** @var array<int, array<string, mixed>> $commits */
        $commits = is_array($payload['commits'] ?? null) ? $payload['commits'] : [];

        foreach ($commits as $commitPayload) {
            $commitPayload['sha'] ??= $commitPayload['id'] ?? null;

            if (isset($commitPayload['sha'])) {
                $this->ingestion->upsertCommit($repository, $commitPayload);
            }
        }
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function handlePullRequest(array $payload): void
    {
        $installation = $this->installationFromPayload($payload);

        if (
            $installation === null
            || ! is_array($payload['repository'] ?? null)
            || ! is_array($payload['pull_request'] ?? null)
        ) {
            return;
        }

        /** @var array<string, mixed> $repositoryPayload */
        $repositoryPayload = $payload['repository'];
        /** @var array<string, mixed> $pullRequestPayload */
        $pullRequestPayload = $payload['pull_request'];

        $repository = $this->ingestion->upsertRepository($installation, $repositoryPayload);
        $this->ingestion->upsertPullRequest($repository, $pullRequestPayload);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function handlePullRequestReview(array $payload): void
    {
        $installation = $this->installationFromPayload($payload);

        if (
            $installation === null
            || ! is_array($payload['repository'] ?? null)
            || ! is_array($payload['pull_request'] ?? null)
            || ! is_array($payload['review'] ?? null)
        ) {
            return;
        }

        /** @var array<string, mixed> $repositoryPayload */
        $repositoryPayload = $payload['repository'];
        /** @var array<string, mixed> $pullRequestPayload */
        $pullRequestPayload = $payload['pull_request'];
        /** @var array<string, mixed> $reviewPayload */
        $reviewPayload = $payload['review'];

        $repository = $this->ingestion->upsertRepository($installation, $repositoryPayload);
        $pullRequest = GitHubPullRequest::query()->where('github_id', $pullRequestPayload['id'])->first()
            ?? $this->ingestion->upsertPullRequest($repository, $pullRequestPayload);

        $this->ingestion->upsertPullRequestReview($pullRequest, $reviewPayload);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function installationFromPayload(array $payload): ?GitHubAppInstallation
    {
        if (! is_array($payload['installation'] ?? null) || ! isset($payload['installation']['id'])) {
            return null;
        }

        return GitHubAppInstallation::query()
            ->where('installation_id', $payload['installation']['id'])
            ->first();
    }

    private function hasValidSignature(Request $request): bool
    {
        $secret = config('github.webhook_secret');

        if (! is_string($secret) || $secret === '' || $secret === 'your_webhook_secret') {
            return false;
        }

        $signature = (string) $request->header('X-Hub-Signature-256');

        if (! str_starts_with($signature, 'sha256=')) {
            return false;
        }

        $expected = 'sha256='.hash_hmac('sha256', $request->getContent(), $secret);

        return hash_equals($expected, $signature);
    }
}
