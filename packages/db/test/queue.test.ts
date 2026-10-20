import { PgBoss as PgBossClass } from "pg-boss";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	AUDIT_DEAD_QUEUE,
	AUDIT_QUEUE,
	type AuditJobData,
	audits,
	createAudit,
	enqueueAudit,
	enqueueFixFiles,
	FIX_FILES_DEAD_QUEUE,
	FIX_FILES_QUEUE,
	MAINTENANCE_QUEUE,
	MAINTENANCE_SCHEDULES,
	type NewAuditInput,
	type PgBoss,
	parseAuditJobData,
	parseFixFilesJobData,
	parseMaintenanceJobData,
	type QueueHandle,
	requeueAudit,
	requeueFixFiles,
	scheduleMaintenance,
	startQueue,
} from "../src/index.ts";
import {
	createTestDb,
	startTestQueue,
	type TestDbHandle,
} from "../src/testing.ts";

const input: NewAuditInput = {
	url: "https://example.com/",
	host: "example.com",
	mode: "quick",
	userId: null,
};

const WORK_OPTIONS = {
	batchSize: 1,
	pollingIntervalSeconds: 0.5,
	includeMetadata: true,
} as const;

describe("parseAuditJobData", () => {
	it("keeps only the audit id", () => {
		expect(
			parseAuditJobData({ auditId: "a", network: { blockPrivate: false } }),
		).toEqual({ auditId: "a" });
	});

	it.each([null, {}, { auditId: 7 }, { auditId: "" }])("rejects %j", (data) => {
		expect(() => parseAuditJobData(data)).toThrow("Invalid audit job data");
	});
});

describe("parseFixFilesJobData", () => {
	const id = "00000000-0000-4000-8000-000000000000";

	it("keeps only the audit id", () => {
		expect(parseFixFilesJobData({ auditId: id, kinds: ["x"] })).toEqual({
			auditId: id,
		});
	});

	it.each([null, {}, { auditId: 7 }, { auditId: "" }, { auditId: "nope" }])(
		"rejects %j",
		(data) => {
			expect(() => parseFixFilesJobData(data)).toThrow(
				"Invalid fix files job data",
			);
		},
	);
});

describe("parseMaintenanceJobData", () => {
	it.each(["sweep", "retention"])(
		"accepts %s and drops other fields",
		(task) => {
			expect(parseMaintenanceJobData({ task, extra: 1 })).toEqual({ task });
		},
	);

	it.each([null, {}, { task: "x" }, { task: 1 }])("rejects %j", (data) => {
		expect(() => parseMaintenanceJobData(data)).toThrow(
			"Invalid maintenance job data",
		);
	});
});

describe("startQueue", () => {
	it("rejects and releases pg-boss when the database is unreachable", async () => {
		const stop = vi.spyOn(PgBossClass.prototype, "stop");
		await expect(
			startQueue(
				{
					connectionString: "postgres://invalid:invalid@127.0.0.1:1/nope",
					max: 1,
					connectionTimeoutMs: 2000,
				},
				{ supervise: false, onError: () => {} },
			),
		).rejects.toThrow();
		expect(stop).toHaveBeenCalledWith({ graceful: false, timeout: 1000 });
		stop.mockRestore();
	}, 15_000);
});

