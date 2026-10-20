import { Mail, Share2 } from "lucide-react";
import type { ReactNode } from "react";
import type { ShareTargetId } from "./share-targets";

/**
 * Network logos supplied by the author (lucide-react 1.x ships no brand
 * icons): bare glyphs in currentColor, each with its own viewBox; the share
 * dialog draws the circle round them. A network without its logo yet falls
 * back to a generic share glyph.
 */
const LOGOS: Partial<
	Record<ShareTargetId, { viewBox: string; path: ReactNode }>
> = {
	x: {
		viewBox: "0 0 16 16",
		path: (
			<path
				fill="currentColor"
				d="M12.6.75h2.454l-5.36 6.142L16 15.25h-4.937l-3.867-5.07l-4.425 5.07H.316l5.733-6.57L0 .75h5.063l3.495 4.633L12.601.75Zm-.86 13.028h1.36L4.323 2.145H2.865z"
			/>
		),
	},
	facebook: {
		viewBox: "0 0 320 512",
		path: (
			<path
				fill="currentColor"
				d="m279.14 288l14.22-92.66h-88.91v-60.13c0-25.35 12.42-50.06 52.24-50.06h40.42V6.26S260.43 0 225.36 0c-73.22 0-121.08 44.38-121.08 124.72v70.62H22.89V288h81.39v224h100.17V288z"
			/>
		),
	},
	reddit: {
		viewBox: "0 0 24 24",
		path: (
			<>
				<path
					fill="currentColor"
					d="M16.985 13.5a1.447 1.447 0 1 1-2.895 0a1.447 1.447 0 0 1 2.895 0m-8.528 1.447a1.447 1.447 0 1 0 0-2.894a1.447 1.447 0 0 0 0 2.894m.393 1.682a.75.75 0 0 0-.8 1.268l.345.218a6.75 6.75 0 0 0 7.202 0l.345-.217a.75.75 0 1 0-.8-1.27l-.345.218a5.25 5.25 0 0 1-5.602 0z"
				/>
				<path
					fill="currentColor"
					fillRule="evenodd"
					clipRule="evenodd"
					d="M19.96 1.75c-.873 0-1.636.479-2.038 1.188l-3.6-.739a.75.75 0 0 0-.841.442c-.411.966-1.027 2.431-1.542 3.685c-.182.444-.352.863-.495 1.225c-2.047.082-3.943.617-5.494 1.484a3.066 3.066 0 1 0-3.762 4.421q-.2.72-.201 1.491c0 2.142 1.209 4.012 3.025 5.317c1.818 1.307 4.29 2.091 6.988 2.091c2.697 0 5.17-.784 6.988-2.09c1.816-1.306 3.025-3.176 3.025-5.318c0-.514-.07-1.012-.2-1.49a3.066 3.066 0 1 0-3.762-4.422c-1.427-.797-3.145-1.314-5.003-1.456q.132-.326.28-.684c.418-1.021.906-2.185 1.294-3.103l3.018.62a2.343 2.343 0 1 0 2.32-2.662m-.842 2.342a.842.842 0 1 1 1.685 0a.842.842 0 0 1-1.685 0M12 9.04q.23 0 .46.009a1 1 0 0 1-.012.094l-.002.005l.003-.01l.029-.088c2.224.086 4.201.77 5.634 1.8c1.537 1.104 2.401 2.563 2.401 4.098c0 1.536-.865 2.995-2.4 4.1c-1.536 1.102-3.694 1.808-6.113 1.808s-4.577-.706-6.112-1.809c-1.537-1.104-2.401-2.563-2.401-4.099c0-1.535.864-2.994 2.4-4.098S9.582 9.039 12 9.039M1.75 10.605a1.566 1.566 0 0 1 2.947-.738c-.799.63-1.463 1.373-1.934 2.204a1.57 1.57 0 0 1-1.013-1.466m19.487 1.466c-.471-.83-1.135-1.575-1.934-2.204a1.566 1.566 0 1 1 1.934 2.204"
				/>
			</>
		),
	},
	hackernews: {
		// Cropped to the drawing (5..27): the source's padding left it smaller than the others.
		viewBox: "4 4 24 24",
		path: (
			<path
				fill="currentColor"
				d="M5 5v22h22V5zm2 2h18v18H7zm4 3l4 7v5h2v-5l4-7h-2l-3 5.25L13 10z"
			/>
		),
	},
	bluesky: {
		viewBox: "0 0 24 24",
		path: (
			<path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="2"
				d="M12 10q5-7 8-7t2 6t-6 5q6 3 2 6t-6-3q-2 6-6 3t2-6q-5 1-6-5t2-6t8 7"
			/>
		),
	},
	linkedin: {
		viewBox: "0 0 24 24",
		path: (
			<path
				fill="currentColor"
				fillRule="evenodd"
				clipRule="evenodd"
				d="M9.429 8.969h3.714v1.85c.535-1.064 1.907-2.02 3.968-2.02c3.951 0 4.889 2.118 4.889 6.004V22h-4v-6.312c0-2.213-.535-3.461-1.897-3.461c-1.889 0-2.674 1.345-2.674 3.46V22h-4zM2.57 21.83h4V8.799h-4zM7.143 4.55a2.53 2.53 0 0 1-.753 1.802a2.57 2.57 0 0 1-1.82.748a2.6 2.6 0 0 1-1.818-.747A2.55 2.55 0 0 1 2 4.55c0-.677.27-1.325.753-1.803A2.58 2.58 0 0 1 4.571 2c.682 0 1.336.269 1.819.747s.753 1.126.753 1.803"
			/>
		),
	},
};

/** The icon of a share target, `aria-hidden`, in currentColor. */
export function ShareIcon({
	id,
	className = "size-4",
}: {
	id: ShareTargetId;
	className?: string;
}) {
	const logo = LOGOS[id];
	if (logo) {
		return (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox={logo.viewBox}
				aria-hidden="true"
				className={className}
			>
				{logo.path}
			</svg>
		);
	}
	if (id === "email") return <Mail aria-hidden="true" className={className} />;
	return <Share2 aria-hidden="true" className={className} />;
}
