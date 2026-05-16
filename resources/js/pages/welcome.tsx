import SheepIcon from '@/components/sheep-icon';
import { login } from '@/routes';
import { Head, Link } from '@inertiajs/react';

export default function Welcome() {
    return (
        <>
            <Head title="Shiplog" />
            <div className="flex min-h-screen flex-col items-center justify-center bg-[#FDFDFC] p-6 text-[#1b1b18] dark:bg-[#0a0a0a]">
                <main className="flex flex-col items-center gap-8 text-center">
                    <SheepIcon className="h-16 w-16 text-[#1b1b18] dark:text-[#EDEDEC]" />
                    <div className="flex flex-col gap-2">
                        <h1 className="text-3xl font-semibold tracking-tight text-[#1b1b18] dark:text-[#EDEDEC]">
                            Shiplog
                        </h1>
                        <p className="text-sm text-[#706f6c] dark:text-[#A1A09A]">
                            Coming soon.
                        </p>
                    </div>
                    <Link
                        href={login()}
                        className="inline-block rounded-sm border border-[#19140035] px-5 py-1.5 text-sm leading-normal text-[#1b1b18] hover:border-[#1915014a] dark:border-[#3E3E3A] dark:text-[#EDEDEC] dark:hover:border-[#62605b]"
                    >
                        Sign in
                    </Link>
                </main>
            </div>
        </>
    );
}
