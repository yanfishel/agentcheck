/**
 * A guest's press on a button that needs an account (Full check, Generate
 * fix files), kept across the sign-in it needs.
 *
 * The press is the intent; signing in (through the dialog, the header, a
 * provider redirect) is only the way there. Once a signed-in viewer is back on
 * that audit's page within the window, the run they asked for starts by
 * itself. Kept in sessionStorage, keyed by the audit and the mode, for a few
 * minutes: nothing in the URL, so a crafted link cannot start audits from
 * someone else's account.
 */
export type RerunMode = "quick" | "full";

export interface RerunIntent {
	auditId: string;
	url: string;
	mode: RerunMode;
	at: number;
}

export const RERUN_INTENT_KEY = "agentcheck:rerun";
export const RERUN_INTENT_TTL_MS = 10 * 60 * 1000;

function storage(): Storage | null {
	try {
		return window.sessionStorage;
	} catch {
		return null;
	}
}

/** Remembers that the guest wants this audit's URL run again in `mode`. */
export function rememberRerun(
	auditId: string,
	url: string,
	mode: RerunMode,
	now = Date.now(),
): void {
	const intent: RerunIntent = { auditId, url, mode, at: now };
	try {
		storage()?.setItem(RERUN_INTENT_KEY, JSON.stringify(intent));
	} catch {
		// Storage may be full or blocked; the guest then presses the button again.
	}
}

/** The guest backed out of the account dialog: the press no longer counts. */
export function forgetRerun(): void {
	try {
		storage()?.removeItem(RERUN_INTENT_KEY);
	} catch {
		// Nothing to forget when storage is unavailable.
	}
}

/**
 * The intent for this audit and mode, removed from storage when it is
 * returned; an expired or malformed entry is removed too, one for another
 * audit or mode is kept for the button it belongs to.
 */
export function takeRerun(
	auditId: string,
	mode: RerunMode,
	now = Date.now(),
): RerunIntent | null {
	const store = storage();
	if (!store) return null;
	try {
		const raw = store.getItem(RERUN_INTENT_KEY);
		if (raw === null) return null;
		const parsed: unknown = JSON.parse(raw);
		if (!isIntent(parsed) || now - parsed.at > RERUN_INTENT_TTL_MS) {
			store.removeItem(RERUN_INTENT_KEY);
			return null;
		}
		if (parsed.auditId !== auditId || parsed.mode !== mode) return null;
		store.removeItem(RERUN_INTENT_KEY);
		return parsed;
	} catch {
		return null;
	}
}

function isIntent(value: unknown): value is RerunIntent {
	if (typeof value !== "object" || value === null) return false;
	const { auditId, url, mode, at } = value as Record<string, unknown>;
	return (
		typeof auditId === "string" &&
		typeof url === "string" &&
		(mode === "quick" || mode === "full") &&
		typeof at === "number" &&
		Number.isFinite(at)
	);
}
