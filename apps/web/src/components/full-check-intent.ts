/**
 * A guest's press on Full check, kept across the sign-in that it needs.
 *
 * The press is the intent; signing in (through the dialog, the header, a
 * provider redirect) is only the way there. Once a signed-in viewer is back on
 * that audit's page within the window, the full check starts by itself. Kept
 * in sessionStorage, keyed by the audit, for a few minutes: nothing in the URL,
 * so a crafted link cannot start audits from someone else's account.
 */
export interface FullCheckIntent {
	auditId: string;
	url: string;
	at: number;
}

export const FULL_CHECK_INTENT_KEY = "agentcheck:full-check";
export const FULL_CHECK_INTENT_TTL_MS = 10 * 60 * 1000;

function storage(): Storage | null {
	try {
		return window.sessionStorage;
	} catch {
		return null;
	}
}

/** Remembers that the guest wants a full check of this audit's URL. */
export function rememberFullCheck(
	auditId: string,
	url: string,
	now = Date.now(),
): void {
	const intent: FullCheckIntent = { auditId, url, at: now };
	try {
		storage()?.setItem(FULL_CHECK_INTENT_KEY, JSON.stringify(intent));
	} catch {
		// Storage may be full or blocked; the guest then presses the button again.
	}
}

/** The guest backed out of the account dialog: the press no longer counts. */
export function forgetFullCheck(): void {
	try {
		storage()?.removeItem(FULL_CHECK_INTENT_KEY);
	} catch {
		// Nothing to forget when storage is unavailable.
	}
}

/**
 * The intent for this audit, removed from storage when it is returned; an
 * expired or malformed entry is removed too, one for another audit is kept.
 */
export function takeFullCheck(
	auditId: string,
	now = Date.now(),
): FullCheckIntent | null {
	const store = storage();
	if (!store) return null;
	try {
		const raw = store.getItem(FULL_CHECK_INTENT_KEY);
		if (raw === null) return null;
		const parsed: unknown = JSON.parse(raw);
		if (!isIntent(parsed) || now - parsed.at > FULL_CHECK_INTENT_TTL_MS) {
			store.removeItem(FULL_CHECK_INTENT_KEY);
			return null;
		}
		if (parsed.auditId !== auditId) return null;
		store.removeItem(FULL_CHECK_INTENT_KEY);
		return parsed;
	} catch {
		return null;
	}
}

function isIntent(value: unknown): value is FullCheckIntent {
	if (typeof value !== "object" || value === null) return false;
	const { auditId, url, at } = value as Record<string, unknown>;
	return (
		typeof auditId === "string" &&
		typeof url === "string" &&
		typeof at === "number" &&
		Number.isFinite(at)
	);
}
