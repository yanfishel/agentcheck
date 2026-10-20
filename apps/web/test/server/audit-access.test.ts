import type { Audit, SyncedUser, User } from "@agentcheck/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	auditStatusBody,
	canViewAudit,
	requireAuditAccess,
	resolveViewer,
	type Viewer,
} from "@/server/audit-access";

vi.mock("server-only", () => ({}));
const notFound = vi.hoisted(() =>
	vi.fn(() => {
		throw new Error("NEXT_NOT_FOUND");
	}),
);
vi.mock("next/navigation", () => ({ notFound }));

const user = (over: Partial<SyncedUser> = {}): SyncedUser => ({
	id: "u1",
	email: "a@x.com",
	role: "user",
	blocked: false,
	created: false,
	...over,
});

const audit = (over: Partial<Audit> = {}): Audit => ({
	id: "11111111-1111-4111-8111-111111111111",
	userId: null,
	ipHash: "iphash",
	url: "https://example.com/",
	finalUrl: "https://example.com/home",
	host: "example.com",
	mode: "quick",
	status: "queued",
	result: null,
	score: null,
	grade: null,
	error: null,
	shareToken: "share-token",
	hasScreenshot: false,
	hasFavicon: false,
	createdAt: new Date("2026-10-19T10:00:00.000Z"),
	startedAt: null,
	finishedAt: null,
	queuedAt: new Date("2026-10-19T10:00:00.000Z"),
	claimedBy: null,
	...over,
});

const owner = user({ id: "owner" });
const other = user({ id: "other" });
const admin = user({ id: "admin", role: "admin" });

describe("canViewAudit", () => {
	describe("anonymous audit", () => {
		const anonymous = audit({ userId: null });

		it.each<[string, Viewer]>([
			["a signed-out viewer", null],
			["a user", other],
			["an admin", admin],
		])("is visible to %s", (_name, viewer) => {
			expect(canViewAudit(anonymous, viewer)).toBe(true);
		});
	});

	describe("owned audit", () => {
		const owned = audit({ userId: "owner" });

		it.each<[string, Viewer, boolean]>([
			["the owner", owner, true],
			["an admin", admin, true],
			["another user", other, false],
			["a signed-out viewer", null, false],
			["a blocked owner", user({ id: "owner", blocked: true }), false],
			[
				"a blocked admin",
				user({ id: "admin", role: "admin", blocked: true }),
				false,
			],
		])("for %s is %s", (_name, viewer, expected) => {
			expect(canViewAudit(owned, viewer)).toBe(expected);
		});
	});
});

describe("requireAuditAccess", () => {
	beforeEach(() => {
		notFound.mockClear();
	});

	it("returns without notFound when the viewer may see the audit", () => {
		expect(() =>
			requireAuditAccess(audit({ userId: "owner" }), owner),
		).not.toThrow();
		expect(() => requireAuditAccess(audit(), null)).not.toThrow();
		expect(notFound).not.toHaveBeenCalled();
	});

	it("calls notFound when the viewer may not see the audit", () => {
		expect(() => requireAuditAccess(audit({ userId: "owner" }), other)).toThrow(
			"NEXT_NOT_FOUND",
		);
		expect(notFound).toHaveBeenCalledTimes(1);
	});

	it("calls notFound for a signed-out viewer of an owned audit", () => {
		expect(() => requireAuditAccess(audit({ userId: "owner" }), null)).toThrow(
			"NEXT_NOT_FOUND",
		);
		expect(notFound).toHaveBeenCalledTimes(1);
	});
});

describe("auditStatusBody", () => {
	it("serialises dates as ISO strings and keeps nulls", () => {
		expect(auditStatusBody(audit())).toEqual({
			id: "11111111-1111-4111-8111-111111111111",
			status: "queued",
			mode: "quick",
			url: "https://example.com/",
			score: null,
			grade: null,
			error: null,
			createdAt: "2026-10-19T10:00:00.000Z",
			startedAt: null,
			finishedAt: null,
		});
	});

	it("serialises a finished audit", () => {
		const body = auditStatusBody(
			audit({
				status: "done",
				mode: "full",
				score: 87,
				grade: "B+",
				startedAt: new Date("2026-10-19T10:00:05.000Z"),
				finishedAt: new Date("2026-10-19T10:00:30.000Z"),
			}),
		);
		expect(body).toMatchObject({
			status: "done",
			mode: "full",
			score: 87,
			grade: "B+",
			startedAt: "2026-10-19T10:00:05.000Z",
			finishedAt: "2026-10-19T10:00:30.000Z",
		});
	});

	it("keeps the error of a failed audit", () => {
		expect(
			auditStatusBody(audit({ status: "failed", error: "timeout" })).error,
		).toBe("timeout");
	});

	it("never exposes private fields", () => {
		const body = auditStatusBody(
			audit({ userId: "owner", result: {} as Audit["result"] }),
		);
		for (const key of [
			"result",
			"ipHash",
			"shareToken",
			"finalUrl",
			"host",
			"userId",
		]) {
			expect(body).not.toHaveProperty(key);
		}
	});
});

describe("resolveViewer", () => {
	const row = (over: Partial<User> = {}): User => ({
		id: "owner",
		email: "o@x.com",
		role: "user",
		blocked: false,
		createdAt: new Date("2026-10-19T10:00:00.000Z"),
		...over,
	});

	it("skips both lookups for anonymous audits", async () => {
		const deps = {
			userId: vi.fn(async () => "u1"),
			getUser: vi.fn(async () => null),
		};
		expect(await resolveViewer(audit({ userId: null }), deps)).toBeNull();
		expect(deps.userId).not.toHaveBeenCalled();
		expect(deps.getUser).not.toHaveBeenCalled();
	});

	it("returns null for a signed-out visitor without reading users", async () => {
		const deps = {
			userId: vi.fn(async () => null),
			getUser: vi.fn(async () => null),
		};
		expect(await resolveViewer(audit({ userId: "owner" }), deps)).toBeNull();
		expect(deps.getUser).not.toHaveBeenCalled();
	});

	it("maps the users row for an owned audit", async () => {
		const deps = {
			userId: async () => "owner",
			getUser: vi.fn(async () => row({ role: "admin", blocked: true })),
		};
		expect(await resolveViewer(audit({ userId: "owner" }), deps)).toEqual({
			id: "owner",
			email: "o@x.com",
			role: "admin",
			blocked: true,
			created: false,
		});
		expect(deps.getUser).toHaveBeenCalledWith("owner");
	});

	it("returns null when the users row is missing", async () => {
		const deps = { userId: async () => "owner", getUser: async () => null };
		expect(await resolveViewer(audit({ userId: "owner" }), deps)).toBeNull();
	});
});
