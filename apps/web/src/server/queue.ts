import "server-only";
import { type QueueHandle, startQueue } from "@agentcheck/db";

declare global {
	var __agentcheckQueue: Promise<QueueHandle> | undefined;
}

/**
 * One started pg-boss instance per server process (lazy), used only to send
 * jobs; the worker processes them. The promise lives on `globalThis` so Next
 * dev hot reloads do not start a new instance each time.
 */
export function getQueue(): Promise<QueueHandle> {
	if (!globalThis.__agentcheckQueue) {
		const url = process.env.DATABASE_URL;
		if (!url) {
			throw new Error(
				"DATABASE_URL is not set; it is required to queue audits.",
			);
		}
		const started = startQueue(
			{ connectionString: url, max: 2 },
			{ supervise: false },
		);
		// A failed start is not memoised, so the next request retries.
		started.catch(() => {
			if (globalThis.__agentcheckQueue === started) {
				globalThis.__agentcheckQueue = undefined;
			}
		});
		globalThis.__agentcheckQueue = started;
	}
	return globalThis.__agentcheckQueue;
}
