import { describe, expect, it } from "vitest";
import { createFetcher, type HttpResult, isTextResource } from "../src/http.ts";
import { mockRoutes } from "./helpers/mock-site.ts";

const ORIGIN = "https://example.test";
const UA = "AgentCheck/test (+https://example.test)";

function response(
	overrides: Partial<Extract<HttpResult, { kind: "response" }>> = {},
): HttpResult {
	return {
		kind: "response",
		url: `${ORIGIN}/llms.txt`,
		status: 200,
		contentType: "text/plain",
		headers: new Headers(),
		body: "# Site",
		truncated: false,
		...overrides,
	};
}

describe("createFetcher", () => {
	it("sends the configured user-agent header", async () => {
		let seen: string | undefined;
		const dispatcher = mockRoutes(ORIGIN, {
			"/": {
				status: 200,
				contentType: "text/plain",
				body: "ok",
				onRequest: (h) => {
					seen = h["user-agent"];
				},
			},
		});
		const res = await createFetcher({ userAgent: UA, dispatcher }).get(
			`${ORIGIN}/`,
		);
		expect(res.kind).toBe("response");
		expect(seen).toBe(UA);
	});

	it("follows a redirect and reports the final url", async () => {
		const dispatcher = mockRoutes(ORIGIN, {
			"/a": { status: 301, headers: { location: "/b" } },
			"/b": { status: 200, contentType: "text/plain", body: "hello" },
		});
		const res = await createFetcher({ userAgent: UA, dispatcher }).get(
			`${ORIGIN}/a`,
		);
		expect(res.kind).toBe("response");
		if (res.kind === "response") {
			expect(res.url.endsWith("/b")).toBe(true);
			expect(res.body).toBe("hello");
		}
	});

	it("allows exactly maxRedirects redirects", async () => {
		const routes: Record<string, import("./helpers/mock-site.ts").Route> = {
			"/r5": { status: 200, contentType: "text/plain", body: "end" },
		};
		for (let i = 0; i < 5; i++) {
			routes[`/r${i}`] = { status: 302, headers: { location: `/r${i + 1}` } };
		}
		const dispatcher = mockRoutes(ORIGIN, routes);
		const res = await createFetcher({ userAgent: UA, dispatcher }).get(
			`${ORIGIN}/r0`,
		);
		expect(res.kind).toBe("response");
	});

	it("returns an error after too many redirects", async () => {
		const routes: Record<string, import("./helpers/mock-site.ts").Route> = {};
		for (let i = 0; i < 6; i++) {
			routes[`/r${i}`] = { status: 302, headers: { location: `/r${i + 1}` } };
		}
		routes["/r6"] = { status: 200, body: "end" };
		const dispatcher = mockRoutes(ORIGIN, routes);
		const res = await createFetcher({ userAgent: UA, dispatcher }).get(
			`${ORIGIN}/r0`,
		);
		expect(res.kind).toBe("error");
		if (res.kind === "error") expect(res.error).toContain("redirect");
	});

	it("returns an error when the request times out", async () => {
		const dispatcher = mockRoutes(ORIGIN, {
			"/slow": { status: 200, body: "late", delayMs: 200 },
		});
		const res = await createFetcher({
			userAgent: UA,
			dispatcher,
			timeoutMs: 50,
		}).get(`${ORIGIN}/slow`);
		expect(res.kind).toBe("error");
		if (res.kind === "error") expect(res.error).toContain("timed out");
	});

	it("truncates bodies larger than maxBytes", async () => {
		const dispatcher = mockRoutes(ORIGIN, {
			"/big": { status: 200, contentType: "text/plain", body: "x".repeat(100) },
		});
		const res = await createFetcher({
			userAgent: UA,
			dispatcher,
			maxBytes: 10,
		}).get(`${ORIGIN}/big`);
		expect(res.kind).toBe("response");
		if (res.kind === "response") {
			expect(res.truncated).toBe(true);
			expect(res.body.length).toBe(10);
		}
	});

	it("takes a per-call byte cap and signal, bypassing the cache", async () => {
		let hits = 0;
		const dispatcher = mockRoutes(ORIGIN, {
			"/big": {
				status: 200,
				contentType: "text/plain",
				body: "x".repeat(100),
				onRequest: () => {
					hits++;
				},
			},
			"/slow": { status: 200, body: "late", delayMs: 500 },
		});
		const fetcher = createFetcher({ userAgent: UA, dispatcher, maxBytes: 10 });
		const wide = await fetcher.get(`${ORIGIN}/big`, { maxBytes: 50 });
		expect(wide.kind === "response" && wide.body.length).toBe(50);
		await fetcher.get(`${ORIGIN}/big`);
		await fetcher.get(`${ORIGIN}/big`);
		expect(hits).toBe(2);

		const aborted = await fetcher.get(`${ORIGIN}/slow`, {
			signal: AbortSignal.timeout(20),
		});
		expect(aborted.kind === "error" && aborted.error).toBe("request aborted");
	});

	it("decodes the body using the charset from content-type", async () => {
		// "Привет" in windows-1251
		const bytes = new Uint8Array([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]);
		const dispatcher = mockRoutes(ORIGIN, {
			"/ru": {
				status: 200,
				contentType: "text/html; charset=windows-1251",
				body: bytes,
			},
		});
		const res = await createFetcher({ userAgent: UA, dispatcher }).get(
			`${ORIGIN}/ru`,
		);
		expect(res.kind === "response" && res.body).toBe("Привет");
	});

	describe("meta charset detection", () => {
		const PRIVET = [0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]; // windows-1251
		const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

		async function fetchHtml(
			contentType: string,
			body: Uint8Array,
		): Promise<string | undefined> {
			const dispatcher = mockRoutes(ORIGIN, {
				"/page": { status: 200, contentType, body },
			});
			const res = await createFetcher({ userAgent: UA, dispatcher }).get(
				`${ORIGIN}/page`,
			);
			return res.kind === "response" ? res.body : undefined;
		}

		it("uses <meta charset> when the header has no charset", async () => {
			const body = new Uint8Array([
				...ascii('<html><head><META CHARSET="windows-1251"></head><body>'),
				...PRIVET,
			]);
			expect(await fetchHtml("text/html", body)).toContain("Привет");
		});

		it("uses the http-equiv Content-Type meta", async () => {
			const body = new Uint8Array([
				...ascii(
					'<html><head><meta http-equiv="Content-Type" content="text/html; charset=windows-1251"></head><body>',
				),
				...PRIVET,
			]);
			expect(await fetchHtml("text/html", body)).toContain("Привет");
		});

		it("prefers the header charset over the meta tag", async () => {
			const body = new TextEncoder().encode(
				'<html><head><meta charset="windows-1251"></head><body>Привет',
			);
			expect(await fetchHtml("text/html; charset=utf-8", body)).toContain(
				"Привет",
			);
		});

		it("ignores meta charset in non-HTML responses", async () => {
			const body = new TextEncoder().encode(
				'<meta charset="windows-1251">Привет',
			);
			expect(await fetchHtml("text/plain", body)).toContain("Привет");
		});
	});

	it("fetches the same url only once", async () => {
		let hits = 0;
		const dispatcher = mockRoutes(ORIGIN, {
			"/once": {
				status: 200,
				contentType: "text/plain",
				body: "x",
				onRequest: () => {
					hits++;
				},
			},
		});
		const fetcher = createFetcher({ userAgent: UA, dispatcher });
		const [a, b] = await Promise.all([
			fetcher.get(`${ORIGIN}/once`),
			fetcher.get(new URL(`${ORIGIN}/once`)),
		]);
		const c = await fetcher.get(`${ORIGIN}/once`);
		expect(hits).toBe(1);
		expect(b).toBe(a);
		expect(c).toBe(a);
	});

	it("returns non-2xx statuses as responses", async () => {
		const dispatcher = mockRoutes(ORIGIN, {});
		const res = await createFetcher({ userAgent: UA, dispatcher }).get(
			`${ORIGIN}/missing`,
		);
		expect(res.kind).toBe("response");
		if (res.kind === "response") expect(res.status).toBe(404);
	});
});

