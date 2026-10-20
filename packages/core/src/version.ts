import pkg from "../package.json" with { type: "json" };

export const VERSION: string = pkg.version;

export const HOMEPAGE: string | undefined = (pkg as { homepage?: string })
	.homepage;

/** Builds the default User-Agent; `version` is the running tool's version (defaults to the core package version). */
export function defaultUserAgent(version: string = VERSION): string {
	return HOMEPAGE
		? `AgentCheck/${version} (+${HOMEPAGE})`
		: `AgentCheck/${version}`;
}
