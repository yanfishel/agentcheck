import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CheckNow } from "@/components/landing/check-now";

// The form is a client island; these stubs only let it render on the server.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@clerk/nextjs", () => ({
	useClerk: () => ({ openSignIn: vi.fn() }),
	useAuth: () => ({ isSignedIn: false }),
}));

describe("CheckNow", () => {
	it("closes the landing with its own heading and form id", () => {
		const html = renderToStaticMarkup(<CheckNow />);
		expect(html).toContain("Check your site now");
		expect(html).toContain('aria-labelledby="check-now-title"');
		expect(html).toContain('id="check-now"');
	});

	it("takes a report page's heading, line and form id", () => {
		const html = renderToStaticMarkup(
			<CheckNow
				id="check-yours"
				title="How ready is your site?"
				line="Your turn."
			/>,
		);
		expect(html).toContain("How ready is your site?");
		expect(html).toContain("Your turn.");
		expect(html).toContain('aria-labelledby="check-yours-title"');
		expect(html).toContain('id="check-yours-title"');
		expect(html).toContain('id="check-yours"');
		expect(html).not.toContain("Check your site now");
	});
});
