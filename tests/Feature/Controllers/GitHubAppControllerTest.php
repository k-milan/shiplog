<?php

declare(strict_types=1);

use App\Contracts\GitHubAppTokenContract;
use App\Models\GitHubAppInstallation;
use App\Models\User;
use Illuminate\Support\Facades\Http;

beforeEach(function (): void {
    $this->withoutVite();

    $this->mock(GitHubAppTokenContract::class)
        ->shouldReceive('generateAppToken')
        ->andReturn('fake-jwt-token');
});

it('renders github settings page for authenticated user', function (): void {
    $user = User::factory()->create();

    $response = $this->actingAs($user)
        ->get(route('github-apps.index'));

    $response->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('settings/github/index')
            ->has('installations'));
});

it('redirects unauthenticated users from github settings', function (): void {
    $response = $this->get(route('github-apps.index'));

    $response->assertRedirectToRoute('login');
});

it('shows existing installations on the settings page', function (): void {
    $user = User::factory()->create();
    GitHubAppInstallation::factory()->create([
        'user_id' => $user->id,
        'account_login' => 'myorg',
    ]);

    $response = $this->actingAs($user)
        ->get(route('github-apps.index'));

    $response->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('settings/github/index')
            ->has('installations', 1)
            ->where('installations.0.account_login', 'myorg'));
});

it('only shows installations belonging to the authenticated user', function (): void {
    $user = User::factory()->create();
    $otherUser = User::factory()->create();

    GitHubAppInstallation::factory()->create(['user_id' => $otherUser->id]);

    $response = $this->actingAs($user)
        ->get(route('github-apps.index'));

    $response->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('settings/github/index')
            ->has('installations', 0));
});

it('redirects to github app installation url', function (): void {
    config(['github.app_name' => 'my-test-app']);

    $user = User::factory()->create();

    $response = $this->actingAs($user)
        ->get(route('github-apps.redirect'));

    $response->assertRedirect('https://github.com/apps/my-test-app/installations/new');
});

it('redirects unauthenticated users away from github redirect', function (): void {
    $response = $this->get(route('github-apps.redirect'));

    $response->assertRedirectToRoute('login');
});

it('handles github callback and connects installation', function (): void {
    $user = User::factory()->create();

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

    $response = $this->actingAs($user)
        ->get(route('github-apps.callback', [
            'installation_id' => 12345678,
            'setup_action' => 'install',
        ]));

    $response->assertRedirectToRoute('github-apps.index')
        ->assertSessionHas('status', 'github-app-connected');

    $this->assertDatabaseHas('github_app_installations', [
        'user_id' => $user->id,
        'installation_id' => 12345678,
        'account_login' => 'myorg',
        'account_type' => 'Organization',
    ]);
});

it('handles github callback with delete setup action', function (): void {
    $user = User::factory()->create();

    $response = $this->actingAs($user)
        ->get(route('github-apps.callback', [
            'installation_id' => 12345678,
            'setup_action' => 'delete',
        ]));

    $response->assertRedirectToRoute('github-apps.index')
        ->assertSessionHas('status', 'github-app-removed');
});

it('handles github callback when github api fails', function (): void {
    $user = User::factory()->create();

    Http::fake([
        'api.github.com/app/installations/*' => Http::response([], 404),
    ]);

    $response = $this->actingAs($user)
        ->get(route('github-apps.callback', [
            'installation_id' => 99999999,
            'setup_action' => 'install',
        ]));

    $response->assertRedirectToRoute('github-apps.index')
        ->assertSessionHas('status', 'github-app-error');
});

it('redirects unauthenticated users away from callback', function (): void {
    $response = $this->get(route('github-apps.callback', [
        'installation_id' => 123,
        'setup_action' => 'install',
    ]));

    $response->assertRedirectToRoute('login');
});

it('may disconnect a github app installation', function (): void {
    $user = User::factory()->create();
    $installation = GitHubAppInstallation::factory()->create(['user_id' => $user->id]);

    $response = $this->actingAs($user)
        ->delete(route('github-apps.destroy', $installation));

    $response->assertRedirectToRoute('github-apps.index')
        ->assertSessionHas('status', 'github-app-disconnected');

    $this->assertDatabaseMissing('github_app_installations', ['id' => $installation->id]);
});

it('cannot disconnect another users github app installation', function (): void {
    $user = User::factory()->create();
    $otherUser = User::factory()->create();
    $installation = GitHubAppInstallation::factory()->create(['user_id' => $otherUser->id]);

    $response = $this->actingAs($user)
        ->delete(route('github-apps.destroy', $installation));

    $response->assertForbidden();

    $this->assertDatabaseHas('github_app_installations', ['id' => $installation->id]);
});

it('redirects unauthenticated users away from destroy', function (): void {
    $installation = GitHubAppInstallation::factory()->create();

    $response = $this->delete(route('github-apps.destroy', $installation));

    $response->assertRedirectToRoute('login');
});
