<?php

declare(strict_types=1);

namespace App\Contracts;

interface GitHubAppTokenContract
{
    public function generateAppToken(): string;
}
