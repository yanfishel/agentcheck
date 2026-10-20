import pkg from "../package.json" with { type: "json" };

/** The worker reports its own package version in audit results. */
export const WORKER_VERSION: string = pkg.version;
