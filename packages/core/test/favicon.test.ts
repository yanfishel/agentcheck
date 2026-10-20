import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import {
	detectImageType,
	FAVICON_MAX_BYTES,
	faviconCandidates,
	fetchFavicon,
} from "../src/favicon.ts";
import { createFetcher } from "../src/http.ts";
import { mockRoutes } from "./helpers/mock-site.ts";

const ORIGIN = "https://example.test";
const PAGE = new URL(`${ORIGIN}/docs/page`);
const UA = "AgentCheck/test";

const PNG = new Uint8Array([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
]);
const ICO = new Uint8Array([0, 0, 1, 0, 1, 0, 16, 16]);
const text = (s: string) => new TextEncoder().encode(s);
const page = (head: string) => load(`<html><head>${head}</head></html>`);

function candidates(head: string) {
	return faviconCandidates(page(head), PAGE);
}

describe("detectImageType", () => {
	it("recognises each format by magic bytes", () => {
		expect(detectImageType(PNG)).toBe("image/png");
		expect(detectImageType(ICO)).toBe("image/x-icon");
		expect(detectImageType(text("GIF89a...."))).toBe("image/gif");
		expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(
			"image/jpeg",
		);
		expect(
			detectImageType(
				new Uint8Array([
					0x52, 0x49, 0x46, 0x46, 9, 9, 9, 9, 0x57, 0x45, 0x42, 0x50,
				]),
			),
		).toBe("image/webp");
		expect(detectImageType(text('<svg xmlns="x"></svg>'))).toBe(
			"image/svg+xml",
		);
	});

	it("rejects HTML, empty and truncated input", () => {
		expect(detectImageType(text("<!doctype html><html></html>"))).toBeNull();
		expect(detectImageType(new Uint8Array(0))).toBeNull();
		expect(detectImageType(PNG.subarray(0, 5))).toBeNull();
	});

	it("accepts an SVG after BOM, XML declaration, comment and doctype", () => {
		const svg =
			'﻿  <?xml version="1.0"?>\n<!-- c -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x.dtd">\n<SVG></SVG>';
		expect(detectImageType(text(svg))).toBe("image/svg+xml");
	});
});

describe("detectImageType performance", () => {
	it("classifies a comment flood in linear time", () => {
		for (const tail of ["x", "<svg>"]) {
			const start = performance.now();
			const type = detectImageType(
				text("<!---->".repeat(tail === "x" ? 1000 : 250) + tail),
			);
			expect(performance.now() - start).toBeLessThan(50);
			expect(type).toBe(tail === "x" ? null : "image/svg+xml");
		}
	});
});

describe("faviconCandidates", () => {
	it("prefers the smallest icon of at least 32 px", () => {
		const list = candidates(
			`<link rel="icon" href="/16.png" sizes="16x16">
			 <link rel="icon" href="/192.png" sizes="192x192">
			 <link rel="icon" href="/32.png" sizes="32x32">`,
		);
		expect(list).toEqual([`${ORIGIN}/32.png`, `${ORIGIN}/favicon.ico`]);
	});

	it("falls back to an any-sized SVG when no icon is 32 px or more", () => {
		const list = candidates(
			`<link rel="icon" href="/16.png" sizes="16x16">
			 <link rel="icon" href="/logo.svg" type="image/svg+xml" sizes="any">`,
		);
		expect(list[0]).toBe(`${ORIGIN}/logo.svg`);
	});

	it("understands shortcut icon", () => {
		expect(candidates('<link rel="Shortcut ICON" href="/a.png">')[0]).toBe(
			`${ORIGIN}/a.png`,
		);
	});

	it("uses apple-touch-icon when there is no icon link", () => {
		expect(candidates('<link rel="apple-touch-icon" href="/t.png">')).toEqual([
			`${ORIGIN}/t.png`,
			`${ORIGIN}/favicon.ico`,
		]);
	});

	it("honours <base href>", () => {
		const list = candidates(
			'<base href="https://cdn.test/assets/"><link rel="icon" href="i.png">',
		);
		expect(list[0]).toBe("https://cdn.test/assets/i.png");
	});

	it("ends with /favicon.ico and does not duplicate it", () => {
		expect(candidates("")).toEqual([`${ORIGIN}/favicon.ico`]);
		expect(candidates('<link rel="icon" href="/favicon.ico">')).toEqual([
			`${ORIGIN}/favicon.ico`,
		]);
	});
});

