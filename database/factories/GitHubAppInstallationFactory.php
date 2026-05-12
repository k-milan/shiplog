<?php

declare(strict_types=1);

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\GitHubAppInstallation>
 */
final class GitHubAppInstallationFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $login = fake()->userName();

        return [
            'user_id' => null,
            'installation_id' => fake()->unique()->numberBetween(1000000, 9999999),
            'account_login' => $login,
            'account_type' => fake()->randomElement(['User', 'Organization']),
            'account_name' => fake()->optional()->name(),
            'avatar_url' => fake()->imageUrl(100, 100),
            'access_token' => null,
            'token_expires_at' => null,
        ];
    }

    public function forOrganization(): self
    {
        return $this->state(fn (array $attributes): array => [
            'account_type' => 'Organization',
        ]);
    }

    public function forUser(): self
    {
        return $this->state(fn (array $attributes): array => [
            'account_type' => 'User',
        ]);
    }
}
