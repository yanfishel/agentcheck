import { describe, expect, it } from "vitest";
import { llmsTxtFormat } from "../../src/checks/llms-txt-format.ts";
import { mockRoutes, type Route } from "../helpers/mock-site.ts";
import { runCheck } from "../helpers/run-check.ts";

const run = (body?: string, contentType = "text/plain") => {
	const llms: Route | undefined =
		body === undefined ? undefined : { status: 200, contentType, body };
	return runCheck(
		llmsTxtFormat,
		mockRoutes("https://example.com", {
			"/": { status: 200, contentType: "text/html", body: "<html></html>" },
			...(llms ? { "/llms.txt": llms } : {}),
		}),
		"https://example.com/",
	);
};

const GOOD = [
	"# Lumen Notes",
	"",
	"> A notebook for small teams.",
	"",
	"## News",
	"- [Launch](https://example.com/launch): we launched",
].join("\n");

describe("llms-txt-format", () => {
	it("has the expected metadata", () => {
		expect(llmsTxtFormat.id).toBe("llms-txt-format");
		expect(llmsTxtFormat.weight).toBe(20);
		expect(llmsTxtFormat.category).toBe("ai-manifests");
	});

	it("passes for a complete file", async () => {
		expect((await run(GOOD)).status).toBe("pass");
	});

	it("accepts CRLF line endings and a BOM", async () => {
		const out = await run(`﻿${GOOD.replace(/\n/g, "\r\n")}`);
		expect(out.status).toBe("pass");
	});

	it("warns when the summary blockquote is missing", async () => {
		const out = await run(
			GOOD.replace("> A notebook for small teams.\n\n", ""),
		);
		expect(out.status).toBe("warn");
		expect(out.remediation).toBeTruthy();
	});

	it("fails for a resume-style file without links", async () => {
		const out = await run("# Jane Doe\n\n## Skills\n- TypeScript\n- Go\n");
		expect(out.status).toBe("fail");
		expect(out.details).toEqual(['no "## " section with a markdown link list']);
	});

	it("does not count a bullet with a label before the link", async () => {
		const out = await run(
			"# Jane\n\n## Contact\n- **Website:** [x](https://example.com)\n",
		);
		expect(out.status).toBe("fail");
	});

	it("fails without an H1 on the first line", async () => {
		const out = await run(
			"Intro\n# Title\n\n## News\n- [a](https://example.com)\n",
		);
		expect(out.status).toBe("fail");
		expect(out.details).toEqual(["no H1 title on the first line"]);
	});

	it("fails when a link list sits outside any section", async () => {
		const out = await run("# T\n- [a](https://example.com)\n");
		expect(out.status).toBe("fail");
	});

	it("fails when llms.txt is missing", async () => {
		const out = await run();
		expect(out.status).toBe("fail");
		expect(out.message).toBe(
			"llms.txt not found (HTTP 404); nothing to validate",
		);
	});

	it("treats an HTML response as missing", async () => {
		const out = await run("<html></html>", "text/html");
		expect(out.message).toBe(
			"llms.txt is served as HTML, not plain text; nothing to validate",
		);
	});
});
