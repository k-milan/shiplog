<?php

declare(strict_types=1);

namespace App\Actions;

use App\Models\GitHubAppInstallation;
use App\Models\User;

final readonly class ConnectGitHubApp
{
    /**
     * @param  array{installation_id: int, account_login: string, account_type: string, account_name: string|null, avatar_url: string|null}  $installationData
     */
    public function handle(User $user, array $installationData): GitHubAppInstallation
    {
        return GitHubAppInstallation::query()->updateOrCreate(
            [
                'installation_id' => $installationData['installation_id'],
            ],
            [
                'user_id' => $user->id,
                'account_login' => $installationData['account_login'],
                'account_type' => $installationData['account_type'],
                'account_name' => $installationData['account_name'],
                'avatar_url' => $installationData['avatar_url'],
            ],
        );
    }
}
