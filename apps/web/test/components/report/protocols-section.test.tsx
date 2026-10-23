import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProtocolsSection } from "@/components/report/protocols-section";

const checked = ["mcp-server-card", "oauth-discovery", "ucp"];

describe("ProtocolsSection", () => {
	it("lists only the protocols found, with the count under the title", () => {
		const html = renderToStaticMarkup(
			<ProtocolsSection
				heading="h2"
				protocols={{
					checked,
					found: [
						{
							id: "mcp-server-card",
							title: "MCP Server Card",
							group: "agents",
							url: "https://example.com/.well-known/mcp.json",
						},
					],
				}}
			/>,
		);
		expect(html).toContain("Agent protocols");
		expect(html).toContain("not scored");
		expect(html).toContain("Checked 3 protocols, 1 published.");
		expect(html).toContain("MCP Server Card");
		expect(html).toContain("https://example.com/.well-known/mcp.json");
		expect(html).not.toContain("OAuth");
		// The site's URLs are text, not links.
		expect(html).not.toContain("<a ");
	});

	it("is one row when nothing is published", () => {
		const html = renderToStaticMarkup(
			<ProtocolsSection heading="h4" protocols={{ checked, found: [] }} />,
		);
		expect(html).toContain("Checked 3 protocols, none published.");
		expect(html).not.toContain("<ul");
		expect(html).toContain("<h4");
	});
});
