import type { AuditResult } from "@agentcheck/core";
import data from "./example-audit.json";

/** A saved real audit of a reference site (scripts/capture-example.ts); not live data. */
export const exampleAudit = data as AuditResult;
