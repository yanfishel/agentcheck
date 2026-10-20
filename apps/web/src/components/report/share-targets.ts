/** Where a shared report can be posted, in the order the share dialog lists them. */
export type ShareTargetId =
	| "x"
	| "linkedin"
	| "facebook"
	| "reddit"
	| "hackernews"
	| "bluesky"
	| "email";

export interface ShareTarget {
	id: ShareTargetId;
	label: string;
	href: string;
}

/**
 * The share intents for a public report link. `text` is the post's line (host
 * and score); every value is URL-encoded, nothing is fetched.
 */
export function shareTargets(url: string, text: string): ShareTarget[] {
	const u = encodeURIComponent(url);
	const t = encodeURIComponent(text);
	const both = encodeURIComponent(`${text} ${url}`);
	return [
		{
			id: "x",
			label: "X",
			href: `https://x.com/intent/post?text=${t}&url=${u}`,
		},
		{
			id: "linkedin",
			label: "LinkedIn",
			href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
		},
		{
			id: "facebook",
			label: "Facebook",
			href: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
		},
		{
			id: "reddit",
			label: "Reddit",
			href: `https://www.reddit.com/submit?url=${u}&title=${t}`,
		},
		{
			id: "hackernews",
			label: "Hacker News",
			href: `https://news.ycombinator.com/submitlink?u=${u}&t=${t}`,
		},
		{
			id: "bluesky",
			label: "Bluesky",
			href: `https://bsky.app/intent/compose?text=${both}`,
		},
		{
			id: "email",
			label: "Email",
			href: `mailto:?subject=${t}&body=${both}`,
		},
	];
}