describe("fetchFavicon", () => {
	it("returns the linked icon", async () => {
		const dispatcher = mockRoutes(ORIGIN, {
			"/icon.png": { status: 200, contentType: "image/png", body: PNG },
		});
		const fetcher = createFetcher({ userAgent: UA, dispatcher });
		const icon = await fetchFavicon(
			fetcher,
			page('<link rel="icon" href="/icon.png">'),
			PAGE,
		);
		expect(icon).toEqual({ contentType: "image/png", body: PNG });
	});

	it("falls back to /favicon.ico when the link 404s", async () => {
		const dispatcher = mockRoutes(ORIGIN, {
			"/favicon.ico": { status: 200, contentType: "image/x-icon", body: ICO },
		});
		const fetcher = createFetcher({ userAgent: UA, dispatcher });
		const icon = await fetchFavicon(
			fetcher,
			page('<link rel="icon" href="/missing.png">'),
			PAGE,
		);
		expect(icon?.contentType).toBe("image/x-icon");
	});

	it("no icon for a soft-404 HTML favicon.ico", async () => {
		const dispatcher = mockRoutes(ORIGIN, {
			"/favicon.ico": {
				status: 200,
				contentType: "image/x-icon",
				body: "<!doctype html><html>nope</html>",
			},
		});
		const fetcher = createFetcher({ userAgent: UA, dispatcher });
		expect(await fetchFavicon(fetcher, page(""), PAGE)).toBeNull();
	});

	it("rejects a body over the size limit", async () => {
		const big = new Uint8Array(FAVICON_MAX_BYTES + 10);
		big.set(PNG);
		const dispatcher = mockRoutes(ORIGIN, {
			"/favicon.ico": { status: 200, contentType: "image/png", body: big },
		});
		const fetcher = createFetcher({ userAgent: UA, dispatcher });
		expect(await fetchFavicon(fetcher, page(""), PAGE)).toBeNull();
	});

	it("decodes a data: URI without any request", async () => {
		// A MockAgent with no intercepts and net connect disabled fails any request.
		const dispatcher = mockRoutes(ORIGIN, {});
		const fetcher = createFetcher({ userAgent: UA, dispatcher });
		let requests = 0;
		const spy = {
			...fetcher,
			get: (u: string | URL) => {
				requests++;
				return fetcher.get(u);
			},
			getBytes: (u: string | URL, o: { maxBytes: number }) => {
				requests++;
				return fetcher.getBytes(u, o);
			},
		};
		const b64 = Buffer.from(PNG).toString("base64");
		const icon = await fetchFavicon(
			spy,
			page(`<link rel="icon" href="data:image/png;base64,${b64}">`),
			PAGE,
		);
		expect(icon).toEqual({ contentType: "image/png", body: PNG });
		expect(requests).toBe(0);
	});

	it("decodes a percent-encoded binary data: URI", async () => {
		const fetcher = createFetcher({
			userAgent: UA,
			dispatcher: mockRoutes(ORIGIN, {}),
		});
		const encoded = [...PNG]
			.map((b) => `%${b.toString(16).padStart(2, "0")}`)
			.join("");
		const icon = await fetchFavicon(
			fetcher,
			page(`<link rel="icon" href="data:image/png,${encoded}">`),
			PAGE,
		);
		expect(icon).toEqual({ contentType: "image/png", body: PNG });
	});

	it("decodes a percent-encoded SVG data: URI", async () => {
		const fetcher = createFetcher({
			userAgent: UA,
			dispatcher: mockRoutes(ORIGIN, {}),
		});
		const icon = await fetchFavicon(
			fetcher,
			page(
				'<link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns%3D%22x%22%2F%3E">',
			),
			PAGE,
		);
		expect(icon?.contentType).toBe("image/svg+xml");
	});

	it("a private-address icon link is refused and favicon.ico is still tried", async () => {
		let privateHit = false;
		const dispatcher = mockRoutes(ORIGIN, {
			"/favicon.ico": { status: 200, contentType: "image/x-icon", body: ICO },
		});
		mockRoutes(
			"http://10.0.0.1",
			{
				"/icon.png": {
					status: 200,
					contentType: "image/png",
					body: PNG,
					onRequest: () => {
						privateHit = true;
					},
				},
			},
			dispatcher,
		);
		const fetcher = createFetcher({
			userAgent: UA,
			dispatcher,
			network: { blockPrivate: true, trustDispatcher: true },
		});
		const icon = await fetchFavicon(
			fetcher,
			page('<link rel="icon" href="http://10.0.0.1/icon.png">'),
			PAGE,
		);
		expect(privateHit).toBe(false);
		expect(icon?.contentType).toBe("image/x-icon");
	});

	it("a public icon link redirecting to a private address is never followed", async () => {
		let privateHit = false;
		const dispatcher = mockRoutes(ORIGIN, {
			"/go": { status: 302, headers: { location: "http://127.0.0.1/x.png" } },
			"/favicon.ico": { status: 200, contentType: "image/x-icon", body: ICO },
		});
		mockRoutes(
			"http://127.0.0.1",
			{
				"/x.png": {
					status: 200,
					contentType: "image/png",
					body: PNG,
					onRequest: () => {
						privateHit = true;
					},
				},
			},
			dispatcher,
		);
		const fetcher = createFetcher({
			userAgent: UA,
			dispatcher,
			network: { blockPrivate: true, trustDispatcher: true },
		});
		const icon = await fetchFavicon(
			fetcher,
			page('<link rel="icon" href="/go">'),
			PAGE,
		);
		expect(privateHit).toBe(false);
		expect(icon?.contentType).toBe("image/x-icon");
	});

	it("returns null and never throws when everything fails", async () => {
		const fetcher = createFetcher({
			userAgent: UA,
			dispatcher: mockRoutes(ORIGIN, {}),
		});
		expect(
			await fetchFavicon(
				fetcher,
				page('<link rel="icon" href="/x.png">'),
				PAGE,
			),
		).toBeNull();
		const broken = {
			...fetcher,
			getBytes: () => {
				throw new Error("boom");
			},
		};
		expect(await fetchFavicon(broken, page(""), PAGE)).toBeNull();
	});
});

