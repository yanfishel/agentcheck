import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export type ButtonVariant =
	| "primary"
	| "secondary"
	| "soft"
	| "code"
	| "ghost"
	| "danger";
export type ButtonSize = "sm" | "md";

const base =
	"inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors focus-visible:outline-2 outline-accent outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

const variants: Record<ButtonVariant, string> = {
	primary: "bg-accent text-accent-fg hover:opacity-90",
	secondary: "bg-surface border border-line text-foreground hover:bg-surface-2",
	soft: "bg-accent-soft text-foreground hover:bg-line",
	/** On a dark code window bar. */
	code: "bg-code-tab text-code-fg hover:bg-code-dot",
	ghost: "bg-transparent text-foreground hover:bg-surface-2",
	danger: "bg-transparent text-fail hover:bg-fail-soft",
};

const sizes: Record<ButtonSize, string> = {
	sm: "px-3 py-1.5 text-sm",
	md: "px-4 py-2",
};

/** The button look for a plain element, e.g. an `<a download>` that must skip the client router. */
export function buttonClass(
	variant: ButtonVariant = "primary",
	size: ButtonSize = "md",
	className?: string,
): string {
	return look(variant, size, className);
}

function look(variant: ButtonVariant, size: ButtonSize, className?: string) {
	return [base, variants[variant], sizes[size], className]
		.filter(Boolean)
		.join(" ");
}

export type ButtonProps = ComponentProps<"button"> & {
	variant?: ButtonVariant;
	size?: ButtonSize;
	loading?: boolean;
	icon?: ReactNode;
};

export function Button({
	variant = "primary",
	size = "md",
	loading = false,
	icon,
	className,
	disabled,
	children,
	type = "button",
	...rest
}: ButtonProps) {
	return (
		<button
			{...rest}
			type={type}
			disabled={disabled || loading}
			aria-busy={loading ? true : undefined}
			className={look(variant, size, className)}
		>
			{icon}
			{children}
		</button>
	);
}

export type ButtonLinkProps = ComponentProps<typeof Link> & {
	variant?: ButtonVariant;
	size?: ButtonSize;
	icon?: ReactNode;
};

export function ButtonLink({
	variant = "primary",
	size = "md",
	icon,
	className,
	children,
	...rest
}: ButtonLinkProps) {
	return (
		<Link {...rest} className={look(variant, size, className)}>
			{icon}
			{children}
		</Link>
	);
}
