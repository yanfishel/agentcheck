import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Home, { metadata as homeMetadata } from "@/app/page";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { ToastProvider } from "@/components/ui";
import { siteMetadata as rootMetadata, SITE } from "@/content/site";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@clerk/nextjs", () => ({
	useClerk: () => ({ openSignIn: vi.fn() }),
	useAuth: () => ({ isSignedIn: false }),
}));

const publicFile = (name: string) =>
	readFileSync(
		fileURLToPath(new URL(`../../public/${name}`, import.meta.url)),
		"utf8",
	);

const landing = () =>
	renderToStaticMarkup(
		<ToastProvider>
			<Home />
		</ToastProvider>,
	);

describe("agentcheck.dev is AI-ready itself", () => {
	it("robots.txt lets every crawler in, keeps out the private areas and names the sitemap", () => {
		const r = robots();
		const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
		expect(rules).toContainEqual(
			expect.objectContaining({ userAgent: "*", allow: "/" }),
		);
		const disallow = rules.flatMap((rule) => rule.disallow ?? []);
		for (const path of ["/api/", "/admin", "/audits/", "/history"]) {
			expect(disallow).toContain(path);
		}
		expect(disallow).not.toContain("/");
		expect(r.sitemap).toBe(`${SITE.url}/sitemap.xml`);
	});

	it("the sitemap lists the public pages by absolute URL", () => {
		const urls = sitemap().map((entry) => entry.url);
		expect(urls).toEqual([
			`${SITE.url}/`,
			`${SITE.url}/privacy`,
			`${SITE.url}/terms`,
		]);
	});

	it("the site's base URL and OpenGraph URL are agentcheck.dev", () => {
		const layout = readFileSync(
			fileURLToPath(new URL("../../src/app/layout.tsx", import.meta.url)),
			"utf8",
		);
		expect(layout).toContain("siteMetadata");
		expect(SITE.url).toBe("https://agentcheck.dev");
		expect(String(rootMetadata.metadataBase)).toBe(`${SITE.url}/`);
		expect(rootMetadata.openGraph).toMatchObject({
			url: "/",
			type: "website",
		});
		expect(rootMetadata.twitter).toMatchObject({
			card: "summary_large_image",
		});
	});

	it("the landing advertises its markdown twin", () => {
		expect(homeMetadata.alternates?.types).toEqual({
			"text/markdown": "/index.md",
		});
	});

	it("the landing describes itself in JSON-LD", () => {
		const html = landing();
		const match = html.match(
			/<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
		);
		expect(match?.[1]).toBeTruthy();
		const data = JSON.parse(match?.[1] ?? "{}") as {
			"@graph": { "@type": string; url?: string }[];
		};
		const types = data["@graph"].map((node) => node["@type"]);
		expect(types).toEqual(
			expect.arrayContaining(["WebSite", "SoftwareApplication"]),
		);
		expect(
			data["@graph"].every(
				(node) => !node.url || node.url.startsWith(SITE.url),
			),
		).toBe(true);
	});

	it("llms.txt follows llmstxt.org: a title, a summary and link sections", () => {
		const text = publicFile("llms.txt");
		expect(text).toMatch(/^# AgentCheck\n/);
		expect(text).toMatch(/\n> .+\n/);
		expect(text).toMatch(/\n## .+\n/);
		expect(text).toContain(`](${SITE.url}/index.md)`);
		expect(text).toContain(`](${SITE.url}/llms-full.txt)`);
	});

	it("the markdown twin and llms-full.txt carry every heading of the landing", () => {
		const html = landing();
		const headings = [...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/g)]
			.map((m) =>
				(m[1] ?? "")
					.replace(/<[^>]+>/g, "")
					.replace(/&#x27;|&#39;/g, "'")
					.replace(/&amp;/g, "&")
					.trim(),
			)
			.filter(Boolean);
		expect(headings.length).toBeGreaterThan(8);
		const twin = publicFile("index.md");
		const full = publicFile("llms-full.txt");
		for (const heading of headings) {
			expect(twin, `index.md lacks "${heading}"`).toContain(heading);
			expect(full, `llms-full.txt lacks "${heading}"`).toContain(heading);
		}
	});
});
