import { describe, expect, it } from "vitest";
import { captchaBlocking } from "../../src/checks/captcha-blocking.ts";
import { fakeRenderer, renderedPage } from "../helpers/fake-renderer.ts";
import { mockRoutes } from "../helpers/mock-site.ts";
import { runCheck } from "../helpers/run-check.ts";

const routes = () =>
	mockRoutes("https://example.com", {
		"/": { status: 200, contentType: "text/html", body: "<body></body>" },
	});

const run = (captcha: {
	markers: string[];
	blocking: boolean;
	reason?: string;
}) =>
	runCheck(
		captchaBlocking,
		routes(),
		"https://example.com/",
		fakeRenderer(renderedPage({ captcha })),
	);

const REMEDIATION =
	"Do not challenge ordinary page views with a captcha; protect forms or rate-limit instead.";

const WARN_REMEDIATION =
	"Make sure agents can submit forms without solving a captcha, or offer an alternative contact path.";

describe("captcha-blocking", () => {
	it("has the expected metadata", () => {
		expect(captchaBlocking.id).toBe("captcha-blocking");
		expect(captchaBlocking.weight).toBe(15);
		expect(captchaBlocking.category).toBe("agentic-actionability");
	});

	it("passes with no markers", async () => {
		const out = await run({ markers: [], blocking: false });
		expect(out.status).toBe("pass");
		expect(out.message).toBe("No captcha found");
	});

	it("warns when a captcha is present but not blocking", async () => {
		const out = await run({ markers: ["recaptcha"], blocking: false });
		expect(out.status).toBe("warn");
		expect(out.message).toBe(
			"Captcha present but not blocking the page (recaptcha)",
		);
		expect(out.remediation).toBe(WARN_REMEDIATION);
	});

	it("fails with the reason when blocking", async () => {
		const out = await run({
			markers: ["cloudflare"],
			blocking: true,
			reason: "Cloudflare challenge page",
		});
		expect(out.status).toBe("fail");
		expect(out.message).toBe(
			"Captcha blocks the page: Cloudflare challenge page",
		);
		expect(out.remediation).toBe(REMEDIATION);
	});

	it("fails without a reason", async () => {
		const out = await run({ markers: [], blocking: true });
		expect(out.status).toBe("fail");
		expect(out.message).toBe("Captcha blocks the page");
	});

	it("skips when the browser is unavailable", async () => {
		const out = await runCheck(
			captchaBlocking,
			routes(),
			"https://example.com/",
			fakeRenderer({ kind: "unavailable", reason: "no browser" }),
		);
		expect(out).toEqual({ status: "skip", message: "no browser" });
	});
});

describe("captcha-blocking failed collection", () => {
	const skipRun = (failures: { accessibility?: string; dom?: string }) =>
		runCheck(
			captchaBlocking,
			mockRoutes("https://example.com", {
				"/": { status: 200, contentType: "text/html", body: "<body></body>" },
			}),
			"https://example.com/",
			fakeRenderer(renderedPage({ failures })),
		);

	it("skips when the DOM measurement failed", async () => {
		const out = await skipRun({ dom: "dom boom" });
		expect(out.status).toBe("skip");
		expect(out.message).toBe("Page measurements unavailable: dom boom");
	});

	it("ignores an accessibility-only failure", async () => {
		expect((await skipRun({ accessibility: "ax boom" })).status).toBe("pass");
	});
});
