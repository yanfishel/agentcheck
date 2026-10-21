// Throwaway spike: OG image variants for a shared report, drawn by next/og.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const repo = "D:/Work/Sites/agent-probe";
const require = createRequire(`${repo}/apps/web/package.json`);
const React = require("react");
const { ImageResponse } = await import(
	"file:///" + require.resolve("next/dist/compiled/@vercel/og/index.node.js").replace(/\\/g, "/")
);
const h = React.createElement;
const out = process.argv[2];

const font = (w) => readFileSync(`${repo}/apps/web/src/app/_og/schibsted-grotesk-${w}.ttf`);
const fonts = [
	{ name: "S", data: font(500), weight: 500 },
	{ name: "S", data: font(800), weight: 800 },
];
const shot = `data:image/png;base64,${readFileSync(`${repo}/.playwright-mcp/atarcms.png`).toString("base64")}`;
const uri = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
const PLUM = "#6e2a5e";
const color = (g) => (g === "A+" || g === "A" ? "#4fd1b0" : g === "F" ? "#ff3b30" : "#facc15");

const markSvg = (c = "#fff") =>
	readFileSync(`${repo}/apps/web/src/app/icon.svg`, "utf8")
		.replace(/<style>[\s\S]*?<\/style>/, "")
		.replace("<svg", `<svg color="${c}"`);

// The grade inside the brand frame, spark in the corner (as GradeMark).
const gradeMark = (g) => {
	const c = color(g);
	const fs = g.length > 1 ? 34 : 44;
	return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="none" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path stroke="${c}" d="M52 22H29Q16 22 16 35V71Q16 84 29 84H65Q78 84 78 71V48"/><path stroke="#fff" d="M78 6Q80.5 19.5 94 22Q80.5 24.5 78 38Q75.5 24.5 62 22Q75.5 19.5 78 6Z"/></g><text x="47" y="66" text-anchor="middle" font-size="${fs}" font-weight="800" font-family="Arial" fill="${c}">${g}</text></svg>`);
};
// The score ring like the band's gauge.
const ring = (score, g) => {
	const r = 44, len = 2 * Math.PI * r;
	return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="${r}" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="7"/><circle cx="50" cy="50" r="${r}" fill="none" stroke="${color(g)}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(len * score) / 100} ${len}" transform="rotate(-90 50 50)"/></svg>`);
};

const brand = (size = 40, c = "#fff") =>
	h("div", { style: { display: "flex", alignItems: "center", gap: size * 0.4 } },
		h("img", { src: uri(markSvg(c)), width: size * 1.6, height: size * 1.6 }),
		h("div", { style: { display: "flex", fontSize: size, letterSpacing: -1, color: c } }, "Agent", h("span", { style: { fontWeight: 800 } }, "Check")));

const bg = {
	background: PLUM,
	backgroundImage: "radial-gradient(circle at 80% 20%, rgba(255,255,255,0.16), transparent 55%)",
};

