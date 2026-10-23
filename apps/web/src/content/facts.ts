import { CHECKS, PROTOCOLS, SERVICE_CRAWL } from "@agentcheck/core";
import { CATEGORIES } from "@agentcheck/core/scoring";

/**
 * What AgentCheck does, in numbers taken from the engine, so the landing and
 * /checks never drift from the code. Facts about ourselves only: no
 * comparisons with other tools.
 */
export const FACTS = {
	checks: CHECKS.length,
	categories: CATEGORIES.length,
	protocols: PROTOCOLS.length,
	pages: SERVICE_CRAWL.limit,
} as const;

export const FACTS_LINE = `${FACTS.checks} checks in ${FACTS.categories} categories, each based on a published standard. A full check also opens the page in a real browser and covers up to ${FACTS.pages} pages of the site; every report looks for ${FACTS.protocols} agent protocols, and the fix files come from your own pages.`;
