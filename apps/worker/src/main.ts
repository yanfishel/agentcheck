import {
	AUDIT_DEAD_QUEUE,
	AUDIT_QUEUE,
	createDb,
	FIX_FILES_DEAD_QUEUE,
	FIX_FILES_QUEUE,
	MAINTENANCE_QUEUE,
	MAINTENANCE_SCHEDULES,
	scheduleMaintenance,
	startQueue,
} from "@agentcheck/db";
import { dbAuditStore } from "./audit-store.ts";
import { runDeadLetter } from "./dead-letter.ts";
import { parseWorkerEnv, type WorkerEnv } from "./env.ts";
import { dbFixFilesStore } from "./fix-files-store.ts";
import { createLogger } from "./log.ts";
import { runMaintenance } from "./maintenance.ts";
import { type ProcessDeps, runJob } from "./process-audit.ts";
import {
	type FixDeps,
	runFixFilesDeadLetter,
	runFixFilesJob,
} from "./process-fix-files.ts";
import { WORKER_VERSION } from "./version.ts";

/** Longer than AUDIT_TIMEOUT_MS so running audits can finish on shutdown. */
const STOP_TIMEOUT_MS = 95_000;

const log = createLogger();

let env: WorkerEnv;
try {
	env = parseWorkerEnv(process.env);
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}

const handle = createDb(env.databaseUrl);
const queue = await startQueue(
	{ connectionString: env.databaseUrl, max: env.concurrency + 2 },
	{
		supervise: true,
		schedule: true,
		stopTimeoutMs: STOP_TIMEOUT_MS,
		onError: (error) => log("error", "queue.error", { error: error.message }),
	},
);
const deps: ProcessDeps = {
	store: dbAuditStore(handle.db, queue.boss),
	log,
};

await queue.boss.work(
	AUDIT_QUEUE,
	{
		batchSize: 1,
		localConcurrency: env.concurrency,
		pollingIntervalSeconds: 1,
		includeMetadata: true,
	},
	async ([job]) => {
		if (job) await runJob(deps, job);
	},
);
const fixDeps: FixDeps = {
	store: dbFixFilesStore(handle.db, queue.boss),
	log,
};
await queue.boss.work(
	FIX_FILES_QUEUE,
	{
		batchSize: 1,
		localConcurrency: env.concurrency,
		pollingIntervalSeconds: 1,
		includeMetadata: true,
	},
	async ([job]) => {
		if (job) await runFixFilesJob(fixDeps, job);
	},
);
await queue.boss.work(
	FIX_FILES_DEAD_QUEUE,
	{ batchSize: 1, pollingIntervalSeconds: 5 },
	async ([job]) => {
		if (job) await runFixFilesDeadLetter(fixDeps, job.data);
	},
);
await queue.boss.work(
	AUDIT_DEAD_QUEUE,
	{ batchSize: 1, pollingIntervalSeconds: 5 },
	async ([job]) => {
		if (job) await runDeadLetter(deps, job.data);
	},
);
await queue.boss.work(
	MAINTENANCE_QUEUE,
	{ batchSize: 1, pollingIntervalSeconds: 5 },
	async ([job]) => {
		if (job) await runMaintenance({ db: handle.db, log }, job.data);
	},
);
await scheduleMaintenance(queue.boss);
log("info", "worker.scheduled", { ...MAINTENANCE_SCHEDULES });
log("info", "worker.started", {
	version: WORKER_VERSION,
	concurrency: env.concurrency,
});

let stopping = false;
const shutdown = async (signal: NodeJS.Signals) => {
	if (stopping) process.exit(1);
	stopping = true;
	log("info", "worker.stopping", { signal });
	try {
		await queue.stop();
		await handle.close();
	} catch (error) {
		log("error", "worker.stop_error", {
			error: error instanceof Error ? error.message : String(error),
		});
		process.exit(1);
	}
	process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
