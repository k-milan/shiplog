<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('github_pull_request_reviews', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('github_pull_request_id')->constrained()->cascadeOnDelete();
            $table->bigInteger('github_id')->unique();
            $table->string('state');
            $table->string('author_login')->nullable();
            $table->text('body')->nullable();
            $table->string('html_url')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->json('payload')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('github_pull_request_reviews');
    }
};
