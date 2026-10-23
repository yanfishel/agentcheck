import type { Check } from "../types.ts";
import { checkTextManifest } from "./text-manifest.ts";

export const llmsTxt: Check = {
	id: "llms-txt",
	category: "ai-manifests",
	scope: "site",
	title: "llms.txt present",
	weight: 40,
	run: (ctx) =>
		checkTextManifest(
			ctx,
			"/llms.txt",
			"Publish /llms.txt as plain text: an H1 title, a short summary and link lists to your key pages (see llmstxt.org).",
		),
};
