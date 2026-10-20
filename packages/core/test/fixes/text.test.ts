import { describe, expect, it } from "vitest";
import {
	cleanText,
	escapeAttribute,
	escapeMarkdown,
	jsonForScript,
} from "../../src/fixes/text.ts";

describe("fix text helpers", () => {
	it("collapses whitespace and drops control characters", () => {
		expect(cleanText("  a\n\tb\u0000 ")).toBe("a b");
		expect(cleanText(undefined)).toBe("");
	});

	it("cuts on code points", () => {
		expect(cleanText("x".repeat(250))).toHaveLength(200);
		const out = cleanText(`${"x".repeat(199)}😀😀`);
		expect([...out].length).toBe(200);
		expect(out.endsWith("😀")).toBe(true);
	});

	it("escapes markdown", () => {
		const input = "[x](y) <z>";
		const out = escapeMarkdown(input);
		expect(out).not.toBe(input);
		const bs = String.fromCharCode(92);
		expect(out).toBe(`${bs}[x${bs}]${bs}(y${bs}) ${bs}<z>`);
		expect(out.split("").filter((c) => c.charCodeAt(0) === 92)).toHaveLength(5);
	});

	it("escapes the ampersand so entity text stays literal", () => {
		const bs = String.fromCharCode(92);
		expect(escapeMarkdown("&lt;b&gt; & co")).toBe(
			`${bs}&lt;b${bs}&gt; ${bs}& co`,
		);
	});

	it("escapes the backslash itself", () => {
		const bs = String.fromCharCode(92);
		expect(escapeMarkdown(`Price C:${bs}`)).toBe(`Price C:${bs}${bs}`);
		expect(escapeMarkdown(`a${bs}]b`)).toBe(`a${bs}${bs}${bs}]b`);
	});

	it("escapes attributes", () => {
		expect(escapeAttribute('a"<b>&')).toBe("a&quot;&lt;b&gt;&amp;");
	});

	it("keeps JSON safe inside a script tag", () => {
		const out = jsonForScript({ a: "</script>" });
		expect(out).toContain("\x5cu003c/script>");
		expect(out).not.toContain("</script>");
	});
});
