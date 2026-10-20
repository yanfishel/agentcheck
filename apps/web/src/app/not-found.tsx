import { BrandMark } from "../components/brand-mark";
import { ButtonLink } from "../components/ui";

export default function NotFound() {
	return (
		<main className="mx-auto flex w-full max-w-page flex-1 flex-col items-center px-4 py-20 text-center">
			<BrandMark state="failed" className="size-16" />
			<h1 className="mt-6 text-2xl font-bold tracking-tight text-balance">
				There is no page at this address.
			</h1>
			<ButtonLink href="/" className="mt-6">
				Go to the home page
			</ButtonLink>
		</main>
	);
}
