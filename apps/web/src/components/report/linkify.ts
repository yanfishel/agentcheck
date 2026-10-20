export type TextPart = string | { text: string; href: string };

/**
 * Full http(s) URLs, and bare domains with a common TLD ("llmstxt.org"). A bare
 * domain must not follow a slash, dot, @ or word character, so paths and file
 * names ("/llms.txt", "index.md", "a@b.org") stay text.
 */
const LINK =
	/https?:\/\/[^\s<>"'`]+|(?<![\w@/.-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:org|com|net|io|dev|ai|app|co|il|info|me|uk|de|eu|ru)(?![\w-]|\.\w)/gi;

/** Trailing punctuation that ends a sentence, not the URL. */
const TRAILING = /[.,;:!?)\]]+$/;

/** Splits text into plain strings and links to the addresses it mentions. */
export function linkify(text: string): TextPart[] {
	const parts: TextPart[] = [];
	let last = 0;
	for (const match of text.matchAll(LINK)) {
		const raw = match[0];
		const start = match.index;
		let link = raw.replace(TRAILING, "");
		// Keep a closing parenthesis that belongs to the URL itself.
		if (link.includes("(") && raw.startsWith(`${link})`)) link = `${link})`;
		const href = /^https?:/i.test(link) ? link : `https://${link}`;
		if (!URL.canParse(href)) continue;
		if (start > last) parts.push(text.slice(last, start));
		parts.push({ text: link, href });
		last = start + link.length;
	}
	if (last < text.length) parts.push(text.slice(last));
	return parts;
}
