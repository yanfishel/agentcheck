import {
	claimAudit,
	claimFixFiles,
	completeAudit,
	completeFixFiles,
	createAudit,
	failFixFiles,
	getAudit,
	getFixFiles,
	type SyncedUser,
	users,
} from "@agentcheck/db";
import {
	createTestDb,
	startTestQueue,
	type TestDbHandle,
} from "@agentcheck/db/testing";
import { strFromU8, unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	FIX_PREVIEW_MAX,
	previewText,
} from "@/components/report/fix-files/preview";
import {
	type FixFilesDeps,
	fixFilesView,
	handleFixFileDownload,
	handleGetFixFiles,
	handleStartFixFiles,
} from "@/server/fix-files";

vi.mock("server-only", () => ({}));

const owner: SyncedUser = {
	id: "owner",
	email: "o@x.com",
	role: "user",
	blocked: false,
	created: false,
};
const other: SyncedUser = { ...owner, id: "other", email: "x@x.com" };
const admin: SyncedUser = {
	...owner,
	id: "admin",
	email: "a@x.com",
	role: "admin",
};

const failing = {
	id: "ai-bots-allowed",
	title: "AI bots",
	weight: 1,
	status: "fail",
	message: "GPTBot is blocked",
	details: ["GPTBot"],
};
const result = (checks: unknown[]) =>
	({
		tool: { name: "agentcheck", version: "0.1.0" },
		target: "https://codeframe.pro/",
		finalUrl: "https://codeframe.pro/",
		timestamp: "2026-10-20T00:00:00.000Z",
		categories: [
			{
				id: "bot-access",
				title: "Bot",
				weight: 20,
				status: "scored",
				score: 1,
				checks,
			},
		],
		score: 40,
		grade: "D",
		browser: { used: false, reason: "disabled" },
	}) as never;

const fixFiles = {
	files: [
		{
			kind: "robots",
			name: "robots.txt",
			target: "Replace /robots.txt at the site root",
			fixes: ["ai-bots-allowed"],
			content: "User-agent: GPTBot\nAllow: /\n",
			todos: [],
		},
	],
	skipped: [],
	pagesRead: 3,
	pagesFailed: 0,
	generatedAt: "2026-10-20T10:00:00.000Z",
	toolVersion: "0.1.0",
};

/** About 1 MB of llms-full.txt in lines of 100 characters. */
const bigLine = `${"x".repeat(99)}\n`;
const bigContent = bigLine.repeat(10_486);
const bigFiles = {
	...fixFiles,
	files: [
		...fixFiles.files,
		{
			kind: "llms-full",
			name: "llms-full.txt",
			target: "New file at /llms-full.txt",
			fixes: ["llms-full-txt"],
			content: bigContent,
			todos: [],
		},
	],
};

