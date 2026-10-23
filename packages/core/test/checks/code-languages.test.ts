import { describe, expect, it } from "vitest";
import { codeLanguages } from "../../src/checks/code-languages.ts";
import { mockRoutes } from "../helpers/mock-site.ts";
import { runCheck } from "../helpers/run-check.ts";

const ORIGIN = "https://example.com";

const run = (body: string) =>
	runCheck(
		codeLanguages,
		mockRoutes(ORIGIN, {
			"/": {
				status: 200,
				contentType: "text/html",
				body: `<html><body>${body}</body></html>`,
			},
		}),
		`${ORIGIN}/`,
	);

describe("code-languages", () => {
	it("has the expected metadata", () => {
		expect(codeLanguages.id).toBe("code-languages");
		expect(codeLanguages.weight).toBe(10);
		expect(codeLanguages.category).toBe("content-semantics");
	});

	it("skips a page without code blocks", async () => {
		const out = await run("<p>No code, <code>inline</code> only.</p>");
		expect(out.status).toBe("skip");
	});

	it("passes when every block names its language, wherever the marker sits", async () => {
		const out = await run(
			[
				'<pre><code class="language-bash">npm i</code></pre>',
				'<pre class="lang-js">x</pre>',
				'<pre data-language="ts">y</pre>',
				'<div class="highlight highlight-source-python"><pre>z</pre></div>',
				'<div class="language-json theme"><div class="wrap"><pre><code>{}</code></pre></div></div>',
			].join(""),
		);
		expect(out.status).toBe("pass");
		expect(out.message).toBe("5 of 5 code blocks name their language");
	});

	it("warns when some blocks name no language", async () => {
		const out = await run(
			'<pre><code class="language-bash">a</code></pre><pre><code class="hljs">b</code></pre>',
		);
		expect(out.status).toBe("warn");
		expect(out.message).toBe("1 of 2 code blocks name their language");
	});

	it("fails when no block names its language", async () => {
		const out = await run("<pre>a</pre>");
		expect(out.status).toBe("fail");
		expect(out.message).toBe("0 of 1 code block name their language");
	});
});
