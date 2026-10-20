import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import {
	auditFavicons,
	auditScreenshots,
	audits,
	type ClerkIdentity,
	countUsers,
	createAudit,
	type Db,
	deleteUserData,
	getUserById,
	listUsers,
	setUserBlocked,
	syncUser,
	users,
} from "../src/index.ts";
import { createTestDb } from "../src/testing.ts";

const identity = (
	id: string,
	primaryEmail: string | null,
	primaryEmailVerified = true,
): ClerkIdentity => ({ id, primaryEmail, primaryEmailVerified });

const ADMIN = "owner@example.com";

describe("syncUser", () => {
	let close: (() => Promise<void>) | undefined;
	afterEach(async () => {
		await close?.();
		close = undefined;
	});
	const setup = async () => {
		const t = await createTestDb();
		close = t.close;
		return t.db;
	};

	it("makes the verified ADMIN_EMAIL account admin", async () => {
		const db = await setup();
		const u = await syncUser(db, identity("u1", ADMIN), { adminEmail: ADMIN });
		expect(u).toMatchObject({ role: "admin", created: true, blocked: false });
	});

	it("does not make an unverified matching email admin", async () => {
		const db = await setup();
		const u = await syncUser(db, identity("u1", ADMIN, false), {
			adminEmail: ADMIN,
		});
		expect(u.role).toBe("user");
	});

	it("does not make other emails admin, even the first user", async () => {
		const db = await setup();
		const a = await syncUser(db, identity("u1", "a@x.com"), {
			adminEmail: ADMIN,
		});
		const n = await syncUser(db, identity("u2", null), { adminEmail: ADMIN });
		expect(a.role).toBe("user");
		expect(n).toMatchObject({ role: "user", email: "" });
	});

	it("never lets Unicode case folding create an admin match", async () => {
		const db = await setup();
		// U+212A KELVIN SIGN lowercases to ASCII "k".
		const u = await syncUser(db, identity("u1", "Kelvin@example.com"), {
			adminEmail: "kelvin@example.com",
		});
		expect(u.role).toBe("user");
	});

	it("compares non-ASCII addresses exactly", async () => {
		const db = await setup();
		const same = await syncUser(db, identity("u1", "jörg@example.com"), {
			adminEmail: "jörg@example.com",
		});
		const folded = await syncUser(db, identity("u2", "JÖRG@example.com"), {
			adminEmail: "jörg@example.com",
		});
		expect(same.role).toBe("admin");
		expect(folded.role).toBe("user");
	});

	it("matches case- and whitespace-insensitively", async () => {
		const db = await setup();
		const u = await syncUser(db, identity("u1", "OWNER@Example.COM"), {
			adminEmail: "  Owner@example.com ",
		});
		expect(u.role).toBe("admin");
	});

	it("moves the admin role when ADMIN_EMAIL changes", async () => {
		const db = await setup();
		await syncUser(db, identity("u1", "a@x.com"), { adminEmail: "a@x.com" });
		await syncUser(db, identity("u2", "b@x.com"), { adminEmail: "a@x.com" });
		const a = await syncUser(db, identity("u1", "a@x.com"), {
			adminEmail: "b@x.com",
		});
		const b = await syncUser(db, identity("u2", "b@x.com"), {
			adminEmail: "b@x.com",
		});
		expect(a).toMatchObject({ role: "user", created: false });
		expect(b).toMatchObject({ role: "admin", created: false });
		const rows = await db.select().from(users);
		expect(rows.filter((r) => r.role === "admin")).toHaveLength(1);
	});

	it("demotes an admin whose email becomes unverified or changes", async () => {
		const db = await setup();
		const opts = { adminEmail: ADMIN };
		await syncUser(db, identity("u1", ADMIN), opts);
		const unverified = await syncUser(db, identity("u1", ADMIN, false), opts);
		expect(unverified.role).toBe("user");
		await syncUser(db, identity("u1", ADMIN), opts);
		const changed = await syncUser(db, identity("u1", "new@x.com"), opts);
		expect(changed).toMatchObject({ role: "user", email: "new@x.com" });
		const [row] = await db.select().from(users).where(eq(users.id, "u1"));
		expect(row).toMatchObject({ role: "user", email: "new@x.com" });
	});

	it.each(["", "   "])("throws for blank adminEmail %j", async (adminEmail) => {
		const db = await setup();
		await expect(
			syncUser(db, identity("u1", ADMIN), { adminEmail }),
		).rejects.toThrow("ADMIN_EMAIL is required");
	});

	it("throws for a missing adminEmail", async () => {
		const db = await setup();
		await expect(
			syncUser(db, identity("u1", ADMIN), {} as { adminEmail: string }),
		).rejects.toThrow("ADMIN_EMAIL is required");
	});
});

