"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { currentTheme, setTheme, subscribeTheme, type Theme } from "./theme";
import { RadioMenu, type RadioMenuOption } from "./ui";

const options: RadioMenuOption<Theme>[] = [
	{ value: "light", label: "Light", icon: Sun },
	{ value: "dark", label: "Dark", icon: Moon },
	{ value: "system", label: "System", icon: Monitor },
];

/** The header's theme switch; the trigger shows the icon of the current choice. */
export function ThemeMenu({ className }: { className: string }) {
	const theme = useSyncExternalStore(
		subscribeTheme,
		currentTheme,
		() => "system" as const,
	);
	const Icon =
		options.find((option) => option.value === theme)?.icon ?? Monitor;
	return (
		<RadioMenu
			label="Theme"
			value={theme}
			onValueChange={setTheme}
			options={options}
			trigger={
				<button type="button" aria-label="Theme" className={className}>
					<Icon aria-hidden="true" className="size-4" />
				</button>
			}
		/>
	);
}
