import type { AuditResult } from "@agentcheck/core";
import { agentPrompt, type FixFiles, readme } from "@agentcheck/core/fixes";
import { strToU8, zipSync } from "fflate";

interface ZipAudit {
	url: string;
	reportUrl: string;
	result: AuditResult;
}

/** The download zip: the generated files plus README.md and AGENT-PROMPT.md. */
export function fixZip(files: FixFiles, audit: ZipAudit): Uint8Array {
	const entries: Record<string, Uint8Array> = {};
	for (const file of files.files) entries[file.name] = strToU8(file.content);
	entries["README.md"] = strToU8(readme(files, audit));
	entries["AGENT-PROMPT.md"] = strToU8(agentPrompt(files, audit));
	return zipSync(entries);
}
