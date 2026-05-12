<?php

declare(strict_types=1);

namespace App\Services;

use App\Contracts\GitHubAppTokenContract;
use App\Models\GitHubAppInstallation;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Http;
use RuntimeException;

final readonly class GitHubInstallationTokenService
{
    public function __construct(private GitHubAppTokenContract $appTokenService) {}

    public function tokenFor(GitHubAppInstallation $installation): string
    {
        if ($installation->access_token !== null && ! $installation->isTokenExpired()) {
            return $installation->access_token;
        }

        $response = Http::withHeaders([
            'Authorization' => 'Bearer '.$this->appTokenService->generateAppToken(),
            'Accept' => 'application/vnd.github+json',
            'X-GitHub-Api-Version' => '2022-11-28',
        ])->post("https://api.github.com/app/installations/{$installation->installation_id}/access_tokens");

        if (! $response->successful()) {
            throw new RuntimeException('Failed to create GitHub installation token.');
        }

        /** @var array{token: string, expires_at: string} $data */
        $data = $response->json();

        $installation->forceFill([
            'access_token' => $data['token'],
            'token_expires_at' => CarbonImmutable::parse($data['expires_at'])->subMinute(),
        ])->save();

        return $data['token'];
    }
}
