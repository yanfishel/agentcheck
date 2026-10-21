import { readFile } from "node:fs/promises";
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 } as const;

export type OgGrade = "A+" | "A" | "B" | "C" | "D" | "F";

const PLUM = "#6e2a5e";
const FONT = "Schibsted Grotesk";
const CELL = 64;
// Width left for the host line to the right of the 150px seal at 80px padding.
const HOST_SPACE = 890;

/**
 * The site's typeface, static instances (OFL, see OFL.txt). Each URL is a
 * literal: the bundler resolves `new URL()` statically, and a template string
 * here made both weights load the same file.
 */
const fonts = {
	500: () => readFile(new URL("./schibsted-grotesk-500.ttf", import.meta.url)),
	800: () => readFile(new URL("./schibsted-grotesk-800.ttf", import.meta.url)),
};

async function loadFonts() {
	return [
		{ name: FONT, data: await fonts[500](), weight: 500 as const },
		{ name: FONT, data: await fonts[800](), weight: 800 as const },
	];
}

function dataUri(svg: string): string {
	return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function gradeColor(grade: OgGrade): string {
	if (grade === "A+" || grade === "A") return "#4fd1b0";
	if (grade === "F") return "#ff3b30";
	return "#facc15";
}

/** The font size of the host line: 84px, shrinking so a long host fits on one line. */
export function hostFontSize(host: string): number {
	return Math.max(
		28,
		Math.min(84, Math.floor(HOST_SPACE / (0.6 * host.length))),
	);
}

/** The favicon's mark, drawn white; its own style would recolour it. */
async function markUri(): Promise<string> {
	const svg = (await readFile(new URL("../icon.svg", import.meta.url), "utf8"))
		.replace(/<style>[\s\S]*?<\/style>/, "")
		.replace("<svg", '<svg color="#ffffff"');
	return dataUri(svg);
}

/** The grade inside the brand frame, the spark in the corner (as GradeMark). */
function gradeMark(grade: OgGrade): string {
	const color = gradeColor(grade);
	const fontSize = grade.length > 1 ? 34 : 44;
	return dataUri(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="none" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path stroke="${color}" d="M52 22H29Q16 22 16 35V71Q16 84 29 84H65Q78 84 78 71V48"/><path stroke="#fff" d="M78 6Q80.5 19.5 94 22Q80.5 24.5 78 38Q75.5 24.5 62 22Q75.5 19.5 78 6Z"/></g><text x="47" y="66" text-anchor="middle" font-size="${fontSize}" font-weight="800" font-family="${FONT}, Arial" fill="${color}">${grade}</text></svg>`,
	);
}

/** The score ring like the band's gauge. */
function ring(score: number, grade: OgGrade): string {
	const r = 44;
	const length = 2 * Math.PI * r;
	return dataUri(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="${r}" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="7"/><circle cx="50" cy="50" r="${r}" fill="none" stroke="${gradeColor(grade)}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(length * score) / 100} ${length}" transform="rotate(-90 50 50)"/></svg>`,
	);
}

/** The hero's line grid: centred columns, an elliptic fade, a few lit cells. */
function gridOf(cell: number): string {
	const { width, height } = OG_SIZE;
	const x0 = width / 2 - cell / 2;
	let lines = "";
	for (let x = x0 % cell; x <= width; x += cell) {
		lines += `<path d="M${x + 0.5} 0V${height}"/>`;
	}
	for (let y = 0; y <= height; y += cell) {
		lines += `<path d="M0 ${y + 0.5}H${width}"/>`;
	}
	const lit = (cx: number, cy: number) =>
		`<rect x="${(x0 % cell) + cx * cell + 1}" y="${cy * cell + 1}" width="${cell - 1}" height="${cell - 1}"/>`;
	return dataUri(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><radialGradient id="f" cx="50%" cy="45%" r="50%" gradientTransform="translate(.5 .45) scale(1.2 1.4) translate(-.5 -.45)"><stop offset=".2" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><mask id="m"><rect width="${width}" height="${height}" fill="url(#f)"/></mask></defs><g mask="url(#m)"><g stroke="rgba(255,255,255,.09)" stroke-width="1">${lines}</g><g fill="rgba(255,255,255,.07)">${lit(17, 3)}${lit(9, 9)}${lit(21, 11)}</g></g></svg>`,
	);
}

const GRID = gridOf(CELL);

/** The plum page with the grid under a padded column of three rows. */
function Page(props: { children: React.ReactNode }) {
	return (
		<div
			style={{
				background: PLUM,
				backgroundImage:
					"radial-gradient(circle at 80% 20%, rgba(255,255,255,0.16), transparent 55%), radial-gradient(circle at 12% 95%, rgba(40,10,35,0.45), transparent 50%)",
				width: "100%",
				height: "100%",
				display: "flex",
				position: "relative",
				color: "#ffffff",
				fontFamily: FONT,
			}}
		>
			{/* biome-ignore lint/performance/noImgElement: ImageResponse renders plain img only. */}
			<img
				src={GRID}
				width={OG_SIZE.width}
				height={OG_SIZE.height}
				alt=""
				style={{ position: "absolute", top: 0, left: 0 }}
			/>
			<div
				style={{
					position: "relative",
					width: "100%",
					height: "100%",
					display: "flex",
					flexDirection: "column",
					justifyContent: "space-between",
					padding: "56px 80px 60px",
				}}
			>
				{props.children}
			</div>
		</div>
	);
}

/** The logo row; the mark's frame starts 12.5% into its box, so the row is pulled left by 8px. */
function Brand(props: { mark: string }) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 16,
				marginLeft: -8,
			}}
		>
			{/* biome-ignore lint/performance/noImgElement: ImageResponse renders plain img only. */}
			<img src={props.mark} width={64} height={64} alt="" />
			<div style={{ display: "flex", fontSize: 40, letterSpacing: -1 }}>
				Agent<span style={{ fontWeight: 800 }}>Check</span>
			</div>
		</div>
	);
}

function ScoreRing(props: { score: number; grade: OgGrade }) {
	const size = 230;
	return (
		<div
			style={{
				display: "flex",
				position: "relative",
				width: size,
				height: size,
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			{/* biome-ignore lint/performance/noImgElement: ImageResponse renders plain img only. */}
			<img
				src={ring(props.score, props.grade)}
				width={size}
				height={size}
				alt=""
				style={{ position: "absolute", top: 0, left: 0 }}
			/>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
				}}
			>
				<div
					style={{
						fontSize: 84,
						fontWeight: 800,
						letterSpacing: -4,
						lineHeight: 1,
					}}
				>
					{String(props.score)}
				</div>
				<div style={{ fontSize: 84 * 0.27, opacity: 0.8 }}>out of 100</div>
			</div>
		</div>
	);
}

function ReportPicture(props: {
	host: string;
	score: number;
	grade: OgGrade;
	mark: string;
}) {
	return (
		<Page>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "flex-start",
				}}
			>
				<Brand mark={props.mark} />
				<ScoreRing score={props.score} grade={props.grade} />
			</div>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 18,
					marginLeft: -19,
				}}
			>
				{/* biome-ignore lint/performance/noImgElement: ImageResponse renders plain img only. */}
				<img src={gradeMark(props.grade)} width={150} height={150} alt="" />
				<div style={{ display: "flex", flexDirection: "column" }}>
					<div style={{ fontSize: 30, opacity: 0.8 }}>AI readiness of</div>
					<div
						style={{
							display: "flex",
							whiteSpace: "nowrap",
							fontSize: hostFontSize(props.host),
							fontWeight: 800,
							letterSpacing: -2,
							lineHeight: 1.05,
						}}
					>
						{props.host}
					</div>
				</div>
			</div>
			<div style={{ display: "flex", fontSize: 30, opacity: 0.9 }}>
				Is your site ready for AI agents? Check it at agentcheck.dev
			</div>
		</Page>
	);
}

function SitePicture(props: { mark: string }) {
	return (
		<Page>
			<Brand mark={props.mark} />
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					fontSize: 88,
					fontWeight: 800,
					lineHeight: 1.05,
					letterSpacing: -3,
				}}
			>
				<div style={{ display: "flex" }}>Is your site ready</div>
				<div style={{ display: "flex" }}>for AI agents?</div>
			</div>
			<div style={{ display: "flex", fontSize: 32, opacity: 0.85 }}>
				agentcheck.dev
			</div>
		</Page>
	);
}

/** The picture a shared report shows in chats and feeds, as PNG bytes. */
export async function drawReportOg(input: {
	host: string;
	score: number;
	grade: OgGrade;
}): Promise<Uint8Array> {
	const response = new ImageResponse(
		<ReportPicture {...input} mark={await markUri()} />,
		{ ...OG_SIZE, fonts: await loadFonts() },
	);
	return new Uint8Array(await response.arrayBuffer());
}

/** The picture a link to agentcheck.dev shows: the landing's question on the plum grid. */
export async function drawSiteOg(): Promise<ImageResponse> {
	return new ImageResponse(<SitePicture mark={await markUri()} />, {
		...OG_SIZE,
		fonts: await loadFonts(),
	});
}
