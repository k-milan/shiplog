<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('github_repositories', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('github_app_installation_id')->constrained()->cascadeOnDelete();
            $table->bigInteger('github_id')->unique();
            $table->string('name');
            $table->string('full_name')->unique();
            $table->string('owner_login');
            $table->boolean('private')->default(false);
            $table->string('default_branch')->nullable();
            $table->string('html_url');
            $table->timestamp('pushed_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('github_repositories');
    }
};
