"use client";

import { type ReactNode, useEffect, useRef } from "react";

const COLORS = ["#4fd1b0", "#ffffff", "#dc92cc", "#ffbe96", "#6e2a5e"];
const SHOT_GAP_MS = 350;
const SHOTS = [
	{ spread: 80, startVelocity: 34 },
	{ spread: 90, startVelocity: 37 },
	{ spread: 100, startVelocity: 40 },
	{ spread: 110, startVelocity: 43 },
];

/**
 * Wraps the score ring of a perfect full report and fires one salvo of confetti
 * from its centre when it mounts. A re-render (the page polls while an audit
 * runs) does not mount again, so the salvo is once per page open. Nothing is
 * downloaded or fired with reduced motion.
 */
export function ScoreConfetti({ children }: { children: ReactNode }) {
	const ref = useRef<HTMLSpanElement>(null);

	useEffect(() => {
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		const timers: ReturnType<typeof setTimeout>[] = [];
		let cancelled = false;
		void import("canvas-confetti").then(({ default: confetti }) => {
			const box = ref.current?.getBoundingClientRect();
			if (cancelled || !box) return;
			const x = (box.left + box.width / 2) / window.innerWidth;
			const y = (box.top + box.height / 2) / window.innerHeight;
			SHOTS.forEach((shot, i) => {
				timers.push(
					setTimeout(() => {
						void confetti({
							origin: { x: x + (i % 2 === 0 ? -0.04 : 0.04), y },
							particleCount: 60,
							...shot,
							ticks: 220,
							scalar: 0.9,
							colors: COLORS,
							disableForReducedMotion: true,
						});
					}, i * SHOT_GAP_MS),
				);
			});
		});
		return () => {
			cancelled = true;
			for (const timer of timers) clearTimeout(timer);
		};
	}, []);

	return (
		<span ref={ref} data-confetti className="inline-flex">
			{children}
		</span>
	);
}
