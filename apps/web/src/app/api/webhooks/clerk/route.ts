import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { handleClerkWebhook } from "../../../../server/clerk-webhook";
import { getDb } from "../../../../server/current-user";

/** Clerk deliveries: public by design, authorised by the signature inside handleClerkWebhook. */
export async function POST(request: NextRequest): Promise<Response> {
	return handleClerkWebhook(request, {
		db: getDb(),
		verify: () => verifyWebhook(request),
	});
}
