import { type LookupAddress, type LookupOptions, promises } from "node:dns";
import { blockedMessage, isBlockedAddress } from "./policy.ts";

export type Resolve = (
	hostname: string,
) => Promise<Array<{ address: string; family: 4 | 6 }>>;

/** Signature of a `dns.lookup`-compatible function, as accepted by `net.connect`. */
export type LookupFunction = (
	hostname: string,
	options: LookupOptions,
	callback: (
		err: NodeJS.ErrnoException | null,
		address: string | LookupAddress[],
		family?: number,
	) => void,
) => void;

export const defaultResolve: Resolve = async (hostname) => {
	const found = await promises.lookup(hostname, { all: true, verbatim: true });
	return found.map((a) => ({ address: a.address, family: a.family as 4 | 6 }));
};

function wantedFamily(family: LookupOptions["family"]): 4 | 6 | 0 {
	if (family === 4 || family === "IPv4") return 4;
	if (family === 6 || family === "IPv6") return 6;
	return 0;
}

/**
 * Builds a lookup that resolves a host, drops blocked addresses and only ever
 * hands back vetted ones. Honours `options.all` and `options.family`.
 */
export function createGuardedLookup(
	resolve: Resolve = defaultResolve,
): LookupFunction {
	return (hostname, options, callback) => {
		const opts: LookupOptions =
			typeof options === "object" && options !== null ? options : {};
		const family = wantedFamily(opts.family);
		resolve(hostname).then(
			(found) => {
				const allowed = found.filter(
					(a) =>
						(family === 0 || a.family === family) &&
						!isBlockedAddress(a.address),
				);
				const first = allowed[0];
				if (!first) {
					callback(
						new Error(
							blockedMessage(`no allowed address for ${hostname}`),
						) as NodeJS.ErrnoException,
						[],
					);
					return;
				}
				if (opts.all) {
					callback(
						null,
						allowed.map((a) => ({ address: a.address, family: a.family })),
					);
				} else {
					callback(null, first.address, first.family);
				}
			},
			(err: unknown) => {
				callback(
					(err instanceof Error
						? err
						: new Error(String(err))) as NodeJS.ErrnoException,
					[],
				);
			},
		);
	};
}
