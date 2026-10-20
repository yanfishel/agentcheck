import { Zap } from "lucide-react";
import { exampleAudit } from "../../content/example-audit";
import { AuditReport } from "../audit-report";
import { ButtonLink, Card } from "../ui";

/** The saved audit's first-screen shot and site icon (scripts/capture-example.ts). */
const SCREENSHOT = {
	small: "/example/screenshot-small.webp",
	large: "/example/screenshot-large.webp",
};
const FAVICON = "/example/favicon.svg";

function hostOf(url: string): string {
	try {
		return new URL(url).host;
	} catch {
		return url;
	}
}

/** A saved real report, rendered with the same component as live audits. */
export function ExampleReport() {
	return (
		<section aria-labelledby="example" className="mt-20">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<h2
						id="example"
						className="text-2xl font-bold tracking-tight sm:text-3xl"
					>
						Example report
					</h2>
					<p className="mt-2 text-muted">
						{`A saved audit of ${hostOf(exampleAudit.target)}, shown the way you will see your own.`}
					</p>
				</div>
				{/* The bolt of the form's Quick button, where this leads. */}
				<ButtonLink
					href="#start"
					className="self-start"
					icon={<Zap aria-hidden="true" className="size-4" />}
				>
					Check your site
				</ButtonLink>
			</div>
			<Card className="mt-6 p-4 sm:p-6">
				<AuditReport
					result={exampleAudit}
					variant="example"
					defaultOpen="none"
					screenshot={SCREENSHOT}
					favicon={FAVICON}
				/>
			</Card>
		</section>
	);
}
