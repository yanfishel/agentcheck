import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// The Docker image runs the self-contained server; tracing starts at the
	// workspace root so the workspace packages are included.
	output: "standalone",
	outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
	transpilePackages: ["@agentcheck/core", "@agentcheck/db"],
	serverExternalPackages: ["playwright-core", "pg", "pg-boss"],
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
