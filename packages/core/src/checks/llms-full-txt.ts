import type { Check } from "../types.ts";
import { checkTextManifest } from "./text-manifest.ts";

export const llmsFullTxt: Check = {
	id: "llms-full-txt",
	category: "ai-manifests",
	scope: "site",
	title: "llms-full.txt present",
	weight: 20,
	run: (ctx) =>
		checkTextManifest(
			ctx,
			"/llms-full.txt",
			"Publish /llms-full.txt with the full text of your key pages in markdown (see llmstxt.org).",
		),
};
