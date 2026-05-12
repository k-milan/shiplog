<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('github_commits', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('github_repository_id')->constrained()->cascadeOnDelete();
            $table->string('sha')->unique();
            $table->text('message')->nullable();
            $table->string('author_login')->nullable();
            $table->string('author_name')->nullable();
            $table->string('author_email')->nullable();
            $table->timestamp('authored_at')->nullable();
            $table->string('html_url')->nullable();
            $table->json('payload')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('github_commits');
    }
};
