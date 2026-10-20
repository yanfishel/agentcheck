import { accessibleNames } from "./checks/accessible-names.ts";
import { aiBotsAllowed } from "./checks/ai-bots-allowed.ts";
import { assetAccess } from "./checks/asset-access.ts";
import { captchaBlocking } from "./checks/captcha-blocking.ts";
import { clickTargets } from "./checks/click-targets.ts";
import { contentDensity } from "./checks/content-density.ts";
import { headingHierarchy } from "./checks/heading-hierarchy.ts";
import { llmsFullTxt } from "./checks/llms-full-txt.ts";
import { llmsTxt } from "./checks/llms-txt.ts";
import { llmsTxtFormat } from "./checks/llms-txt-format.ts";
import { markdownTwin } from "./checks/markdown-twin.ts";
import { noaiDirectives } from "./checks/noai-directives.ts";
import { opengraph } from "./checks/opengraph.ts";
import { overlayBlocking } from "./checks/overlay-blocking.ts";
import { structuredData } from "./checks/structured-data.ts";
import type { Check } from "./types.ts";

export const CHECKS: Check[] = [
	aiBotsAllowed,
	noaiDirectives,
	assetAccess,
	llmsTxt,
	llmsTxtFormat,
	llmsFullTxt,
	markdownTwin,
	headingHierarchy,
	structuredData,
	opengraph,
	contentDensity,
	accessibleNames,
	clickTargets,
	overlayBlocking,
	captchaBlocking,
];
