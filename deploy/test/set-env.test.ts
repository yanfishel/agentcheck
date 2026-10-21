import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("../bin/set-env", import.meta.url));

function envFile(content: string): string {
	const file = join(mkdtempSync(join(tmpdir(), "set-env-")), ".env");
	writeFileSync(file, content, { mode: 0o600 });
	return file;
}

const run = (file: string, input: string) =>
	spawnSync("sh", [SCRIPT, file], { input, encoding: "utf8" });

describe("set-env", () => {
	it("updates allowed keys and keeps the rest", () => {
		const file = envFile("A=1\nCLERK_SECRET_KEY=old\n");
		const result = run(
			file,
			"CLERK_SECRET_KEY=sk=abc\nCLERK_WEBHOOK_SIGNING_SECRET=whsec_new\n",
		);
		expect(result.status).toBe(0);
		const lines = readFileSync(file, "utf8").trim().split("\n");
		expect(lines).toContain("A=1");
		expect(lines).toContain("CLERK_SECRET_KEY='sk=abc'");
		expect(lines).toContain("CLERK_WEBHOOK_SIGNING_SECRET='whsec_new'");
		expect(lines.filter((l) => l.startsWith("CLERK_SECRET_KEY="))).toHaveLength(
			1,
		);
		expect(result.stdout).toBe(
			"updated CLERK_SECRET_KEY\nupdated CLERK_WEBHOOK_SIGNING_SECRET\n",
		);
		expect(result.stdout + result.stderr).not.toContain("whsec_new");
	});

	it("quotes values so Compose keeps a dollar sign literal", () => {
		const file = envFile("A=1\n");
		const result = run(file, "CLERK_SECRET_KEY=sk_a$b\n");
		expect(result.status).toBe(0);
		expect(readFileSync(file, "utf8")).toBe("A=1\nCLERK_SECRET_KEY='sk_a$b'\n");
	});

	it("rejects a value with a single quote and writes nothing", () => {
		const file = envFile("CLERK_SECRET_KEY='old'\n");
		const result = run(file, "CLERK_SECRET_KEY=sk_it's\n");
		expect(result.status).not.toBe(0);
		expect(readFileSync(file, "utf8")).toBe("CLERK_SECRET_KEY='old'\n");
		expect(result.stdout + result.stderr).not.toContain("sk_it");
	});

	it("rejects unknown names and writes nothing", () => {
		const file = envFile("CLERK_SECRET_KEY=old\n");
		const result = run(file, "CLERK_SECRET_KEY=sk_new\nPATH=/x\n");
		expect(result.status).not.toBe(0);
		expect(readFileSync(file, "utf8")).toBe("CLERK_SECRET_KEY=old\n");
		expect(result.stderr).toContain("PATH");
		expect(result.stdout + result.stderr).not.toContain("sk_new");
	});

	it("rejects a name made of allowed names joined by a space", () => {
		const file = envFile("CLERK_SECRET_KEY=old\n");
		const result = run(
			file,
			"CLERK_SECRET_KEY CLERK_WEBHOOK_SIGNING_SECRET=x\n",
		);
		expect(result.status).not.toBe(0);
		expect(readFileSync(file, "utf8")).toBe("CLERK_SECRET_KEY=old\n");
	});

	it("rejects ADMIN_EMAIL, which lives only in the server's .env", () => {
		const file = envFile("ADMIN_EMAIL=me@x.test\n");
		const result = run(file, "ADMIN_EMAIL=other@x.test\n");
		expect(result.status).not.toBe(0);
		expect(readFileSync(file, "utf8")).toBe("ADMIN_EMAIL=me@x.test\n");
	});

	it("rejects a line without a name and writes nothing", () => {
		const file = envFile("CLERK_SECRET_KEY=old\n");
		const result = run(file, "just a value\n");
		expect(result.status).not.toBe(0);
		expect(readFileSync(file, "utf8")).toBe("CLERK_SECRET_KEY=old\n");
	});

	it("empty input leaves the file exactly as it was", () => {
		const content = "# comment\nA=1\n\nCLERK_SECRET_KEY=old\n";
		const file = envFile(content);
		const result = run(file, "\n");
		expect(result.status).toBe(0);
		expect(result.stdout).toBe("");
		expect(readFileSync(file, "utf8")).toBe(content);
	});

	it("keeps comments and blank lines when it updates a key", () => {
		const file = envFile("# keys\nA=1\n\n# clerk\nCLERK_SECRET_KEY=old\n");
		expect(run(file, "CLERK_SECRET_KEY=new\n").status).toBe(0);
		expect(readFileSync(file, "utf8")).toBe(
			"# keys\nA=1\n\n# clerk\nCLERK_SECRET_KEY='new'\n",
		);
	});

	it("an empty value clears the key", () => {
		const file = envFile("CLERK_SECRET_KEY=sk_live\n");
		expect(run(file, "CLERK_SECRET_KEY=\n").status).toBe(0);
		expect(readFileSync(file, "utf8")).toBe("CLERK_SECRET_KEY=''\n");
	});

	it.skipIf(process.platform === "win32")("keeps the file mode 600", () => {
		const file = envFile("A=1\n");
		run(file, "CLERK_SECRET_KEY=sk_new\n");
		expect(statSync(file).mode & 0o777).toBe(0o600);
	});
});
