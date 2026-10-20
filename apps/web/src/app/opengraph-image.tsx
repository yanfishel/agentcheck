import { readFile } from "node:fs/promises";
import { ImageResponse } from "next/og";
import { SITE } from "../content/site";

// The picture a link to agentcheck.dev shows in chats and feeds: the mark and
// the landing's question on the plum, built once at build time.
export const alt = "AgentCheck: is your site ready for AI agents?";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The site's typeface, static instances (OFL, see _og/OFL.txt). Each URL is a
 * literal: the bundler resolves `new URL()` statically, and a template string
 * here made both weights load the same file.
 */
const fonts = {
	500: () =>
		readFile(new URL("./_og/schibsted-grotesk-500.ttf", import.meta.url)),
	800: () =>
		readFile(new URL("./_og/schibsted-grotesk-800.ttf", import.meta.url)),
};

export default async function OpengraphImage() {
	// The favicon's mark, drawn white; its own style would recolour it.
	const svg = (await readFile(new URL("./icon.svg", import.meta.url), "utf8"))
		.replace(/<style>[\s\S]*?<\/style>/, "")
		.replace("<svg", '<svg color="#ffffff"');
	const mark = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				padding: "72px 80px",
				background: "#6e2a5e",
				backgroundImage:
					"radial-gradient(circle at 80% 20%, rgba(255,255,255,0.16), transparent 55%)",
				color: "#ffffff",
				fontFamily: "Schibsted Grotesk",
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: 24 }}>
				{/* biome-ignore lint/performance/noImgElement: ImageResponse renders plain img only. */}
				<img src={mark} width={96} height={96} alt="" />
				<div style={{ display: "flex", fontSize: 48, letterSpacing: -1 }}>
					Agent<span style={{ fontWeight: 800 }}>Check</span>
				</div>
			</div>
			<div
				style={{
					display: "flex",
					fontSize: 88,
					fontWeight: 800,
					lineHeight: 1.05,
					letterSpacing: -3,
					maxWidth: 880,
				}}
			>
				Is your site ready for AI agents?
			</div>
			<div style={{ display: "flex", fontSize: 32, opacity: 0.85 }}>
				{new URL(SITE.url).host}
			</div>
		</div>,
		{
			...size,
			fonts: [
				{ name: "Schibsted Grotesk", data: await fonts[500](), weight: 500 },
				{ name: "Schibsted Grotesk", data: await fonts[800](), weight: 800 },
			],
		},
	);
}
