/** One page of a list: the page shown (1-based), how many there are, and the row offset. */
export interface PageWindow {
	page: number;
	pages: number;
	offset: number;
}

/** Reads `?q=`: trimmed, cut to `max`, empty as none. */
export function searchQuery(
	raw: string | string[] | undefined,
	max: number,
): string | undefined {
	const value = Array.isArray(raw) ? raw[0] : raw;
	return value?.trim().slice(0, max) || undefined;
}

/**
 * Reads `?page=` against the list's size: anything that is not a positive
 * integer is page 1, a page past the end is the last page, and an empty list
 * still has one page.
 */
export function pageWindow(
	raw: string | string[] | undefined,
	total: number,
	size: number,
): PageWindow {
	const value = Array.isArray(raw) ? raw[0] : raw;
	const asked = value && /^\d+$/.test(value) ? Number(value) : 1;
	const pages = Math.max(1, Math.ceil(total / size));
	const page = Math.min(Math.max(asked, 1), pages);
	return { page, pages, offset: (page - 1) * size };
}
