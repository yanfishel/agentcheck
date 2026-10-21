import { drawSiteOg, OG_SIZE } from "./_og/draw";

// The picture a link to agentcheck.dev shows in chats and feeds: the landing's
// question on the plum grid, built once at build time.
export const alt = "AgentCheck: is your site ready for AI agents?";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OpengraphImage() {
	return drawSiteOg();
}
