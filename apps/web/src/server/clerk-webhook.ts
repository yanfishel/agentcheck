import "server-only";
import { type Db, deleteUserData } from "@agentcheck/db";
import type { WebhookEvent } from "@clerk/nextjs/webhooks";

export type ClerkWebhookDeps = {
	db: Db;
	/** verifyWebhook from @clerk/nextjs/webhooks (CLERK_WEBHOOK_SIGNING_SECRET). */
	verify: (request: Request) => Promise<WebhookEvent>;
};

/**
 * Clerk webhooks. The signature is the only check (deliveries carry no session),
 * so a bad one is a 400 and nothing else runs. user.deleted removes the local
 * user and their audits; other events are acknowledged and ignored. A database
 * error throws, so Clerk retries the delivery.
 */
export async function handleClerkWebhook(
	request: Request,
	deps: ClerkWebhookDeps,
): Promise<Response> {
	let event: WebhookEvent;
	try {
		event = await deps.verify(request);
	} catch (error) {
		console.error(
			"clerk.webhook.unverified",
			error instanceof Error ? error.message : "unknown error",
		);
		return new Response("Verification failed", { status: 400 });
	}

	if (event.type === "user.deleted" && event.data.id) {
		const removed = await deleteUserData(deps.db, event.data.id);
		console.info("clerk.user_deleted", removed);
	}
	return new Response("OK", { status: 200 });
}
