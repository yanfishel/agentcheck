import { SignIn } from "@clerk/nextjs";

export default function Page() {
	return (
		<main className="flex flex-1 items-center justify-center px-4 py-12 sm:py-16">
			<SignIn />
		</main>
	);
}
