// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	currentTheme,
	setTheme,
	subscribeTheme,
	themeScript,
} from "@/components/theme";

const root = document.documentElement;

afterEach(() => {
	localStorage.clear();
	delete root.dataset.theme;
});

describe("themeScript", () => {
	it.each(["light", "dark"])("pins a stored %s theme", (theme) => {
		localStorage.setItem("theme", theme);
		new Function(themeScript)();
		expect(root.dataset.theme).toBe(theme);
	});

	it("leaves the attribute off for system and junk values", () => {
		new Function(themeScript)();
		expect(root.dataset.theme).toBeUndefined();
		localStorage.setItem("theme", "sepia");
		new Function(themeScript)();
		expect(root.dataset.theme).toBeUndefined();
	});
});

describe("setTheme", () => {
	it("pins light and dark and remembers them", () => {
		setTheme("dark");
		expect(root.dataset.theme).toBe("dark");
		expect(localStorage.getItem("theme")).toBe("dark");
		expect(currentTheme()).toBe("dark");
	});

	it("returns to the system preference", () => {
		setTheme("light");
		setTheme("system");
		expect(root.dataset.theme).toBeUndefined();
		expect(localStorage.getItem("theme")).toBeNull();
		expect(currentTheme()).toBe("system");
	});

	it("notifies subscribers until they unsubscribe", () => {
		const listener = vi.fn();
		const unsubscribe = subscribeTheme(listener);
		setTheme("dark");
		expect(listener).toHaveBeenCalledOnce();
		unsubscribe();
		setTheme("light");
		expect(listener).toHaveBeenCalledOnce();
	});
});

describe("subscribeTheme", () => {
	it("follows a theme picked in another tab", () => {
		const listener = vi.fn();
		const unsubscribe = subscribeTheme(listener);
		window.dispatchEvent(
			new StorageEvent("storage", { key: "theme", newValue: "dark" }),
		);
		expect(root.dataset.theme).toBe("dark");
		window.dispatchEvent(
			new StorageEvent("storage", { key: "theme", newValue: null }),
		);
		expect(root.dataset.theme).toBeUndefined();
		window.dispatchEvent(
			new StorageEvent("storage", { key: "other", newValue: "x" }),
		);
		expect(listener).toHaveBeenCalledTimes(2);
		unsubscribe();
	});
});
