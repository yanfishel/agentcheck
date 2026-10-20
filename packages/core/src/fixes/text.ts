/** Collapses whitespace, drops control characters and cuts on code points. */
export function cleanText(value: string | undefined, max = 200): string {
	if (!value) return "";
	const flat = value
		// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
		.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, "")
		.replace(/\s+/g, " ")
		.trim();
	const points = [...flat];
	return points.length > max ? points.slice(0, max).join("").trim() : flat;
}

const BACKSLASH = String.fromCharCode(92);
const MARKDOWN_SPECIAL = `${BACKSLASH}[]()<&`;

/**
 * Puts a backslash before each backslash and each of [ ] ( ) < & so site text
 * cannot form links, tags or entity references (`&lt;b&gt;` stays literal).
 */
export function escapeMarkdown(value: string): string {
	return Array.from(value, (char) =>
		MARKDOWN_SPECIAL.includes(char) ? BACKSLASH + char : char,
	).join("");
}

export function escapeAttribute(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

/** Pretty JSON that is safe inside an inline script tag: every less-than sign becomes a unicode escape. */
export function jsonForScript(value: unknown): string {
	return JSON.stringify(value, null, 2).replace(/</g, "\x5cu003c");
}
