export type Logger = (
	level: "info" | "warn" | "error",
	event: string,
	fields?: Record<string, unknown>,
) => void;

/** Structured logger: one JSON object per line. */
export function createLogger(
	write: (line: string) => void = (l) => process.stdout.write(`${l}\n`),
): Logger {
	return (level, event, fields) => {
		write(
			JSON.stringify({
				time: new Date().toISOString(),
				level,
				event,
				...fields,
			}),
		);
	};
}
