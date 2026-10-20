import {
	Bot,
	Braces,
	FileText,
	type LucideIcon,
	MousePointerClick,
} from "lucide-react";
import type { CategoryResult } from "./report/markers";

export type CategoryId = CategoryResult["id"];

/**
 * How each audit category looks wherever it appears (landing and report): a short
 * name, an icon and its identity colour. The colour classes are literal so Tailwind
 * finds them; they colour icons, rings and tints only, never text (text keeps the
 * text tokens, and status keeps pass/warn/fail).
 */
export const CATEGORY_META: Record<
	CategoryId,
	{
		short: string;
		icon: LucideIcon;
		/** Icon or ring stroke in the category colour. */
		text: string;
		/** A soft tile behind the icon. */
		tint: string;
	}
> = {
	"ai-manifests": {
		short: "Manifests",
		icon: FileText,
		text: "text-cat-manifests",
		tint: "bg-cat-manifests/15",
	},
	"bot-access": {
		short: "Bots",
		icon: Bot,
		text: "text-cat-bots",
		tint: "bg-cat-bots/15",
	},
	"content-semantics": {
		short: "Semantics",
		icon: Braces,
		text: "text-cat-semantics",
		tint: "bg-cat-semantics/15",
	},
	"agentic-actionability": {
		short: "Actions",
		icon: MousePointerClick,
		text: "text-cat-actions",
		tint: "bg-cat-actions/15",
	},
};

/** The category's icon on a soft tile in its colour. */
export function CategoryIcon({
	id,
	size = "md",
}: {
	id: CategoryId;
	size?: "sm" | "md";
}) {
	const { icon: Icon, text, tint } = CATEGORY_META[id];
	const box = size === "sm" ? "size-7 rounded-lg" : "size-11 rounded-xl";
	const glyph = size === "sm" ? "size-4" : "size-5";
	return (
		<span
			className={["grid shrink-0 place-items-center", box, tint, text].join(
				" ",
			)}
		>
			<Icon aria-hidden="true" className={glyph} />
		</span>
	);
}
