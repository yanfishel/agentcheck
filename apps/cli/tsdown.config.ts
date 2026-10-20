import { defineConfig } from "tsdown";

export default defineConfig({
	entry: { cli: "src/cli.ts" },
	format: "esm",
	platform: "node",
	target: "node22",
	clean: true,
	// Core is consumed as TypeScript source; inline it into the CLI bundle.
	deps: { alwaysBundle: ["@agentcheck/core"] },
});
