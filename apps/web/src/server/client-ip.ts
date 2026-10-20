import "server-only";
import { createHmac } from "node:crypto";
import { isIPv4, isIPv6 } from "node:net";

export const UNKNOWN_IP_KEY = "unknown";

const DEV_SECRET = "dev-ip-hash-secret";
const MAPPED_V4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

/** Expands an IPv6 address into eight hextets (embedded IPv4 becomes two). */
function expandIpv6(address: string): string[] {
	let text = address.toLowerCase();
	const v4 = text.match(/(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
	if (v4) {
		const [a = 0, b = 0, c = 0, d = 0] = v4.split(".").map(Number);
		text =
			text.slice(0, -v4.length) +
			((a << 8) | b).toString(16) +
			":" +
			((c << 8) | d).toString(16);
	}
	const [head = "", tail] = text.split("::");
	const left = head ? head.split(":") : [];
	if (tail === undefined) return left;
	const right = tail ? tail.split(":") : [];
	const fill = Array<string>(8 - left.length - right.length).fill("0");
	return [...left, ...fill, ...right];
}

/**
 * The rate-limit key for the caller: the last `x-forwarded-for` entry (the one
 * appended by our own proxy), with IPv6 reduced to its /64 network.
 */
export function clientIpKey(headers: Headers): string {
	const last = headers.get("x-forwarded-for")?.split(",").pop()?.trim() ?? "";
	const mapped = last.match(MAPPED_V4)?.[1];
	if (mapped && isIPv4(mapped)) return mapped;
	if (isIPv4(last)) return last;
	if (isIPv6(last)) {
		const prefix = expandIpv6(last)
			.slice(0, 4)
			.map((hextet) => hextet.replace(/^0+(?=.)/, ""));
		return `${prefix.join(":")}::/64`;
	}
	return UNKNOWN_IP_KEY;
}

export function hashIp(key: string, secret: string): string {
	return createHmac("sha256", secret).update(key).digest("hex");
}

let warned = false;

export function ipHashSecret(env: NodeJS.ProcessEnv = process.env): string {
	if (env.IP_HASH_SECRET) return env.IP_HASH_SECRET;
	if (env.NODE_ENV === "production") {
		throw new Error("IP_HASH_SECRET is not set");
	}
	if (!warned) {
		warned = true;
		console.warn("IP_HASH_SECRET is not set; using an insecure dev secret");
	}
	return DEV_SECRET;
}
