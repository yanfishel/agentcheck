import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AuditFailed } from "@/components/audit-failed";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@clerk/nextjs", () => ({
	useAuth: () => ({ isLoaded: true, isSignedIn: true }),
	useClerk: () => ({ openSignIn: vi.fn(), openSignUp: vi.fn() }),
}));

const AT = new Date(Date.UTC(2026, 9, 20, 12, 0));

const render = (canRerun: boolean) =>
	renderToStaticMarkup(
		<AuditFailed
			error="Could not reach https://nope.test/: getaddrinfo ENOTFOUND nope.test"
			url="https://nope.test/"
			mode="full"
			at={AT}
			canRerun={canRerun}
			now={AT.getTime() + 3_600_000}
		/>,
	);

describe("AuditFailed", () => {
	it("draws the report's band: failed ring, host, url, chips and the failed mark", () => {
		const html = render(true);
		expect(html).toContain("on-band");
		expect(html).toContain(">Failed<");
		expect(html).toContain("text-band-fail");
		expect(html).toMatch(/<h1[^>]*>nope\.test<\/h1>/);
		expect(html).toContain("https://nope.test/");
		expect(html).toContain("Full check");
		expect(html).toContain("1 hour ago");
		expect(html).toContain('dateTime="2026-10-20T12:00:00.000Z"');
		expect(html).toContain("ac--failed");
		expect(html).toContain('aria-label="Audit failed"');
	});

	it("shows the error as text and offers Run again and Try another URL", () => {
		const html = render(true);
		expect(html).toContain("The audit could not finish");
		expect(html).toContain("getaddrinfo ENOTFOUND nope.test");
		expect(html).toContain("Run again");
		expect(html).toContain('href="/"');
		expect(html).toContain("Try another URL");
	});

	it("leaves Run again out when the viewer cannot rerun", () => {
		const html = render(false);
		expect(html).not.toContain("Run again");
		expect(html).toContain("Try another URL");
	});
});
