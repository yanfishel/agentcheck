import "server-only";

type Env = Record<string, string | undefined>;

/** Returns the trimmed, format-checked ADMIN_EMAIL or throws; the app must not run without it. */
export function requireAdminEmail(env: Env = process.env): string {
	const value = env.ADMIN_EMAIL?.trim();
	if (!value) {
		throw new Error(
			"ADMIN_EMAIL is not set. Add ADMIN_EMAIL=<email> to apps/web/.env.local",
		);
	}
	const parts = value.split("@");
	if (parts.length !== 2 || !parts[0] || !parts[1] || /[\s,;]/.test(value)) {
		throw new Error("ADMIN_EMAIL must be a single email address");
	}
	return value;
}

export const IP_HASH_SECRET_MIN = 32;

const BASE_URL_RULE =
	"PUBLIC_BASE_URL must be an https origin such as https://agentcheck.dev";

/** Clerk keys only need to be present; their format is Clerk's business. */
const REQUIRED_CLERK = [
	"CLERK_SECRET_KEY",
	"NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
	"CLERK_WEBHOOK_SIGNING_SECRET",
] as const;

/** The https origin in PUBLIC_BASE_URL, or null when it is not one. */
function httpsOrigin(value: string): string | null {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return null;
	}
	const bare =
		url.protocol === "https:" &&
		!url.username &&
		!url.password &&
		url.pathname === "/" &&
		!url.search &&
		!url.hash;
	return bare ? url.origin : null;
}

/** The origin public links are built from, or null when PUBLIC_BASE_URL is unset or invalid. */
export function publicBaseUrl(env: Env = process.env): string | null {
	const value = env.PUBLIC_BASE_URL?.trim();
	return value ? httpsOrigin(value) : null;
}

/**
 * Every problem with the production configuration, one message per variable,
 * empty when it is complete. Messages name variables, never their values.
 */
export function productionEnvProblems(env: Env = process.env): string[] {
	const problems: string[] = [];
	try {
		requireAdminEmail(env);
	} catch (error) {
		problems.push((error as Error).message);
	}
	if (!env.DATABASE_URL?.trim()) problems.push("DATABASE_URL is not set");
	const secret = env.IP_HASH_SECRET ?? "";
	if (!secret) problems.push("IP_HASH_SECRET is not set");
	else if (secret.length < IP_HASH_SECRET_MIN) {
		problems.push(
			`IP_HASH_SECRET must be at least ${IP_HASH_SECRET_MIN} characters`,
		);
	}
	const base = env.PUBLIC_BASE_URL?.trim();
	if (!base) problems.push("PUBLIC_BASE_URL is not set");
	else if (!httpsOrigin(base)) problems.push(BASE_URL_RULE);
	for (const name of REQUIRED_CLERK) {
		if (!env[name]?.trim()) problems.push(`${name} is not set`);
	}
	return problems;
}

/** Fails the production server at start with every configuration problem listed. */
export function requireProductionEnv(env: Env = process.env): void {
	const problems = productionEnvProblems(env);
	if (problems.length > 0) {
		throw new Error(
			`Invalid production configuration:\n- ${problems.join("\n- ")}`,
		);
	}
}
