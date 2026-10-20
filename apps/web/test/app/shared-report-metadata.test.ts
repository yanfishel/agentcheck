import {
	claimAudit,
	completeAudit,
	createAudit,
	setShareToken,
	users,
} from "@agentcheck/db";
import { createTestDb, type TestDbHandle } from "@agentcheck/db/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let handle: TestDbHandle;
vi.mock("@/server/current-user", () => ({ getDb: () => handle.db }));

import { generateMetadata } from "@/app/r/[shareToken]/page";

const TOKEN = "abcdefghijklmnopqrstuvwx";
const noop = async () => {};
const meta = (shareToken: string) =>
	generateMetadata({ params: Promise.resolve({ shareToken }) } as never);

describe("shared report metadata", () => {
	beforeEach(async () => {
		handle = await createTestDb();
		await handle.db
			.insert(users)
			.values({ id: "owner", email: "o@x.com", role: "user" });
	});
	afterEach(async () => {
		await handle.close();
	});

	it("carries the host and score in the title, description and cards", async () => {
		const audit = await createAudit(
			handle.db,
			{
				url: "https://example.com/",
				host: "example.com",
				mode: "quick",
				userId: "owner",
			},
			noop,
		);
		await claimAudit(handle.db, audit.id, { jobId: "job-1" });
		await completeAudit(handle.db, audit.id, {
			result: { score: 78, grade: "B" } as never,
			finalUrl: "https://example.com/",
			score: 78,
			grade: "B",
		});
		await setShareToken(handle.db, audit.id, "owner", TOKEN);

		const m = await meta(TOKEN);
		const title = "Audit of example.com — AgentCheck";
		const description = "AI readiness score 78/100 (B) on AgentCheck";
		expect(m.title).toBe(title);
		expect(m.description).toBe(description);
		expect(m.openGraph).toMatchObject({ title, description });
		expect(m.twitter).toMatchObject({ card: "summary", title, description });
		expect(m.robots).toEqual({ index: false });
	});

	it("keeps the generic fallback for an unknown token", async () => {
		const m = await meta(TOKEN);
		expect(m).toEqual({
			title: "Shared report — AgentCheck",
			robots: { index: false },
		});
	});
});
