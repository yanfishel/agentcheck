import type { AuditResult } from "@agentcheck/core";
import { protocolsLine } from "@agentcheck/core/protocols-line";
import {
	KeyRound,
	type LucideIcon,
	Plug,
	ShoppingCart,
	Waypoints,
} from "lucide-react";
import { Chip } from "../ui";

type Protocols = NonNullable<AuditResult["protocols"]>;
type Group = Protocols["found"][number]["group"];

const GROUP_ICON: Record<Group, LucideIcon> = {
	agents: Plug,
	auth: KeyRound,
	commerce: ShoppingCart,
};

/**
 * What the site publishes for agents beyond its content (MCP, A2A, OAuth,
 * commerce). Informational, never scored: a neutral icon (not a category's
 * colour), "not scored", the count under the title, then only the protocols
 * found; with none it is one row like a closed category. The URLs are the
 * site's own, shown as text.
 */
export function ProtocolsSection({
	protocols,
	heading,
}: {
	protocols: Protocols;
	heading: "h2" | "h4";
}) {
	const Heading = heading;
	const { checked, found } = protocols;
	return (
		<section className="rounded-[14px] border border-line bg-surface px-4 py-1 shadow-card">
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
				<Heading className="flex min-w-0 flex-auto items-center gap-3">
					<span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted">
						<Waypoints aria-hidden="true" className="size-4" />
					</span>
					<span className="min-w-0 flex-1">
						<span className="block font-bold">Agent protocols</span>
						<span className="block text-sm font-normal text-muted">
							{protocolsLine(checked.length, found.length)}
						</span>
					</span>
				</Heading>
				<Chip>not scored</Chip>
			</div>
			{found.length > 0 ? (
				<ul className="divide-y divide-line-soft border-t border-line-soft">
					{found.map((protocol) => {
						const Icon = GROUP_ICON[protocol.group];
						return (
							<li
								key={protocol.id}
								className="grid grid-cols-[18px_1fr] gap-x-3 py-3"
							>
								<Icon
									aria-hidden="true"
									className="mt-[3px] size-[18px] text-muted"
								/>
								<div className="min-w-0">
									<p>{protocol.title}</p>
									<p className="break-all text-sm text-muted">{protocol.url}</p>
								</div>
							</li>
						);
					})}
				</ul>
			) : null}
		</section>
	);
}
