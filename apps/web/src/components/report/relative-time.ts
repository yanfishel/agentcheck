const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
	["year", 365 * 86_400],
	["month", 30 * 86_400],
	["week", 7 * 86_400],
	["day", 86_400],
	["hour", 3_600],
	["minute", 60],
];

export interface RelativeTimeOptions {
	/** "auto" reads "yesterday"; "always" keeps numbers ("1 day ago"). Default "auto". */
	numeric?: Intl.RelativeTimeFormatNumeric;
	/** The coarsest unit to use; larger spans stay in this unit ("30 days ago"). Default "year". */
	maxUnit?: Intl.RelativeTimeFormatUnit;
}

/** "2 minutes ago", "yesterday", "just now"; the input back when it is not a date. */
export function relativeTime(
	timestamp: string | Date,
	now: number,
	{ numeric = "auto", maxUnit = "year" }: RelativeTimeOptions = {},
): string {
	const time = new Date(timestamp).getTime();
	if (Number.isNaN(time)) return String(timestamp);
	const seconds = (time - now) / 1000;
	const format = new Intl.RelativeTimeFormat("en", { numeric });
	const from = Math.max(
		0,
		UNITS.findIndex(([unit]) => unit === maxUnit),
	);
	for (const [unit, size] of UNITS.slice(from)) {
		if (Math.abs(seconds) >= size) {
			return format.format(Math.round(seconds / size), unit);
		}
	}
	return "just now";
}
