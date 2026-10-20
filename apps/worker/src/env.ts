export interface WorkerEnv {
	databaseUrl: string;
	concurrency: number;
}

const DEFAULT_CONCURRENCY = 2;
const MAX_CONCURRENCY = 16;

/** Reads and validates the worker configuration from the environment. */
export function parseWorkerEnv(
	env: Record<string, string | undefined> = process.env,
): WorkerEnv {
	const databaseUrl = env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL is not set");
	const raw = env.AUDIT_CONCURRENCY;
	let concurrency = DEFAULT_CONCURRENCY;
	if (raw !== undefined && raw !== "") {
		concurrency = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
		if (!(concurrency >= 1 && concurrency <= MAX_CONCURRENCY)) {
			throw new Error(
				`AUDIT_CONCURRENCY must be an integer between 1 and ${MAX_CONCURRENCY}`,
			);
		}
	}
	return { databaseUrl, concurrency };
}
