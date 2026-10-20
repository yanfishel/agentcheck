import type { SyncedUser } from "@agentcheck/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireActiveUser, requireAdmin } from "@/server/guards";

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

describe("requireAdmin", () => {
	beforeEach(() => {
		notFound.mockClear();
	});

	it("returns the admin", async () => {
		const admin = user({ role: "admin" });
		await expect(requireAdmin(async () => admin)).resolves.toBe(admin);
		expect(notFound).not.toHaveBeenCalled();
	});

	it("calls notFound for a regular user", async () => {
		await expect(requireAdmin(async () => user())).rejects.toThrow(
			"NEXT_NOT_FOUND",
		);
		expect(notFound).toHaveBeenCalledTimes(1);
	});

	it("calls notFound for a blocked admin", async () => {
		await expect(
			requireAdmin(async () => user({ role: "admin", blocked: true })),
		).rejects.toThrow("NEXT_NOT_FOUND");
		expect(notFound).toHaveBeenCalledTimes(1);
	});

	it("calls notFound when there is no user", async () => {
		await expect(requireAdmin(async () => null)).rejects.toThrow(
			"NEXT_NOT_FOUND",
		);
	});
});

describe("requireActiveUser", () => {
	beforeEach(() => {
		notFound.mockClear();
	});

	it("returns an active user", async () => {
		const u = user();
		await expect(requireActiveUser(async () => u)).resolves.toBe(u);
		expect(notFound).not.toHaveBeenCalled();
	});

	it("calls notFound for a blocked user", async () => {
		await expect(
			requireActiveUser(async () => user({ blocked: true })),
		).rejects.toThrow("NEXT_NOT_FOUND");
	});

	it("calls notFound when there is no user", async () => {
		await expect(requireActiveUser(async () => null)).rejects.toThrow(
			"NEXT_NOT_FOUND",
		);
	});
});
