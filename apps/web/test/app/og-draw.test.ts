import { describe, expect, it } from "vitest";
import { drawReportOg, drawSiteOg, hostFontSize } from "@/app/_og/draw";

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function expectPng(bytes: Uint8Array) {
	expect([...bytes.slice(0, 8)]).toEqual(SIGNATURE);
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	expect(view.getUint32(16)).toBe(1200);
	expect(view.getUint32(20)).toBe(630);
}

describe("hostFontSize", () => {
	it("keeps the full size for ordinary hosts", () => {
		expect(hostFontSize("atarcms.com")).toBe(84);
		expect(hostFontSize("example-shop.com")).toBe(84);
	});

	it("shrinks a long host but never below the floor", () => {
		const size = hostFontSize(`${"a".repeat(63)}.example.com`);
		expect(size).toBeLessThan(84);
		expect(size).toBeGreaterThanOrEqual(28);
	});

	it("fits the space right of the seal at every length, or sits on the floor", () => {
		for (let length = 1; length <= 253; length++) {
			const host = "a".repeat(length);
			const size = hostFontSize(host);
			expect(size === 28 || size * 0.6 * length <= 890).toBe(true);
		}
	});
});

describe("OG pictures", () => {
	it("draws the report picture as a 1200x630 PNG", async () => {
		expectPng(
			await drawReportOg({ host: "atarcms.com", score: 100, grade: "A+" }),
		);
	});

	it("draws the site picture as a 1200x630 PNG", async () => {
		const response = await drawSiteOg();
		expectPng(new Uint8Array(await response.arrayBuffer()));
	});
});
