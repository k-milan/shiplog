<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Actions\ConnectGitHubApp;
use App\Actions\DisconnectGitHubApp;
use App\Contracts\GitHubAppTokenContract;
use App\Models\GitHubAppInstallation;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Inertia\Inertia;
use Inertia\Response;

final readonly class GitHubAppController
{
    public function __construct(
        private ConnectGitHubApp $connectGitHubApp,
        private DisconnectGitHubApp $disconnectGitHubApp,
        private GitHubAppTokenContract $tokenService,
    ) {}

    public function index(Request $request): Response
    {
        return Inertia::render('settings/github/index', [
            'installations' => $request->user()
                ->githubAppInstallations()
                ->orderBy('account_login')
                ->get(['id', 'installation_id', 'account_login', 'account_type', 'account_name', 'avatar_url', 'created_at']),
        ]);
    }

    public function redirect(): RedirectResponse
    {
        $appName = config('github.app_name');

        return redirect("https://github.com/apps/{$appName}/installations/new");
    }

    public function callback(Request $request): RedirectResponse
    {
        $installationId = $request->integer('installation_id');
        $setupAction = $request->string('setup_action')->toString();

        if ($setupAction === 'delete' || $installationId === 0) {
            return to_route('github-apps.index')
                ->with('status', 'github-app-removed');
        }

        $installationData = $this->fetchInstallationData($installationId);

        if ($installationData === null) {
            return to_route('github-apps.index')
                ->with('status', 'github-app-error');
        }

        $this->connectGitHubApp->handle($request->user(), $installationData);

        return to_route('github-apps.index')
            ->with('status', 'github-app-connected');
    }

    public function destroy(Request $request, GitHubAppInstallation $installation): RedirectResponse
    {
        $this->authorizeOwnership($request->user(), $installation);

        $this->disconnectGitHubApp->handle($installation);

        return to_route('github-apps.index')
            ->with('status', 'github-app-disconnected');
    }

    /**
     * @return array{installation_id: int, account_login: string, account_type: string, account_name: string|null, avatar_url: string|null}|null
     */
    private function fetchInstallationData(int $installationId): ?array
    {
        $response = Http::withHeaders([
            'Authorization' => 'Bearer '.$this->tokenService->generateAppToken(),
            'Accept' => 'application/vnd.github+json',
            'X-GitHub-Api-Version' => '2022-11-28',
        ])->get("https://api.github.com/app/installations/{$installationId}");

        if (! $response->successful()) {
            return null;
        }

        /** @var array{id: int, account: array{login: string, type: string, name: string|null, avatar_url: string|null}} $data */
        $data = $response->json();

        return [
            'installation_id' => $data['id'],
            'account_login' => $data['account']['login'],
            'account_type' => $data['account']['type'],
            'account_name' => $data['account']['name'] ?? null,
            'avatar_url' => $data['account']['avatar_url'] ?? null,
        ];
    }

    private function authorizeOwnership(User $user, GitHubAppInstallation $installation): void
    {
        abort_if($installation->user_id !== $user->id, 403);
    }
}
