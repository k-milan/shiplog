<?php

declare(strict_types=1);

return [
    'app_id' => env('GITHUB_APP_ID'),
    'app_name' => env('GITHUB_APP_NAME'),
    'client_id' => env('GITHUB_CLIENT_ID'),
    'client_secret' => env('GITHUB_CLIENT_SECRET'),
    'private_key' => env('GITHUB_PRIVATE_KEY'),
    'webhook_secret' => env('GITHUB_WEBHOOK_SECRET'),
];
