import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	collectRenderedData,
	RENDERED_HTML_MAX,
} from "../../src/browser/collect.ts";
import type { CdpLike, PageLike } from "../../src/browser/playwright-types.ts";
import { createBrowserRenderer } from "../../src/browser/render.ts";
import type { RenderedPage } from "../../src/browser/types.ts";
import {
	browserAvailable,
	type LocalServer,
	serveHtml,
} from "../helpers/local-server.ts";

const available = await browserAvailable();
if (!available)
	console.info("browser collector tests skipped: no Chromium-based browser");

const page = (body: string, head = "") =>
	`<html><head><title>t</title>${head}<style>body{margin:0}</style></head><body>${body}</body></html>`;

const many = Array.from(
	{ length: 5000 },
	(_, i) => `<div style="cursor:pointer;width:20px;height:20px">${i}</div>`,
).join("");

// A real browser per test can pass the 5 s default when the whole suite runs in
// parallel; which test timed out varied from run to run.
describe.skipIf(!available)(
	"collectRenderedData with a real browser",
	{ timeout: 20_000 },
	() => {
		let server: LocalServer;
		beforeAll(async () => {
			server = await serveHtml({
				"/names": {
					body: page(
						'<button>Save</button><button><svg width="10" height="10"></svg></button><a href="/x"><i class="icon" style="display:inline-block;width:10px;height:10px"></i></a>',
					),
				},
				"/traps": {
					body: page(
						'<div class="carousel">' +
							'<div style="cursor:pointer;width:20px;height:20px"><span>Dot</span></div>'.repeat(
								3,
							) +
							'</div><button style="cursor:pointer"><span style="cursor:pointer">x</span></button>',
					),
				},
				"/onclick": { body: page('<div onclick="f()">Go</div>') },
				"/onclick-role": {
					body: page('<div onclick="f()" role="button" tabindex="0">Go</div>'),
				},
				"/overlays": {
					body: page(
						'<div id="hdr" style="position:fixed;top:0;left:0;width:100%;height:72px;background:#ccc">h</div>' +
							'<div id="ban" style="position:fixed;bottom:0;left:0;width:100%;height:320px;background:#ddd">b</div>' +
							'<div id="mod" style="position:fixed;top:200px;left:440px;width:400px;height:300px;background:#eee">m</div>' +
							'<div id="wid" style="position:fixed;top:0;right:0;width:200px;height:200px;background:#aaa">w</div>' +
							'<div id="tiny" style="position:fixed;top:700px;left:0;width:20px;height:20px;background:#aaa">t</div>',
					),
				},
				"/recaptcha/api.js": { body: "", contentType: "text/javascript" },
				"/script-captcha": {
					body: page('<script src="/recaptcha/api.js"></script><p>form</p>'),
				},
				"/widget-captcha": {
					body: page(
						'<div class="g-recaptcha" style="position:fixed;inset:0;background:#fff">c</div>',
					),
				},
				"/visibility": {
					body: page(
						'<div style="cursor:pointer;display:none;width:20px;height:20px">a</div>' +
							'<div style="cursor:pointer;visibility:hidden;width:20px;height:20px">b</div>' +
							'<div style="cursor:pointer;opacity:0.03;width:20px;height:20px">c</div>' +
							'<div style="cursor:pointer;width:3px;height:3px"></div>' +
							'<div id="ok" style="cursor:pointer;width:20px;height:20px">d</div>',
					),
				},
				"/ancestors": {
					body: page(
						'<div role="button"><div style="cursor:pointer;width:20px;height:20px">a</div></div>' +
							'<div tabindex="0"><div style="cursor:pointer;width:20px;height:20px">b</div></div>' +
							'<div id="ok" style="cursor:pointer;width:20px;height:20px">c</div>',
					),
				},
				"/zindex": {
					body: page(
						'<div id="z1000" style="position:absolute;z-index:1000;top:0;left:0;width:300px;height:300px">a</div>' +
							'<div id="zauto" style="position:absolute;top:0;left:400px;width:300px;height:300px">b</div>' +
							'<div id="z999" style="position:absolute;z-index:999;top:0;left:800px;width:300px;height:300px">c</div>',
					),
				},
				"/clipped": {
					body: page(
						'<div id="clip" style="position:fixed;left:-100px;top:0;width:300px;height:800px">a</div>',
					),
				},
				"/pe-none": {
					body: page(
						'<div id="none" style="position:fixed;inset:0;pointer-events:none"></div>',
					),
				},
				"/sticky": {
					body: page(
						'<div id="head" style="position:sticky;top:0;height:100px;background:#ccc">h</div>' +
							'<div style="height:300px"></div>' +
							'<div id="mid" style="position:sticky;top:0;height:100px;background:#ddd">m</div>' +
							'<div style="height:3000px"></div>',
					),
				},
				"/shadow": {
					body: page(
						'<div id="host"></div><script>const r=document.getElementById("host").attachShadow({mode:"open"});r.innerHTML=\'<div id="cookie" style="position:fixed;bottom:0;left:0;width:100%;height:320px;background:#ddd">c</div><div id="modal" style="position:fixed;top:200px;left:440px;width:400px;height:300px;background:#eee">m</div><div id="sh" style="cursor:pointer;width:20px;height:20px">s</div>\';</script>',
					),
				},
				"/hcaptcha/api.js": { body: "", contentType: "text/javascript" },
				"/challenges.cloudflare.com/turnstile.js": {
					body: "",
					contentType: "text/javascript",
				},
				"/recaptcha/frame": { body: page("<p>frame</p>") },
				"/hcaptcha-script": {
					body: page('<script src="/hcaptcha/api.js"></script>'),
				},
				"/turnstile-class": {
					body: page(
						'<div class="cf-turnstile" style="width:300px;height:65px">t</div>',
					),
				},
				"/cf-script": {
					body: page('<script src="/challenges.cloudflare.com/x.js"></script>'),
				},
				"/challenges.cloudflare.com/x.js": {
					body: "",
					contentType: "text/javascript",
				},
				"/hcaptcha-class": {
					body: page(
						'<div class="h-captcha" style="width:300px;height:65px">h</div>',
					),
				},
				"/cf-script-old": {
					body: page(
						'<script src="/challenges.cloudflare.com/turnstile.js"></script>',
					),
				},
				"/multi-captcha": {
					body: page(
						'<script src="/challenges.cloudflare.com/turnstile.js"></script><script src="/hcaptcha/api.js"></script><script src="/recaptcha/api.js"></script><script src="/recaptcha/api.js"></script>',
					),
				},
				"/captcha-word": {
					body: page('<p class="captcha">Solve the captcha</p>'),
				},
				"/corner-iframe": {
					body: page(
						'<iframe src="/recaptcha/frame" style="position:fixed;bottom:0;right:0;width:200px;height:100px;border:0"></iframe>',
					),
				},
				"/overlay-negative-z": {
					body: page(
						'<div id="bg" style="position:fixed;inset:0;z-index:-1;background:#eee"></div><p>content</p>',
					),
				},
				"/overlay-shell": {
					body: page(
						'<div id="shell" style="position:fixed;inset:0;overflow:auto"><main><h1>Title</h1><p>content</p></main></div>',
					),
				},
				"/overlay-shell-h1": {
					body: page(
						'<div id="shell" style="position:fixed;inset:0;overflow:auto"><div><h1>Title</h1></div></div>',
					),
				},
				"/overlay-shell-article": {
					body: page(
						'<div id="shell" style="position:fixed;inset:0;overflow:auto"><article>text</article></div>',
					),
				},
				"/overlay-modal-with-main": {
					body: page(
						'<main><h1>Title</h1></main><div id="mod" style="position:fixed;top:200px;left:440px;width:400px;height:300px;background:#eee">m</div>',
					),
				},
				"/trap-main": {
					body: page(
						'<main role="main"><div style="cursor:pointer;width:20px;height:20px">a</div></main>',
					),
				},
				"/trap-tabindex-negative": {
					body: page(
						'<div tabindex="-1"><div style="cursor:pointer;width:20px;height:20px">a</div></div>',
					),
				},
				"/trap-role-button": {
					body: page(
						'<div role="button" tabindex="0"><div style="cursor:pointer;width:20px;height:20px">a</div></div>',
					),
				},
				"/recaptcha/v3.js": { body: "", contentType: "text/javascript" },
				"/v3-captcha": {
					body: page(
						'<script src="/recaptcha/v3.js?render=6LcABCDEF"></script><iframe src="/recaptcha/frame?size=invisible" style="position:fixed;bottom:0;right:0;width:256px;height:60px;border:0"></iframe>',
					),
				},
				"/explicit-captcha": {
					body: page(
						'<script src="/recaptcha/v3.js?render=explicit"></script>',
					),
				},
				"/many": { body: page(many) },
				"/scripted": {
					body: page(
						'<main id="m"></main><script>document.getElementById("m").textContent = "Added by a script";</script>',
					),
				},
			});
		});
		afterAll(async () => {
			await server.close();
		});

		async function collect(path: string): Promise<RenderedPage> {
			const result = await createBrowserRenderer().render(
				`${server.url}${path}`,
				{},
			);
			if (result.kind !== "rendered")
				throw new Error(`not rendered: ${result.reason}`);
			return result;
		}

		it("keeps the rendered DOM, with text a script added", async () => {
			const { html } = await collect("/scripted");
			expect(html).toContain("Added by a script");
		});

		it("lists interactive nodes with names and descriptions", async () => {
			const { interactive } = await collect("/names");
			expect(interactive).toHaveLength(3);
			expect(interactive.filter((n) => n.name === "")).toHaveLength(2);
			const unnamed = interactive.filter((n) => n.name === "");
			const starts = unnamed.map((n) => n.element.split(/[ #.>]/)[0]);
			expect(starts.sort()).toEqual(["<a", "<button"]);
			for (const n of interactive)
				expect(n.element.length).toBeLessThanOrEqual(100);
			expect(unnamed.find((n) => n.role === "link")?.element).toContain(
				'href="/x"',
			);
		});

		it("counts only outermost click traps", async () => {
			const { clickTraps } = await collect("/traps");
			expect(clickTraps).toHaveLength(3);
			expect(clickTraps[0]?.element).toMatch(/^<div/);
		});

		it("flags onclick without role or tabindex", async () => {
			expect((await collect("/onclick")).clickTraps).toHaveLength(1);
			expect((await collect("/onclick-role")).clickTraps).toHaveLength(0);
		});

		it("reports overlays with coverage and centre coverage", async () => {
			const { overlays } = await collect("/overlays");
			const by = (id: string) =>
				overlays.find((o) => o.element.startsWith(`<div#${id}`));
			expect(by("hdr")?.coverage).toBeCloseTo(0.09, 2);
			expect(by("hdr")?.coversCentre).toBe(false);
			expect(by("ban")?.coverage).toBeCloseTo(0.4, 2);
			expect(by("ban")?.coversCentre).toBe(false);
			expect(by("mod")?.coversCentre).toBe(true);
			expect(by("wid")?.coverage).toBeCloseTo(0.039, 2);
			expect(by("wid")?.coversCentre).toBe(false);
			expect(by("tiny")).toBeUndefined();
		});

		it("detects captcha markers and blocking", async () => {
			const script = (await collect("/script-captcha")).captcha;
			expect(script).toEqual({ markers: ["recaptcha"], blocking: false });
			const widget = (await collect("/widget-captcha")).captcha;
			expect(widget).toMatchObject({
				markers: ["recaptcha"],
				blocking: true,
				reason: "Captcha covers the page",
			});
		});

		it("excludes invisible and tiny pointer elements from click traps", async () => {
			expect((await collect("/visibility")).clickTraps).toHaveLength(1);
		});

		it("excludes descendants of role or tabindex ancestors", async () => {
			expect((await collect("/ancestors")).clickTraps).toHaveLength(1);
		});

		it("includes absolute z-index >= 1000 only", async () => {
			const { overlays } = await collect("/zindex");
			expect(overlays.map((o) => o.element.split(/[ >]/)[0])).toEqual([
				"<div#z1000",
			]);
		});

		it("clips coverage to the visible viewport part", async () => {
			const { overlays } = await collect("/clipped");
			expect(overlays).toHaveLength(1);
			expect(overlays[0]?.coverage).toBeCloseTo(200 / 1280, 2);
		});

		it("ignores pointer-events none overlays", async () => {
			expect((await collect("/pe-none")).overlays).toEqual([]);
		});

		it("reports sticky elements only while stuck", async () => {
			const { overlays } = await collect("/sticky");
			expect(overlays).toHaveLength(1);
			expect(overlays[0]?.element).toMatch(/^<div#head/);
		});

		it("looks inside open shadow roots", async () => {
			const { overlays, clickTraps } = await collect("/shadow");
			const cookie = overlays.find((o) => o.element.startsWith("<div#cookie"));
			expect(cookie?.coverage).toBeCloseTo(0.4, 2);
			expect(
				overlays.find((o) => o.element.startsWith("<div#modal"))?.coversCentre,
			).toBe(true);
			expect(clickTraps.some((t) => t.element.startsWith("<div#sh"))).toBe(
				true,
			);
		});

		it("maps hcaptcha, turnstile and cloudflare markers", async () => {
			expect((await collect("/hcaptcha-script")).captcha.markers).toEqual([
				"hcaptcha",
			]);
			expect((await collect("/turnstile-class")).captcha.markers).toEqual([
				"turnstile",
			]);
			expect((await collect("/cf-script")).captcha.markers).toEqual([
				"turnstile",
			]);
			expect((await collect("/hcaptcha-class")).captcha.markers).toEqual([
				"hcaptcha",
			]);
		});

		it("dedupes markers in a fixed order", async () => {
			expect((await collect("/multi-captcha")).captcha.markers).toEqual([
				"recaptcha",
				"hcaptcha",
				"turnstile",
			]);
		});

		it("ignores the bare word captcha", async () => {
			expect((await collect("/captcha-word")).captcha).toEqual({
				markers: [],
				blocking: false,
			});
		});

		it("does not treat a corner captcha iframe as blocking", async () => {
			expect((await collect("/corner-iframe")).captcha).toEqual({
				markers: ["recaptcha"],
				blocking: false,
			});
		});

		it("ignores negative z-index backgrounds and layout shells as overlays", async () => {
			expect((await collect("/overlay-negative-z")).overlays).toEqual([]);
			expect((await collect("/overlay-shell")).overlays).toEqual([]);
			expect((await collect("/overlay-shell-h1")).overlays).toEqual([]);
			expect((await collect("/overlay-shell-article")).overlays).toEqual([]);
		});

		it("still reports a centred fixed modal next to the page content", async () => {
			const { overlays } = await collect("/overlay-modal-with-main");
			expect(overlays).toHaveLength(1);
			expect(overlays[0]?.element).toMatch(/^<div#mod/);
			expect(overlays[0]?.coversCentre).toBe(true);
		});

		it("does not let landmark roles or tabindex -1 hide click traps", async () => {
			expect((await collect("/trap-main")).clickTraps).toHaveLength(1);
			expect(
				(await collect("/trap-tabindex-negative")).clickTraps,
			).toHaveLength(1);
			expect((await collect("/trap-role-button")).clickTraps).toHaveLength(0);
		});

		it("treats reCAPTCHA v3 as invisible but render=explicit as a widget", async () => {
			expect((await collect("/v3-captcha")).captcha).toEqual({
				markers: [],
				blocking: false,
			});
			expect((await collect("/explicit-captcha")).captcha.markers).toEqual([
				"recaptcha",
			]);
		});

		it("collects a 5000-element page within 5 s", async () => {
			const started = Date.now();
			const { clickTraps } = await collect("/many");
			const elapsed = Date.now() - started;
			console.info(`5000-element collect (full render): ${elapsed} ms`);
			expect(clickTraps).toHaveLength(5000);
			expect(elapsed).toBeLessThan(5000);
		});
	},
);

describe("collectRenderedData robustness (fakes)", () => {
	const measured = {
		clickTraps: [{ element: "<div>" }],
		overlays: [],
		captcha: { markers: [], blocking: false },
	};
	const axCdp: CdpLike = {
		send: async () => ({
			nodes: [{ role: { value: "link" }, name: { value: "Home" } }],
		}),
	};
	const failingCdp: CdpLike = {
		send: async () => {
			throw new Error("cdp boom");
		},
	};
	const fakePage = (evaluate: () => Promise<unknown>) =>
		({ evaluate }) as unknown as PageLike;

	it("keeps DOM data when the accessibility tree fails", async () => {
		const result = await collectRenderedData(
			fakePage(async () => measured),
			failingCdp,
		);
		expect(result.interactive).toEqual([]);
		expect(result.clickTraps).toHaveLength(1);
		expect(result.failures).toEqual({ accessibility: "cdp boom" });
	});

	it("keeps accessibility data when measurement fails", async () => {
		const result = await collectRenderedData(
			fakePage(async () => {
				throw new Error("page boom");
			}),
			axCdp,
		);
		expect(result.interactive).toHaveLength(1);
		expect(result.clickTraps).toEqual([]);
		expect(result.overlays).toEqual([]);
		expect(result.captcha).toEqual({ markers: [], blocking: false });
		expect(result.failures).toEqual({ dom: "page boom" });
	});

	it("rejects when both halves fail", async () => {
		await expect(
			collectRenderedData(
				fakePage(async () => {
					throw new Error("page boom");
				}),
				failingCdp,
			),
		).rejects.toThrow("cdp boom");
	});

	it("reports no failures on success", async () => {
		const result = await collectRenderedData(
			fakePage(async () => measured),
			axCdp,
		);
		expect(result.failures).toBeUndefined();
	});

	it("records a DOM failure when the retry also fails", async () => {
		const result = await collectRenderedData(
			fakePage(async () => {
				throw new Error("Execution context was destroyed\nmore");
			}),
			axCdp,
		);
		expect(result.failures).toEqual({
			dom: "Execution context was destroyed",
		});
	});

	it("retries evaluate once after a destroyed execution context", async () => {
		let calls = 0;
		const result = await collectRenderedData(
			fakePage(async () => {
				calls++;
				if (calls === 1) throw new Error("Execution context was destroyed");
				return measured;
			}),
			axCdp,
		);
		expect(calls).toBe(2);
		expect(result.clickTraps).toHaveLength(1);
	});

	it("keeps the page's content, cut at RENDERED_HTML_MAX", async () => {
		const page = {
			evaluate: async () => measured,
			content: async () => "x".repeat(RENDERED_HTML_MAX + 10),
		} as unknown as PageLike;
		const result = await collectRenderedData(page, axCdp);
		expect(result.html).toHaveLength(RENDERED_HTML_MAX);
	});

	it("leaves html out when the content cannot be read", async () => {
		const page = {
			evaluate: async () => measured,
			content: async () => {
				throw new Error("gone");
			},
		} as unknown as PageLike;
		const result = await collectRenderedData(page, axCdp);
		expect(result).not.toHaveProperty("html");
		expect(result.failures).toBeUndefined();
	});
});
