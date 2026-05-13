<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Database\Factories\GitHubAppInstallationFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property-read int $id
 * @property-read int|null $user_id
 * @property-read int $installation_id
 * @property-read string $account_login
 * @property-read string $account_type
 * @property-read string|null $account_name
 * @property-read string|null $avatar_url
 * @property-read string|null $access_token
 * @property-read CarbonInterface|null $token_expires_at
 * @property-read string $sync_status
 * @property-read CarbonInterface|null $sync_started_at
 * @property-read CarbonInterface|null $sync_finished_at
 * @property-read string|null $sync_error
 * @property-read CarbonInterface $created_at
 * @property-read CarbonInterface $updated_at
 */
final class GitHubAppInstallation extends Model
{
    /**
     * @use HasFactory<GitHubAppInstallationFactory>
     */
    use HasFactory;

    /** @var string */
    protected $table = 'github_app_installations';

    /**
     * @var list<string>
     */
    protected $hidden = [
        'access_token',
    ];

    /**
     * @return array<string, string>
     */
    public function casts(): array
    {
        return [
            'id' => 'integer',
            'user_id' => 'integer',
            'installation_id' => 'integer',
            'account_login' => 'string',
            'account_type' => 'string',
            'account_name' => 'string',
            'avatar_url' => 'string',
            'access_token' => 'encrypted',
            'token_expires_at' => 'datetime',
            'sync_status' => 'string',
            'sync_started_at' => 'datetime',
            'sync_finished_at' => 'datetime',
            'sync_error' => 'string',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return HasMany<GitHubRepository, $this>
     */
    public function repositories(): HasMany
    {
        return $this->hasMany(GitHubRepository::class, 'github_app_installation_id');
    }

    public function isTokenExpired(): bool
    {
        return $this->token_expires_at !== null && $this->token_expires_at->isPast();
    }
}
