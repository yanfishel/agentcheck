import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

/** SITE.url of content/site.ts (the config is loaded outside the app's module graph). */
const SITE_URL = "https://agentcheck.dev";

/** Public pages and their markdown versions in public/. */
const TWINS = [
	["/", "/index.md"],
	["/privacy", "/privacy.md"],
	["/terms", "/terms.md"],
] as const;

const nextConfig: NextConfig = {
	// The Docker image runs the self-contained server; tracing starts at the
	// workspace root so the workspace packages are included.
	output: "standalone",
	outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
	transpilePackages: ["@agentcheck/core", "@agentcheck/db"],
	serverExternalPackages: ["playwright-core", "pg", "pg-boss"],
	// An agent asking for a public page with Accept: text/markdown gets its
	// markdown version (public/*.md), the same file the page links to; the
	// markdown points back to the page, so it is not taken for a duplicate.
	async rewrites() {
		return {
			beforeFiles: TWINS.map(([page, twin]) => ({
				source: page,
				has: [
					{
						type: "header" as const,
						key: "accept",
						value: ".*text/markdown.*",
					},
				],
				destination: twin,
			})),
			afterFiles: [],
			fallback: [],
		};
	},
	async headers() {
		return TWINS.flatMap(([page, twin]) => [
			{ source: page, headers: [{ key: "Vary", value: "Accept" }] },
			{
				source: twin,
				headers: [
					{ key: "Link", value: `<${SITE_URL}${page}>; rel="canonical"` },
				],
			},
		]);
	},
	turbopack: {
		rules: {
			"*.css": {
				loaders: ["@tailwindcss/turbopack"],
				as: "*.css",
			},
		},
	},
};

export default nextConfig;
