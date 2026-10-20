import { defineConfig } from "vitest/config";

// Root-level tests: release and deploy tooling (the packages have their own configs).
export default defineConfig({
	test: {
		include: ["scripts/**/*.test.ts", "deploy/test/**/*.test.ts"],
	},
});
