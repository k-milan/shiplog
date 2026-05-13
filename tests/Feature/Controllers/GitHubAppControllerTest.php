<?php

declare(strict_types=1);

use App\Contracts\GitHubAppTokenContract;
use App\Jobs\BackfillGitHubInstallationJob;
use App\Jobs\BackfillGitHubRepositoriesJob;
use App\Models\GitHubAppInstallation;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Http;

beforeEach(function (): void {
    $this->withoutVite();

    $this->mock(GitHubAppTokenContract::class)
        ->shouldReceive('generateAppToken')
        ->andReturn('fake-jwt-token');
});

it('renders github settings page', function (): void {
    $response = $this->get(route('github-apps.index'));

    $response->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('settings/github/index')
            ->has('installations'));
});

it('renders github settings page from the home page', function (): void {
    $response = $this->get(route('home'));

    $response->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('settings/github/index')
            ->has('installations'));
});

it('shows existing installations on the settings page', function (): void {
    GitHubAppInstallation::factory()->create([
        'account_login' => 'myorg',
    ]);

    $response = $this->get(route('github-apps.index'));

    $response->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('settings/github/index')
            ->has('installations', 1)
            ->where('installations.0.account_login', 'myorg'));
});

it('shows all connected installations on the settings page', function (): void {
    GitHubAppInstallation::factory()->count(2)->create();

    $response = $this->get(route('github-apps.index'));

    $response->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('settings/github/index')
            ->has('installations', 2));
});

it('redirects to github app installation url', function (): void {
    config(['github.app_name' => 'my-test-app']);

    $response = $this->get(route('github-apps.redirect'));

    $response->assertRedirect('https://github.com/apps/my-test-app/installations/new');
});

it('handles github callback and connects installation', function (): void {
    Bus::fake();

    Http::fake([
        'api.github.com/app/installations/*' => Http::response([
            'id' => 12345678,
            'account' => [
                'login' => 'myorg',
                'type' => 'Organization',
                'name' => 'My Org',
                'avatar_url' => 'https://avatars.githubusercontent.com/u/123',
            ],
        ], 200),
    ]);

    $response = $this->get(route('github-apps.callback', [
        'installation_id' => 12345678,
        'setup_action' => 'install',
    ]));

    $response->assertRedirectToRoute('github-apps.index')
        ->assertSessionHas('status', 'github-app-connected');

    $this->assertDatabaseHas('github_app_installations', [
        'user_id' => null,
        'installation_id' => 12345678,
        'account_login' => 'myorg',
        'account_type' => 'Organization',
        'sync_status' => 'pending',
    ]);

    Bus::assertDispatched(BackfillGitHubInstallationJob::class);
});

it('handles github callback with delete setup action', function (): void {
    $response = $this->get(route('github-apps.callback', [
        'installation_id' => 12345678,
        'setup_action' => 'delete',
    ]));

    $response->assertRedirectToRoute('github-apps.index')
        ->assertSessionHas('status', 'github-app-removed');
});

it('handles github callback when github api fails', function (): void {
    Http::fake([
        'api.github.com/app/installations/*' => Http::response([], 404),
    ]);

    $response = $this->get(route('github-apps.callback', [
        'installation_id' => 99999999,
        'setup_action' => 'install',
    ]));

    $response->assertRedirectToRoute('github-apps.index')
        ->assertSessionHas('status', 'github-app-error');
});

it('may disconnect a github app installation', function (): void {
    $installation = GitHubAppInstallation::factory()->create();

    $response = $this->delete(route('github-apps.destroy', $installation));

    $response->assertRedirectToRoute('github-apps.index')
        ->assertSessionHas('status', 'github-app-disconnected');

    $this->assertDatabaseMissing('github_app_installations', ['id' => $installation->id]);
});

it('ingests push webhooks', function (): void {
    config(['github.webhook_secret' => 'webhook-secret']);

    GitHubAppInstallation::factory()->create([
        'installation_id' => 12345678,
    ]);

    $payload = [
        'installation' => ['id' => 12345678],
        'repository' => [
            'id' => 987,
            'name' => 'demo',
            'full_name' => 'myorg/demo',
            'owner' => ['login' => 'myorg'],
            'private' => false,
            'default_branch' => 'main',
            'html_url' => 'https://github.com/myorg/demo',
            'pushed_at' => '2026-05-01T00:00:00Z',
        ],
        'commits' => [
            [
                'id' => 'pushsha',
                'message' => 'Ship webhook sync',
                'timestamp' => '2026-05-06T00:00:00Z',
                'url' => 'https://github.com/myorg/demo/commit/pushsha',
                'author' => [
                    'username' => 'octocat',
                    'name' => 'Octo Cat',
                    'email' => 'octocat@example.com',
                ],
            ],
        ],
    ];
    $body = json_encode($payload, JSON_THROW_ON_ERROR);

    $response = $this
        ->withHeaders(githubWebhookHeaders('push', $body))
        ->postJson(route('github-apps.webhook'), $payload);

    $response->assertOk()
        ->assertJson(['ok' => true]);

    $this->assertDatabaseHas('github_commits', [
        'sha' => 'pushsha',
        'message' => 'Ship webhook sync',
    ]);
});

it('backfills repositories added to a github app installation', function (): void {
    config(['github.webhook_secret' => 'webhook-secret']);
    Bus::fake();

    $installation = GitHubAppInstallation::factory()->create([
        'installation_id' => 12345678,
    ]);

    $payload = [
        'installation' => ['id' => 12345678],
        'repositories_added' => [
            [
                'id' => 654321,
                'name' => 'new-repo',
                'full_name' => 'myorg/new-repo',
                'owner' => ['login' => 'myorg'],
                'private' => false,
                'default_branch' => 'main',
                'html_url' => 'https://github.com/myorg/new-repo',
                'pushed_at' => '2026-05-06T00:00:00Z',
            ],
        ],
        'repositories_removed' => [],
    ];
    $body = json_encode($payload, JSON_THROW_ON_ERROR);

    $response = $this
        ->withHeaders(githubWebhookHeaders('installation_repositories', $body))
        ->postJson(route('github-apps.webhook'), $payload);

    $response->assertOk()
        ->assertJson(['ok' => true]);

    Bus::assertDispatched(
        BackfillGitHubRepositoriesJob::class,
        fn (BackfillGitHubRepositoriesJob $job): bool => $job->installationId === $installation->id
            && $job->repositories[0]['full_name'] === 'myorg/new-repo',
    );
});

it('rejects webhooks with invalid signatures', function (): void {
    config(['github.webhook_secret' => 'webhook-secret']);

    $response = $this
        ->withHeaders([
            'X-GitHub-Event' => 'ping',
            'X-Hub-Signature-256' => 'sha256=invalid',
        ])
        ->postJson(route('github-apps.webhook'), ['zen' => 'Keep it logically awesome.']);

    $response->assertUnauthorized();
});

/**
 * @return array<string, string>
 */
function githubWebhookHeaders(string $event, string $body): array
{
    return [
        'X-GitHub-Event' => $event,
        'X-Hub-Signature-256' => 'sha256='.hash_hmac('sha256', $body, 'webhook-secret'),
    ];
}
