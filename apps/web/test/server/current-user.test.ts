import type { DbHandle, Role } from "@agentcheck/db";
import { createTestDb } from "@agentcheck/db/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ClerkPort, getCurrentUser } from "@/server/current-user";

vi.mock("server-only", () => ({}));

function fakeClerk(
	user: { role?: string } | null,
	setRole: ClerkPort["setRole"] = async () => {},
): ClerkPort & { setRole: ReturnType<typeof vi.fn> } {
	return {
		currentUser: async () =>
			user && {
				id: "user_1",
				primaryEmail: "a@x.com",
				primaryEmailVerified: true,
				publicMetadata: user.role ? { role: user.role } : {},
			},
		setRole: vi.fn(setRole),
	};
}

describe("getCurrentUser", () => {
	let handle: DbHandle;
	beforeEach(async () => {
		handle = await createTestDb();
	});
	afterEach(async () => {
		vi.restoreAllMocks();
		await handle.close();
	});

	it("throws when ADMIN_EMAIL is missing", async () => {
		vi.stubEnv("ADMIN_EMAIL", "");
		await expect(
			getCurrentUser({ db: handle.db, clerk: fakeClerk(null) }),
		).rejects.toThrow("ADMIN_EMAIL is not set");
		vi.unstubAllEnvs();
	});

	it("returns null when signed out", async () => {
		const clerk = fakeClerk(null);
		expect(
			await getCurrentUser({ db: handle.db, clerk, adminEmail: "a@x.com" }),
		).toBeNull();
		expect(clerk.setRole).not.toHaveBeenCalled();
	});

	it("mirrors the database role when metadata differs", async () => {
		const clerk = fakeClerk({});
		const user = await getCurrentUser({
			db: handle.db,
			clerk,
			adminEmail: "a@x.com",
		});
		expect(user?.role).toBe("admin");
		expect(clerk.setRole).toHaveBeenCalledTimes(1);
		expect(clerk.setRole).toHaveBeenCalledWith(
			"user_1",
			"admin" satisfies Role,
		);
	});

	it("does not call setRole when metadata matches", async () => {
		const clerk = fakeClerk({ role: "admin" });
		await getCurrentUser({ db: handle.db, clerk, adminEmail: "a@x.com" });
		expect(clerk.setRole).not.toHaveBeenCalled();
	});

	it("swallows a setRole failure with a warning and retries next time", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const clerk = fakeClerk({}, async () => {
			throw new Error("clerk down");
		});
		const first = await getCurrentUser({
			db: handle.db,
			clerk,
			adminEmail: "a@x.com",
		});
		expect(first?.role).toBe("admin");
		expect(warn).toHaveBeenCalledTimes(1);
		const second = await getCurrentUser({
			db: handle.db,
			clerk,
			adminEmail: "a@x.com",
		});
		expect(second?.role).toBe("admin");
		expect(clerk.setRole).toHaveBeenCalledTimes(2);
	});

	it("reuses the database handle stored on globalThis", async () => {
		vi.stubEnv("DATABASE_URL", "");
		const g = globalThis as { __agentcheckDb?: DbHandle };
		g.__agentcheckDb = handle;
		try {
			const user = await getCurrentUser({
				clerk: fakeClerk({ role: "admin" }),
				adminEmail: "a@x.com",
			});
			expect(user?.role).toBe("admin");
		} finally {
			delete g.__agentcheckDb;
			vi.unstubAllEnvs();
		}
	});

	it("explains the missing DATABASE_URL when no handle exists", async () => {
		vi.stubEnv("DATABASE_URL", "");
		await expect(
			getCurrentUser({ clerk: fakeClerk({}), adminEmail: "a@x.com" }),
		).rejects.toThrow("DATABASE_URL is not set");
		vi.unstubAllEnvs();
	});
});
