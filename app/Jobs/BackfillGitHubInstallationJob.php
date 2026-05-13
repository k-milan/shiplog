<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Actions\BackfillGitHubInstallation;
use App\Models\GitHubAppInstallation;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

final class BackfillGitHubInstallationJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 300;

    public function __construct(public int $installationId) {}

    public function handle(BackfillGitHubInstallation $backfill): void
    {
        $installation = GitHubAppInstallation::query()->find($this->installationId);

        if ($installation === null) {
            return;
        }

        $installation->forceFill([
            'sync_status' => 'syncing',
            'sync_started_at' => CarbonImmutable::now(),
            'sync_finished_at' => null,
            'sync_error' => null,
        ])->save();

        try {
            $backfill->handle($installation);

            $installation->forceFill([
                'sync_status' => 'complete',
                'sync_finished_at' => CarbonImmutable::now(),
                'sync_error' => null,
            ])->save();
        } catch (Throwable $exception) {
            $installation->forceFill([
                'sync_status' => 'failed',
                'sync_finished_at' => CarbonImmutable::now(),
                'sync_error' => $exception->getMessage(),
            ])->save();

            throw $exception;
        }
    }

    public function failed(?Throwable $exception): void
    {
        GitHubAppInstallation::query()
            ->whereKey($this->installationId)
            ->update([
                'sync_status' => 'failed',
                'sync_finished_at' => CarbonImmutable::now(),
                'sync_error' => $exception?->getMessage() ?? 'GitHub backfill job failed.',
            ]);
    }
}
