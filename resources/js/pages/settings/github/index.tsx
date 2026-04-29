import HeadingSmall from '@/components/heading-small';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { destroy, index, redirect } from '@/routes/github-apps';
import { type BreadcrumbItem } from '@/types';
import { Form, Head, Link } from '@inertiajs/react';
import { GitBranch, Plus, Trash2 } from 'lucide-react';

interface GitHubInstallation {
    id: number;
    installation_id: number;
    account_login: string;
    account_type: string;
    account_name: string | null;
    avatar_url: string | null;
    created_at: string;
}

interface Props {
    installations: GitHubInstallation[];
    status?: string;
}

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'GitHub',
        href: index.url(),
    },
];

export default function GitHubIndex({ installations, status }: Props) {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="GitHub" />
            <SettingsLayout>
                <div className="space-y-6">
                    <HeadingSmall
                        title="GitHub Accounts"
                        description="Connect your GitHub accounts to track pull requests, commits, and reviews"
                    />

                    {status === 'github-app-connected' && (
                        <div className="text-sm font-medium text-green-600 dark:text-green-400">
                            GitHub account connected successfully.
                        </div>
                    )}

                    {status === 'github-app-disconnected' && (
                        <div className="text-sm font-medium text-muted-foreground">
                            GitHub account disconnected.
                        </div>
                    )}

                    {status === 'github-app-error' && (
                        <div className="text-sm font-medium text-destructive">
                            Failed to connect GitHub account. Please try again.
                        </div>
                    )}

                    {installations.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-sidebar-border/70 py-12 text-center dark:border-sidebar-border">
                            <GitBranch className="mb-3 h-8 w-8 text-muted-foreground" />
                            <p className="text-sm font-medium">No GitHub accounts connected</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Connect a GitHub account to start tracking your activity.
                            </p>
                            <Button asChild className="mt-4" size="sm">
                                <Link href={redirect()}>
                                    <Plus className="h-4 w-4" />
                                    Connect GitHub
                                </Link>
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <ul className="divide-y divide-border rounded-xl border">
                                {installations.map((installation) => (
                                    <li
                                        key={installation.id}
                                        className="flex items-center justify-between gap-4 px-4 py-3"
                                    >
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-8 w-8">
                                                <AvatarImage
                                                    src={installation.avatar_url ?? undefined}
                                                    alt={installation.account_login}
                                                />
                                                <AvatarFallback>
                                                    {installation.account_login.slice(0, 2).toUpperCase()}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <p className="text-sm font-medium leading-none">
                                                    {installation.account_name ?? installation.account_login}
                                                </p>
                                                <p className="mt-0.5 text-xs text-muted-foreground">
                                                    @{installation.account_login}
                                                </p>
                                            </div>
                                            <Badge variant="secondary" className="text-xs">
                                                {installation.account_type}
                                            </Badge>
                                        </div>

                                        <Form
                                            {...destroy.form({ installation: installation.id })}
                                        >
                                            {({ processing }) => (
                                                <Button
                                                    type="submit"
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled={processing}
                                                    className="text-destructive hover:text-destructive"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                    <span className="sr-only">Disconnect</span>
                                                </Button>
                                            )}
                                        </Form>
                                    </li>
                                ))}
                            </ul>

                            <Button asChild size="sm" variant="outline">
                                <Link href={redirect()}>
                                    <Plus className="h-4 w-4" />
                                    Connect another account
                                </Link>
                            </Button>
                        </div>
                    )}
                </div>
            </SettingsLayout>
        </AppLayout>
    );
}
