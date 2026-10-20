import { describe, expect, it } from "vitest";
import { relativeTime } from "@/components/report/relative-time";

const NOW = Date.UTC(2026, 9, 20, 12, 0, 0);
const ago = (ms: number) => new Date(NOW - ms);
const DAY = 86_400_000;

describe("relativeTime", () => {
	it("reads naturally by default", () => {
		expect(relativeTime(ago(DAY).toISOString(), NOW)).toBe("yesterday");
		expect(relativeTime(ago(10 * DAY).toISOString(), NOW)).toBe("last week");
		expect(relativeTime(ago(10_000).toISOString(), NOW)).toBe("just now");
		expect(relativeTime(ago(120_000).toISOString(), NOW)).toBe("2 minutes ago");
	});

	it("returns the input when it is not a date", () => {
		expect(relativeTime("nope", NOW)).toBe("nope");
	});

	it("keeps numbers and days for the history list", () => {
		const opts = { numeric: "always", maxUnit: "day" } as const;
		expect(relativeTime(ago(DAY), NOW, opts)).toBe("1 day ago");
		expect(relativeTime(ago(10 * DAY), NOW, opts)).toBe("10 days ago");
		expect(relativeTime(ago(400 * DAY), NOW, opts)).toBe("400 days ago");
		expect(relativeTime(ago(3 * 3_600_000), NOW, opts)).toBe("3 hours ago");
		expect(relativeTime(ago(5_000), NOW, opts)).toBe("just now");
	});
});
