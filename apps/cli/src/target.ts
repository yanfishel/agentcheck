import { TargetUnreachableError } from "@agentcheck/core";

/** Adds https:// to a bare host; an unparsable value is left for runAudit to report. */
export function normalizeTarget(arg: string): string {
	const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(arg)
		? arg
		: `https://${arg}`;
	try {
		return new URL(withScheme).href;
	} catch {
		return withScheme;
	}
}

/** The one-line message printed on stderr when an audit or a read fails. */
export function failureMessage(err: unknown): string {
	if (err instanceof TargetUnreachableError) return `${err.message}\n`;
	return `Error: ${err instanceof Error ? err.message : String(err)}\n`;
}
