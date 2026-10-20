/**
 * The report page shows at most this many characters of a fix file; the rest
 * is one click away (Copy fetches, Download serves the whole file). A plain
 * module: the server cuts the view with it and the panel names the limit.
 */
export const FIX_PREVIEW_MAX = 20 * 1024;

/**
 * The start of `text` that fits in `max` characters, ending at the last line
 * boundary that fits (a single first line longer than that is cut on code
 * points); null when the whole text fits.
 */
export function previewText(
	text: string,
	max = FIX_PREVIEW_MAX,
): string | null {
	if (text.length <= max) return null;
	const lineEnd = text.lastIndexOf("\n", max - 1);
	if (lineEnd >= 0) return text.slice(0, lineEnd + 1);
	let end = max;
	const last = text.charCodeAt(end - 1);
	// Never keep a high surrogate without its pair.
	if (last >= 0xd800 && last <= 0xdbff) end--;
	return text.slice(0, end);
}

/** "20 KB", "1.2 MB": a file size for the preview note. */
export function formatSize(length: number): string {
	const mb = 1024 * 1024;
	if (length >= mb) return `${(length / mb).toFixed(1)} MB`;
	return `${Math.max(1, Math.round(length / 1024))} KB`;
}
