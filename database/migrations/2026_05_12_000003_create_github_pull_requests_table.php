<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('github_pull_requests', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('github_repository_id')->constrained()->cascadeOnDelete();
            $table->bigInteger('github_id')->unique();
            $table->unsignedInteger('number');
            $table->string('title');
            $table->string('state');
            $table->boolean('draft')->default(false);
            $table->string('author_login')->nullable();
            $table->string('html_url');
            $table->timestamp('opened_at')->nullable();
            $table->timestamp('updated_at_github')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->timestamp('merged_at')->nullable();
            $table->json('payload')->nullable();
            $table->timestamps();

            $table->unique(['github_repository_id', 'number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('github_pull_requests');
    }
};