describe("listUsers", () => {
	it("returns users newest first, paged, and counts them", async () => {
		const t = await createTestDb();
		try {
			await t.db.insert(users).values([
				{
					id: "old",
					email: "o@x.com",
					role: "user",
					createdAt: new Date(1000),
				},
				{
					id: "new",
					email: "n@x.com",
					role: "user",
					createdAt: new Date(2000),
				},
			]);
			expect((await listUsers(t.db)).map((u) => u.id)).toEqual(["new", "old"]);
			const second = await listUsers(t.db, { limit: 1, offset: 1 });
			expect(second.map((u) => u.id)).toEqual(["old"]);
			expect(await countUsers(t.db)).toBe(2);
		} finally {
			await t.close();
		}
	});

	it("searches the email case-insensitively and literally", async () => {
		const t = await createTestDb();
		try {
			await t.db.insert(users).values([
				{ id: "a", email: "Alice@Mail.test", role: "user" },
				{ id: "b", email: "bob_x@mail.test", role: "user" },
				{ id: "c", email: "", role: "user" },
			]);
			const ids = async (search: string) =>
				(await listUsers(t.db, { search })).map((u) => u.id).sort();
			expect(await ids("ALICE")).toEqual(["a"]);
			expect(await ids("mail.test")).toEqual(["a", "b"]);
			expect(await ids("bo_x")).toEqual([]);
			expect(await ids("b_x@")).toEqual(["b"]);
			expect(await ids("%")).toEqual([]);
			expect(await countUsers(t.db, { search: "mail.test" })).toBe(2);
			expect(await countUsers(t.db, { search: "nobody" })).toBe(0);
		} finally {
			await t.close();
		}
	});
});

describe("getUserById", () => {
	let close: (() => Promise<void>) | undefined;
	afterEach(async () => {
		await close?.();
		close = undefined;
	});

	it("returns the row, or null for an unknown id", async () => {
		const t = await createTestDb();
		close = t.close;
		await syncUser(t.db, identity("u1", "a@x.com"), { adminEmail: ADMIN });
		expect(await getUserById(t.db, "u1")).toMatchObject({
			id: "u1",
			email: "a@x.com",
			role: "user",
			blocked: false,
		});
		expect(await getUserById(t.db, "nope")).toBeNull();
	});
});

describe("setUserBlocked", () => {
	let close: (() => Promise<void>) | undefined;
	afterEach(async () => {
		await close?.();
		close = undefined;
	});

	it("flips the flag and returns the row, or null for an unknown id", async () => {
		const t = await createTestDb();
		close = t.close;
		await t.db
			.insert(users)
			.values({ id: "u1", email: "u@x.com", role: "user" });
		const blocked = await setUserBlocked(t.db, "u1", true);
		expect(blocked?.blocked).toBe(true);
		expect((await getUserById(t.db, "u1"))?.blocked).toBe(true);
		const unblocked = await setUserBlocked(t.db, "u1", false);
		expect(unblocked?.blocked).toBe(false);
		expect(await setUserBlocked(t.db, "nope", true)).toBeNull();
	});
});

describe("deleteUserData", () => {
	let close: (() => Promise<void>) | undefined;
	afterEach(async () => {
		await close?.();
		close = undefined;
	});

	const audit = (db: Db, userId: string | null) =>
		createAudit(
			db,
			{
				url: "https://example.com/",
				host: "example.com",
				mode: "quick",
				userId,
			},
			async () => {},
		);

	it("removes the screenshots of the deleted audits", async () => {
		const t = await createTestDb();
		close = t.close;
		const { db } = t;
		await syncUser(db, identity("gone", "gone@example.com"), {
			adminEmail: ADMIN,
		});
		const a = await audit(db, "gone");
		await db.insert(auditScreenshots).values({
			auditId: a.id,
			contentType: "image/webp",
			large: new Uint8Array([1]),
			small: new Uint8Array([2]),
		});
		await db.insert(auditFavicons).values({
			auditId: a.id,
			contentType: "image/png",
			body: new Uint8Array([3]),
		});
		await deleteUserData(db, "gone");
		expect(await db.select().from(auditScreenshots)).toEqual([]);
		expect(await db.select().from(auditFavicons)).toEqual([]);
	});

	it("removes the user and their audits, and leaves everyone else alone", async () => {
		const t = await createTestDb();
		close = t.close;
		const { db } = t;
		await syncUser(db, identity("gone", "gone@example.com"), {
			adminEmail: ADMIN,
		});
		await syncUser(db, identity("stays", "stays@example.com"), {
			adminEmail: ADMIN,
		});
		await audit(db, "gone");
		await audit(db, "gone");
		const kept = await audit(db, "stays");
		const anonymous = await audit(db, null);

		expect(await deleteUserData(db, "gone")).toEqual({
			user: true,
			audits: 2,
		});
		expect(await getUserById(db, "gone")).toBeNull();
		const left = (await db.select({ id: audits.id }).from(audits)).map(
			(a) => a.id,
		);
		expect(left.sort()).toEqual([kept.id, anonymous.id].sort());
	});

	it("is a no-op for an unknown id, so a redelivered event is harmless", async () => {
		const t = await createTestDb();
		close = t.close;
		expect(await deleteUserData(t.db, "nobody")).toEqual({
			user: false,
			audits: 0,
		});
	});
});
