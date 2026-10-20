import "server-only";
import { blockedMessage, checkUrl } from "@agentcheck/core";

export type TargetUrlResult =
	| { ok: true; url: string; host: string }
	| { ok: false; message: string };

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

export const INVALID_URL_MESSAGE = "Enter a valid http(s) URL";

export const CREDENTIALS_MESSAGE =
	"Remove the user name and password from the URL";

/**
 * Turns user input into an auditable URL: adds `https://` when no scheme is
 * given, refuses embedded credentials, drops the fragment and applies the
 * core network policy (public http(s) hosts only).
 */
export function normaliseTargetUrl(input: string): TargetUrlResult {
	const trimmed = input.trim();
	const withScheme = SCHEME_RE.test(trimmed) ? trimmed : `https://${trimmed}`;
	let url: URL;
	try {
		url = new URL(withScheme);
	} catch {
		return { ok: false, message: INVALID_URL_MESSAGE };
	}
	if (url.username || url.password) {
		return { ok: false, message: CREDENTIALS_MESSAGE };
	}
	url.hash = "";
	const check = checkUrl(url);
	if (!check.ok) return { ok: false, message: blockedMessage(check.reason) };
	return { ok: true, url: url.href, host: hostKey(url) };
}

/** The site key used to group audits: lowercased, no trailing dot, no leading `www.`. */
export function hostKey(url: URL): string {
	let host = url.hostname.toLowerCase();
	if (host.endsWith(".")) host = host.slice(0, -1);
	if (host.startsWith("www.")) host = host.slice(4);
	return host;
}