// A: the site's OG look; host big, score ring with the grade on the right.
const A = ({ host, score, grade }) =>
	h("div", { style: { ...bg, width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 80px", color: "#fff", fontFamily: "S" } },
		brand(40),
		h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
			h("div", { style: { display: "flex", flexDirection: "column", maxWidth: 620 } },
				h("div", { style: { fontSize: 30, opacity: 0.8 } }, "AI readiness of"),
				h("div", { style: { fontSize: 76, fontWeight: 800, letterSpacing: -2, lineHeight: 1.05 } }, host)),
			h("div", { style: { display: "flex", position: "relative", width: 300, height: 300, alignItems: "center", justifyContent: "center" } },
				h("img", { src: ring(score, grade), width: 300, height: 300, style: { position: "absolute", top: 0, left: 0 } }),
				h("div", { style: { display: "flex", flexDirection: "column", alignItems: "center" } },
					h("div", { style: { fontSize: 112, fontWeight: 800, letterSpacing: -4, lineHeight: 1 } }, String(score)),
					h("div", { style: { fontSize: 28, opacity: 0.8 } }, "out of 100")),
				h("img", { src: gradeMark(grade), width: 110, height: 110, style: { position: "absolute", right: -30, bottom: -20 } }))),
		h("div", { style: { display: "flex", fontSize: 30, opacity: 0.9 } }, "Is your site ready for AI agents? Check it at agentcheck.dev"));

// B: plum left with the numbers, the site's first screen on the right.
const B = ({ host, score, grade }) =>
	h("div", { style: { ...bg, width: "100%", height: "100%", display: "flex", color: "#fff", fontFamily: "S" } },
		h("div", { style: { display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "60px 0 60px 72px", width: 560 } },
			brand(36),
			h("div", { style: { display: "flex", flexDirection: "column" } },
				h("div", { style: { fontSize: 44, fontWeight: 800, letterSpacing: -1 } }, host),
				h("div", { style: { display: "flex", alignItems: "flex-end", gap: 20, marginTop: 8 } },
					h("div", { style: { display: "flex", alignItems: "baseline" } },
						h("div", { style: { fontSize: 168, fontWeight: 800, letterSpacing: -6, lineHeight: 1, color: color(grade) } }, String(score)),
						h("div", { style: { fontSize: 44, opacity: 0.7, marginLeft: 6 } }, "/100")),
					h("img", { src: gradeMark(grade), width: 120, height: 120, style: { marginBottom: 10 } })),
				h("div", { style: { fontSize: 28, opacity: 0.8, marginTop: 4 } }, "AI readiness score")),
			h("div", { style: { display: "flex", fontSize: 28, opacity: 0.9 } }, "Check your site → agentcheck.dev")),
		h("div", { style: { display: "flex", flex: 1, alignItems: "center", paddingLeft: 24 } },
			h("img", { src: shot, width: 760, height: 475, style: { borderRadius: 18, boxShadow: "0 30px 60px rgba(0,0,0,.45)", border: "6px solid rgba(255,255,255,.9)" } })));

// C: the site's screenshot fills the card under a plum veil, a centred seal.
const C = ({ host, score, grade }) =>
	h("div", { style: { width: "100%", height: "100%", display: "flex", position: "relative", color: "#fff", fontFamily: "S" } },
		h("img", { src: shot, width: 1200, height: 750, style: { position: "absolute", top: 0, left: 0 } }),
		h("div", { style: { position: "absolute", top: 0, left: 0, width: 1200, height: 630, display: "flex", background: "linear-gradient(90deg, rgba(110,42,94,.97) 0%, rgba(110,42,94,.92) 55%, rgba(110,42,94,.55) 100%)" } }),
		h("div", { style: { position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 80px", width: "100%" } },
			brand(36),
			h("div", { style: { display: "flex", alignItems: "center", gap: 48 } },
				h("img", { src: gradeMark(grade), width: 230, height: 230 }),
				h("div", { style: { display: "flex", flexDirection: "column" } },
					h("div", { style: { fontSize: 64, fontWeight: 800, letterSpacing: -2 } }, host),
					h("div", { style: { display: "flex", alignItems: "baseline", fontSize: 40, opacity: 0.9 } },
						"AI readiness ",
						h("span", { style: { fontWeight: 800, fontSize: 64, marginLeft: 14, color: color(grade) } }, String(score)),
						h("span", { style: { marginLeft: 4 } }, "/100")))),
			h("div", { style: { display: "flex", fontSize: 30, opacity: 0.9 } }, "Is your site ready for AI agents? agentcheck.dev")));


const ringBox = (score, grade, size, inner) =>
	h("div", { style: { display: "flex", position: "relative", width: size, height: size, alignItems: "center", justifyContent: "center" } },
		h("img", { src: ring(score, grade), width: size, height: size, style: { position: "absolute", top: 0, left: 0 } }),
		inner);
const scoreText = (score, size) =>
	h("div", { style: { display: "flex", flexDirection: "column", alignItems: "center" } },
		h("div", { style: { fontSize: size, fontWeight: 800, letterSpacing: -4, lineHeight: 1 } }, String(score)),
		h("div", { style: { fontSize: size * 0.27, opacity: 0.8 } }, "out of 100"));
const page = (top, middle, bottom) =>
	h("div", { style: { ...bg, width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "56px 80px 60px", color: "#fff", fontFamily: "S" } }, top, middle, bottom);
const topRow = (right) => h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" } }, brand(40), right);
const cta = (right) => h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-end" } }, h("div", { style: { display: "flex", fontSize: 30, opacity: 0.9 } }, "Is your site ready for AI agents? Check it at agentcheck.dev"), right || null);
const hostBlock = (host) => h("div", { style: { display: "flex", flexDirection: "column" } },
	h("div", { style: { fontSize: 30, opacity: 0.8 } }, "AI readiness of"),
	h("div", { style: { fontSize: 84, fontWeight: 800, letterSpacing: -2, lineHeight: 1.05 } }, host));

// A1: the seal stands before the domain.
const A1 = ({ host, score, grade }) => page(
	topRow(ringBox(score, grade, 230, scoreText(score, 84))),
	h("div", { style: { display: "flex", alignItems: "center", gap: 36 } }, h("img", { src: gradeMark(grade), width: 150, height: 150 }), hostBlock(host)),
	cta());
// A2: the grade sits inside the ring, under the score.
const A2 = ({ host, score, grade }) => page(
	topRow(ringBox(score, grade, 250, h("div", { style: { display: "flex", flexDirection: "column", alignItems: "center" } },
		h("div", { style: { fontSize: 92, fontWeight: 800, letterSpacing: -4, lineHeight: 1 } }, String(score)),
		h("img", { src: gradeMark(grade), width: 70, height: 70, style: { marginTop: 4 } })))),
	hostBlock(host),
	cta());
// A3: the seal at the bottom right, on the line with the call.
const A3 = ({ host, score, grade }) => page(
	topRow(ringBox(score, grade, 230, scoreText(score, 84))),
	hostBlock(host),
	cta(h("img", { src: gradeMark(grade), width: 120, height: 120, style: { marginBottom: -12, marginRight: -12 } })));


// The hero's line grid: 44px cells, centred columns, an elliptic fade; a few lit cells.
const gridOf = (S) => {
	const W = 1200, H = 630, x0 = W / 2 - S / 2;
	let lines = "";
	for (let x = x0 % S; x <= W; x += S) lines += `<path d="M${x + 0.5} 0V${H}"/>`;
	for (let y = 0; y <= H; y += S) lines += `<path d="M0 ${y + 0.5}H${W}"/>`;
	const cell = (cx, cy) => `<rect x="${x0 % S + cx * S + 1}" y="${cy * S + 1}" width="${S - 1}" height="${S - 1}"/>`;
	return uri(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><radialGradient id="f" cx="50%" cy="45%" r="50%" gradientTransform="translate(.5 .45) scale(1.2 1.4) translate(-.5 -.45)"><stop offset=".2" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><mask id="m"><rect width="${W}" height="${H}" fill="url(#f)"/></mask></defs><g mask="url(#m)"><g stroke="rgba(255,255,255,.09)" stroke-width="1">${lines}</g><g fill="rgba(255,255,255,.07)">${cell(17, 3)}${cell(9, 9)}${cell(21, 11)}</g></g></svg>`);
};
let gridSvg = gridOf(44);
const glow = {
	background: PLUM,
	backgroundImage: "radial-gradient(circle at 80% 20%, rgba(255,255,255,0.16), transparent 55%), radial-gradient(circle at 12% 95%, rgba(40,10,35,0.45), transparent 50%)",
};
const page2 = (grid, top, middle, bottom) =>
	h("div", { style: { ...glow, width: "100%", height: "100%", display: "flex", position: "relative", color: "#fff", fontFamily: "S" } },
		grid ? h("img", { src: gridSvg, width: 1200, height: 630, style: { position: "absolute", top: 0, left: 0 } }) : null,
		h("div", { style: { position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "56px 80px 60px" } }, top, middle, bottom));
// The mark's frame starts 12.5% into its box (x 16 minus half the 7px stroke): pull boxes left by that.
const brandL = () => h("div", { style: { display: "flex", alignItems: "center", gap: 16, marginLeft: -8 } },
	h("img", { src: uri(markSvg()), width: 64, height: 64 }),
	h("div", { style: { display: "flex", fontSize: 40, letterSpacing: -1 } }, "Agent", h("span", { style: { fontWeight: 800 } }, "Check")));
const A1b = (grid) => ({ host, score, grade }) => page2(grid,
	h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" } }, brandL(), ringBox(score, grade, 230, scoreText(score, 84))),
	h("div", { style: { display: "flex", alignItems: "center", gap: 18, marginLeft: -19 } }, h("img", { src: gradeMark(grade), width: 150, height: 150 }), hostBlock(host)),
	cta());


// The site's own OG picture (app/opengraph-image.tsx) with the grid under it.
const site = () => page2(true,
	brandL(),
	h("div", { style: { display: "flex", fontSize: 88, fontWeight: 800, lineHeight: 1.05, letterSpacing: -3, flexDirection: "column" } }, h("div", { style: { display: "flex" } }, "Is your site ready"), h("div", { style: { display: "flex" } }, "for AI agents?")),
	h("div", { style: { display: "flex", fontSize: 32, opacity: 0.85 } }, "agentcheck.dev"));
const cases = {};
const data = [
	{ host: "atarcms.com", score: 100, grade: "A+" },
	{ host: "example-shop.com", score: 58, grade: "D" },
];
for (const [name, fn] of Object.entries(cases)) {
	for (const d of data) {
		const res = new ImageResponse(fn(d), { width: 1200, height: 630, fonts });
		writeFileSync(`${out}/${name}-${d.score}.png`, Buffer.from(await res.arrayBuffer()));
	}
}
const runs = [];
for (const S of [64]) {
	runs.push([`A1-grid${S}`, S, A1b(true)]);
	runs.push([`site-grid${S}`, S, site]);
}
for (const [name, S, fn] of runs) {
	gridSvg = gridOf(S);
	for (const d of name.startsWith("site") ? [data[0]] : data) {
		const res = new ImageResponse(fn(d), { width: 1200, height: 630, fonts });
		writeFileSync(`${out}/${name}-${d.score}.png`, Buffer.from(await res.arrayBuffer()));
	}
}
console.log("ok");
