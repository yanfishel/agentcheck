import { BlockList, isIP } from "node:net";

const blockList = new BlockList();

const BLOCKED_IPV4: Array<[string, number]> = [
	["0.0.0.0", 8],
	["10.0.0.0", 8],
	["100.64.0.0", 10],
	["127.0.0.0", 8],
	["169.254.0.0", 16],
	["172.16.0.0", 12],
	["192.0.0.0", 24],
	["192.0.2.0", 24],
	["192.168.0.0", 16],
	["198.18.0.0", 15],
	["198.51.100.0", 24],
	["203.0.113.0", 24],
	["224.0.0.0", 4],
	["240.0.0.0", 4],
];

const BLOCKED_IPV6: Array<[string, number]> = [
	// IPv4-compatible (includes ::, ::1 and ::127.0.0.1 forms)
	["::", 96],
	// IPv4-translated (SIIT)
	["::ffff:0:0:0", 96],
	["64:ff9b:1::", 48],
	// Deprecated site-local
	["fec0::", 10],
	// 6to4 and Teredo embed arbitrary IPv4 addresses
	["2002::", 16],
	["2001::", 32],
	["fc00::", 7],
	["fe80::", 10],
	["ff00::", 8],
	["64:ff9b::", 96],
	["2001:db8::", 32],
];

for (const [net, prefix] of BLOCKED_IPV4)
	blockList.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of BLOCKED_IPV6)
	blockList.addSubnet(net, prefix, "ipv6");

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

export interface GuardOptions {
	allowPorts?: number[];
}

const DEFAULT_PORTS = [80, 443];

/**
 * Normalises an IP literal to canonical text, unwrapping IPv4-mapped IPv6
 * (dotted or hex form) to plain IPv4. Returns null for non-IP input.
 */
export function normaliseIp(raw: string): { ip: string; family: 4 | 6 } | null {
	const ip = raw.startsWith("[") && raw.endsWith("]") ? raw.slice(1, -1) : raw;
	const family = isIP(ip);
	if (family === 0) return null;
	if (family === 4) return { ip, family: 4 };
	let canonical: string;
	try {
		canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
	} catch {
		return { ip, family: 6 };
	}
	const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(canonical);
	if (mapped) {
		const hi = Number.parseInt(mapped[1] as string, 16);
		const lo = Number.parseInt(mapped[2] as string, 16);
		return { ip: `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`, family: 4 };
	}
	return { ip: canonical, family: 6 };
}

/**
 * Returns true when the IP literal lies in a blocked range. Returns false for
 * non-IP input (including hostnames), so callers must only pass IP literals.
 */
export function isBlockedAddress(ip: string): boolean {
	const norm = normaliseIp(ip);
	if (!norm) return false;
	return blockList.check(norm.ip, norm.family === 4 ? "ipv4" : "ipv6");
}

export function checkUrl(
	input: string | URL,
	opts: GuardOptions = {},
): UrlCheck {
	let url: URL;
	try {
		url = new URL(typeof input === "string" ? input : input.href);
	} catch {
		return { ok: false, reason: "host <invalid>" };
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		return { ok: false, reason: `scheme ${url.protocol}` };
	}
	const port =
		url.port === "" ? (url.protocol === "https:" ? 443 : 80) : Number(url.port);
	if (!(opts.allowPorts ?? DEFAULT_PORTS).includes(port)) {
		return { ok: false, reason: `port ${port}` };
	}
	const hostname = url.hostname.toLowerCase();
	const bare = hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
	if (bare === "localhost" || bare.endsWith(".localhost")) {
		return { ok: false, reason: `host ${hostname}` };
	}
	const norm = normaliseIp(hostname);
	if (norm && isBlockedAddress(norm.ip)) {
		return { ok: false, reason: `address ${norm.ip}` };
	}
	return { ok: true, url };
}

/** Single source of the text every policy refusal starts with. */
export const BLOCKED_PREFIX = "Target address is not allowed";

export function blockedMessage(reason: string): string {
	return `${BLOCKED_PREFIX}: ${reason}`;
}
