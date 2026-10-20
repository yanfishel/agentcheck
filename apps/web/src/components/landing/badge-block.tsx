import { Award } from "lucide-react";
import { exampleAudit } from "../../content/example-audit";
import { renderBadge } from "../../server/render-badge";
import { badgeSnippetTabs } from "../badge-snippets";
import { CodeWindow } from "../ui";

const ALT = `AI Ready: ${exampleAudit.score}/100`;

export function BadgeBlock() {
	const svg = renderBadge({
		score: exampleAudit.score,
		grade: exampleAudit.grade,
	});
	return (
		<section aria-labelledby="badge" className="flex min-w-0 flex-col">
			<h2
				id="badge"
				className="flex items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl"
			>
				<Award aria-hidden="true" className="size-7 text-accent" />
				Badge
			</h2>
			<p className="mt-2 text-muted">
				Share a report and show the score in your README.
			</p>
			<div className="mt-6">
				<CodeWindow
					label="Badge snippets"
					tabs={badgeSnippetTabs({
						alt: ALT,
						badgeUrl: "<badge url>",
						reportUrl: "<report url>",
						readmeHeading: "Status",
					})}
					footer={
						<div className="border-t border-code-line bg-surface p-4">
							<p className="text-xs text-muted">Preview</p>
							<div className="mt-2 rounded-lg border border-line p-4">
								<p className="border-b border-line-soft pb-2 text-lg font-bold">
									Status
								</p>
								<div
									className="mt-3 flex"
									// biome-ignore lint/security/noDangerouslySetInnerHtml: renderBadge draws the SVG from two numbers, no user input.
									dangerouslySetInnerHTML={{ __html: svg }}
								/>
							</div>
						</div>
					}
				/>
			</div>
		</section>
	);
}
