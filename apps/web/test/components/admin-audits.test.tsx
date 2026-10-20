import type { AdminAuditRow } from "@agentcheck/db";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminAudits, auditsHref } from "@/components/admin-audits";
import { chipClass, statusTone } from "@/components/ui";

const row = (overrides: Partial<AdminAuditRow>): AdminAuditRow => ({
	id: "a1",
	url: "https://example.com/a/very/long/path/that/gets/truncated",
	host: "example.com",
	mode: "quick",
	status: "done",
	score: 92,
	grade: "A",
	error: null,
	finishedAt: null,
	createdAt: new Date("2026-10-19T10:00:00Z"),
	userEmail: "user@example.com",
	...overrides,
});

describe("AdminAudits", () => {
	it("AdminAudits renders status chips and the filter menu trigger", () => {
		const rows = [
			row({}),
			row({ id: "a2", status: "failed", score: null, grade: null }),
		];
		const all = renderToStaticMarkup(<AdminAudits rows={rows} />);
		expect(all).toContain(chipClass(statusTone("done")));
		expect(all).toContain(chipClass(statusTone("failed")));
		expect(all).toContain("Status: all");
		expect(all).toContain("font-mono");
		expect(all).toContain("max-w-[28ch]");

		const failed = renderToStaticMarkup(
			<AdminAudits rows={rows.slice(1)} status="failed" />,
		);
		expect(failed).toContain("Status: failed");
	});

	it("adds the error column on the failed view only", () => {
		const failed = renderToStaticMarkup(
			<AdminAudits
				rows={[row({ status: "failed", error: "Audit timed out" })]}
				status="failed"
			/>,
		);
		expect(failed).toContain(">Error<");
		expect(failed).toContain("Audit timed out");
		expect(failed).toContain("Status: failed");
		const done = renderToStaticMarkup(<AdminAudits rows={[row({})]} />);
		expect(done).not.toContain(">Error<");
	});

	it("searches with a GET form that keeps the status and clears to the filter", () => {
		const html = renderToStaticMarkup(
			<AdminAudits rows={[]} status="failed" q="shop" />,
		);
		expect(html).toContain("<search");
		expect(html).toContain('action="/admin/audits"');
		expect(html).toContain('method="get"');
		expect(html).toContain('type="hidden" name="status" value="failed"');
		expect(html).toContain('name="q"');
		expect(html).toContain('value="shop"');
		expect(html).toMatch(
			/href="\/admin\/audits\?status=failed"[^>]*aria-label="Clear search"|aria-label="Clear search"[^>]*href="\/admin\/audits\?status=failed"/,
		);
		expect(html).toContain("No audits match this filter.");
		const plain = renderToStaticMarkup(<AdminAudits rows={[]} />);
		expect(plain).not.toContain('name="status"');
		expect(plain).not.toContain("Clear search");
	});

	it("keeps the search in the status filter links", () => {
		expect(auditsHref("done", "shop")).toBe("/admin/audits?status=done&q=shop");
		expect(auditsHref(undefined, "a b")).toBe("/admin/audits?q=a+b");
		expect(auditsHref()).toBe("/admin/audits");
	});
});
