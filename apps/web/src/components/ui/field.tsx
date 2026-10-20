import { Field as BaseField } from "@base-ui/react/field";
import type { ComponentProps, ReactNode } from "react";

export function Field({
	label,
	hint,
	error,
	hintClassName = "text-sm text-muted",
	errorClassName = "text-sm text-fail",
	stackMessages = false,
	children,
}: {
	label: ReactNode;
	hint?: ReactNode;
	error?: ReactNode;
	/** Replaces the default hint look (muted text). */
	hintClassName?: string;
	/** Replaces the default error look (red text). */
	errorClassName?: string;
	/**
	 * Puts hint and error in one grid cell: the hint stays (invisible) while the
	 * error shows, so the slot is as tall as the taller of the two and nothing jumps.
	 */
	stackMessages?: boolean;
	children: ReactNode;
}) {
	const hidden = stackMessages && error ? " invisible" : "";
	const description = hint ? (
		<BaseField.Description className={`${hintClassName}${hidden}`}>
			{hint}
		</BaseField.Description>
	) : null;
	const alert = error ? (
		<BaseField.Error match role="alert" className={errorClassName}>
			{error}
		</BaseField.Error>
	) : null;
	return (
		<BaseField.Root invalid={Boolean(error)} className="flex flex-col gap-1.5">
			<BaseField.Label className="text-sm font-semibold">
				{label}
			</BaseField.Label>
			{children}
			{stackMessages ? (
				<div className="grid items-center *:[grid-area:1/1]">
					{description}
					{alert}
				</div>
			) : (
				<>
					{description}
					{alert}
				</>
			)}
		</BaseField.Root>
	);
}

const boxed =
	"rounded-full border border-line bg-surface px-4 py-2 focus-visible:outline-2 outline-accent outline-offset-2 data-[invalid]:border-fail";

/** `bare` drops the box for an input that sits inside a styled container (the container draws focus and error). */
export function Input({
	mono = false,
	bare = false,
	className,
	...rest
}: ComponentProps<"input"> & { mono?: boolean; bare?: boolean }) {
	return (
		<BaseField.Control
			{...rest}
			className={[
				"w-full text-foreground placeholder:text-muted disabled:opacity-60",
				bare ? "rounded-full bg-transparent outline-none" : boxed,
				mono ? "font-mono" : "",
				className,
			]
				.filter(Boolean)
				.join(" ")}
		/>
	);
}
