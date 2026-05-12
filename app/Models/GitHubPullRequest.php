<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class GitHubPullRequest extends Model
{
    protected $table = 'github_pull_requests';

    /**
     * @return array<string, string>
     */
    public function casts(): array
    {
        return [
            'id' => 'integer',
            'github_repository_id' => 'integer',
            'github_id' => 'integer',
            'number' => 'integer',
            'draft' => 'boolean',
            'opened_at' => 'datetime',
            'updated_at_github' => 'datetime',
            'closed_at' => 'datetime',
            'merged_at' => 'datetime',
            'payload' => 'array',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<GitHubRepository, $this>
     */
    public function repository(): BelongsTo
    {
        return $this->belongsTo(GitHubRepository::class, 'github_repository_id');
    }

    /**
     * @return HasMany<GitHubPullRequestReview, $this>
     */
    public function reviews(): HasMany
    {
        return $this->hasMany(GitHubPullRequestReview::class, 'github_pull_request_id');
    }
}
