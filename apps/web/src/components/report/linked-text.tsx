import { linkify } from "./linkify";

/** Text with the web addresses it mentions turned into links (new tab). */
export function LinkedText({ text }: { text: string }) {
	return linkify(text).map((part, index) =>
		typeof part === "string" ? (
			part
		) : (
			<a
				// biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed string, never reordered.
				key={index}
				href={part.href}
				target="_blank"
				rel="noopener noreferrer nofollow"
				className="underline decoration-1 underline-offset-2 hover:text-accent"
			>
				{part.text}
			</a>
		),
	);
}
