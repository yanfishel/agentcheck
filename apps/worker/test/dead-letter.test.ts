import type { AuditResult } from "@agentcheck/core";
import {
	claimAudit,
	completeAudit,
	createAudit,
	failAudit,
	getAudit,
	type NewAuditInput,
} from "@agentcheck/db";
import { createTestDb, type TestDbHandle } from "@agentcheck/db/testing";
import { afterEach, describe, expect, it } from "vitest";
import { runDeadLetter } from "../src/dead-letter.ts";
import type { Logger } from "../src/log.ts";

const input: NewAuditInput = {
	url: "https://example.com/",
	host: "example.com",
	mode: "quick",
	userId: null,
};

const RESULT: AuditResult = {
	tool: { name: "agentcheck", version: "0.1.0" },
	target: input.url,
	finalUrl: input.url,
	timestamp: "2026-10-19T00:00:00.000Z",
	categories: [],
	score: 90,
	grade: "A",
	browser: { used: false, reason: "disabled" },
};

const noopEnqueue = async () => {};

describe("runDeadLetter", () => {
	let handle: TestDbHandle | undefined;
	afterEach(async () => {
		await handle?.close();
		handle = undefined;
	});

	const setup = async () => {
		handle = await createTestDb();
		const { db } = handle;
		return {
			db,
			store: { fail: (id: string, error: string) => failAudit(db, id, error) },
		};
	};

	it("fails a running audit with the internal error", async () => {
		const { db, store } = await setup();
		const audit = await createAudit(db, input, noopEnqueue);
		await claimAudit(db, audit.id, { jobId: "job-1" });
		const events: Array<{ event: string; fields?: Record<string, unknown> }> =
			[];
		const log: Logger = (_level, event, fields) => {
			events.push({ event, fields });
		};

		await expect(
			runDeadLetter({ store, log }, { auditId: audit.id }),
		).resolves.toBe(true);
		expect(await getAudit(db, audit.id)).toMatchObject({
			status: "failed",
			error: "Internal error",
		});
		expect(events).toEqual([
			{
				event: "audit.dead_letter",
				fields: { auditId: audit.id, failed: true },
			},
		]);
	});

	it("leaves a finished audit unchanged", async () => {
		const { db, store } = await setup();
		const audit = await createAudit(db, input, noopEnqueue);
		await claimAudit(db, audit.id, { jobId: "job-1" });
		await completeAudit(db, audit.id, {
			result: RESULT,
			finalUrl: input.url,
			score: 90,
			grade: "A",
		});
		const before = await getAudit(db, audit.id);
		await expect(runDeadLetter({ store }, { auditId: audit.id })).resolves.toBe(
			false,
		);
		expect(await getAudit(db, audit.id)).toEqual(before);
	});

	it("rejects invalid job data", async () => {
		const { store } = await setup();
		await expect(runDeadLetter({ store }, {})).rejects.toThrow(
			"Invalid audit job data",
		);
	});
});
