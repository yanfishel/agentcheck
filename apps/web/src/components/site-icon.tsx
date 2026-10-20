"use client";

import { Globe } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const GLOBE_TONE: Record<"band" | "card", string> = {
	band: "text-accent-fg/70",
	card: "text-muted",
};

/** Box, image and globe classes per size; the box keeps the line height only inline. */
const SIZE = {
	sm: { box: "h-[1lh] w-4", icon: "size-4", px: 16 },
	lg: { box: "size-8", icon: "size-8", px: 32 },
} as const;

/**
 * The checked site's icon in a 16×16 box beside its URL, or a globe when the
 * audit kept no icon or the image fails to load; image and globe take the same
 * box, so the line never shifts. The box is one line of the surrounding text
 * high, so a wrapped URL keeps the icon beside its first line. `size="lg"`
 * draws it 32×32 for a placeholder tile.
 */
export function SiteIcon({
	src,
	tone,
	size = "sm",
}: {
	src?: string;
	tone: "band" | "card";
	size?: "sm" | "lg";
}) {
	const dims = SIZE[size];
	const [failed, setFailed] = useState(false);
	const image = useRef<HTMLImageElement>(null);

	// The image is server-rendered: it can fail before hydration attaches
	// onError, and React does not replay that event. decode() rejects for a
	// broken image (naturalWidth would misjudge an SVG without intrinsic size).
	useEffect(() => {
		const img = image.current;
		if (!img?.complete || typeof img.decode !== "function") return;
		img.decode().catch(() => setFailed(true));
	}, []);

	return (
		<span
			className={`inline-flex ${dims.box} shrink-0 items-center justify-center`}
		>
			{src && !failed ? (
				// biome-ignore lint/performance/noImgElement: a same-origin image route behind the audit's access rules; next/image would proxy it
				<img
					ref={image}
					src={src}
					alt=""
					width={dims.px}
					height={dims.px}
					onError={() => setFailed(true)}
					className={`${dims.icon} object-contain`}
				/>
			) : (
				<Globe
					aria-hidden="true"
					className={`${dims.icon} ${GLOBE_TONE[tone]}`}
				/>
			)}
		</span>
	);
}
