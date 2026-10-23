import type {
	CdpLike,
	Collect,
	CollectedData,
	PageLike,
} from "./playwright-types.ts";
import type {
	CaptchaInfo,
	ElementInfo,
	InteractiveNode,
	OverlayInfo,
} from "./types.ts";

const INTERACTIVE_ROLES = new Set([
	"button",
	"link",
	"textbox",
	"searchbox",
	"combobox",
	"checkbox",
	"radio",
	"menuitem",
	"tab",
	"switch",
	"slider",
	"spinbutton",
	"listbox",
	"option",
]);

/** Upper bound on CDP round trips spent describing unnamed nodes. */
const MAX_DESCRIBED = 200;

/** The rendered DOM kept for static-content at most (characters). */
export const RENDERED_HTML_MAX = 5_000_000;

interface AxNode {
	ignored?: boolean;
	role?: { value?: unknown };
	name?: { value?: unknown };
	backendDOMNodeId?: number;
}

interface PageData {
	clickTraps: ElementInfo[];
	overlays: OverlayInfo[];
	captcha: CaptchaInfo;
}

/**
 * Runs inside the page as plain JavaScript. It is a string (not a function)
 * so the project does not need the DOM lib and the bundler cannot rewrite it.
 * The describe function is deliberately duplicated in DESCRIBE_FN below, which
 * runs on a single CDP-resolved node.
 */
