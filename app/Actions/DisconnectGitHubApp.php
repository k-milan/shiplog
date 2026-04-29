<?php

declare(strict_types=1);

namespace App\Actions;

use App\Models\GitHubAppInstallation;

final readonly class DisconnectGitHubApp
{
    public function handle(GitHubAppInstallation $installation): void
    {
        $installation->delete();
    }
}
