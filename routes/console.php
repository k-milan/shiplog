<?php

declare(strict_types=1);

use App\Actions\BackfillGitHubInstallation;
use App\Models\GitHubAppInstallation;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function (): void {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('github:backfill {installation_id?}', function (BackfillGitHubInstallation $backfill): int {
    $query = GitHubAppInstallation::query();

    if ($this->argument('installation_id') !== null) {
        $query->where('installation_id', $this->argument('installation_id'));
    }

    $installations = $query->get();

    if ($installations->isEmpty()) {
        $this->warn('No GitHub installations found.');

        return self::SUCCESS;
    }

    foreach ($installations as $installation) {
        $this->line("Backfilling {$installation->account_login}...");
        $backfill->handle($installation);
    }

    $this->info('GitHub backfill complete.');

    return self::SUCCESS;
})->purpose('Backfill GitHub repositories, commits, pull requests, and reviews from the last month');
