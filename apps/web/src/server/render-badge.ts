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
	// Each label is drawn twice: a faint shadow 1px lower, then the white text.
	const text = (x: number, content: string) =>
		`<text x="${x}" y="15" fill="#010101" fill-opacity=".3">${content}</text>` +
		`<text x="${x}" y="14">${content}</text>`;
	// The shields.io "flat" look, so the badge sits well next to the usual ones:
	// corners rounded by 3px and a faint top-to-bottom sheen.
	return [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}" role="img" aria-label="${title}">`,
		`<title>${title}</title>`,
		`<linearGradient id="agentcheck-badge-s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>`,
		`<clipPath id="agentcheck-badge-r"><rect width="${width}" height="${HEIGHT}" rx="3" fill="#fff"/></clipPath>`,
		`<g clip-path="url(#agentcheck-badge-r)">`,
		`<rect width="${left}" height="${HEIGHT}" fill="${LEFT_FILL}"/>`,
		`<rect x="${left}" width="${right}" height="${HEIGHT}" fill="${RIGHT_FILL}"/>`,
		`<rect width="${width}" height="${HEIGHT}" fill="url(#agentcheck-badge-s)"/>`,
		`</g>`,
		`<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">`,
		text(left / 2, LABEL),
		text(left + right / 2, value),
		`</g>`,
		`</svg>`,
	].join("");
}
