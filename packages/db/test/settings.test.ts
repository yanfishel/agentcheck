import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	DEFAULT_LIMITS,
	getSettings,
	settings,
	updateSettings,
	validateLimits,
} from "../src/index.ts";
import { createTestDb } from "../src/testing.ts";

describe("settings", () => {
	let close: (() => Promise<void>) | undefined;
	let db: Awaited<ReturnType<typeof createTestDb>>["db"];
	beforeEach(async () => {
		const t = await createTestDb();
		close = t.close;
		db = t.db;
	});
	afterEach(async () => {
		await close?.();
		close = undefined;
	});

	it("returns the defaults without writing a row", async () => {
		expect(await getSettings(db)).toEqual(DEFAULT_LIMITS);
		expect(await getSettings(db)).toEqual(DEFAULT_LIMITS);
		expect((await db.select().from(settings)).length).toBe(0);
	});

	it("updates and reads back", async () => {
		const next = { ...DEFAULT_LIMITS, anonQuickPerHour: 9 };
		expect(await updateSettings(db, next)).toEqual(next);
		expect(await getSettings(db)).toEqual(next);
	});
});

describe("validateLimits", () => {
	it.each([
		[
			{ ...DEFAULT_LIMITS, anonQuickPerHour: 0 },
			"anonQuickPerHour must be an integer between 1 and 1000000",
		],
		[
			{ ...DEFAULT_LIMITS, hostRunningMax: 1.5 },
			"hostRunningMax must be an integer between 1 and 1000000",
		],
		[
			{ ...DEFAULT_LIMITS, userFullPerDay: "30" },
			"userFullPerDay must be an integer between 1 and 1000000",
		],
	])("rejects %j", (input, message) => {
		expect(() => validateLimits(input)).toThrow(message);
	});

	it("drops unknown fields", () => {
		expect(validateLimits({ ...DEFAULT_LIMITS, extra: 1 })).toEqual(
			DEFAULT_LIMITS,
		);
	});
});
