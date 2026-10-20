"use client";

import { Menu as BaseMenu } from "@base-ui/react/menu";
import { Check, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";

export type MenuItemSpec = {
	label: string;
	onSelect?: () => void;
	href?: string;
	/** Renders a plain `<a download>` instead of `next/link` (file downloads skip the client router). */
	download?: boolean | string;
	tone?: "default" | "danger";
	selected?: boolean;
	icon?: LucideIcon;
};

function ItemContent({ item }: { item: MenuItemSpec }) {
	const Icon = item.icon;
	return (
		<>
			{Icon ? <Icon aria-hidden="true" className="size-4 shrink-0" /> : null}
			{item.label}
		</>
	);
}

function itemClass(item: MenuItemSpec) {
	const color = item.selected
		? "text-accent"
		: item.tone === "danger"
			? "text-fail"
			: "";
	return `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-accent-soft ${color}`;
}

const popupClass =
	"min-w-40 rounded-[10px] border border-line bg-surface p-1 shadow-card outline-none transition duration-150 data-[ending-style]:-translate-y-1 data-[starting-style]:-translate-y-1 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0";

export function Menu({
	trigger,
	items,
	label,
	header,
}: {
	trigger: ReactElement;
	items: MenuItemSpec[];
	label: string;
	/** Static content above the items (e.g. who is signed in). */
	header?: ReactNode;
}) {
	return (
		<BaseMenu.Root>
			<BaseMenu.Trigger render={trigger} />
			<BaseMenu.Portal>
				<BaseMenu.Positioner sideOffset={6} align="end">
					<BaseMenu.Popup aria-label={label} className={popupClass}>
						{header ? (
							<div className="mb-1 border-b border-line-soft px-3 pt-2 pb-3">
								{header}
							</div>
						) : null}
						{items.map((item) =>
							item.href ? (
								<BaseMenu.LinkItem
									key={item.label}
									render={
										item.download !== undefined ? (
											// biome-ignore lint/a11y/useAnchorContent: Base UI renders the label into the anchor.
											<a href={item.href} download={item.download} />
										) : (
											<Link href={item.href} />
										)
									}
									closeOnClick
									aria-current={item.selected ? "page" : undefined}
									className={itemClass(item)}
								>
									<ItemContent item={item} />
								</BaseMenu.LinkItem>
							) : (
								<BaseMenu.Item
									key={item.label}
									onClick={item.onSelect}
									className={itemClass(item)}
								>
									<ItemContent item={item} />
								</BaseMenu.Item>
							),
						)}
					</BaseMenu.Popup>
				</BaseMenu.Positioner>
			</BaseMenu.Portal>
		</BaseMenu.Root>
	);
}

export type RadioMenuOption<T extends string> = {
	value: T;
	label: string;
	icon?: LucideIcon;
};

/** A menu of mutually exclusive choices (menuitemradio); the checked one gets a tick. */
export function RadioMenu<T extends string>({
	trigger,
	label,
	value,
	onValueChange,
	options,
}: {
	trigger: ReactElement;
	label: string;
	value: T;
	onValueChange: (value: T) => void;
	options: RadioMenuOption<T>[];
}) {
	return (
		<BaseMenu.Root>
			<BaseMenu.Trigger render={trigger} />
			<BaseMenu.Portal>
				<BaseMenu.Positioner sideOffset={6} align="end">
					<BaseMenu.Popup aria-label={label} className={popupClass}>
						<BaseMenu.RadioGroup
							value={value}
							onValueChange={(next: T) => onValueChange(next)}
						>
							{options.map(({ value: option, label: text, icon: Icon }) => (
								<BaseMenu.RadioItem
									key={option}
									value={option}
									closeOnClick
									className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-accent-soft data-[checked]:font-semibold data-[checked]:text-accent"
								>
									{Icon ? (
										<Icon aria-hidden="true" className="size-4 shrink-0" />
									) : null}
									<span className="flex-1">{text}</span>
									<BaseMenu.RadioItemIndicator>
										<Check aria-hidden="true" className="size-4" />
									</BaseMenu.RadioItemIndicator>
								</BaseMenu.RadioItem>
							))}
						</BaseMenu.RadioGroup>
					</BaseMenu.Popup>
				</BaseMenu.Positioner>
			</BaseMenu.Portal>
		</BaseMenu.Root>
	);
}
