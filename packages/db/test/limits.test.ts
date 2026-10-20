import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, describe, expect, it } from "vitest";
import {
	type AuditMode,
	type AuditStatus,
	audits,
	type Db,
	DEFAULT_LIMITS,
	enforceLimits,
	formatWait,
	users,
} from "../src/index.ts";
import { createTestDb } from "../src/testing.ts";

const T0 = new Date("2026-10-19T12:00:00.000Z");
const clock = () => T0;
const minutesAgo = (m: number) => new Date(T0.getTime() - m * 60_000);
const hoursAgo = (h: number) => minutesAgo(h * 60);

interface Row {
	userId?: string | null;
	ipHash?: string | null;
	host?: string;
	mode?: AuditMode;
	status?: AuditStatus;
	createdAt: Date;
}

describe("limits", () => {
	let close: (() => Promise<void>) | undefined;
	afterEach(async () => {
		await close?.();
		close = undefined;
	});
	const setup = async (): Promise<Db> => {
		const t = await createTestDb();
		close = t.close;
		return t.db;
	};
	const insertAudit = async (db: Db, row: Row) => {
		const userId = row.userId ?? null;
		if (userId) {
			await db
				.insert(users)
				.values({ id: userId, email: `${userId}@x.test`, role: "user" })
				.onConflictDoNothing();
		}
		const host = row.host ?? "a.test";
		await db.insert(audits).values({
			url: `https://${host}/`,
			host,
			mode: row.mode ?? "quick",
			status: row.status ?? "done",
			userId,
			ipHash: row.ipHash ?? null,
			createdAt: row.createdAt,
		});
	};

	it("allows the first anonymous audit", async () => {
		const db = await setup();
		await expect(
			enforceLimits(
				db,
				DEFAULT_LIMITS,
				{
					userId: null,
					role: null,
					ipHash: "h1",
					host: "a.test",
					mode: "quick",
				},
				clock,
			),
		).resolves.toBeUndefined();
	});

	it("refuses the 6th anonymous quick audit from one ip hash within an hour", async () => {
		const db = await setup();
		for (let i = 0; i < 5; i++) {
			await insertAudit(db, {
				ipHash: "h1",
				host: "a.test",
				createdAt: minutesAgo(50 - i),
			});
		}
		await expect(
			enforceLimits(
				db,
				DEFAULT_LIMITS,
				{
					userId: null,
					role: null,
					ipHash: "h1",
					host: "b.test",
					mode: "quick",
				},
				clock,
			),
		).rejects.toMatchObject({
			reason: "anonymous",
			retryAfterSeconds: 600,
			message: "Too many checks from your network. Try again in 10 minutes.",
		});
	});

	it("ignores anonymous audits older than an hour and from other ip hashes", async () => {
		const db = await setup();
		for (let i = 0; i < 5; i++) {
			await insertAudit(db, {
				ipHash: "h1",
				host: `old${i}.test`,
				createdAt: minutesAgo(61),
			});
			await insertAudit(db, {
				ipHash: "h2",
				host: `other${i}.test`,
				createdAt: minutesAgo(5),
			});
		}
		await expect(
			enforceLimits(
				db,
				DEFAULT_LIMITS,
				{
					userId: null,
					role: null,
					ipHash: "h1",
					host: "b.test",
					mode: "quick",
				},
				clock,
			),
		).resolves.toBeUndefined();
	});

	it("counts quick and full user audits separately", async () => {
		const db = await setup();
		for (let i = 0; i < 60; i++) {
			await insertAudit(db, {
				userId: "u1",
				host: `s${i}.test`,
				mode: "quick",
				createdAt: hoursAgo(1),
			});
		}
		const subject = {
			userId: "u1",
			role: "user" as const,
			ipHash: null,
			host: "x.test",
		};
		await expect(
			enforceLimits(db, DEFAULT_LIMITS, { ...subject, mode: "quick" }, clock),
		).rejects.toMatchObject({
			reason: "user_quick",
			retryAfterSeconds: 23 * 3600,
		});
		await expect(
			enforceLimits(db, DEFAULT_LIMITS, { ...subject, mode: "full" }, clock),
		).resolves.toBeUndefined();
	});

	it("refuses a user over the full-mode daily limit", async () => {
		const db = await setup();
		for (let i = 0; i < 30; i++) {
			await insertAudit(db, {
				userId: "u1",
				host: `s${i}.test`,
				mode: "full",
				createdAt: hoursAgo(2),
			});
		}
		await expect(
			enforceLimits(
				db,
				DEFAULT_LIMITS,
				{
					userId: "u1",
					role: "user",
					ipHash: null,
					host: "x.test",
					mode: "full",
				},
				clock,
			),
		).rejects.toMatchObject({
			reason: "user_full",
			retryAfterSeconds: 22 * 3600,
			message:
				"You have reached today's limit for full checks. Try again in 22 hours.",
		});
	});

	it("does not apply user limits to admins", async () => {
		const db = await setup();
		for (let i = 0; i < 60; i++) {
			await insertAudit(db, {
				userId: "u1",
				host: `s${i}.test`,
				mode: "quick",
				createdAt: hoursAgo(1),
			});
		}
		await expect(
			enforceLimits(
				db,
				DEFAULT_LIMITS,
				{
					userId: "u1",
					role: "admin",
					ipHash: null,
					host: "x.test",
					mode: "quick",
				},
				clock,
			),
		).resolves.toBeUndefined();
	});

	it("applies the host limit to everyone, admins included", async () => {
		const db = await setup();
		for (let i = 0; i < 10; i++) {
			await insertAudit(db, {
				userId: `u${i}`,
				host: "hot.test",
				createdAt: minutesAgo(9),
			});
		}
		await expect(
			enforceLimits(
				db,
				DEFAULT_LIMITS,
				{
					userId: "admin",
					role: "admin",
					ipHash: null,
					host: "hot.test",
					mode: "quick",
				},
				clock,
			),
		).rejects.toMatchObject({
			reason: "host",
			retryAfterSeconds: 60,
			message:
				"This site is being checked a lot right now. Try again in 1 minute.",
		});
	});

	it("takes the host lock before the subject lock", async () => {
		const db = await setup();
		const dialect = new PgDialect();
		const executed: string[] = [];
		const spy = new Proxy(db, {
			get(target, prop) {
				if (prop === "execute") {
					return (query: SQL) => {
						const { sql, params } = dialect.sqlToQuery(query);
						executed.push(`${sql} ${JSON.stringify(params)}`);
						return target.execute(query);
					};
				}
				const value = Reflect.get(target, prop, target);
				return typeof value === "function" ? value.bind(target) : value;
			},
		});
		await enforceLimits(
			spy,
			DEFAULT_LIMITS,
			{ userId: null, role: null, ipHash: "h1", host: "a.test", mode: "quick" },
			clock,
		);
		expect(
			executed.filter((q) => q.includes("pg_advisory_xact_lock")),
		).toHaveLength(2);
		expect(executed[0]).toContain("host:");
		expect(executed[1]).toContain("ip:");
	});

	it.each([
		[1, "1 minute"],
		[59, "1 minute"],
		[60, "1 minute"],
		[61, "2 minutes"],
		[3600, "1 hour"],
		[5400, "2 hours"],
		[86400, "1 day"],
		[90000, "2 days"],
	])("formatWait(%i) = %s", (s, text) => {
		expect(formatWait(s)).toBe(text);
	});
});
