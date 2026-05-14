<?php

declare(strict_types=1);

use App\Contracts\GitHubAppTokenContract;
use App\Jobs\BackfillGitHubInstallationJob;
use App\Jobs\BackfillGitHubRepositoriesJob;
use App\Models\GitHubAppInstallation;
use App\Models\GitHubCommit;
use App\Models\GitHubRepository;
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

it('paginates activity items ten at a time', function (): void {
    $installation = GitHubAppInstallation::factory()->create([
        'account_login' => 'octocat',
    ]);
    $repository = GitHubRepository::query()->create([
        'github_app_installation_id' => $installation->id,
        'github_id' => 1001,
        'name' => 'demo',
        'full_name' => 'myorg/demo',
        'owner_login' => 'myorg',
        'private' => false,
        'default_branch' => 'main',
        'html_url' => 'https://github.com/myorg/demo',
    ]);

    foreach (range(1, 11) as $index) {
        GitHubCommit::query()->create([
            'github_repository_id' => $repository->id,
            'sha' => sprintf('sha-%02d', $index),
            'message' => "Commit {$index}",
            'author_login' => 'octocat',
            'authored_at' => now()->subMinutes(11 - $index),
            'html_url' => "https://github.com/myorg/demo/commit/sha-{$index}",
        ]);
    }

    $firstPage = $this->get(route('github-apps.index'));

    $firstPage->assertOk()
        ->assertInertia(fn ($page) => $page
            ->has('activityItems.data', 10)
            ->where('activityItems.data.0.title', 'Commit 11')
            ->where('activityItems.per_page', 10)
            ->where('activityItems.total', 11));

    $secondPage = $this
        ->withHeaders([
            'X-Inertia-Partial-Component' => 'settings/github/index',
            'X-Inertia-Partial-Data' => 'activityItems',
        ])
        ->get(route('github-apps.index', ['activity' => 2]));

    $secondPage->assertOk()
        ->assertInertia(fn ($page) => $page
            ->has('activityItems.data', 1)
            ->where('activityItems.data.0.title', 'Commit 1'));

    $this->flushHeaders();

    $freshPageWithStaleActivityQuery = $this->get(route('github-apps.index', ['activity' => 2]));

    $freshPageWithStaleActivityQuery->assertOk()
        ->assertInertia(fn ($page) => $page
            ->has('activityItems.data', 10)
            ->where('activityItems.data.0.title', 'Commit 11'));
});

it('compares last twenty four hour activities against the previous day window', function (): void {
    $now = Carbon\CarbonImmutable::parse('2026-05-14 12:00:00', 'UTC');
    $this->travelTo($now);

    $installation = GitHubAppInstallation::factory()->create([
        'account_login' => 'octocat',
    ]);
    $repository = GitHubRepository::query()->create([
        'github_app_installation_id' => $installation->id,
        'github_id' => 1001,
        'name' => 'demo',
        'full_name' => 'myorg/demo',
        'owner_login' => 'myorg',
        'private' => false,
        'default_branch' => 'main',
        'html_url' => 'https://github.com/myorg/demo',
    ]);

    foreach ([1, 2, 3] as $hoursAgo) {
        GitHubCommit::query()->create([
            'github_repository_id' => $repository->id,
            'sha' => sprintf('recent-sha-%d', $hoursAgo),
            'message' => "Recent commit {$hoursAgo}",
            'author_login' => 'octocat',
            'authored_at' => $now->subHours($hoursAgo),
            'html_url' => "https://github.com/myorg/demo/commit/recent-sha-{$hoursAgo}",
        ]);
    }

    GitHubCommit::query()->create([
        'github_repository_id' => $repository->id,
        'sha' => 'previous-sha',
        'message' => 'Previous day commit',
        'author_login' => 'octocat',
        'authored_at' => $now->subHours(30),
        'html_url' => 'https://github.com/myorg/demo/commit/previous-sha',
    ]);

    $response = $this->get(route('github-apps.index'));

    $response->assertOk()
        ->assertInertia(fn ($page) => $page
            ->where('last24HoursSummary.activities', 3)
            ->where('last24HoursSummary.activities_change_percent', 200)
            ->where('last24HoursSummary.activities_change_direction', 'up'));
});

