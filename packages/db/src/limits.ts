import { and, count, eq, gt, isNull, min, sql } from "drizzle-orm";
import type { Db } from "./client.ts";
import { type AuditMode, audits, type Role } from "./schema.ts";
import type { LimitSettings } from "./settings.ts";

export type LimitReason = "anonymous" | "user_quick" | "user_full" | "host";

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

/** Human wait time, rounded up: "1 minute", "12 minutes", "2 hours", "1 day". */
export function formatWait(seconds: number): string {
	const minutes = Math.max(1, Math.ceil(seconds / MINUTE));
	if (minutes < 60) return plural(minutes, "minute");
	const hours = Math.ceil(minutes / 60);
	if (hours < 24) return plural(hours, "hour");
	return plural(Math.ceil(hours / 24), "day");
}

export const LIMIT_MESSAGES: Record<
	LimitReason,
	(retryAfterSeconds: number) => string
> = {
	anonymous: (s) =>
		`Too many checks from your network. Try again in ${formatWait(s)}.`,
	user_quick: (s) =>
		`You have reached today's limit for quick checks. Try again in ${formatWait(s)}.`,
	user_full: (s) =>
		`You have reached today's limit for full checks. Try again in ${formatWait(s)}.`,
	host: (s) =>
		`This site is being checked a lot right now. Try again in ${formatWait(s)}.`,
};

export class RateLimitError extends Error {
	override name = "RateLimitError";
	// Explicit fields, not parameter properties: Node's type stripping
	// (worker, web server code) cannot run parameter properties.
	readonly reason: LimitReason;
	readonly retryAfterSeconds: number;
	constructor(reason: LimitReason, retryAfterSeconds: number) {
		super(LIMIT_MESSAGES[reason](retryAfterSeconds));
		this.reason = reason;
		this.retryAfterSeconds = retryAfterSeconds;
	}
}

export interface LimitSubject {
	userId: string | null;
	role: Role | null;
	ipHash: string | null;
	host: string;
	mode: AuditMode;
}

type Where = ReturnType<typeof and>;

/**
 * Throws `RateLimitError` when `count(where within window) >= max`; the retry
 * delay is until the oldest counted audit leaves the window.
 */
async function check(
	tx: Db,
	reason: LimitReason,
	where: Where,
	windowSeconds: number,
	max: number,
	now: Date,
): Promise<void> {
	const [row] = await tx
		.select({ n: count(), oldest: min(audits.createdAt) })
		.from(audits)
		.where(where);
	if (!row || row.n < max || !row.oldest) return;
	const retry = Math.ceil(
		(row.oldest.getTime() + windowSeconds * 1000 - now.getTime()) / 1000,
	);
	throw new RateLimitError(reason, Math.max(1, retry));
}

const lock = (tx: Db, key: string) =>
	tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);

/**
 * Enforces the rate limits for a new audit. Call it with the enqueue
 * transaction: the advisory locks (host first, then subject) serialise
 * concurrent requests until commit, so the counts cannot be raced.
 */
export async function enforceLimits(
	tx: Db,
	limits: LimitSettings,
	subject: LimitSubject,
	now: () => Date = () => new Date(),
): Promise<void> {
	const at = now();
	const since = (seconds: number) => new Date(at.getTime() - seconds * 1000);

	await lock(tx, `host:${subject.host}`);
	if (subject.userId) await lock(tx, `user:${subject.userId}`);
	else if (subject.ipHash) await lock(tx, `ip:${subject.ipHash}`);

	await check(
		tx,
		"host",
		and(
			eq(audits.host, subject.host),
			gt(audits.createdAt, since(10 * MINUTE)),
		),
		10 * MINUTE,
		limits.hostPer10Min,
		at,
	);

	if (!subject.userId) {
		if (!subject.ipHash) return;
		await check(
			tx,
			"anonymous",
			and(
				isNull(audits.userId),
				eq(audits.ipHash, subject.ipHash),
				gt(audits.createdAt, since(HOUR)),
			),
			HOUR,
			limits.anonQuickPerHour,
			at,
		);
		return;
	}

	if (subject.role === "admin") return;
	const full = subject.mode === "full";
	await check(
		tx,
		full ? "user_full" : "user_quick",
		and(
			eq(audits.userId, subject.userId),
			eq(audits.mode, subject.mode),
			gt(audits.createdAt, since(DAY)),
		),
		DAY,
		full ? limits.userFullPerDay : limits.userQuickPerDay,
		at,
	);
}
