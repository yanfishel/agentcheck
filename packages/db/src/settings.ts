import { eq } from "drizzle-orm";
import type { Db } from "./client.ts";
import { settings } from "./schema.ts";

export interface LimitSettings {
	anonQuickPerHour: number;
	userFullPerDay: number;
	userQuickPerDay: number;
	hostPer10Min: number;
	hostRunningMax: number;
}

export const DEFAULT_LIMITS: LimitSettings = {
	anonQuickPerHour: 5,
	userFullPerDay: 30,
	userQuickPerDay: 60,
	hostPer10Min: 10,
	hostRunningMax: 2,
};

const FIELDS = Object.keys(DEFAULT_LIMITS) as (keyof LimitSettings)[];
const MAX_LIMIT = 1_000_000;

const toLimits = (row: LimitSettings): LimitSettings => ({
	anonQuickPerHour: row.anonQuickPerHour,
	userFullPerDay: row.userFullPerDay,
	userQuickPerDay: row.userQuickPerDay,
	hostPer10Min: row.hostPer10Min,
	hostRunningMax: row.hostRunningMax,
});

/** Reads the limits; the defaults when no row has been stored yet. Never writes. */
export async function getSettings(db: Db): Promise<LimitSettings> {
	const [row] = await db.select().from(settings).where(eq(settings.id, 1));
	return row ? toLimits(row) : { ...DEFAULT_LIMITS };
}

/** Validates untrusted input into limits; unknown fields are dropped. */
export function validateLimits(input: unknown): LimitSettings {
	const source = (input ?? {}) as Record<string, unknown>;
	const out = { ...DEFAULT_LIMITS };
	for (const field of FIELDS) {
		const value = source[field];
		if (
			typeof value !== "number" ||
			!Number.isInteger(value) ||
			value < 1 ||
			value > MAX_LIMIT
		) {
			throw new Error(`${field} must be an integer between 1 and ${MAX_LIMIT}`);
		}
		out[field] = value;
	}
	return out;
}

export async function updateSettings(
	db: Db,
	limits: LimitSettings,
): Promise<LimitSettings> {
	const values = { ...toLimits(limits), updatedAt: new Date() };
	const [row] = await db
		.insert(settings)
		.values({ id: 1, ...values })
		.onConflictDoUpdate({ target: settings.id, set: values })
		.returning();
	if (!row) throw new Error("settings upsert returned no row");
	return toLimits(row);
}
