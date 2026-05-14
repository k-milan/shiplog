import '../css/app.css';

import { createInertiaApp, type ResolvedComponent } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createRoot } from 'react-dom/client';
import { initializeTheme } from './hooks/use-appearance';

const appName = import.meta.env.VITE_APP_NAME || 'Sheep';

createInertiaApp({
    title: (title) =>
        !title || title === appName ? appName : `${title} - ${appName}`,
    resolve: async (name) =>
        (
            await resolvePageComponent<{ default: ResolvedComponent }>(
                `./pages/${name}.tsx`,
                import.meta.glob<{ default: ResolvedComponent }>(
                    './pages/**/*.tsx',
                ),
            )
        ).default,
    setup({ el, App, props }) {
        const root = createRoot(el);

        root.render(<App {...props} />);
    },
    progress: {
        color: '#4B5563',
    },
});

// This will set light / dark mode on load...
initializeTheme();