const MEASURE_SCRIPT = String.raw`(() => {
	const describe = (el) => {
		const cls = [...el.classList].slice(0, 2);
		let out = "<" + el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + cls.map((c) => "." + c).join("") + ">";
		const href = el.tagName === "A" ? el.getAttribute("href") : null;
		if (href) {
			out += ' href="' + href.slice(0, 40) + '"';
		} else {
			const text = (el.textContent || "").replace(/\s+/g, " ").trim();
			if (text) out += ' "' + text.slice(0, 30) + '"';
		}
		return out.slice(0, 100);
	};

	const parentOf = (el) => el.parentElement || (el.parentNode && el.parentNode.host) || null;

	const visible = (el) => {
		const r = el.getBoundingClientRect();
		if (r.width < 4 || r.height < 4) return false;
		const s = getComputedStyle(el);
		return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05;
	};

	const NATIVE = "a[href], button, input, select, textarea, label, summary";
	const ROLES = new Set(${JSON.stringify([...INTERACTIVE_ROLES])});
	// Landmark roles and tabindex="-1" do not make an element reachable for agents.
	const hasHook = (el) => {
		if (el.matches(NATIVE)) return true;
		const role = (el.getAttribute("role") || "").trim().split(/\s+/)[0].toLowerCase();
		if (ROLES.has(role)) return true;
		const tab = el.getAttribute("tabindex");
		return tab !== null && Number.parseInt(tab, 10) >= 0;
	};

	// Memoised: does any ancestor (exclusive) make the element visible to agents?
	const blockedCache = new Map();
	const blocked = (el) => {
		const parent = parentOf(el);
		if (!parent) return false;
		const cached = blockedCache.get(parent);
		if (cached !== undefined) return cached;
		const result = hasHook(parent) || blocked(parent);
		blockedCache.set(parent, result);
		return result;
	};

	const trapCache = new Map();
	const isTrap = (el) => {
		const cached = trapCache.get(el);
		if (cached !== undefined) return cached;
		let result = false;
		if (!hasHook(el) && !blocked(el) && visible(el)) {
			result = getComputedStyle(el).cursor === "pointer" || el.hasAttribute("onclick");
		}
		trapCache.set(el, result);
		return result;
	};

	// Open shadow roots are traversed recursively.
	const roots = [document];
	const all = [];
	const walk = (root, selector) => {
		for (const el of root.querySelectorAll(selector)) {
			all.push(el);
			if (el.shadowRoot) {
				roots.push(el.shadowRoot);
				walk(el.shadowRoot, "*");
			}
		}
	};
	walk(document, "body *");
	const queryAll = (selector) => roots.flatMap((root) => [...root.querySelectorAll(selector)]);

	const clickTraps = [];
	for (const el of all) {
		if (!isTrap(el)) continue;
		const parent = parentOf(el);
		if (parent && parent !== document.body && isTrap(parent)) continue;
		clickTraps.push({ element: describe(el) });
	}

	const vw = innerWidth;
	const vh = innerHeight;
	let centre = document.elementFromPoint(vw / 2, vh / 2);
	while (centre && centre.shadowRoot) {
		const inner = centre.shadowRoot.elementFromPoint(vw / 2, vh / 2);
		if (!inner || inner === centre) break;
		centre = inner;
	}
	const coversCentre = (el) => {
		for (let n = centre; n; n = parentOf(n)) if (n === el) return true;
		return false;
	};
	// Sticky counts only while stuck to its edge.
	const stuck = (s, r) => {
		if (s.top !== "auto" && Math.abs(r.top - Number.parseFloat(s.top)) <= 1) return true;
		if (s.bottom !== "auto" && Math.abs(vh - r.bottom - Number.parseFloat(s.bottom)) <= 1) return true;
		return false;
	};

	const firstH1 = document.querySelector("h1");
	const overlays = [];
	for (const el of all) {
		const s = getComputedStyle(el);
		const z = Number.parseInt(s.zIndex, 10);
		if (z < 0) continue;
		const qualifies =
			s.position === "fixed" || s.position === "sticky" || (s.position === "absolute" && z >= 1000);
		if (!qualifies || s.pointerEvents === "none" || !visible(el)) continue;
		const r = el.getBoundingClientRect();
		if (s.position === "sticky" && !stuck(s, r)) continue;
		if (
			(s.position === "fixed" || s.position === "sticky") &&
			(el.querySelector("main, article") || (firstH1 && el.contains(firstH1)))
		) {
			continue; // a layout shell holding the page content, not an overlay
		}
		const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
		const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
		const share = (w * h) / (vw * vh);
		if (share < 0.01) continue;
		overlays.push({
			element: describe(el),
			coverage: Math.round(share * 1000) / 1000,
			coversCentre: coversCentre(el),
		});
	}

	const markerOf = (text) => {
		const t = text.toLowerCase();
		if (t.includes("recaptcha")) return "recaptcha";
		if (t.includes("hcaptcha")) return "hcaptcha";
		if (t.includes("turnstile") || t.includes("challenges.cloudflare.com")) return "turnstile";
		return undefined;
	};
	const found = new Set();
	const widgets = new Set();
	for (const el of queryAll("iframe[src], script[src]")) {
		const src = el.getAttribute("src") || "";
		const marker = markerOf(src);
		if (!marker) continue;
		if (el.tagName === "SCRIPT" && marker === "recaptcha") {
			// reCAPTCHA v3 (render=<site key>) is invisible; only render=explicit is a widget.
			const render = /[?&]render=([^&]*)/.exec(src);
			if (render && render[1] !== "explicit") continue;
		}
		if (
			el.tagName === "IFRAME" &&
			(src.includes("size=invisible") || el.closest(".grecaptcha-badge"))
		) {
			continue;
		}
		found.add(marker);
		if (el.tagName === "IFRAME") widgets.add(el);
	}
	const classMarkers = [
		[".g-recaptcha", "recaptcha"],
		[".h-captcha", "hcaptcha"],
		[".cf-turnstile", "turnstile"],
	];
	for (const [selector, marker] of classMarkers) {
		for (const el of queryAll(selector)) {
			found.add(marker);
			widgets.add(el);
		}
	}
	let blocking = false;
	for (const el of widgets) {
		if (visible(el) && coversCentre(el)) blocking = true;
	}
	const order = ["recaptcha", "hcaptcha", "turnstile"];
	const captcha = { markers: order.filter((m) => found.has(m)), blocking };
	if (blocking) captcha.reason = "Captcha covers the page";

	return { clickTraps, overlays, captcha };
})()`;

