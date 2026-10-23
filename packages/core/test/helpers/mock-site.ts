import { readFileSync } from "node:fs";
import { MockAgent } from "undici";

export type Route = {
	status: number;
	contentType?: string;
	body?: string | Uint8Array;
	headers?: Record<string, string>;
	delayMs?: number;
	/** Called with the request headers each time the route is hit. */
	onRequest?: (headers: Record<string, string>) => void;
	/** Served instead when the request's Accept names text/markdown. */
	markdown?: Route;
};

const NOT_FOUND_BODY = "<!DOCTYPE html><html><body>Not found</body></html>";

function normalizeHeaders(raw: unknown): Record<string, string> {
	const out: Record<string, string> = {};
	if (Array.isArray(raw)) {
		for (let i = 0; i + 1 < raw.length; i += 2) {
			out[String(raw[i]).toLowerCase()] = String(raw[i + 1]);
		}
	} else if (raw && typeof raw === "object") {
		for (const [k, v] of Object.entries(raw)) {
			out[k.toLowerCase()] = String(v);
		}
	}
	return out;
}

export function mockRoutes(
	origin: string,
	routes: Record<string, Route>,
	existingAgent?: MockAgent,
): MockAgent {
	const agent = existingAgent ?? new MockAgent();
	agent.disableNetConnect();
	const pool = agent.get(origin);

	const reply = (route: Route) => (opts: { headers?: unknown }) => {
		route.onRequest?.(normalizeHeaders(opts.headers));
		return {
			statusCode: route.status,
			data: route.body ?? "",
			responseOptions: {
				headers: {
					...(route.contentType ? { "content-type": route.contentType } : {}),
					...route.headers,
				},
			},
		};
	};
	for (const [path, route] of Object.entries(routes)) {
		// Registered first, so it wins over the plain route for Accept: text/markdown.
		if (route.markdown) {
			pool
				.intercept({
					path,
					method: "GET",
					headers: { accept: (v: string) => /text\/markdown/i.test(v ?? "") },
				})
				.reply(reply(route.markdown))
				.persist();
		}
		const scope = pool.intercept({ path, method: "GET" }).reply(reply(route));
		if (route.delayMs) scope.delay(route.delayMs);
		scope.persist();
	}

	pool
		.intercept({
			path: (p: string) => !(p in routes),
			method: "GET",
		})
		.reply(404, NOT_FOUND_BODY, {
			headers: { "content-type": "text/html" },
		})
		.persist();

	return agent;
}

const SITES_DIR = new URL("../fixtures/sites/", import.meta.url);

interface SiteManifest {
	origin: string;
	routes: Record<
		string,
		{
			status: number;
			contentType?: string;
			file?: string;
			headers?: Record<string, string>;
			/** Served for Accept: text/markdown. */
			markdown?: { status: number; contentType?: string; file?: string };
		}
	>;
}

/** Mocks a synthetic reference site from test/fixtures/sites/<name>/. */
export function mockSite(name: string): { agent: MockAgent; origin: string } {
	const dir = new URL(`${name}/`, SITES_DIR);
	const manifest = JSON.parse(
		readFileSync(new URL("routes.json", dir), "utf8"),
	) as SiteManifest;
	const routes: Record<string, Route> = {};
	const toRoute = (entry: {
		status: number;
		contentType?: string;
		file?: string;
		headers?: Record<string, string>;
	}): Route => ({
		status: entry.status,
		contentType: entry.contentType,
		headers: entry.headers,
		// Routes without a stored file (non-2xx) reply a short not-found body.
		body: entry.file
			? new Uint8Array(readFileSync(new URL(entry.file, dir)))
			: NOT_FOUND_BODY,
	});
	for (const [path, entry] of Object.entries(manifest.routes)) {
		routes[path] = {
			...toRoute(entry),
			...(entry.markdown ? { markdown: toRoute(entry.markdown) } : {}),
		};
	}
	return {
		agent: mockRoutes(manifest.origin, routes),
		origin: manifest.origin,
	};
}
