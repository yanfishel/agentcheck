import { VERSION } from "@agentcheck/core/version";
import { LEGAL } from "../../content/legal";
import { SITE } from "../../content/site";

/** What the landing is, in schema.org terms: the site and the tool it offers. */
const graph = {
	"@context": "https://schema.org",
	"@graph": [
		{
			"@type": "WebSite",
			"@id": `${SITE.url}/#website`,
			name: SITE.name,
			url: `${SITE.url}/`,
			description: SITE.description,
		},
		{
			"@type": "SoftwareApplication",
			"@id": `${SITE.url}/#app`,
			name: SITE.name,
			url: `${SITE.url}/`,
			description:
				"Audits how ready a website is for AI agents, search assistants and browser automation: llms.txt, robots.txt for AI crawlers, structured data and accessible controls. A web service and a CLI.",
			applicationCategory: "DeveloperApplication",
			operatingSystem: "Web, Node.js 22",
			softwareVersion: VERSION,
			license: "https://opensource.org/licenses/MIT",
			offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
			author: { "@type": "Person", name: LEGAL.operator },
		},
	],
};

/** Our own constant data; `<` is escaped so the text can never close the tag. */
export function StructuredData() {
	return (
		<script
			type="application/ld+json"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: static JSON-LD built above, not user text.
			dangerouslySetInnerHTML={{
				__html: JSON.stringify(graph).replace(/</g, "\u003c"),
			}}
		/>
	);
}