/** Same description format as measurePage, applied to the CDP-resolved `this`. */
const DESCRIBE_FN = `function () {
	var el = this;
	var cls = Array.prototype.slice.call(el.classList || [], 0, 2);
	var out = "<" + el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + cls.map(function (c) { return "." + c; }).join("") + ">";
	var href = el.tagName === "A" ? el.getAttribute("href") : null;
	if (href) {
		out += ' href="' + href.slice(0, 40) + '"';
	} else {
		var text = (el.textContent || "").replace(/\\s+/g, " ").trim();
		if (text) out += ' "' + text.slice(0, 30) + '"';
	}
	return out.slice(0, 100);
}`;

async function describeNode(
	cdp: CdpLike,
	backendNodeId: number,
): Promise<string | undefined> {
	let objectId: string | undefined;
	try {
		const resolved = (await cdp.send("DOM.resolveNode", { backendNodeId })) as {
			object?: { objectId?: string };
		};
		objectId = resolved.object?.objectId;
		if (!objectId) return undefined;
		const called = (await cdp.send("Runtime.callFunctionOn", {
			objectId,
			functionDeclaration: DESCRIBE_FN,
			returnByValue: true,
		})) as { result?: { value?: unknown } };
		const value = called.result?.value;
		return typeof value === "string" ? value : undefined;
	} catch {
		return undefined;
	} finally {
		if (objectId) {
			try {
				await cdp.send("Runtime.releaseObject", { objectId });
			} catch {
				// ignored on purpose
			}
		}
	}
}

async function collectInteractive(cdp: CdpLike): Promise<InteractiveNode[]> {
	const { nodes } = (await cdp.send("Accessibility.getFullAXTree")) as {
		nodes: AxNode[];
	};
	const result: InteractiveNode[] = [];
	let described = 0;
	for (const node of nodes) {
		const role = node.role?.value;
		if (node.ignored || typeof role !== "string") continue;
		if (!INTERACTIVE_ROLES.has(role)) continue;
		const rawName = node.name?.value;
		const name = typeof rawName === "string" ? rawName.trim() : "";
		let element = `<${role}>`;
		// Only unnamed nodes are shown in details; named ones are just counted.
		if (
			!name &&
			node.backendDOMNodeId !== undefined &&
			described < MAX_DESCRIBED
		) {
			described++;
			element = (await describeNode(cdp, node.backendDOMNodeId)) ?? element;
		}
		result.push({ role, name, element });
	}
	return result;
}

function firstLine(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return message.split("\n")[0] ?? message;
}

async function evaluateWithRetry(page: PageLike): Promise<PageData> {
	try {
		return await page.evaluate<PageData>(MEASURE_SCRIPT);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (!message.includes("Execution context was destroyed")) throw error;
		return page.evaluate<PageData>(MEASURE_SCRIPT);
	}
}

export const collectRenderedData: Collect = async (
	page: PageLike,
	cdp: CdpLike,
): Promise<CollectedData> => {
	const [tree, measured, content] = await Promise.allSettled([
		collectInteractive(cdp),
		evaluateWithRetry(page),
		// Inside the chain, so a throw (not only a rejection) is settled too.
		Promise.resolve().then(() => page.content()),
	]);
	if (tree.status === "rejected" && measured.status === "rejected") {
		throw tree.reason;
	}
	const dom = measured.status === "fulfilled" ? measured.value : undefined;
	const failures: NonNullable<CollectedData["failures"]> = {};
	if (tree.status === "rejected")
		failures.accessibility = firstLine(tree.reason);
	if (measured.status === "rejected") failures.dom = firstLine(measured.reason);
	return {
		...(Object.keys(failures).length > 0 ? { failures } : {}),
		// A failed read leaves html out: static-content then skips.
		...(content.status === "fulfilled"
			? { html: content.value.slice(0, RENDERED_HTML_MAX) }
			: {}),
		interactive: tree.status === "fulfilled" ? tree.value : [],
		clickTraps: dom?.clickTraps ?? [],
		overlays: dom?.overlays ?? [],
		captcha: dom?.captcha ?? { markers: [], blocking: false },
	};
};
