import { describe, expect, it } from "vitest";
import { pageWindow, searchQuery } from "@/server/paging";

describe("pageWindow", () => {
	it("maps a page to its offset", () => {
		expect(pageWindow("2", 120, 50)).toEqual({ page: 2, pages: 3, offset: 50 });
		expect(pageWindow(undefined, 120, 50)).toEqual({
			page: 1,
			pages: 3,
			offset: 0,
		});
	});

	it("reads anything that is not a positive integer as page 1", () => {
		for (const raw of ["abc", "0", "-1", "1.5", "", " 2"]) {
			expect(pageWindow(raw, 120, 50).page).toBe(1);
		}
		expect(pageWindow(["3", "1"], 120, 50).page).toBe(3);
	});

	it("clamps a page past the end to the last page", () => {
		expect(pageWindow("999", 120, 50)).toEqual({
			page: 3,
			pages: 3,
			offset: 100,
		});
	});

	it("gives an empty list one page", () => {
		expect(pageWindow("4", 0, 50)).toEqual({ page: 1, pages: 1, offset: 0 });
	});
});

describe("searchQuery", () => {
	it("trims, cuts to the limit and reads empty as none", () => {
		expect(searchQuery("  shop  ", 200)).toBe("shop");
		expect(searchQuery(["a", "b"], 200)).toBe("a");
		expect(searchQuery("abcdef", 3)).toBe("abc");
		expect(searchQuery("   ", 200)).toBeUndefined();
		expect(searchQuery(undefined, 200)).toBeUndefined();
	});
});
