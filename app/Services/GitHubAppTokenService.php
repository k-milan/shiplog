<?php

declare(strict_types=1);

namespace App\Services;

use App\Contracts\GitHubAppTokenContract;
use RuntimeException;

/**
 * Generates a JWT for authenticating as a GitHub App.
 *
 * GitHub requires a signed JWT built from the App's private key (RS256).
 * No external JWT library is needed — PHP's openssl extension handles this.
 */
final readonly class GitHubAppTokenService implements GitHubAppTokenContract
{
    public function generateAppToken(): string
    {
        $appId = config('github.app_id');
        $privateKey = config('github.private_key');

        if (! $appId || ! $privateKey) {
            throw new RuntimeException('GitHub App credentials are not configured.');
        }

        $now = time();

        $header = $this->base64UrlEncode(json_encode(['alg' => 'RS256', 'typ' => 'JWT'], JSON_THROW_ON_ERROR));
        $payload = $this->base64UrlEncode(json_encode([
            'iat' => $now - 60,
            'exp' => $now + (9 * 60),
            'iss' => $appId,
        ], JSON_THROW_ON_ERROR));

        $signingInput = $header.'.'.$payload;

        $privateKeyResource = openssl_pkey_get_private($privateKey);

        if ($privateKeyResource === false) {
            throw new RuntimeException('Failed to load GitHub App private key.');
        }

        openssl_sign($signingInput, $signature, $privateKeyResource, OPENSSL_ALGO_SHA256);

        return $signingInput.'.'.$this->base64UrlEncode($signature);
    }

    private function base64UrlEncode(string $data): string
    {
        return mb_rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
}
