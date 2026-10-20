import { renderHtml } from "@agentcheck/core";
import {
	type Audit,
	claimAudit,
	completeAudit,
	createAudit,
	setShareToken,
	users,
} from "@agentcheck/db";
import { createTestDb, type TestDbHandle } from "@agentcheck/db/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	exportFilename,
	exportFormat,
	exportResponse,
	handleSharedExport,
} from "@/server/export";

vi.mock("server-only", () => ({}));

const TOKEN = "abcdefghijklmnopqrstuvwx";
const d = new Date("2026-10-19T08:14:00Z");

const result = {
	tool: { name: "agentcheck", version: "0.1.0" },
	target: "https://example.com/",
	finalUrl: "https://example.com/",
	timestamp: "2026-10-19T00:00:00.000Z",
	categories: [],
	score: 87,
	grade: "B",
	browser: { used: false, reason: "disabled" },
} as const;

const doneAudit = (overrides: Partial<Audit> = {}) =>
	({
		id: "a1",
		host: "example.com",
		status: "done",
		result,
		finishedAt: d,
		createdAt: d,
		...overrides,
	}) as unknown as Audit;

describe("exportFilename", () => {
	it("keeps only [a-z0-9.-]", () => {
		expect(exportFilename("Example.COM", d, "json")).toBe(
			"agentcheck-example.com-2026-10-19.json",
		);
		expect(exportFilename("xn--80ak6aa92e.com", d, "html")).toBe(
			"agentcheck-xn--80ak6aa92e.com-2026-10-19.html",
		);
		expect(exportFilename("a b/c", d, "json")).toBe(
			"agentcheck-a-b-c-2026-10-19.json",
		);
	});
});

describe("exportFormat", () => {
	it("reads the query and defaults to json", () => {
		const f = (qs: string) => exportFormat(new Request(`http://x/e${qs}`));
		expect(f("")).toBe("json");
		expect(f("?format=html")).toBe("html");
		expect(f("?format=xml")).toBeNull();
	});
});

describe("exportResponse", () => {
	it("json export is the stored result verbatim with attachment headers", async () => {
		const res = exportResponse(doneAudit(), "json");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("application/json");
		expect(res.headers.get("content-disposition")).toBe(
			'attachment; filename="agentcheck-example.com-2026-10-19.json"',
		);
		expect(res.headers.get("cache-control")).toBe("no-store");
		expect(JSON.parse(await res.text())).toEqual(result);
	});

	it("html export is renderHtml(result)", async () => {
		const res = exportResponse(doneAudit(), "html");
		expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
		expect(res.headers.get("content-disposition")).toBe(
			'attachment; filename="agentcheck-example.com-2026-10-19.html"',
		);
		expect(res.headers.get("cache-control")).toBe("no-store");
		expect(await res.text()).toBe(renderHtml(result as never));
	});

	it("falls back to createdAt when finishedAt is null", () => {
		const res = exportResponse(doneAudit({ finishedAt: null }), "json");
		expect(res.headers.get("content-disposition")).toContain("2026-10-19");
	});

	it("rejects a null format with 400 and unfinished audits with 404", async () => {
		const bad = exportResponse(doneAudit(), null);
		expect(bad.status).toBe(400);
		expect(bad.headers.get("cache-control")).toBe("no-store");
		expect(
			exportResponse(doneAudit({ status: "running" }), "json").headers.get(
				"cache-control",
			),
		).toBe("no-store");
		expect(await bad.json()).toEqual({ error: "format must be json or html" });
		expect(
			exportResponse(doneAudit({ status: "running" }), "json").status,
		).toBe(404);
		expect(exportResponse(doneAudit({ result: null }), "json").status).toBe(
			404,
		);
	});
});

describe("handleSharedExport", () => {
	let handle: TestDbHandle;

	beforeEach(async () => {
		handle = await createTestDb();
		await handle.db
			.insert(users)
			.values({ id: "owner", email: "o@x.com", role: "user" });
	});
	afterEach(async () => {
		await handle.close();
	});

	const req = (qs = "") => new Request(`http://x/export${qs}`);

	it("404s for unknown or unshared tokens and serves shared done audits", async () => {
		const missing = await handleSharedExport(req(), TOKEN, { db: handle.db });
		expect(missing.status).toBe(404);
		expect(missing.headers.get("cache-control")).toBe("no-store");
		const audit = await createAudit(
			handle.db,
			{
				url: "https://example.com/",
				host: "example.com",
				mode: "quick",
				userId: "owner",
			},
			async () => {},
		);
		await claimAudit(handle.db, audit.id, { jobId: "job-1" });
		await completeAudit(handle.db, audit.id, {
			result: result as never,
			finalUrl: "https://example.com/",
			score: 87,
			grade: "B",
		});
		await setShareToken(handle.db, audit.id, "owner", TOKEN);
		const ok = await handleSharedExport(req("?format=json"), TOKEN, {
			db: handle.db,
		});
		expect(ok.status).toBe(200);
		expect(JSON.parse(await ok.text())).toEqual(result);
		expect(
			(await handleSharedExport(req("?format=xml"), TOKEN, { db: handle.db }))
				.status,
		).toBe(400);
		await setShareToken(handle.db, audit.id, "owner", null);
		expect(
			(await handleSharedExport(req(), TOKEN, { db: handle.db })).status,
		).toBe(404);
	});
});
