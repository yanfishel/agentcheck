import { getSettings } from "@agentcheck/db";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { AdminShell } from "../../../components/admin-nav";
import { LimitsForm } from "../../../components/limits-form";
import { getDb } from "../../../server/current-user";
import { requireAdmin } from "../../../server/guards";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "Limits — Admin — AgentCheck",
	robots: { index: false },
};

export default async function AdminLimitsPage() {
	await auth.protect();
	await requireAdmin();
	const settings = await getSettings(getDb());
	return (
		<AdminShell current="/admin/limits">
			<LimitsForm initial={settings} />
		</AdminShell>
	);
}
