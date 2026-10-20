/**
 * Pure SVG drawing for the "AI Ready" badge: no database, no `server-only`, so
 * the landing can show a static preview. The SVG is built from numbers only.
 */
const LABEL = "AI Ready";
const LEFT_FILL = "#1b1420";
const RIGHT_FILL = "#6e2a5e";
const HEIGHT = 20;

function segmentWidth(text: string): number {
	return Math.round(6.5 * text.length + 10);
}

/** A two-segment SVG badge. It carries no host or URL, only the label and the score. */
export function renderBadge(input: { score: number; grade: string }): string {
	const value = `${input.score}/100`;
	const left = segmentWidth(LABEL);
	const right = segmentWidth(value);
	const width = left + right;
	const title = `${LABEL}: ${value}`;
	const text = (x: number, content: string) =>
		`<text x="${x}" y="14" fill="#fff" font-size="11" text-anchor="middle">${content}</text>`;
	return [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}" role="img" aria-label="${title}">`,
		`<title>${title}</title>`,
		`<g shape-rendering="crispEdges">`,
		`<rect width="${left}" height="${HEIGHT}" fill="${LEFT_FILL}"/>`,
		`<rect x="${left}" width="${right}" height="${HEIGHT}" fill="${RIGHT_FILL}"/>`,
		`</g>`,
		`<g font-family="Verdana,DejaVu Sans,sans-serif">`,
		text(left / 2, LABEL),
		text(left + right / 2, value),
		`</g>`,
		`</svg>`,
	].join("");
}
