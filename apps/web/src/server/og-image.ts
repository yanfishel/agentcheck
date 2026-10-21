import "server-only";
import { type Db, getAuditByShareToken } from "@agentcheck/db";
import { drawReportOg, type OgGrade } from "../app/_og/draw";

const GRADES: readonly string[] = ["A+", "A", "B", "C", "D", "F"];

export interface OgCache {
	get(key: string): Uint8Array | undefined;
	set(key: string, png: Uint8Array): void;
}

/** A small LRU of rendered pictures, keyed by audit id (a done audit never changes). */
export function createOgCache(max = 50): OgCache {
	const map = new Map<string, Uint8Array>();
	return {
		get(key) {
			const png = map.get(key);
			if (png) {
				map.delete(key);
				map.set(key, png);
			}
			return png;
		},
		set(key, png) {
			map.delete(key);
			map.set(key, png);
			while (map.size > max) {
				const oldest = map.keys().next().value;
				if (oldest === undefined) break;
				map.delete(oldest);
			}
		},
	};
}

const defaultCache = createOgCache();

export interface OgImageDeps {
	db: Db;
	draw?: typeof drawReportOg;
	cache?: OgCache;
}

const notFound = () =>
	new Response("Not found", {
		status: 404,
		headers: { "cache-control": "no-store" },
	});

/**
 * The social picture for a shared done audit; 404 for anything else. The token
 * lookup always runs first, so unsharing or blocking the owner stops the
 * picture at once even when it is cached.
 */
export async function handleOgImage(
	token: string,
	deps: OgImageDeps,
): Promise<Response> {
	const audit = await getAuditByShareToken(deps.db, token);
	const score = audit?.score ?? audit?.result?.score;
	const grade = audit?.grade ?? audit?.result?.grade;
	if (
		!audit ||
		typeof score !== "number" ||
		typeof grade !== "string" ||
		!GRADES.includes(grade)
	) {
		return notFound();
	}
	const cache = deps.cache ?? defaultCache;
	let png = cache.get(audit.id);
	if (!png) {
		png = await (deps.draw ?? drawReportOg)({
			host: new URL(audit.url).hostname,
			score,
			grade: grade as OgGrade,
		});
		cache.set(audit.id, png);
	}
	return new Response(png as BodyInit, {
		headers: {
			"content-type": "image/png",
			"cache-control": "public, max-age=300",
		},
	});
}
