/** An ILIKE pattern for `search` anywhere in the value, with `\`, `%` and `_` matched literally. */
export const containsPattern = (search: string) =>
	`%${search.replace(/[\\%_]/g, "\\$&")}%`;
