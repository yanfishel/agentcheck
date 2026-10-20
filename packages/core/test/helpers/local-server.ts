import { createServer } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { launchBrowser } from "../../src/browser/launch.ts";

export interface Route {
	status?: number;
	body: string;
	contentType?: string;
	delayMs?: number;
	/** Send headers and part of the body, then never finish the response. */
	neverEnd?: boolean;
}

export interface LocalServer {
	url: string;
	port: number;
	close(): Promise<void>;
	requests: Array<{ path: string; userAgent: string; host: string }>;
}

export async function serveHtml(
	routes: Record<string, Route>,
): Promise<LocalServer> {
	const requests: LocalServer["requests"] = [];
	const sockets = new Set<Socket>();
	const server = createServer((req, res) => {
		const path = (req.url ?? "/").split("?")[0] ?? "/";
		requests.push({
			path,
			userAgent: String(req.headers["user-agent"] ?? ""),
			host: String(req.headers.host ?? ""),
		});
		const route = routes[path];
		if (!route) {
			res.writeHead(404, { "content-type": "text/plain" });
			res.end("not found");
			return;
		}
		const send = () => {
			res.writeHead(route.status ?? 200, {
				"content-type": route.contentType ?? "text/html; charset=utf-8",
			});
			if (route.neverEnd) {
				res.write(route.body);
				return;
			}
			res.end(route.body);
		};
		if (route.delayMs) setTimeout(send, route.delayMs);
		else send();
	});
	server.on("connection", (socket) => {
		sockets.add(socket);
		socket.on("close", () => sockets.delete(socket));
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address() as AddressInfo;
	return {
		url: `http://127.0.0.1:${port}`,
		port,
		requests,
		close: () =>
			new Promise<void>((resolve) => {
				for (const socket of sockets) socket.destroy();
				server.close(() => resolve());
			}),
	};
}

let availability: Promise<boolean> | undefined;

export function browserAvailable(): Promise<boolean> {
	availability ??= (async () => {
		const result = await launchBrowser();
		if ("kind" in result) return false;
		await result.browser.close().catch(() => {});
		return true;
	})();
	return availability;
}
