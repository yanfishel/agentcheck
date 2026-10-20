import { describe, expect, it } from "vitest";
import { contentDensity } from "../../src/checks/content-density.ts";
import { createAuditContext } from "../../src/context.ts";
import { createFetcher } from "../../src/http.ts";
import { mockRoutes } from "../helpers/mock-site.ts";
import { runCheck } from "../helpers/run-check.ts";

const run = (html: string) =>
	runCheck(
		contentDensity,
		mockRoutes("https://example.com", {
			"/": { status: 200, contentType: "text/html", body: html },
		}),
		"https://example.com/",
	);

const words = (n: number, w = "word") => Array(n).fill(w).join(" ");

describe("content-density", () => {
	it("has the expected metadata", () => {
		expect(contentDensity.id).toBe("content-density");
		expect(contentDensity.weight).toBe(30);
		expect(contentDensity.category).toBe("content-semantics");
	});

	it("passes with 200 main words and little navigation", async () => {
		const out = await run(
			`<body><nav>${words(40, "menu")}</nav><main>${words(200)}</main></body>`,
		);
		expect(out.status).toBe("pass");
		expect(out.message).toContain("200 words");
	});

	it("warns when main content is short", async () => {
		const out = await run(`<body><main>${words(100)}</main></body>`);
		expect(out.status).toBe("warn");
		expect(out.remediation).toBeTruthy();
	});

	it("warns when boilerplate dominates the page text", async () => {
		const out = await run(
			`<body><main>${words(200)}</main><footer>${words(200, "foot")}</footer><aside>${words(200, "side")}</aside></body>`,
		);
		expect(out.status).toBe("warn");
		expect(out.remediation).toContain("<main>");
	});

	it("fails on an empty client-rendered shell", async () => {
		const out = await run('<body><div id="root"></div></body>');
		expect(out.status).toBe("fail");
		expect(out.message).toContain("JavaScript");
		expect(out.remediation).toBeTruthy();
	});

	it("falls back to article, then body", async () => {
		const art = await run(
			`<body><article>${words(200)}</article><div>${words(10, "x")}</div></body>`,
		);
		expect(art.status).toBe("pass");
		const body = await run(`<body><div>${words(200)}</div></body>`);
		expect(body.status).toBe("pass");
	});

	it("uses every article when there is no main", async () => {
		const out = await run(
			`<body>${[1, 2, 3].map((i) => `<article>${words(60, `a${i}`)}</article>`).join("")}</body>`,
		);
		expect(out.status).toBe("pass");
		expect(out.message).toContain("180 words");
	});

	it("uses every main element and ignores nested duplicates", async () => {
		const out = await run(
			`<body><main>${words(100)}<article>${words(10, "n")}</article></main><main>${words(100, "m")}</main></body>`,
		);
		expect(out.message).toContain("210 words");
	});

	it("does not count scripts and styles", async () => {
		const out = await run(
			`<body><script>${words(500)}</script><style>${words(500)}</style><p>hi</p></body>`,
		);
		expect(out.status).toBe("fail");
	});

	it("counts Cyrillic and Hebrew words and ignores bare punctuation", async () => {
		const out = await run(
			`<body><main><p>${words(100, "привет")}</p><p>${words(100, "שלום")}</p><p>- | —</p></main></body>`,
		);
		expect(out.status).toBe("pass");
		expect(out.message).toContain("200 words");
	});

	it("does not merge words of adjacent elements", async () => {
		const out = await run(
			`<body><main>${"<p>a</p><p>b</p>".repeat(100)}</main></body>`,
		);
		expect(out.message).toContain("200 words");
	});

	it("does not mutate the shared DOM", async () => {
		const html = `<body><header>h</header><nav>n</nav><main>${words(200)}</main><footer>f</footer><script>x</script></body>`;
		const fetcher = createFetcher({
			userAgent: "agentcheck-test",
			dispatcher: mockRoutes("https://example.com", {
				"/": { status: 200, contentType: "text/html", body: html },
			}),
		});
		const ctx = await createAuditContext("https://example.com/", fetcher);
		await contentDensity.run(ctx);
		for (const sel of ["nav", "header", "footer", "script"]) {
			expect(ctx.$(sel).length, sel).toBe(1);
		}
	});

	it("excludes a nav nested inside main", async () => {
		const out = await run(
			`<body><main><nav>${words(40, "menu")}</nav>${words(200)}</main></body>`,
		);
		expect(out.message).toContain("200 words");
	});

	it("applies the word thresholds at their boundaries", async () => {
		const status = async (n: number) =>
			(await run(`<body><main>${words(n)}</main></body>`)).status;
		expect(await status(49)).toBe("fail");
		expect(await status(50)).toBe("warn");
		expect(await status(149)).toBe("warn");
		expect(await status(150)).toBe("pass");
	});

	it("applies the ratio threshold at its boundary", async () => {
		const status = async (extra: number) =>
			(
				await run(
					`<body><main>${words(200)}</main><footer>${words(extra, "f")}</footer></body>`,
				)
			).status;
		expect(await status(200)).toBe("pass");
		expect(await status(201)).toBe("warn");
	});
});
