import { isTextResource } from "./http.ts";
import { pageLinks } from "./links.ts";
import type { AuditContext } from "./types.ts";

export type ProtocolGroup = "agents" | "auth" | "commerce";

interface Protocol {
	id: string;
	title: string;
	group: ProtocolGroup;
	/** Same-origin paths tried in order; the first that answers counts. */
	paths: string[];
	/** "json": the body must parse as a JSON object or array. */
	body: "json" | "text";
	/** A `<link rel>` (tag or header) that may point at the document instead. */
	rel?: string;
}

/**
 * What a site may publish for agents beyond its content. Informational: the
 * result lists what was found and never touches the score. Paths follow the
 * specs and what other scanners request.
 */
export const PROTOCOLS: readonly Protocol[] = [
	{
		id: "mcp-server-card",
		title: "MCP Server Card",
		group: "agents",
		paths: [
			"/.well-known/mcp/server-card.json",
			"/.well-known/mcp/server-cards.json",
			"/.well-known/mcp.json",
		],
		body: "json",
	},
	{
		id: "a2a-agent-card",
		title: "A2A Agent Card",
		group: "agents",
		paths: ["/.well-known/agent-card.json", "/.well-known/agent.json"],
		body: "json",
	},
	{
		id: "agent-skills",
		title: "Agent Skills index",
		group: "agents",
		paths: [
			"/.well-known/agent-skills/index.json",
			"/.well-known/skills/index.json",
		],
		body: "json",
	},
	{
		id: "api-catalog",
		title: "API Catalog (RFC 9727)",
		group: "agents",
		paths: ["/.well-known/api-catalog"],
		body: "json",
	},
	{
		id: "openapi",
		title: "OpenAPI description",
		group: "agents",
		paths: ["/openapi.json"],
		body: "json",
	},
	{
		id: "ai-catalog",
		title: "AI Catalog",
		group: "agents",
		paths: ["/.well-known/ai-catalog.json"],
		body: "json",
		rel: "ai-catalog",
	},
	{
		id: "oauth-discovery",
		title: "OAuth / OpenID Connect discovery",
		group: "auth",
		paths: [
			"/.well-known/oauth-authorization-server",
			"/.well-known/openid-configuration",
		],
		body: "json",
	},
	{
		id: "oauth-protected-resource",
		title: "OAuth Protected Resource (RFC 9728)",
		group: "auth",
		paths: ["/.well-known/oauth-protected-resource"],
		body: "json",
	},
	{
		id: "auth-md",
		title: "auth.md",
		group: "auth",
		paths: ["/auth.md"],
		body: "text",
	},
	{
		id: "web-bot-auth",
		title: "Web Bot Auth key directory",
		group: "auth",
		paths: ["/.well-known/http-message-signatures-directory"],
		body: "json",
	},
	{
		id: "ucp",
		title: "Universal Commerce Protocol profile",
		group: "commerce",
		paths: ["/.well-known/ucp"],
		body: "json",
	},
	{
		id: "acp",
		title: "Agentic Commerce Protocol discovery",
		group: "commerce",
		paths: ["/.well-known/acp.json"],
		body: "json",
	},
];

/** All protocol lookups of an audit finish within this. */
export const PROTOCOLS_BUDGET_MS = 10_000;

export { protocolsLine } from "./protocols-line.ts";

export interface FoundProtocol {
	id: string;
	title: string;
	group: ProtocolGroup;
	/** Where it was found (same origin as the audited page). */
	url: string;
}

export interface ProtocolsResult {
	/** Ids of every protocol looked for, in `PROTOCOLS` order. */
	checked: string[];
	/** The ones the site publishes, in the same order. */
	found: FoundProtocol[];
}

function isJsonDocument(body: string): boolean {
	try {
		const value: unknown = JSON.parse(body);
		return typeof value === "object" && value !== null;
	} catch {
		return false;
	}
}

/** Looks up every protocol on the audited page's origin. Never throws. */
export async function findProtocols(
	ctx: AuditContext,
	budgetMs = PROTOCOLS_BUDGET_MS,
): Promise<ProtocolsResult> {
	const signal = AbortSignal.timeout(budgetMs);
	const { origin } = ctx.targetUrl;
	const links = pageLinks(ctx.$, ctx.page.headers, ctx.targetUrl);
	const publishes = async (url: string, body: Protocol["body"]) => {
		const res = await ctx.get(url, { signal });
		if (!isTextResource(res) || res.kind !== "response") return false;
		return body === "text" || isJsonDocument(res.body);
	};
	const lookups = PROTOCOLS.map(async (p): Promise<FoundProtocol | null> => {
		const linked = p.rel
			? links
					.filter((l) => l.rels.includes(p.rel as string))
					.map((l) => l.href)
					.filter((href) => href.origin === origin)
					.map((href) => href.href)
			: [];
		const urls = [...linked, ...p.paths.map((path) => `${origin}${path}`)];
		for (const url of [...new Set(urls)]) {
			try {
				if (await publishes(url, p.body)) {
					return { id: p.id, title: p.title, group: p.group, url };
				}
			} catch {
				// An odd response never fails the audit.
			}
		}
		return null;
	});
	const found = (await Promise.all(lookups)).filter(
		(p): p is FoundProtocol => p !== null,
	);
	return { checked: PROTOCOLS.map((p) => p.id), found };
}
