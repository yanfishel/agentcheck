import { ANONYMOUS_RETENTION_DAYS } from "@agentcheck/db";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";
import { LEGAL } from "@/content/legal";

describe("legal pages", () => {
	it("states the retention the database actually applies", () => {
		expect(LEGAL.anonymousRetentionDays).toBe(ANONYMOUS_RETENTION_DAYS);
		const html = renderToStaticMarkup(<PrivacyPage />);
		expect(html).toContain(
			`deleted automatically after ${ANONYMOUS_RETENTION_DAYS} days`,
		);
	});

	it("privacy states how long backups keep data", () => {
		const html = renderToStaticMarkup(<PrivacyPage />);
		expect(html).toContain(
			`Backups of the server are kept for up to ${LEGAL.backupRetentionWeeks} weeks`,
		);
	});

	it("privacy mentions the stored screenshot", () => {
		const html = renderToStaticMarkup(<PrivacyPage />);
		expect(html).toContain("screenshot of the first screen");
		expect(html).toContain("deleted together with their audit");
	});

	it("privacy mentions the stored site icon", () => {
		const html = renderToStaticMarkup(<PrivacyPage />);
		expect(html).toContain("icon (favicon)");
		expect(html).toContain("site icons are kept and");
	});

	it("names the operator, the contact and the open-source scope in both", () => {
		for (const html of [
			renderToStaticMarkup(<PrivacyPage />),
			renderToStaticMarkup(<TermsPage />),
		]) {
			expect(html).toContain(LEGAL.operator);
			expect(html).toContain(LEGAL.email);
			expect(html).toContain(LEGAL.repo);
			expect(html).toContain(`Last updated ${LEGAL.updated}`);
		}
		expect(renderToStaticMarkup(<TermsPage />)).toContain(
			`laws of ${LEGAL.country}`,
		);
	});
});
