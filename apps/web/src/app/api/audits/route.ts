import { getSettings } from "@agentcheck/db";
import { auth } from "@clerk/nextjs/server";
import { handleStartAudit } from "../../../server/audits";
import { clientIpKey, hashIp, ipHashSecret } from "../../../server/client-ip";
import { getCurrentUser, getDb } from "../../../server/current-user";
import { getQueue } from "../../../server/queue";

async function viewer() {
	const { userId } = await auth();
	return { userId, user: userId ? await getCurrentUser() : null };
}

export async function POST(request: Request): Promise<Response> {
	return handleStartAudit(request, {
		db: getDb(),
		boss: (await getQueue()).boss,
		viewer,
		ipHash: hashIp(clientIpKey(request.headers), ipHashSecret()),
		limits: () => getSettings(getDb()),
	});
}
