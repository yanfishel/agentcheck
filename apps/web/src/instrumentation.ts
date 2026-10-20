export async function register() {
	// Fail fast at server start, but never during `next build`.
	if (
		process.env.NEXT_RUNTIME === "nodejs" &&
		process.env.NEXT_PHASE !== "phase-production-build"
	) {
		const { requireAdminEmail, requireProductionEnv } = await import(
			"./server/env"
		);
		if (process.env.NODE_ENV === "production") requireProductionEnv();
		else requireAdminEmail();
	}
}
