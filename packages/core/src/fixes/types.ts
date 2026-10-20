export type FixKind = "robots" | "llms" | "llms-full" | "markdown" | "head";

export interface FixTodo {
	text: string;
}

export interface FixFile {
	kind: FixKind;
	/** "robots.txt", "llms.txt", "llms-full.txt", "head.html" or the twin's "<page>.md" (matches ^[a-z0-9][a-z0-9._-]*$). */
	name: string;
	/** Where it goes, one sentence: "Replace /robots.txt at the site root". */
	target: string;
	/** Check ids this file fixes. */
	fixes: string[];
	content: string;
	todos: FixTodo[];
}

export interface FixFiles {
	files: FixFile[];
	/** `error: true` when the kind's input could not be read; absent when the site is already fine. */
	skipped: { kind: FixKind; reason: string; error?: true }[];
	pagesRead: number;
	pagesFailed: number;
	generatedAt: string; // ISO
	toolVersion: string;
}
