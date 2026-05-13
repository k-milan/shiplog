<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Actions\BackfillGitHubInstallation;
use App\Models\GitHubAppInstallation;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Throwable;

final class BackfillGitHubRepositoriesJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 300;

    /**
     * @param  array<int, array<string, mixed>>  $repositories
     */
    public function __construct(
        public int $installationId,
        public array $repositories,
    ) {}

    public function handle(BackfillGitHubInstallation $backfill): void
    {
        $installation = GitHubAppInstallation::query()->find($this->installationId);

        if ($installation === null || $this->repositories === []) {
            return;
        }

        try {
            $backfill->handleRepositories(
                $installation,
                $this->repositories,
                CarbonImmutable::now()->subMonth(),
            );

            Log::info('Backfilled GitHub repositories added to installation.', [
                'installation_id' => $installation->installation_id,
                'repositories_added_count' => count($this->repositories),
            ]);
        } catch (Throwable $exception) {
            Log::error('Failed to backfill GitHub repositories added to installation.', [
                'installation_id' => $installation->installation_id,
                'repositories_added_count' => count($this->repositories),
                'exception' => $exception->getMessage(),
            ]);

            throw $exception;
        }
    }
}
