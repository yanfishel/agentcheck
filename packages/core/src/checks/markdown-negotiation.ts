import { type HttpResult, isTextResource } from "../http.ts";
import type { AuditContext, Check } from "../types.ts";

const MARKDOWN_TYPES = new Set(["text/markdown", "text/x-markdown"]);

export type Negotiated =
	| { ok: true; url: string; body: string }
	| { ok: false; problem: string };

function judge(res: HttpResult): Negotiated {
	if (res.kind === "error") {
		return { ok: false, problem: `could not be fetched (${res.error})` };
	}
	if (res.status !== 200) return { ok: false, problem: `HTTP ${res.status}` };
	const type = res.contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
	if (!MARKDOWN_TYPES.has(type)) {
		return { ok: false, problem: `answered with ${type || "no content type"}` };
	}
	if (!isTextResource(res)) {
		return {
			ok: false,
			problem: "answered text/markdown with HTML or nothing",
		};
	}
	return { ok: true, url: res.url, body: res.body };
}

// One request per audit, shared by markdown-twin and markdown-negotiation.
const asked = new WeakMap<AuditContext, Promise<Negotiated>>();

/** GET of the target page with `Accept: text/markdown`. */
export function negotiatedMarkdown(ctx: AuditContext): Promise<Negotiated> {
	let pending = asked.get(ctx);
	if (!pending) {
		pending = ctx
			.get(ctx.targetUrl.href, { accept: "text/markdown" })
			.then(judge);
		asked.set(ctx, pending);
	}
	return pending;
}

export const markdownNegotiation: Check = {
	id: "markdown-negotiation",
	category: "ai-manifests",
	title: "Markdown on Accept: text/markdown",
	weight: 10,
	async run(ctx) {
		const out = await negotiatedMarkdown(ctx);
		if (out.ok) {
			return {
				status: "pass",
				message: "The page answers Accept: text/markdown with markdown",
			};
		}
		return {
			status: "fail",
			message: `The page does not answer Accept: text/markdown with markdown (${out.problem})`,
			remediation:
				"Answer requests with Accept: text/markdown with the page's markdown (Content-Type: text/markdown, Vary: Accept): Cloudflare's Markdown for Agents, or a server rewrite to the .md version.",
		};
	},
};
