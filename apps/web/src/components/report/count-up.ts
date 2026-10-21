import { useEffect, useState } from "react";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/** The viewer asked for less motion (false where there is no window). */
export function prefersReducedMotion(): boolean {
	return (
		typeof window !== "undefined" &&
		typeof window.matchMedia === "function" &&
		window.matchMedia(REDUCED_MOTION).matches
	);
}

/**
 * A number that counts up from 0 to `target` over `ms` with an ease-out, for a
 * score that arrives while the viewer watches. Disabled, with reduced motion or
 * without a target it is `target` (0 for none) at once; a count that has run
 * stays at its target.
 */
export function useCountUp(
	target: number | null,
	ms: number,
	enabled: boolean,
): number {
	const run = enabled && target !== null && !prefersReducedMotion();
	// The frame last drawn, for the target it was drawn for: before the first
	// frame of a new target the count shows 0, never a flash of the final value.
	const [frame, setFrame] = useState<{ target: number; value: number } | null>(
		null,
	);

	useEffect(() => {
		if (!run || target === null) return;
		let raf = 0;
		let start: number | null = null;
		const step = (now: number) => {
			start ??= now;
			const t = Math.min(1, (now - start) / ms);
			const eased = 1 - (1 - t) ** 3;
			setFrame({ target, value: Math.round(target * eased) });
			if (t < 1) raf = requestAnimationFrame(step);
		};
		raf = requestAnimationFrame(step);
		return () => cancelAnimationFrame(raf);
	}, [run, target, ms]);

	if (!run || target === null) return target ?? 0;
	return frame?.target === target ? frame.value : 0;
}