describe("isTextResource", () => {
	it.each([
		"text/plain",
		"text/markdown",
		"text/x-markdown",
		"application/octet-stream",
		null,
	])("accepts 200 with content type %s", (contentType) => {
		expect(isTextResource(response({ contentType }))).toBe(true);
	});

	it("rejects html content type", () => {
		expect(isTextResource(response({ contentType: "text/html" }))).toBe(false);
	});

	it("rejects xhtml content type", () => {
		expect(
			isTextResource(response({ contentType: "application/xhtml+xml" })),
		).toBe(false);
	});

	it("rejects text/plain bodies that look like html", () => {
		expect(isTextResource(response({ body: "  <!doctype html><html>" }))).toBe(
			false,
		);
		expect(isTextResource(response({ body: "\n<HTML lang=en>" }))).toBe(false);
	});

	it("rejects an empty body", () => {
		expect(isTextResource(response({ body: "  \n" }))).toBe(false);
	});

	it("rejects non-200 statuses", () => {
		expect(isTextResource(response({ status: 404 }))).toBe(false);
	});

	it("rejects errors", () => {
		expect(isTextResource({ kind: "error", url: ORIGIN, error: "boom" })).toBe(
			false,
		);
	});
});

describe("createFetcher network guard", () => {
	const PUBLIC = "https://public.test";
	const network = { blockPrivate: true, trustDispatcher: true };

	function redirectingSite(target: string) {
		let hit = false;
		const dispatcher = mockRoutes(PUBLIC, {
			"/": { status: 302, headers: { location: target } },
		});
		const meta = new URL(target);
		mockRoutes(
			meta.origin,
			{
				[meta.pathname]: {
					status: 200,
					contentType: "text/plain",
					body: "secret",
					onRequest: () => {
						hit = true;
					},
				},
			},
			dispatcher,
		);
		return { dispatcher, wasHit: () => hit };
	}

	it("stops a redirect to a metadata address", async () => {
		const { dispatcher, wasHit } = redirectingSite(
			"http://169.254.169.254/latest/meta-data/",
		);
		const res = await createFetcher({
			userAgent: UA,
			dispatcher,
			network,
		}).get(`${PUBLIC}/`);
		expect(res).toEqual({
			kind: "error",
			url: `${PUBLIC}/`,
			error: "Target address is not allowed: address 169.254.169.254",
			blocked: true,
		});
		expect(wasHit()).toBe(false);
	});

	it("stops a redirect to a non-standard port", async () => {
		const { dispatcher } = redirectingSite("http://public.test:8080/");
		const res = await createFetcher({
			userAgent: UA,
			dispatcher,
			network,
		}).get(`${PUBLIC}/`);
		expect(res).toMatchObject({
			kind: "error",
			error: "Target address is not allowed: port 8080",
			blocked: true,
		});
	});

	it("blocks a private start URL before any request", async () => {
		const res = await createFetcher({
			userAgent: UA,
			dispatcher: mockRoutes(PUBLIC, {}),
			network,
		}).get("http://127.0.0.1/");
		expect(res).toMatchObject({
			kind: "error",
			error: "Target address is not allowed: address 127.0.0.1",
			blocked: true,
		});
	});

	it("follows the same redirect without the guard", async () => {
		const { dispatcher, wasHit } = redirectingSite(
			"http://169.254.169.254/latest/meta-data/",
		);
		const res = await createFetcher({ userAgent: UA, dispatcher }).get(
			`${PUBLIC}/`,
		);
		expect(res.kind).toBe("response");
		expect(wasHit()).toBe(true);
	});

	it("uses the guarded lookup when no dispatcher is supplied", async () => {
		const res = await createFetcher({
			userAgent: UA,
			network: {
				blockPrivate: true,
				resolve: async () => [{ address: "10.0.0.1", family: 4 }],
			},
		}).get("http://evil.test/");
		expect(res).toMatchObject({
			kind: "error",
			error: "Target address is not allowed: no allowed address for evil.test",
			blocked: true,
		});
	});

	it("does not flag ordinary failures as blocked", async () => {
		const res = await createFetcher({
			userAgent: UA,
			dispatcher: mockRoutes(PUBLIC, {}),
			network,
		}).get(`${PUBLIC}/missing`);
		expect(res).not.toHaveProperty("blocked");
	});

	it("refuses to combine blockPrivate with a custom dispatcher", () => {
		expect(() =>
			createFetcher({
				userAgent: UA,
				dispatcher: mockRoutes(PUBLIC, {}),
				network: { blockPrivate: true },
			}),
		).toThrow(
			"network.blockPrivate cannot be combined with a custom dispatcher",
		);
	});

	it("close() is safe with and without a guarded agent", async () => {
		const guarded = createFetcher({
			userAgent: UA,
			network: { blockPrivate: true },
		});
		await expect(guarded.close()).resolves.toBeUndefined();
		const plain = createFetcher({
			userAgent: UA,
			dispatcher: mockRoutes(PUBLIC, {}),
		});
		await expect(plain.close()).resolves.toBeUndefined();
	});
});
