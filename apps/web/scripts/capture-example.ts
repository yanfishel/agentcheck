/**
 * One-off capture of the landing's example report: audits a public reference
 * site and writes `src/content/example-audit.json` plus the first-screen
 * screenshot and the site icon into `public/example/`. Run from apps/web:
 * `node scripts/capture-example.ts` (needs the network; tests never run it).
 * It runs like the service's full check: a browser and a crawl of the site
 * (`SERVICE_CRAWL`). The repository's version is a placeholder, so pass the
 * release the example belongs to: `EXAMPLE_VERSION=0.2.0`.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
	createBrowserRenderer,
	defaultUserAgent,
	type Favicon,
	runAudit,
	type Screenshot,
	SERVICE_CRAWL,
} from "@agentcheck/core";

const TARGET = "https://vite.dev";

const pkg = JSON.parse(
	await readFile(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };
const toolVersion = process.env.EXAMPLE_VERSION ?? pkg.version;

let screenshot: Screenshot | undefined;
let favicon: Favicon | undefined;
const result = await runAudit(TARGET, {
	userAgent: defaultUserAgent(toolVersion),
	toolVersion,
	renderer: createBrowserRenderer({
		toolVersion,
		onScreenshot: (shot) => {
			screenshot = shot;
		},
	}),
	onFavicon: (icon) => {
		favicon = icon;
	},
	crawl: { ...SERVICE_CRAWL },
});

const out = new URL("../src/content/example-audit.json", import.meta.url);
await writeFile(out, `${JSON.stringify(result, null, 2)}\n`);

const assets = new URL("../public/example/", import.meta.url);
await mkdir(assets, { recursive: true });
if (screenshot) {
	await writeFile(new URL("screenshot-small.webp", assets), screenshot.small);
	await writeFile(new URL("screenshot-large.webp", assets), screenshot.large);
}
if (favicon) {
	const ext =
		{ "image/svg+xml": "svg", "image/x-icon": "ico" }[
			favicon.contentType as string
		] ?? favicon.contentType.split("/")[1];
	await writeFile(new URL(`favicon.${ext}`, assets), favicon.body);
}
console.log(
	`Wrote ${out.pathname}: page ${result.score} (${result.grade}), site ${result.crawl?.score} over ${result.crawl?.pages.length} pages, browser used: ${result.browser.used}; screenshot: ${Boolean(screenshot)}, favicon: ${favicon?.contentType ?? "none"}`,
);
