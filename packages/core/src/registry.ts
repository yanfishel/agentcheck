import { accessibleNames } from "./checks/accessible-names.ts";
import { aiBotsAllowed } from "./checks/ai-bots-allowed.ts";
import { assetAccess } from "./checks/asset-access.ts";
import { canonical } from "./checks/canonical.ts";
import { captchaBlocking } from "./checks/captcha-blocking.ts";
import { clickTargets } from "./checks/click-targets.ts";
import { contentDensity } from "./checks/content-density.ts";
import { contentSignals } from "./checks/content-signals.ts";
import { headingHierarchy } from "./checks/heading-hierarchy.ts";
import { htmlLang } from "./checks/html-lang.ts";
import { llmsFullTxt } from "./checks/llms-full-txt.ts";
import { llmsTxt } from "./checks/llms-txt.ts";
import { llmsTxtFormat } from "./checks/llms-txt-format.ts";
import { llmsTxtLink } from "./checks/llms-txt-link.ts";
import { markdownNegotiation } from "./checks/markdown-negotiation.ts";
import { markdownTwin } from "./checks/markdown-twin.ts";
import { metaDescription } from "./checks/meta-description.ts";
import { noaiDirectives } from "./checks/noai-directives.ts";
import { opengraph } from "./checks/opengraph.ts";
import { overlayBlocking } from "./checks/overlay-blocking.ts";
import { sitemap } from "./checks/sitemap.ts";
import { snippetDirectives } from "./checks/snippet-directives.ts";
import { structuredData } from "./checks/structured-data.ts";
import type { Check } from "./types.ts";

export const CHECKS: Check[] = [
	aiBotsAllowed,
	noaiDirectives,
	assetAccess,
	contentSignals,
	sitemap,
	snippetDirectives,
	llmsTxt,
	llmsTxtFormat,
	llmsFullTxt,
	markdownTwin,
	llmsTxtLink,
	markdownNegotiation,
	headingHierarchy,
	structuredData,
	opengraph,
	contentDensity,
	canonical,
	metaDescription,
	htmlLang,
	accessibleNames,
	clickTargets,
	overlayBlocking,
	captchaBlocking,
];
