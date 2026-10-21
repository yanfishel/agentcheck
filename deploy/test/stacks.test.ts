import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
	readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

/** The block of one top-level compose service, up to the next one. */
function service(compose: string, name: string): string {
	const match = compose.match(
		new RegExp(
			String.raw`\n  ${name}:\n([\s\S]*?)(?=\n  [a-z][\w-]*:\n|\n[a-z]|$)`,
		),
	);
	if (!match?.[1]) throw new Error(`no service ${name}`);
	return match[1];
}

describe("deploy stacks", () => {
	// Comments are prose; only the YAML itself is checked.
	const yaml = (path: string) => read(path).replace(/^\s*#.*\n/gm, "");
	const app = yaml("docker-compose.yml");
	const edge = yaml("edge/docker-compose.yml");

	it("AgentCheck publishes no ports and has no Caddy of its own", () => {
		expect(app).not.toMatch(/\n {2}caddy:/);
		expect(app).not.toMatch(/\bports:/);
		expect(
			existsSync(fileURLToPath(new URL("../Caddyfile", import.meta.url))),
		).toBe(false);
	});

	it("AgentCheck's web joins the edge network as agentcheck-web", () => {
		const web = service(app, "web");
		expect(web).toMatch(
			/networks:[\s\S]*edge:[\s\S]*aliases:[\s\S]*- agentcheck-web/,
		);
		expect(web).toMatch(/networks:[\s\S]*- default|networks:[\s\S]*default:/);
		expect(app).toMatch(/\nnetworks:\n {2}edge:\n {4}external: true/);
	});

	it("web and worker get the variables they read, never the whole .env", () => {
		expect(app).not.toMatch(/env_file/);
		const web = service(app, "web");
		for (const name of [
			"DATABASE_URL",
			"ADMIN_EMAIL",
			"IP_HASH_SECRET",
			"PUBLIC_BASE_URL",
			"NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
			"CLERK_SECRET_KEY",
			"CLERK_WEBHOOK_SIGNING_SECRET",
		]) {
			expect(web).toContain(`${name}: \${${name}:?}`);
		}
		expect(web).not.toContain("POSTGRES_PASSWORD");
		expect(web).not.toContain("AUDIT_CONCURRENCY");
		const worker = service(app, "worker");
		expect(worker).not.toContain("CLERK_SECRET_KEY");
		expect(worker).not.toContain("POSTGRES_PASSWORD");
	});

	it("only the edge stack owns the network and publishes 80 and 443", () => {
		expect(edge).toMatch(/\nnetworks:\n {2}edge:\n {4}name: edge/);
		expect(edge).not.toMatch(/external: true/);
		const caddy = service(edge, "caddy");
		for (const port of ['"80:80"', '"443:443"', '"443:443/udp"']) {
			expect(caddy).toContain(port);
		}
	});

	it("the edge Caddyfile imports one file per site", () => {
		expect(read("edge/Caddyfile")).toMatch(/^import sites\/\*\.caddy$/m);
	});

	it("AgentCheck's site proxies to its web and redirects www", () => {
		const site = read("edge/sites/agentcheck.caddy");
		expect(site).toMatch(
			/agentcheck\.dev \{[\s\S]*reverse_proxy agentcheck-web:3000/,
		);
		expect(site).toMatch(
			/www\.agentcheck\.dev \{[\s\S]*redir https:\/\/agentcheck\.dev\{uri\} permanent/,
		);
	});
});
