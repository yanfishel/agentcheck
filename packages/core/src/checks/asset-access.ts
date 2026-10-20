import type { Check } from "../types.ts";

/** Tests whether a robots.txt rule value matches the start of a path. */
function ruleMatches(rule: string, path: string): boolean {
	const anchored = rule.endsWith("$");
	const body = anchored ? rule.slice(0, -1) : rule;
	const pattern = body
		.split("*")
		.map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
		.join(".*");
	return new RegExp(`^${pattern}${anchored ? "$" : ""}`).test(path);
}

function collectAssets(ctx: Parameters<Check["run"]>[0]): Map<string, URL> {
	const refs: (string | undefined)[] = [];
	ctx.$("img[src], script[src]").each((_, el) => {
		refs.push(ctx.$(el).attr("src"));
	});
	ctx.$("link[rel~=stylesheet][href]").each((_, el) => {
		refs.push(ctx.$(el).attr("href"));
	});
	const assets = new Map<string, URL>();
	for (const ref of refs) {
		const trimmed = ref?.trim();
		if (!trimmed) continue;
		let url: URL;
		try {
			url = new URL(trimmed, ctx.targetUrl);
		} catch {
			continue;
		}
		if (url.protocol !== "http:" && url.protocol !== "https:") continue;
		if (url.origin !== ctx.targetUrl.origin) continue;
		url.hash = "";
		assets.set(url.href, url);
	}
	return assets;
}

export const assetAccess: Check = {
	id: "asset-access",
	category: "bot-access",
	title: "Page assets crawlable",
	weight: 10,
	async run(ctx) {
		const robots = await ctx.robots();
		if (robots.kind === "missing") {
			return {
				status: "pass",
				message: "No robots.txt found; page assets are crawlable",
			};
		}
		if (robots.kind === "error") {
			return {
				status: "skip",
				message: "robots.txt could not be read; asset access not evaluated",
			};
		}
		const assets = collectAssets(ctx);
		const rules = robots.disallowedPaths("*");
		const blocked = [...assets.values()].filter(
			(url) => !robots.isAllowed(url.href, "*"),
		);
		if (blocked.length === 0) {
			return {
				status: "pass",
				message: `robots.txt does not block any of ${assets.size} page assets`,
			};
		}
		const used = new Set<string>();
		for (const url of blocked) {
			const path = url.pathname + url.search;
			const best = rules
				.filter((rule) => ruleMatches(rule, path))
				.sort((a, b) => b.length - a.length)[0];
			if (best !== undefined) used.add(best);
		}
		return {
			status: "warn",
			message: `robots.txt blocks ${blocked.length} of ${assets.size} page assets`,
			details: [...new Set(rules)].filter((rule) => used.has(rule)),
			remediation:
				"Remove the Disallow rules covering CSS, JavaScript and image paths so AI agents can render the page.",
		};
	},
};
