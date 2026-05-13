<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('github_app_installations', function (Blueprint $table): void {
            $table->string('sync_status')->default('pending')->after('token_expires_at');
            $table->timestamp('sync_started_at')->nullable()->after('sync_status');
            $table->timestamp('sync_finished_at')->nullable()->after('sync_started_at');
            $table->text('sync_error')->nullable()->after('sync_finished_at');
        });

        DB::table('github_app_installations')->update([
            'sync_status' => 'complete',
            'sync_finished_at' => now(),
        ]);
    }

    public function down(): void
    {
        Schema::table('github_app_installations', function (Blueprint $table): void {
            $table->dropColumn([
                'sync_status',
                'sync_started_at',
                'sync_finished_at',
                'sync_error',
            ]);
        });
    }
};
