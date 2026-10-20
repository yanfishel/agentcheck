/**
 * One-off capture of the landing's example report: audits a public reference
 * site and writes `src/content/example-audit.json` plus the first-screen
 * screenshot and the site icon into `public/example/`. Run from apps/web:
 * `node scripts/capture-example.ts` (needs the network; tests never run it).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
	createBrowserRenderer,
	defaultUserAgent,
	type Favicon,
	runAudit,
	type Screenshot,
} from "@agentcheck/core";

const TARGET = "https://vite.dev";

const pkg = JSON.parse(
	await readFile(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };
const toolVersion = pkg.version;

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
	`Wrote ${out.pathname}: score ${result.score} (${result.grade}), browser used: ${result.browser.used}; screenshot: ${Boolean(screenshot)}, favicon: ${favicon?.contentType ?? "none"}`,
);
