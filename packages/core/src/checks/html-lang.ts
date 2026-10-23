import type { Check } from "../types.ts";

/** A well-formed BCP 47 tag (`en`, `pt-BR`, `zh-Hant`), per Intl. */
export function isLanguageTag(tag: string): boolean {
	try {
		return Intl.getCanonicalLocales(tag).length === 1;
	} catch {
		return false;
	}
}

export const htmlLang: Check = {
	id: "html-lang",
	category: "content-semantics",
	title: "Page language declared",
	weight: 10,
	async run(ctx) {
		const lang = ctx.$("html").first().attr("lang")?.trim() ?? "";
		const remediation =
			'Set the page language on the root element, e.g. <html lang="en">.';
		if (!lang) {
			return {
				status: "fail",
				message: "The <html> element has no lang attribute",
				remediation,
			};
		}
		if (!isLanguageTag(lang)) {
			return {
				status: "warn",
				message: `The lang attribute is not a valid language tag: ${lang.slice(0, 50)}`,
				remediation,
			};
		}
		return { status: "pass", message: `Page language: ${lang}` };
	},
};
