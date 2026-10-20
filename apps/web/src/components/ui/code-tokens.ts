/**
 * Syntax colours for hand-written snippets inside a CodeWindow. A plain module (not
 * "use client"), so server components get the class names, not a client reference.
 */
export const code = {
	prompt: "text-code-prompt",
	key: "text-code-key",
	string: "text-code-string",
	flag: "text-code-flag",
	number: "text-code-number",
	muted: "text-code-muted",
	strong: "font-bold text-code-fg",
	pass: "text-code-pass",
	warn: "text-code-warn",
	fail: "text-code-fail",
} as const;
