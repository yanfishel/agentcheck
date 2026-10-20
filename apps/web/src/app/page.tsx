import type { Metadata } from "next";
import { BadgeBlock } from "../components/landing/badge-block";
import { Categories } from "../components/landing/categories";
import { CheckNow } from "../components/landing/check-now";
import { CliBlock } from "../components/landing/cli-block";
import { ExampleReport } from "../components/landing/example-report";
import { Faq } from "../components/landing/faq";
import { Hero } from "../components/landing/hero";
import { HowItWorks } from "../components/landing/how-it-works";
import { StructuredData } from "../components/landing/structured-data";
import { StartAuditForm } from "../components/start-audit-form";

/** The landing's markdown twin for AI readers (public/index.md). */
export const metadata: Metadata = {
	alternates: { canonical: "/", types: { "text/markdown": "/index.md" } },
};

/** The landing: a sync server component with no database or Clerk calls. */
export default function Home() {
	return (
		<main className="flex-1">
			<StructuredData />
			<Hero />
			<StartAuditForm />
			<div className="mx-auto w-full max-w-page px-4">
				<Categories />
			</div>
			<HowItWorks />
			<div className="mx-auto w-full max-w-page px-4">
				<ExampleReport />
				<Faq />
				<div className="mt-20 grid gap-16">
					<CliBlock />
					<BadgeBlock />
				</div>
			</div>
			<CheckNow />
		</main>
	);
}