describe("getBytes", () => {
	it("returns raw bytes unchanged and follows redirects", async () => {
		const raw = new Uint8Array([0xff, 0xfe, 0x00, 0x80, 0xc3]);
		const dispatcher = mockRoutes(ORIGIN, {
			"/a": { status: 302, headers: { location: "/b" } },
			"/b": { status: 200, contentType: "application/octet-stream", body: raw },
		});
		const res = await createFetcher({ userAgent: UA, dispatcher }).getBytes(
			`${ORIGIN}/a`,
			{ maxBytes: 100 },
		);
		expect(res).toMatchObject({
			kind: "response",
			url: `${ORIGIN}/b`,
			status: 200,
			truncated: false,
		});
		if (res.kind === "response") expect([...res.bytes]).toEqual([...raw]);
	});

	it("marks truncated past maxBytes", async () => {
		const dispatcher = mockRoutes(ORIGIN, {
			"/big": { status: 200, body: new Uint8Array(50) },
		});
		const res = await createFetcher({ userAgent: UA, dispatcher }).getBytes(
			`${ORIGIN}/big`,
			{ maxBytes: 10 },
		);
		expect(res).toMatchObject({ kind: "response", truncated: true });
		if (res.kind === "response") expect(res.bytes.length).toBe(10);
	});

	it("returns an error result, not a throw, for an aborted signal", async () => {
		const dispatcher = mockRoutes(ORIGIN, {
			"/slow": { status: 200, body: new Uint8Array(5), delayMs: 3000 },
		});
		const controller = new AbortController();
		const pending = createFetcher({ userAgent: UA, dispatcher }).getBytes(
			`${ORIGIN}/slow`,
			{ maxBytes: 10, signal: controller.signal },
		);
		controller.abort();
		const started = Date.now();
		const res = await pending;
		expect(res.kind).toBe("error");
		expect(Date.now() - started).toBeLessThan(2000);
	});
});
