import { normaliseLink, type PageMeta } from "./extract.ts";
import { cleanText, escapeAttribute, jsonForScript } from "./text.ts";
import type { FixFile, FixTodo } from "./types.ts";

export function buildHeadHtml(
	page: PageMeta,
	opts: {
		og: boolean;
		jsonLd: boolean;
		/** Path of an existing markdown version the page does not link to. */
		markdownHref?: string;
		/** Add the `describedby` link to /llms.txt. */
		llmsLink?: boolean;
		/** Add `<link rel="canonical">` (the page has none). */
		canonical?: boolean;
		/** Add `<meta name="description">` (the page has none). */
		description?: boolean;
	},
): FixFile {
	const todos: FixTodo[] = [];
	const fixes: string[] = [];
	const lines: string[] = [];
	const none = "none found on the page";

	if (opts.canonical) {
		fixes.push("canonical");
		// Tracking parameters (utm_*, gclid, ...) are no part of the page's URL.
		const href = normaliseLink(page.url, new URL(page.url))?.href ?? page.url;
		lines.push(`<link rel="canonical" href="${escapeAttribute(href)}">`);
	}
	if (opts.description) {
		fixes.push("meta-description");
		if (page.ogDescription) {
			lines.push(
				`<meta name="description" content="${escapeAttribute(page.ogDescription)}">`,
			);
		} else {
			todos.push({
				text: `head.html: meta description, one or two sentences on the page (${none})`,
			});
			lines.push(
				'<meta name="description" content="TODO: one or two sentences on what the page is">',
			);
		}
	}
	if (opts.markdownHref) {
		fixes.push("markdown-twin");
		lines.push(
			`<link rel="alternate" type="text/markdown" href="${escapeAttribute(opts.markdownHref)}">`,
		);
	}
	if (opts.llmsLink) {
		fixes.push("llms-txt-link");
		lines.push('<link rel="describedby" href="/llms.txt">');
	}

	const meta = (property: string, value: string) =>
		`<meta property="${property}" content="${escapeAttribute(value)}">`;
	const todoMeta = (property: string, what: string, placeholder = what) => {
		todos.push({ text: `head.html: ${property}, ${what} (${none})` });
		return meta(property, `TODO: ${placeholder}`);
	};
	if (opts.og) {
		fixes.push("opengraph");
		const missing = (key: string) => !(key in page.og);
		const title = page.title || page.h1;
		if (missing("og:title")) {
			lines.push(
				title
					? meta("og:title", title)
					: todoMeta("og:title", "a title for the page"),
			);
		}
		if (missing("og:description")) {
			lines.push(
				page.description
					? meta("og:description", page.description)
					: todoMeta("og:description", "a description of the page"),
			);
		}
		if (missing("og:image")) {
			lines.push(
				page.image
					? meta("og:image", page.image)
					: todoMeta("og:image", "a 1200×630 picture", "a 1200×630 image URL"),
			);
		}
		if (missing("og:url")) {
			lines.push(meta("og:url", page.canonical || page.url));
		}
		if (missing("og:type")) lines.push(meta("og:type", "website"));
		if (missing("og:site_name") && page.siteName) {
			lines.push(meta("og:site_name", page.siteName));
		}
	}

	if (opts.jsonLd) {
		fixes.push("structured-data");
		const url = `${new URL(page.url).origin}/`;
		const pageName = page.siteNameFromPage ? cleanText(page.siteName) : "";
		const name = pageName || new URL(page.url).hostname;
		const json = jsonForScript({
			"@context": "https://schema.org",
			"@graph": [
				{ "@type": "WebSite", name, url },
				// Organization only when the page itself names the site.
				...(pageName
					? [
							{
								"@type": "Organization",
								name,
								url,
								...(page.logo ? { logo: page.logo } : {}),
							},
						]
					: []),
			],
		});
		lines.push(`<script type="application/ld+json">\n${json}\n</script>`);
	}

	const where = `Add inside <head> of ${page.url}`;
	const replace = opts.jsonLd && page.jsonLd.present && !page.jsonLd.usable;
	const target = replace
		? `${where}; replace the existing JSON-LD block`
		: where;
	const note = replace ? `${target} with the one below` : where;

	return {
		kind: "head",
		name: "head.html",
		target,
		fixes,
		content: `${[`<!-- ${note.replace(/--+/g, "-")} -->`, ...lines].join("\n")}\n`,
		todos,
	};
}
