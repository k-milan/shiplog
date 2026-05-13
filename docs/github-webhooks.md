# GitHub Webhooks

This document tracks the GitHub App events Shiplog currently handles, where they are stored, and events we may add later.

## Current App Permissions

Minimum permissions for the current implementation:

| Permission | Level | Why |
| --- | --- | --- |
| Metadata | Read-only | Required baseline permission for repository metadata and several repository-level events. |
| Contents | Read-only | Required for `push`; also lets backfill read commits. |
| Pull requests | Read-only | Required for `pull_request`, `pull_request_review`, PR review comments/threads, and PR backfill. |

Current subscribed events:

| Event | Status | Storage | Notes |
| --- | --- | --- | --- |
| `ping` | Implemented | Not stored | Used only to confirm GitHub can reach `/github/webhook`. |
| `installation_repositories` | Implemented | `github_repositories`, `github_commits`, `github_pull_requests`, `github_pull_request_reviews` | When repos are added to the installation, we upsert the added repos and attempt a last-month targeted backfill. |
| `push` | Implemented | `github_repositories`, `github_commits` | Stores pushed commits. GitHub caps pushed commits in the payload; we may later fetch extra commits for very large pushes. |
| `pull_request` | Implemented | `github_repositories`, `github_pull_requests` | Stores PR state, title, author, timestamps, merge state, and payload. |
| `pull_request_review` | Implemented | `github_pull_requests`, `github_pull_request_reviews` | Stores submitted/dismissed/edited review state and links it to the PR. |

## Current Tables

| Table | Purpose |
| --- | --- |
| `github_app_installations` | Connected GitHub App installations and installation token cache. |
| `github_repositories` | Repositories available to an installation. |
| `github_commits` | Commit activity from backfill and `push` webhooks. |
| `github_pull_requests` | Pull request activity from backfill and `pull_request` webhooks. |
| `github_pull_request_reviews` | Review activity from backfill and `pull_request_review` webhooks. |

## Events To Consider Later

| Event | Status | Permission Needed | Possible Storage | Later use |
| --- | --- | --- | --- | --- |
| `workflow_run` | Not implemented | Actions: Read-only | New `github_workflow_runs` table | Track CI/build/deploy workflow status, duration, conclusion, and tie runs to commits/PRs. |
| `workflow_job` | Not implemented | Actions: Read-only | New `github_workflow_jobs` table | Show job-level failures and timing inside a workflow run. |
| `deployment` | Not implemented | Deployments: Read-only | New `github_deployments` table | Track deployment creation, environment, ref, SHA, and creator. |
| `deployment_status` | Not implemented | Deployments: Read-only | New `github_deployment_statuses` table | Best signal for actual deployment success/failure/inactive states. Useful for "production deploy" summary cards. |
| `deployment_review` | Not implemented | Deployments: Read-only | New `github_deployment_reviews` table | Track protected environment approvals/rejections before production deploys. |
| `check_run` | Not implemented | Checks: Read-only | New `github_check_runs` table | Track individual external checks/test results. Less important if `workflow_run` is enough. |
| `check_suite` | Not implemented | Checks: Read-only | New `github_check_suites` table | Track grouped check status by commit. Less detailed than workflow/job data. |
| `pull_request_review_comment` | Not implemented | Pull requests: Read-only | New `github_pull_request_review_comments` table | Capture line-level code review comments for richer review activity. |
| `pull_request_review_thread` | Not implemented | Pull requests: Read-only | New `github_pull_request_review_threads` table | Track resolved/unresolved review discussions. |
| `issue_comment` | Not implemented | Issues or Pull requests: Read-only | New `github_issue_comments` table | Capture comments on issues and PR conversations. Useful for collaboration volume. |
| `issues` | Not implemented | Issues: Read-only | New `github_issues` table | Track opened/closed/labeled/assigned issues if Shiplog expands beyond PR work. |
| `repository` | Not implemented | Metadata: Read-only | Existing `github_repositories` or audit table | Keep names, visibility, archive/rename/delete state current. |
| `star` | Not implemented | Metadata: Read-only | New `github_stars` or activity-only table | Track repo attention/growth; probably low priority for personal activity. |
| `watch` | Not implemented | Metadata: Read-only | New `github_watches` or activity-only table | Track repo subscriptions; probably low priority. |
| `milestone` | Not implemented | Issues or Pull requests: Read-only | New `github_milestones` table | Add planning/release progress tracking. |
| `deploy_key` | Not implemented | Deployments: Read-only | New `github_deploy_keys` audit table | Security/audit signal when deploy keys are added or removed. |
| `release` | Not implemented | Contents: Read-only | New `github_releases` table | Track shipped versions and release notes. |
| `create` / `delete` | Not implemented | Contents: Read-only | New `github_refs` or activity-only table | Track branch/tag creation and deletion. |

## Deployment Tracking Guidance

For the current "production deploy" summary card, the best next events are:

1. `deployment_status` with Deployments read-only permission, if the repos use GitHub Deployments or environments.
2. `workflow_run` with Actions read-only permission, if deployments are represented mainly by GitHub Actions workflows.
3. `deployment_review` only if protected environment approvals are important to show.

Do not add every event at once. Add the smallest event set that supports the dashboard metric we want next.

## OAuth Roadmap

GitHub App installation access is account-scoped. If the app is installed on `k-milan` with "all repositories", Shiplog can receive events for repositories owned by `k-milan`, but not every repository that `k-milan` can personally access as a collaborator.

For collaborator/contributor repositories, we likely need GitHub OAuth later:

| Capability | GitHub App installation | GitHub OAuth user connection |
| --- | --- | --- |
| Webhooks for owned/installed repos | Yes | No, unless the app/webhook is installed on that repo owner. |
| Backfill owned/installed repos | Yes | Yes, if the OAuth token has access. |
| See repos where user is only a collaborator | No, unless that repo owner installed the app. | Yes, if OAuth scopes/token permissions allow it. |
| Real-time updates for collaborator repos | No | Usually no; likely needs polling/scheduled sync. |
| Private collaborator repo support | No, unless installed by owner/org. | Possible with explicit user authorization and correct scopes. |

Likely long-term model:

1. Keep GitHub App installation for webhook-driven, real-time data where the owner/org installs Shiplog.
2. Add GitHub OAuth for "my personal contribution graph" across repos the user can access.
3. Use scheduled polling/backfill for OAuth-visible collaborator repos because webhooks may not be available.
4. Clearly label data source per activity later: `webhook`, `app_backfill`, `oauth_sync`, or `public_event`.

Open product question: decide whether Shiplog is primarily an installed-app repo dashboard, a personal contribution dashboard, or a hybrid. The hybrid gives the best coverage but adds auth, token storage, sync scheduling, deduplication, and permission UX.
