import { describe, expect, it } from "vitest";
import { createAuditContext } from "../src/context.ts";
import { createFetcher } from "../src/http.ts";
import { findProtocols, PROTOCOLS, protocolsLine } from "../src/protocols.ts";
import { renderHtml } from "../src/reporters/html.ts";
import { renderTerminal } from "../src/reporters/terminal.ts";
import type { AuditResult } from "../src/types.ts";
import { mockRoutes, type Route } from "./helpers/mock-site.ts";

const ORIGIN = "https://example.com";
const JSON_DOC = (body: unknown, type = "application/json"): Route => ({
	status: 200,
	contentType: type,
	body: JSON.stringify(body),
});

async function find(
	routes: Record<string, Route>,
	head = "",
	budgetMs?: number,
) {
	const agent = mockRoutes(ORIGIN, {
		"/": {
			status: 200,
			contentType: "text/html",
			body: `<html><head>${head}</head><body></body></html>`,
		},
		...routes,
	});
	const fetcher = createFetcher({ userAgent: "test", dispatcher: agent });
	const ctx = await createAuditContext(`${ORIGIN}/`, fetcher);
	return findProtocols(ctx, budgetMs);
}

describe("findProtocols", () => {
	it("checks every protocol and finds none on a plain site", async () => {
		const out = await find({});
		expect(out.checked).toEqual(PROTOCOLS.map((p) => p.id));
		expect(out.found).toEqual([]);
	});

	it("finds JSON documents at their well-known paths, in PROTOCOLS order", async () => {
		const out = await find({
			"/.well-known/mcp.json": JSON_DOC({ name: "x" }),
			"/.well-known/openid-configuration": JSON_DOC({ issuer: ORIGIN }),
			"/.well-known/api-catalog": JSON_DOC(
				{ linkset: [] },
				"application/linkset+json",
			),
			"/auth.md": { status: 200, contentType: "text/markdown", body: "# Auth" },
		});
		expect(out.found).toEqual([
			{
				id: "mcp-server-card",
				title: "MCP Server Card",
				group: "agents",
				url: `${ORIGIN}/.well-known/mcp.json`,
			},
			{
				id: "api-catalog",
				title: "API Catalog (RFC 9727)",
				group: "agents",
				url: `${ORIGIN}/.well-known/api-catalog`,
			},
			{
				id: "oauth-discovery",
				title: "OAuth / OpenID Connect discovery",
				group: "auth",
				url: `${ORIGIN}/.well-known/openid-configuration`,
			},
			{
				id: "auth-md",
				title: "auth.md",
				group: "auth",
				url: `${ORIGIN}/auth.md`,
			},
		]);
	});

	it("does not count HTML, broken JSON or a JSON scalar", async () => {
		const out = await find({
			"/.well-known/agent-card.json": {
				status: 200,
				contentType: "text/html",
				body: "<!doctype html><html></html>",
			},
			"/openapi.json": {
				status: 200,
				contentType: "application/json",
				body: "{",
			},
			"/.well-known/ucp": JSON_DOC("yes"),
		});
		expect(out.found).toEqual([]);
	});

	it("follows a same-origin rel=ai-catalog link, not another site's", async () => {
		const out = await find(
			{ "/catalog.json": JSON_DOC({ entries: [] }) },
			'<link rel="ai-catalog" href="/catalog.json"><link rel="ai-catalog" href="https://other.example/c.json">',
		);
		expect(out.found.map((p) => p.url)).toEqual([`${ORIGIN}/catalog.json`]);
	});

	it("stops at its budget without failing", async () => {
		const out = await find(
			{ "/.well-known/acp.json": { ...JSON_DOC({}), delayMs: 2000 } },
			"",
			200,
		);
		expect(out.found).toEqual([]);
		expect(out.checked).toHaveLength(PROTOCOLS.length);
	});
});

describe("protocols in the reporters", () => {
	const base: AuditResult = {
		tool: { name: "agentcheck", version: "1.0.0" },
		target: `${ORIGIN}/`,
		finalUrl: `${ORIGIN}/`,
		timestamp: "2026-10-23T00:00:00.000Z",
		categories: [],
		score: 0,
		grade: "F",
		browser: { used: false, reason: "off" },
	};
	const withFound: AuditResult = {
		...base,
		protocols: {
			checked: ["mcp-server-card", "auth-md"],
			found: [
				{
					id: "mcp-server-card",
					title: "MCP Server Card",
					group: "agents",
					url: `${ORIGIN}/.well-known/mcp.json?<x>`,
				},
			],
		},
	};

	it("protocolsLine counts what was published", () => {
		expect(protocolsLine(12, 0)).toBe("Checked 12 protocols, none published.");
		expect(protocolsLine(12, 2)).toBe("Checked 12 protocols, 2 published.");
	});

	it("the terminal lists found protocols and the closing line", () => {
		const text = renderTerminal(withFound, { color: false });
		expect(text).toContain("Agent protocols");
		expect(text).toContain("not scored");
		expect(text).toContain("✓ MCP Server Card");
		expect(text).toContain("Checked 2 protocols, 1 published.");
	});

	it("the HTML report escapes and does not link the URLs", () => {
		const html = renderHtml(withFound);
		expect(html).toContain("<h2>Agent protocols<span>not scored</span></h2>");
		expect(html).toContain("/.well-known/mcp.json?&lt;x&gt;");
		expect(html).not.toContain('href="https://example.com/.well-known');
	});

	it("results without protocols render no section", () => {
		expect(renderTerminal(base, { color: false })).not.toContain(
			"Agent protocols",
		);
		expect(renderHtml(base)).not.toContain("Agent protocols");
	});
});
