<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class GitHubPullRequestReview extends Model
{
    protected $table = 'github_pull_request_reviews';

    /**
     * @return array<string, string>
     */
    public function casts(): array
    {
        return [
            'id' => 'integer',
            'github_pull_request_id' => 'integer',
            'github_id' => 'integer',
            'submitted_at' => 'datetime',
            'payload' => 'array',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<GitHubPullRequest, $this>
     */
    public function pullRequest(): BelongsTo
    {
        return $this->belongsTo(GitHubPullRequest::class, 'github_pull_request_id');
    }
}
