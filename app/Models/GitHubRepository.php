<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class GitHubRepository extends Model
{
    protected $table = 'github_repositories';

    /**
     * @return array<string, string>
     */
    public function casts(): array
    {
        return [
            'id' => 'integer',
            'github_app_installation_id' => 'integer',
            'github_id' => 'integer',
            'private' => 'boolean',
            'pushed_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<GitHubAppInstallation, $this>
     */
    public function installation(): BelongsTo
    {
        return $this->belongsTo(GitHubAppInstallation::class, 'github_app_installation_id');
    }

    /**
     * @return HasMany<GitHubCommit, $this>
     */
    public function commits(): HasMany
    {
        return $this->hasMany(GitHubCommit::class, 'github_repository_id');
    }

    /**
     * @return HasMany<GitHubPullRequest, $this>
     */
    public function pullRequests(): HasMany
    {
        return $this->hasMany(GitHubPullRequest::class, 'github_repository_id');
    }
}
