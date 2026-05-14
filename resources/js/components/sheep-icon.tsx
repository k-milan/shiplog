import { type SVGAttributes } from 'react';

export default function SheepIcon(props: SVGAttributes<SVGElement>) {
    return (
        <svg
            viewBox="2 5 29 25"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden
            {...props}
        >
            <circle cx="9" cy="14" r="4.25" fill="currentColor" />
            <circle cx="16" cy="11.5" r="5" fill="currentColor" />
            <circle cx="23" cy="14" r="4.25" fill="currentColor" />
            <ellipse cx="16" cy="18.5" rx="10.5" ry="7.5" fill="currentColor" />
            <ellipse cx="23.5" cy="20.5" rx="5.25" ry="4.25" fill="currentColor" />
            <ellipse cx="26.5" cy="17.5" rx="2" ry="3.25" fill="currentColor" />
            <rect
                x="10.5"
                y="23.5"
                width="2.25"
                height="5.5"
                rx="1.125"
                fill="currentColor"
            />
            <rect
                x="14.75"
                y="23.5"
                width="2.25"
                height="5.5"
                rx="1.125"
                fill="currentColor"
            />
            <rect
                x="19"
                y="23.5"
                width="2.25"
                height="5.5"
                rx="1.125"
                fill="currentColor"
            />
            <circle cx="24.75" cy="19.75" r="0.9" fill="currentColor" opacity="0.25" />
        </svg>
    );
}
