import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		// Mirrors the "@/*" path in tsconfig.json; tests live in test/ and import sources through it.
		alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
	},
	test: {
		environment: "node",
		include: ["test/**/*.test.{ts,tsx}"],
		setupFiles: ["./test/setup-dom.ts"],
		// Database tests boot PGlite and pg-boss in hooks; on a loaded CI runner
		// (pnpm -r runs the packages' tests side by side) that can pass 10 s.
		testTimeout: 30_000,
		hookTimeout: 30_000,
	},
});
