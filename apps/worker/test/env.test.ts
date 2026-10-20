import { describe, expect, it } from "vitest";
import { parseWorkerEnv } from "../src/env.ts";

const DATABASE_URL = "postgres://u:p@localhost:5432/db";

describe("parseWorkerEnv", () => {
	it("defaults the concurrency to 2", () => {
		expect(parseWorkerEnv({ DATABASE_URL })).toEqual({
			databaseUrl: DATABASE_URL,
			concurrency: 2,
		});
	});

	it("reads AUDIT_CONCURRENCY", () => {
		expect(
			parseWorkerEnv({ DATABASE_URL, AUDIT_CONCURRENCY: "4" }).concurrency,
		).toBe(4);
	});

	it.each(["0", "17", "two", "2.5"])(
		"rejects AUDIT_CONCURRENCY=%j",
		(value) => {
			expect(() =>
				parseWorkerEnv({ DATABASE_URL, AUDIT_CONCURRENCY: value }),
			).toThrow("AUDIT_CONCURRENCY must be an integer between 1 and 16");
		},
	);

	it("requires DATABASE_URL", () => {
		expect(() => parseWorkerEnv({})).toThrow("DATABASE_URL is not set");
		expect(() => parseWorkerEnv({ DATABASE_URL: "" })).toThrow(
			"DATABASE_URL is not set",
		);
	});
});