describe("audit queue", () => {
	let handle: TestDbHandle | undefined;
	let queues: QueueHandle[] = [];

	afterEach(async () => {
		for (const queue of queues) await queue.stop();
		queues = [];
		await handle?.close();
		handle = undefined;
	});

	const setup = async (): Promise<{ handle: TestDbHandle; boss: PgBoss }> => {
		handle = await createTestDb();
		const queue = await startTestQueue(handle);
		queues.push(queue);
		return { handle, boss: queue.boss };
	};

	const jobCount = async (h: TestDbHandle) => {
		const res = await h.client.query<{ n: number }>(
			"select count(*)::int as n from pgboss.job where name = 'audit'",
		);
		return res.rows[0]?.n;
	};

	it("delivers a job created together with the audit", async () => {
		const { handle: h, boss } = await setup();
		const row = await createAudit(h.db, input, (tx, a) =>
			enqueueAudit(boss, tx, a),
		);
		const received: AuditJobData[] = [];
		await boss.work(AUDIT_QUEUE, WORK_OPTIONS, async ([job]) => {
			if (job) received.push(job.data as AuditJobData);
		});
		await vi.waitFor(() => expect(received).toHaveLength(1), {
			timeout: 5000,
		});
		expect(received[0]).toEqual({ auditId: row.id });
	});

	it("rolls the job back with the transaction", async () => {
		const { handle: h, boss } = await setup();
		await expect(
			createAudit(h.db, input, async (tx, a) => {
				await enqueueAudit(boss, tx, a);
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
		expect(await jobCount(h)).toBe(0);
		expect(await h.db.select().from(audits)).toEqual([]);
	});

	it("delivers quick audits before full ones", async () => {
		const { handle: h, boss } = await setup();
		const full = await createAudit(h.db, { ...input, mode: "full" }, (tx, a) =>
			enqueueAudit(boss, tx, a),
		);
		const quick = await createAudit(
			h.db,
			{ ...input, mode: "quick" },
			(tx, a) => enqueueAudit(boss, tx, a),
		);
		const res = await h.client.query<{ data: AuditJobData; priority: number }>(
			"select data, priority from pgboss.job where name = 'audit' order by priority",
		);
		expect(res.rows).toEqual([
			{ data: { auditId: full.id }, priority: 0 },
			{ data: { auditId: quick.id }, priority: 10 },
		]);
		const received: string[] = [];
		await boss.work(AUDIT_QUEUE, WORK_OPTIONS, async ([job]) => {
			if (job) received.push((job.data as AuditJobData).auditId);
		});
		await vi.waitFor(() => expect(received).toHaveLength(2), {
			timeout: 5000,
		});
		expect(received).toEqual([quick.id, full.id]);
	});

	it("allows a second queue instance on the same database", async () => {
		const { handle: h } = await setup();
		const second = await startQueue(
			{ pglite: h.client },
			{ supervise: false, stopTimeoutMs: 2000 },
		);
		queues.push(second);
		await expect(
			second.boss.createQueue(AUDIT_QUEUE, {
				retryLimit: 1,
				retryDelay: 5,
				expireInSeconds: 120,
			}),
		).resolves.not.toThrow();
		expect(await second.boss.getQueue(AUDIT_QUEUE)).toMatchObject({
			name: AUDIT_QUEUE,
			retryLimit: 1,
			retryDelay: 5,
			expireInSeconds: 120,
		});
	});

	it("creates the audit queue with a dead-letter queue and the maintenance queue", async () => {
		const { boss } = await setup();
		expect(await boss.getQueue(AUDIT_QUEUE)).toMatchObject({
			name: AUDIT_QUEUE,
			retryLimit: 1,
			retryDelay: 5,
			expireInSeconds: 120,
			deadLetter: AUDIT_DEAD_QUEUE,
		});
		expect(await boss.getQueue(AUDIT_DEAD_QUEUE)).toMatchObject({
			name: AUDIT_DEAD_QUEUE,
			retryLimit: 1,
		});
		expect(await boss.getQueue(MAINTENANCE_QUEUE)).toMatchObject({
			name: MAINTENANCE_QUEUE,
			retryLimit: 0,
			expireInSeconds: 300,
		});
	});

	it("adds the dead-letter queue to an audit queue created before it existed", async () => {
		const { handle: h, boss } = await setup();
		await boss.updateQueue(AUDIT_QUEUE, { deadLetter: null });
		expect((await boss.getQueue(AUDIT_QUEUE))?.deadLetter).toBeFalsy();
		const second = await startQueue(
			{ pglite: h.client },
			{ supervise: false, stopTimeoutMs: 2000 },
		);
		queues.push(second);
		expect((await second.boss.getQueue(AUDIT_QUEUE))?.deadLetter).toBe(
			AUDIT_DEAD_QUEUE,
		);
	});

	it("schedules both maintenance tasks idempotently", async () => {
		const { boss } = await setup();
		await scheduleMaintenance(boss);
		await scheduleMaintenance(boss);
		const schedules = await boss.getSchedules(MAINTENANCE_QUEUE);
		expect(
			schedules
				.map((s) => ({
					key: s.key,
					cron: s.cron,
					data: s.data,
					tz: s.timezone,
				}))
				.sort((a, b) => a.key.localeCompare(b.key)),
		).toEqual([
			{
				key: "retention",
				cron: "0 3 * * *",
				data: { task: "retention" },
				tz: "UTC",
			},
			{ key: "sweep", cron: "*/5 * * * *", data: { task: "sweep" }, tz: "UTC" },
		]);
		expect(MAINTENANCE_SCHEDULES).toEqual({
			sweep: "*/5 * * * *",
			retention: "0 3 * * *",
		});
	});

	it("requeues an audit with a delay and its priority", async () => {
		const { handle: h, boss } = await setup();
		const before = Date.now();
		await requeueAudit(
			boss,
			{ id: "00000000-0000-4000-8000-000000000001", mode: "quick" },
			5,
		);
		const res = await h.client.query<{
			data: AuditJobData;
			priority: number;
			start_after: Date;
		}>(
			"select data, priority, start_after from pgboss.job where name = 'audit'",
		);
		expect(res.rows).toHaveLength(1);
		const [job] = res.rows;
		expect(job?.data).toEqual({
			auditId: "00000000-0000-4000-8000-000000000001",
		});
		expect(job?.priority).toBe(10);
		expect(new Date(job?.start_after ?? 0).getTime()).toBeGreaterThanOrEqual(
			before + 4000,
		);
	});
});

describe("fix files queue", () => {
	it("moves a fix_files queue created with the audit dead letter to its own", async () => {
		const handle = await createTestDb();
		const first = await startTestQueue(handle);
		try {
			await first.boss.updateQueue(FIX_FILES_QUEUE, {
				deadLetter: AUDIT_DEAD_QUEUE,
			});
			const second = await startQueue(
				{ pglite: handle.client },
				{ supervise: false, stopTimeoutMs: 2000 },
			);
			try {
				expect((await second.boss.getQueue(FIX_FILES_QUEUE))?.deadLetter).toBe(
					FIX_FILES_DEAD_QUEUE,
				);
			} finally {
				await second.stop();
			}
		} finally {
			await first.stop();
			await handle.close();
		}
	});

	it("creates the queue and delivers enqueued and requeued jobs", async () => {
		const handle = await createTestDb();
		const queue = await startTestQueue(handle);
		try {
			const { boss } = queue;
			expect((await boss.getQueue(FIX_FILES_QUEUE))?.deadLetter).toBe(
				FIX_FILES_DEAD_QUEUE,
			);
			expect(await boss.getQueue(FIX_FILES_DEAD_QUEUE)).toMatchObject({
				name: FIX_FILES_DEAD_QUEUE,
				retryLimit: 1,
			});
			const id = "00000000-0000-4000-8000-000000000001";
			await handle.db.transaction((tx) => enqueueFixFiles(boss, tx, id));
			await requeueFixFiles(boss, id, 0);
			const received: AuditJobData[] = [];
			await boss.work(FIX_FILES_QUEUE, WORK_OPTIONS, async ([job]) => {
				if (job) received.push(job.data as AuditJobData);
			});
			await vi.waitFor(() => expect(received.length).toBeGreaterThan(0), {
				timeout: 5000,
			});
			expect(received[0]).toEqual({ auditId: id });
		} finally {
			await queue.stop();
			await handle.close();
		}
	});
});
