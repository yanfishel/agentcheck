import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// The Docker image runs the self-contained server; tracing starts at the
	// workspace root so the workspace packages are included.
	output: "standalone",
	outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
	transpilePackages: ["@agentcheck/core", "@agentcheck/db"],
	serverExternalPackages: ["playwright-core", "pg", "pg-boss"],
	// An agent asking for the landing with Accept: text/markdown gets its
	// markdown version (public/index.md), the same file the page links to.
	async rewrites() {
		return {
			beforeFiles: [
				{
					source: "/",
					has: [{ type: "header", key: "accept", value: ".*text/markdown.*" }],
					destination: "/index.md",
				},
			],
			afterFiles: [],
			fallback: [],
		};
	},
	async headers() {
		return [{ source: "/", headers: [{ key: "Vary", value: "Accept" }] }];
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
