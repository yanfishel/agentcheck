import {
	createServer,
	request as httpRequest,
	type IncomingHttpHeaders,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import { connect, isIP, type Socket } from "node:net";
import { defaultResolve, type Resolve } from "./guarded-lookup.ts";
import { checkUrl, isBlockedAddress, normaliseIp } from "./policy.ts";

export interface GuardedProxy {
	/** Proxy URL, e.g. `http://127.0.0.1:<port>`. */
	url: string;
	close(): Promise<void>;
	/** Reason of the last policy refusal for `host`, or the last refusal overall when omitted. */
	refused(host?: string): string | undefined;
}

export interface GuardedProxyOptions {
	/** @internal for tests; the service must leave this unset — widening it voids the guard. */
	resolve?: Resolve;
	/** @internal for tests; the service must leave this unset — widening it voids the guard. */
	isBlocked?: (ip: string) => boolean;
	/** @internal for tests; the service must leave this unset — widening it voids the guard. */
	allowPorts?: number[];
	/** Upper bound for the DNS resolution step. Default 10000. */
	resolveTimeoutMs?: number;
}

const CONNECT_TIMEOUT_MS = 10_000;

const HOP_BY_HOP = [
	"proxy-connection",
	"proxy-authorization",
	"connection",
	"keep-alive",
	"te",
	"trailer",
	"upgrade",
];

type Vetted =
	| { ok: true; ip: string; port: number }
	| { ok: false; status: 403 | 502; reason: string };

function stripBrackets(host: string): string {
	return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

/** Keeps a header value on one line and printable. */
function headerSafe(value: string): string {
	return value.replace(/[^\x20-\x7e]/g, "?");
}

function forwardHeaders(headers: IncomingHttpHeaders): IncomingHttpHeaders {
	const named = String(headers.connection ?? "")
		.split(",")
		.map((t) => t.trim().toLowerCase())
		.filter(Boolean);
	const out: IncomingHttpHeaders = {};
	for (const [name, value] of Object.entries(headers)) {
		if (!HOP_BY_HOP.includes(name) && !named.includes(name)) out[name] = value;
	}
	return out;
}

export async function startGuardedProxy(
	opts: GuardedProxyOptions = {},
): Promise<GuardedProxy> {
	const resolve = opts.resolve ?? defaultResolve;
	const isBlocked = opts.isBlocked ?? isBlockedAddress;
	const allowPorts = opts.allowPorts;
	const resolveTimeoutMs = opts.resolveTimeoutMs ?? CONNECT_TIMEOUT_MS;
	const sockets = new Set<Socket>();
	let closed = false;
	const refusals = new Map<string, string>();
	let lastRefusal: string | undefined;

	function recordRefusal(target: URL, reason: string): void {
		refusals.set(stripBrackets(target.hostname).toLowerCase(), reason);
		lastRefusal = reason;
	}

	function track(socket: Socket): void {
		if (closed) {
			socket.destroy();
			return;
		}
		sockets.add(socket);
		socket.on("error", () => {});
		socket.once("close", () => sockets.delete(socket));
	}

	/** Applies the hostname/port policy, resolves, and picks a vetted address. */
	async function vet(target: URL): Promise<Vetted> {
		const check = checkUrl(target, { allowPorts });
		// Address-level refusals for IP literals are decided below by `isBlocked`,
		// so an injected policy can override the default one.
		if (!check.ok && !check.reason.startsWith("address ")) {
			return { ok: false, status: 403, reason: check.reason };
		}
		const port = Number(
			target.port || (target.protocol === "https:" ? 443 : 80),
		);
		const host = stripBrackets(target.hostname);
		if (isIP(host)) {
			const ip = normaliseIp(host)?.ip ?? host;
			if (isBlocked(ip)) {
				return { ok: false, status: 403, reason: `address ${ip}` };
			}
			return { ok: true, ip, port };
		}
		let found: Awaited<ReturnType<Resolve>>;
		let timer: NodeJS.Timeout | undefined;
		try {
			found = await Promise.race([
				resolve(host),
				new Promise<never>((_, reject) => {
					timer = setTimeout(
						() => reject(new Error("timeout")),
						resolveTimeoutMs,
					);
				}),
			]);
		} catch {
			return { ok: false, status: 502, reason: `cannot resolve ${host}` };
		} finally {
			clearTimeout(timer);
		}
		found = found.map((a) => ({
			...a,
			address: normaliseIp(a.address)?.ip ?? a.address,
		}));
		const allowed = found.filter((a) => !isBlocked(a.address));
		const first = allowed[0];
		if (!first) {
			const only = found.length === 1 ? found[0] : undefined;
			return {
				ok: false,
				status: 403,
				reason: only
					? `address ${only.address}`
					: `no allowed address for ${host}`,
			};
		}
		return { ok: true, ip: first.address, port };
	}

	/** Connects to a vetted IP (never a hostname) with a connect timeout. */
	function openUpstream(
		ip: string,
		port: number,
		onConnect: (upstream: Socket) => void,
		onFail: () => void,
	): Socket {
		const upstream = connect({ host: ip, port });
		track(upstream);
		upstream.setTimeout(CONNECT_TIMEOUT_MS);
		let connected = false;
		upstream.once("connect", () => {
			connected = true;
			upstream.setTimeout(0);
			onConnect(upstream);
		});
		upstream.once("timeout", () => {
			if (!connected) upstream.destroy();
		});
		upstream.once("close", () => {
			if (!connected) onFail();
		});
		return upstream;
	}

	function refuseSocket(
		socket: Socket,
		status: 400 | 403 | 502,
		reason?: string,
	): void {
		const text =
			status === 403
				? "Forbidden"
				: status === 502
					? "Bad Gateway"
					: "Bad Request";
		const blocked =
			status === 403 && reason
				? `X-AgentCheck-Blocked: ${headerSafe(reason)}\r\n`
				: "";
		socket.end(
			`HTTP/1.1 ${status} ${text}\r\n${blocked}Content-Length: 0\r\nConnection: close\r\n\r\n`,
		);
	}

	function refuseResponse(
		res: ServerResponse,
		status: 400 | 403 | 502,
		reason?: string,
	): void {
		if (res.headersSent) {
			res.destroy();
			return;
		}
		const headers: Record<string, string> = { Connection: "close" };
		if (status === 403 && reason) {
			headers["X-AgentCheck-Blocked"] = headerSafe(reason);
		}
		// A non-empty body keeps Chrome from replacing the response with an error page,
		// so the page-level X-AgentCheck-Blocked header stays observable.
		const body = status === 403 ? "Target address is not allowed" : "";
		res.writeHead(status, headers);
		res.end(body);
	}

	const server = createServer();

	server.on("connection", track);

	server.on("connect", (req: IncomingMessage, client: Socket, head: Buffer) => {
		void (async () => {
			const authority = req.url ?? "";
			let target: URL;
			try {
				const port = /:(\d+)$/.exec(authority)?.[1];
				if (!port) throw new Error("no port");
				target = new URL(`${port === "80" ? "http" : "https"}://${authority}/`);
			} catch {
				refuseSocket(client, 400);
				return;
			}
			const vetted = await vet(target);
			if (closed || client.destroyed) {
				client.destroy();
				return;
			}
			if (!vetted.ok) {
				if (vetted.status === 403) recordRefusal(target, vetted.reason);
				refuseSocket(client, vetted.status, vetted.reason);
				return;
			}
			const upstream = openUpstream(
				vetted.ip,
				vetted.port,
				(up) => {
					if (client.destroyed) {
						up.destroy();
						return;
					}
					client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
					if (head.length > 0) up.write(head);
					up.pipe(client);
					client.pipe(up);
					up.once("close", () => client.destroy());
				},
				() => refuseSocket(client, 502),
			);
			client.once("close", () => upstream.destroy());
		})();
	});

	server.on("request", (req: IncomingMessage, res: ServerResponse) => {
		void (async () => {
			const raw = req.url ?? "";
			if (!/^http:\/\//i.test(raw)) {
				req.resume();
				refuseResponse(res, 400);
				return;
			}
			let target: URL;
			try {
				target = new URL(raw);
			} catch {
				req.resume();
				refuseResponse(res, 400);
				return;
			}
			const vetted = await vet(target);
			if (closed || res.destroyed || req.socket.destroyed) {
				req.socket.destroy();
				return;
			}
			if (!vetted.ok) {
				if (vetted.status === 403) recordRefusal(target, vetted.reason);
				req.resume();
				refuseResponse(res, vetted.status, vetted.reason);
				return;
			}
			const upstreamReq = httpRequest({
				host: vetted.ip,
				port: vetted.port,
				method: req.method,
				path: `${target.pathname}${target.search}`,
				headers: { ...forwardHeaders(req.headers), host: target.host },
				agent: false,
			});
			upstreamReq.on("socket", (socket) => {
				track(socket);
				if (socket.connecting) {
					socket.setTimeout(CONNECT_TIMEOUT_MS, () => socket.destroy());
					socket.once("connect", () => socket.setTimeout(0));
				}
			});
			upstreamReq.on("response", (upstreamRes) => {
				const headers = forwardHeaders(upstreamRes.headers);
				res.writeHead(
					upstreamRes.statusCode ?? 502,
					upstreamRes.statusMessage,
					headers,
				);
				upstreamRes.pipe(res);
				upstreamRes.on("error", () => res.destroy());
			});
			upstreamReq.on("error", () => refuseResponse(res, 502));
			res.on("close", () => upstreamReq.destroy());
			req.pipe(upstreamReq);
		})();
	});

	server.on("clientError", (_err, socket) => {
		if (socket.writable) refuseSocket(socket as Socket, 400);
		else socket.destroy();
	});

	await new Promise<void>((done, fail) => {
		server.once("error", fail);
		server.listen(0, "127.0.0.1", () => {
			server.off("error", fail);
			done();
		});
	});
	const address = server.address();
	if (!address || typeof address === "string") {
		server.close();
		throw new Error("Proxy failed to bind a port");
	}

	let closing: Promise<void> | undefined;
	return {
		url: `http://127.0.0.1:${address.port}`,
		refused(host) {
			return host === undefined
				? lastRefusal
				: refusals.get(stripBrackets(host).toLowerCase());
		},
		close() {
			closed = true;
			if (!closing) {
				closing = new Promise<void>((done) => {
					server.close(() => done());
					for (const socket of sockets) socket.destroy();
					sockets.clear();
				});
			}
			return closing;
		},
	};
}