it('redirects to github app installation url', function (): void {
    config(['github.app_name' => 'my-test-app']);

    $response = $this->get(route('github-apps.redirect'));

    $response->assertRedirect('https://github.com/apps/my-test-app/installations/new');
});

it('redirects to settings when github app name is not configured', function (): void {
    config(['github.app_name' => null]);

    $response = $this->get(route('github-apps.redirect'));

    $response->assertRedirect(route('github-apps.index'))
        ->assertSessionHas('status', 'github-app-misconfigured');
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

it('shows pull request review requests for connected accounts', function (): void {
    config(['github.webhook_secret' => 'webhook-secret']);

    GitHubAppInstallation::factory()->create([
        'installation_id' => 12345678,
        'account_login' => 'octocat',
    ]);

    $payload = [
        'action' => 'review_requested',
        'installation' => ['id' => 12345678],
        'requested_reviewer' => [
            'login' => 'octocat',
        ],
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
        'pull_request' => [
            'id' => 555,
            'number' => 42,
            'title' => 'Needs another look',
            'state' => 'open',
            'draft' => false,
            'user' => ['login' => 'teammate'],
            'html_url' => 'https://github.com/myorg/demo/pull/42',
            'created_at' => '2026-05-14T00:00:00Z',
            'updated_at' => '2026-05-14T01:00:00Z',
            'closed_at' => null,
            'merged_at' => null,
            'requested_reviewers' => [],
        ],
    ];
    $body = json_encode($payload, JSON_THROW_ON_ERROR);

    $response = $this
        ->withHeaders(githubWebhookHeaders('pull_request', $body))
        ->postJson(route('github-apps.webhook'), $payload);

    $response->assertOk()
        ->assertJson(['ok' => true]);

    $this->get(route('github-apps.index'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->has('pullRequestsToReviewItems', 1)
            ->where('pullRequestsToReviewItems.0.title', 'Needs another look'));
});

it('removes pull request review requests after they are removed', function (): void {
    config(['github.webhook_secret' => 'webhook-secret']);

    GitHubAppInstallation::factory()->create([
        'installation_id' => 12345678,
        'account_login' => 'octocat',
    ]);

    $basePayload = [
        'installation' => ['id' => 12345678],
        'requested_reviewer' => [
            'login' => 'octocat',
        ],
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
        'pull_request' => [
            'id' => 555,
            'number' => 42,
            'title' => 'Needs another look',
            'state' => 'open',
            'draft' => false,
            'user' => ['login' => 'teammate'],
            'html_url' => 'https://github.com/myorg/demo/pull/42',
            'created_at' => '2026-05-14T00:00:00Z',
            'updated_at' => '2026-05-14T01:00:00Z',
            'closed_at' => null,
            'merged_at' => null,
            'requested_reviewers' => [],
        ],
    ];

    $requestedPayload = ['action' => 'review_requested', ...$basePayload];
    $requestedBody = json_encode($requestedPayload, JSON_THROW_ON_ERROR);

    $this
        ->withHeaders(githubWebhookHeaders('pull_request', $requestedBody))
        ->postJson(route('github-apps.webhook'), $requestedPayload)
        ->assertOk();

    $removedPayload = ['action' => 'review_request_removed', ...$basePayload];
    $removedBody = json_encode($removedPayload, JSON_THROW_ON_ERROR);

    $this
        ->withHeaders(githubWebhookHeaders('pull_request', $removedBody))
        ->postJson(route('github-apps.webhook'), $removedPayload)
        ->assertOk();

    $this->get(route('github-apps.index'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->has('pullRequestsToReviewItems', 0));
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
