import Heading from '@/components/heading';
import { type PropsWithChildren } from 'react';

export default function SettingsLayout({ children }: PropsWithChildren) {
    return (
        <div className="space-y-8">
            <Heading
                title="Settings"
                description="Manage your profile and account settings"
            />

            <section className="max-w-xl space-y-12">{children}</section>
        </div>
    );
}
