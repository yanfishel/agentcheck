import { robotsTxt } from "../../content/robots";

// Next's robots.ts metadata route cannot write a Content-Signal line.
export const dynamic = "force-static";

export function GET() {
	return new Response(robotsTxt(), {
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
}
