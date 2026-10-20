export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

const STORAGE_KEY = "theme";

/**
 * Runs in <head> before the first paint, so a pinned theme never flashes the
 * system one. Only "light" and "dark" set `data-theme`; "system" leaves it off
 * and globals.css follows prefers-color-scheme.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}})()`;

function isPinned(value: unknown): value is "light" | "dark" {
	return value === "light" || value === "dark";
}

/** The theme currently applied to the document. */
export function currentTheme(): Theme {
	const value = document.documentElement.dataset.theme;
	return isPinned(value) ? value : "system";
}

function apply(theme: Theme) {
	if (isPinned(theme)) document.documentElement.dataset.theme = theme;
	else delete document.documentElement.dataset.theme;
}

const listeners = new Set<() => void>();

/** Applies the theme, remembers it and notifies subscribers. */
export function setTheme(theme: Theme) {
	apply(theme);
	try {
		if (isPinned(theme)) localStorage.setItem(STORAGE_KEY, theme);
		else localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Storage can be blocked; the choice still holds for this page view.
	}
	for (const listener of listeners) listener();
}

/** For useSyncExternalStore; also follows a theme picked in another tab. */
export function subscribeTheme(listener: () => void) {
	const onStorage = (event: StorageEvent) => {
		if (event.key !== STORAGE_KEY && event.key !== null) return;
		apply(isPinned(event.newValue) ? event.newValue : "system");
		listener();
	};
	listeners.add(listener);
	window.addEventListener("storage", onStorage);
	return () => {
		listeners.delete(listener);
		window.removeEventListener("storage", onStorage);
	};
}
