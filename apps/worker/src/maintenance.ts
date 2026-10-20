import {
	type Db,
	deleteExpiredAnonymousAudits,
	failStaleAudits,
	failStaleFixFiles,
	type MaintenanceTask,
	parseMaintenanceJobData,
} from "@agentcheck/db";
import type { Logger } from "./log.ts";

const noLog: Logger = () => {};

/** Runs one scheduled maintenance job: the stale audit and fix-files sweep, or retention. */
export async function runMaintenance(
	deps: { db: Db; log?: Logger; now?: () => Date },
	data: unknown,
): Promise<{ task: MaintenanceTask; affected: number }> {
	const { task } = parseMaintenanceJobData(data);
	const log = deps.log ?? noLog;
	const affected =
		task === "sweep"
			? (await failStaleAudits(deps.db, deps.now)) +
				(await failStaleFixFiles(deps.db, deps.now))
			: await deleteExpiredAnonymousAudits(deps.db, deps.now);
	log("info", `maintenance.${task}`, { affected });
	return { task, affected };
}
