"use client";

import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import { prefersReducedMotion } from "./count-up";

/** The tile pop and the fade-and-rise, motion-safe only (globals.css). */
export const ARRIVE_POP = "motion-safe:animate-arrive-pop";
export const ARRIVE_RISE = "motion-safe:animate-arrive-rise";

/** Pieces that appear now arrive animated: the report animates, has mounted, and motion is welcome. */
const ArrivalContext = createContext(false);

/**
 * Lets the pieces of a report animate as they arrive. Nothing in the first
 * render animates (a reopened report stays still), nor anything while
 * `animate` is false or the viewer prefers reduced motion.
 */
export function ArrivalProvider({
	animate,
	children,
}: {
	animate: boolean;
	children: ReactNode;
}) {
	const [mounted, setMounted] = useState(false);
	const [reduced, setReduced] = useState(false);
	useEffect(() => {
		setReduced(prefersReducedMotion());
		setMounted(true);
	}, []);
	const live = animate && mounted && !reduced;
	return (
		<ArrivalContext.Provider value={live}>{children}</ArrivalContext.Provider>
	);
}

/**
 * Whether a piece arrived while the viewer watched: it mounted present, or
 * turned present, while arrivals animate. Once true it stays true, so the
 * animation class is never removed and re-added (no replay).
 */
export function useArrival(present: boolean): boolean {
	const live = useContext(ArrivalContext);
	const [state, setState] = useState(() => ({
		present,
		arrived: present && live,
	}));
	if (state.present !== present) {
		const next = { present, arrived: state.arrived || (present && live) };
		setState(next);
		return next.arrived;
	}
	return state.arrived;
}

/** A wrapper that fades and rises in when `present` arrives (see `useArrival`). */
export function Arrive({
	present,
	className = "",
	children,
}: {
	present: boolean;
	className?: string;
	children?: ReactNode;
}) {
	const arrived = useArrival(present);
	const classes = `${className} ${arrived ? ARRIVE_RISE : ""}`.trim();
	return <div className={classes || undefined}>{children}</div>;
}