describe("fix files handlers", () => {
	let handle: TestDbHandle;
	let queue: Awaited<ReturnType<typeof startTestQueue>>;

	beforeEach(async () => {
		handle = await createTestDb();
		queue = await startTestQueue(handle);
		await handle.db.insert(users).values([
			{ id: "owner", email: "o@x.com", role: "user" },
			{ id: "other", email: "x@x.com", role: "user" },
			{ id: "admin", email: "a@x.com", role: "admin" },
		]);
	});
	afterEach(async () => {
		await queue.stop();
		await handle.close();
	});

	const make = async (
		userId: string | null,
		opts: { finish?: boolean; checks?: unknown[] } = {},
	) => {
		const audit = await createAudit(
			handle.db,
			{
				url: "https://codeframe.pro/",
				host: "codeframe.pro",
				mode: "quick",
				userId,
			},
			async () => {},
		);
		if (opts.finish ?? true) {
			await claimAudit(handle.db, audit.id, { jobId: "job-1" });
			await completeAudit(handle.db, audit.id, {
				result: result(opts.checks ?? [failing]),
				finalUrl: "https://www.codeframe.pro/",
				score: 40,
				grade: "D",
			});
		}
		return audit;
	};
	const deps = (viewer: SyncedUser | null): FixFilesDeps => ({
		db: handle.db,
		boss: async () => queue.boss,
		viewer: async () => viewer,
		origin: "https://agentcheck.test",
	});
	const finishRow = async (id: string) => {
		await claimFixFiles(handle.db, id, { jobId: "job-1" });
		await completeFixFiles(handle.db, id, fixFiles as never);
	};

	describe("start", () => {
		it("404 when the viewer cannot see the audit", async () => {
			const audit = await make("owner");
			expect((await handleStartFixFiles(audit.id, deps(null))).status).toBe(
				404,
			);
			expect((await handleStartFixFiles(audit.id, deps(other))).status).toBe(
				404,
			);
			expect(
				(
					await handleStartFixFiles(
						"00000000-0000-4000-8000-000000000000",
						deps(owner),
					)
				).status,
			).toBe(404);
		});

		it("403 for a signed-in non-owner", async () => {
			const audit = await make("owner");
			const res = await handleStartFixFiles(audit.id, deps(admin));
			expect(res.status).toBe(403);
			expect((await res.json()).error).toBe(
				"Only the owner can generate fix files",
			);
			const anon = await make(null);
			expect((await handleStartFixFiles(anon.id, deps(owner))).status).toBe(
				403,
			);
		});

		it("409 when the audit is not done", async () => {
			const audit = await make("owner", { finish: false });
			expect((await handleStartFixFiles(audit.id, deps(owner))).status).toBe(
				409,
			);
		});

		it("409 when nothing is fixable", async () => {
			const audit = await make("owner", {
				checks: [{ ...failing, status: "pass" }],
			});
			expect((await handleStartFixFiles(audit.id, deps(owner))).status).toBe(
				409,
			);
			expect(await getFixFiles(handle.db, audit.id)).toBeNull();
		});

		it("409 on a fourth attempt", async () => {
			const audit = await make("owner");
			for (let attempt = 1; attempt <= 3; attempt++) {
				const res = await handleStartFixFiles(audit.id, deps(owner));
				expect(res.status).toBe(202);
				await claimFixFiles(handle.db, audit.id, { jobId: "job-1" });
				await failFixFiles(handle.db, audit.id, "boom");
			}
			const res = await handleStartFixFiles(audit.id, deps(owner));
			expect(res.status).toBe(409);
			const { error } = await res.json();
			expect(error).toContain("3");
			expect(error).toContain("new check");
		});

		it("409 while running or after done", async () => {
			const audit = await make("owner");
			await handleStartFixFiles(audit.id, deps(owner));
			expect((await handleStartFixFiles(audit.id, deps(owner))).status).toBe(
				409,
			);
			await finishRow(audit.id);
			expect((await handleStartFixFiles(audit.id, deps(owner))).status).toBe(
				409,
			);
		});

		it("202 creates and enqueues with fixKindsFor kinds", async () => {
			const audit = await make("owner");
			const res = await handleStartFixFiles(audit.id, deps(owner));
			expect(res.status).toBe(202);
			const body = await res.json();
			expect(body).toMatchObject({
				status: "queued",
				kinds: ["robots"],
				attempts: 1,
				result: null,
				hasPrompt: false,
			});
			expect(body).not.toHaveProperty("prompt");
			const row = await getFixFiles(handle.db, audit.id);
			expect(row?.kinds).toEqual(["robots"]);
		});
	});

	describe("get", () => {
		it("owner and admin see the result and hasPrompt, not the prompt", async () => {
			const audit = await make("owner");
			await handleStartFixFiles(audit.id, deps(owner));
			await finishRow(audit.id);
			for (const viewer of [owner, admin]) {
				const res = await handleGetFixFiles(audit.id, deps(viewer));
				expect(res.status).toBe(200);
				expect(res.headers.get("cache-control")).toBe("no-store");
				const body = await res.json();
				expect(body.status).toBe("done");
				expect(body.result.files[0].name).toBe("robots.txt");
				expect(body.result.files[0].content).toBe(fixFiles.files[0]?.content);
				expect(body.result.files[0].previewOf).toBeNull();
				expect(body.hasPrompt).toBe(true);
				expect(body).not.toHaveProperty("prompt");
			}
		});

		it("has no prompt when every file was skipped", async () => {
			const audit = await make("owner");
			await handleStartFixFiles(audit.id, deps(owner));
			await claimFixFiles(handle.db, audit.id, { jobId: "job-1" });
			await completeFixFiles(handle.db, audit.id, {
				...fixFiles,
				files: [],
				skipped: [
					{
						kind: "robots",
						reason: "robots.txt already allows the AI crawlers on /",
					},
				],
			} as never);
			const body = await (
				await handleGetFixFiles(audit.id, deps(owner))
			).json();
			expect(body.status).toBe("done");
			expect(body.result.skipped).toHaveLength(1);
			expect(body.hasPrompt).toBe(false);
		});

		it("the view without a row is the offer for a done audit", async () => {
			const audit = await make("owner");
			const loaded = await getAudit(handle.db, audit.id);
			expect(loaded && fixFilesView(loaded, null)).toEqual({
				status: "none",
				kinds: ["robots"],
				attempts: 0,
				progress: null,
				error: null,
				result: null,
				hasPrompt: false,
			});
		});

		it("reports none before any generation", async () => {
			const audit = await make("owner");
			const body = await (
				await handleGetFixFiles(audit.id, deps(owner))
			).json();
			expect(body).toMatchObject({
				status: "none",
				kinds: ["robots"],
				attempts: 0,
			});
		});

		it("is a 404 for anonymous audits and for non-owners", async () => {
			const anon = await make(null);
			for (const viewer of [null, owner, admin]) {
				expect((await handleGetFixFiles(anon.id, deps(viewer))).status).toBe(
					404,
				);
			}
			const owned = await make("owner");
			expect((await handleGetFixFiles(owned.id, deps(other))).status).toBe(404);
			expect((await handleGetFixFiles(owned.id, deps(null))).status).toBe(404);
		});
	});

	describe("preview", () => {
		const finishBig = async (id: string) => {
			await handleStartFixFiles(id, deps(owner));
			await claimFixFiles(handle.db, id, { jobId: "job-1" });
			await completeFixFiles(handle.db, id, bigFiles as never);
		};

		it("cuts a big file to a preview at a line boundary", async () => {
			const audit = await make("owner");
			await finishBig(audit.id);
			const body = await (
				await handleGetFixFiles(audit.id, deps(owner))
			).json();
			const big = body.result.files[1];
			expect(bigContent.length).toBeGreaterThan(1024 * 1024);
			expect(big.content.length).toBeLessThanOrEqual(FIX_PREVIEW_MAX);
			expect(big.content.length).toBeGreaterThan(FIX_PREVIEW_MAX - 100);
			expect(big.content.endsWith("\n")).toBe(true);
			expect(bigContent.startsWith(big.content)).toBe(true);
			expect(big.previewOf).toBe(bigContent.length);
			expect(body.result.files[0].previewOf).toBeNull();
		});

		it("keeps the serialised view small", async () => {
			const audit = await make("owner");
			await finishBig(audit.id);
			const loaded = await getAudit(handle.db, audit.id);
			const row = await getFixFiles(handle.db, audit.id);
			const size = loaded
				? JSON.stringify(fixFilesView(loaded, row)).length
				: Number.NaN;
			expect(size).toBeLessThan(150 * 1024);
		});

		it("the zip and the file download keep the full file", async () => {
			const audit = await make("owner");
			await finishBig(audit.id);
			const file = await handleFixFileDownload(
				audit.id,
				"llms-full.txt",
				deps(owner),
			);
			expect(await file.text()).toBe(bigContent);
			const zip = await handleFixFileDownload(audit.id, "zip", deps(owner));
			const entries = unzipSync(new Uint8Array(await zip.arrayBuffer()));
			expect(strFromU8(entries["llms-full.txt"] ?? new Uint8Array())).toBe(
				bigContent,
			);
		});
	});

	describe("previewText", () => {
		it("is null when the text fits", () => {
			expect(previewText("a\nb\n", 10)).toBeNull();
			expect(previewText("x".repeat(10), 10)).toBeNull();
		});

		it("ends at the last line that fits", () => {
			expect(previewText("aaa\nbbb\nccc\n", 9)).toBe("aaa\nbbb\n");
			expect(previewText("aaa\nbbb\nccc\n", 8)).toBe("aaa\nbbb\n");
			expect(previewText("aaa\nbbb\nccc\n", 7)).toBe("aaa\n");
		});

		it("cuts a long first line on code points", () => {
			expect(previewText("abcdefgh", 4)).toBe("abcd");
			// "😀" is two UTF-16 units; the cut never splits it.
			expect(previewText("ab😀cd", 3)).toBe("ab");
			expect(previewText("ab😀cd", 4)).toBe("ab😀");
		});
	});

	describe("prompt download", () => {
		it("serves the agent prompt to the owner and the admin", async () => {
			const audit = await make("owner");
			await handleStartFixFiles(audit.id, deps(owner));
			await finishRow(audit.id);
			for (const viewer of [owner, admin]) {
				const res = await handleFixFileDownload(
					audit.id,
					"prompt",
					deps(viewer),
				);
				expect(res.status).toBe(200);
				expect(res.headers.get("content-type")).toBe(
					"text/plain; charset=utf-8",
				);
				expect(res.headers.get("content-disposition")).toBe(
					'attachment; filename="AGENT-PROMPT.md"',
				);
				expect(res.headers.get("x-content-type-options")).toBe("nosniff");
				expect(res.headers.get("cache-control")).toBe("private, no-store");
				expect(await res.text()).toContain(
					"npx agentcheck-dev https://www.codeframe.pro/",
				);
			}
		});

		it("404 for others, guests, anonymous audits and before generation", async () => {
			const audit = await make("owner");
			expect(
				(await handleFixFileDownload(audit.id, "prompt", deps(owner))).status,
			).toBe(404);
			await handleStartFixFiles(audit.id, deps(owner));
			await finishRow(audit.id);
			for (const viewer of [other, null]) {
				expect(
					(await handleFixFileDownload(audit.id, "prompt", deps(viewer)))
						.status,
				).toBe(404);
			}
			const anon = await make(null);
			for (const viewer of [null, owner, admin]) {
				expect(
					(await handleFixFileDownload(anon.id, "prompt", deps(viewer))).status,
				).toBe(404);
			}
		});

		it("404 when every file was skipped", async () => {
			const audit = await make("owner");
			await handleStartFixFiles(audit.id, deps(owner));
			await claimFixFiles(handle.db, audit.id, { jobId: "job-1" });
			await completeFixFiles(handle.db, audit.id, {
				...fixFiles,
				files: [],
				skipped: [{ kind: "robots", reason: "already fine" }],
			} as never);
			expect(
				(await handleFixFileDownload(audit.id, "prompt", deps(owner))).status,
			).toBe(404);
		});
	});

	describe("download", () => {
		it("downloads a twin by its stored name; rejects names not stored", async () => {
			const audit = await make("owner");
			await handleStartFixFiles(audit.id, deps(owner));
			await claimFixFiles(handle.db, audit.id, { jobId: "job-1" });
			await completeFixFiles(handle.db, audit.id, {
				...fixFiles,
				files: [
					...fixFiles.files,
					{
						kind: "markdown",
						name: "pricing.md",
						target: "Serve at /pricing.md",
						fixes: ["markdown-twin"],
						content: "# Pricing\n",
						todos: [],
					},
				],
			} as never);
			const res = await handleFixFileDownload(
				audit.id,
				"pricing.md",
				deps(owner),
			);
			expect(res.status).toBe(200);
			expect(res.headers.get("content-type")).toBe(
				"text/markdown; charset=utf-8",
			);
			expect(res.headers.get("content-disposition")).toBe(
				'attachment; filename="pricing.md"',
			);
			expect(res.headers.get("x-content-type-options")).toBe("nosniff");
			expect(await res.text()).toBe("# Pricing\n");
			for (const name of [
				"../x.md",
				"other.md",
				"a.exe",
				"README.MD",
				"Pricing.md",
				"a%2Fb.md",
			]) {
				expect(
					(await handleFixFileDownload(audit.id, name, deps(owner))).status,
				).toBe(404);
			}
		});

		it("serves a file as text/plain attachment", async () => {
			const audit = await make("owner");
			await handleStartFixFiles(audit.id, deps(owner));
			await finishRow(audit.id);
			const res = await handleFixFileDownload(
				audit.id,
				"robots.txt",
				deps(owner),
			);
			expect(res.status).toBe(200);
			expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
			expect(res.headers.get("content-disposition")).toBe(
				'attachment; filename="robots.txt"',
			);
			expect(res.headers.get("x-content-type-options")).toBe("nosniff");
			expect(res.headers.get("cache-control")).toBe("private, no-store");
			expect(await res.text()).toBe(fixFiles.files[0]?.content);
		});

		it("serves the zip", async () => {
			const audit = await make("owner");
			await handleStartFixFiles(audit.id, deps(owner));
			await finishRow(audit.id);
			const res = await handleFixFileDownload(audit.id, "zip", deps(admin));
			expect(res.headers.get("content-type")).toBe("application/zip");
			expect(res.headers.get("content-disposition")).toBe(
				'attachment; filename="agentcheck-fix-codeframe.pro.zip"',
			);
			expect(res.headers.get("x-content-type-options")).toBe("nosniff");
			const entries = unzipSync(new Uint8Array(await res.arrayBuffer()));
			expect(Object.keys(entries).sort()).toEqual([
				"AGENT-PROMPT.md",
				"README.md",
				"robots.txt",
			]);
			expect(strFromU8(entries["README.md"] ?? new Uint8Array())).toContain(
				`https://agentcheck.test/audits/${audit.id}`,
			);
		});

		it("404 for an unknown name, a file not generated, or no access", async () => {
			const audit = await make("owner");
			expect(
				(await handleFixFileDownload(audit.id, "robots.txt", deps(owner)))
					.status,
			).toBe(404);
			await handleStartFixFiles(audit.id, deps(owner));
			await finishRow(audit.id);
			expect(
				(await handleFixFileDownload(audit.id, "llms.txt", deps(owner))).status,
			).toBe(404);
			expect(
				(await handleFixFileDownload(audit.id, "evil.sh", deps(owner))).status,
			).toBe(404);
			expect(
				(await handleFixFileDownload(audit.id, "robots.txt", deps(other)))
					.status,
			).toBe(404);
			expect(
				(await handleFixFileDownload(audit.id, "robots.txt", deps(null)))
					.status,
			).toBe(404);
		});
	});
});
