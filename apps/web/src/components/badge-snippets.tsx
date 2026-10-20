import { FileCode, FileText } from "lucide-react";
import { type CodeTab, code } from "./ui";

/**
 * The README and HTML badge snippets as CodeWindow tabs, shared by the landing
 * (placeholder URLs) and the report's Get badge dialog (real ones).
 */
export function badgeSnippetTabs({
	alt,
	badgeUrl,
	reportUrl,
	readmeHeading,
}: {
	alt: string;
	badgeUrl: string;
	reportUrl: string;
	/** A heading shown above the Markdown line (display only, not copied). */
	readmeHeading?: string;
}): CodeTab[] {
	return [
		{
			label: "README.md",
			icon: <FileText aria-hidden="true" className="size-3.5" />,
			copy: `[![${alt}](${badgeUrl})](${reportUrl})`,
			copyLabel: "Copy Markdown",
			content: (
				<span className="whitespace-pre-wrap break-all">
					{readmeHeading ? (
						<>
							<span className={code.muted}>## {readmeHeading}</span>
							{"\n\n"}
						</>
					) : null}
					<span className={code.key}>[![</span>
					<span className={code.string}>{alt}</span>
					<span className={code.key}>](</span>
					<span className={code.flag}>{badgeUrl}</span>
					<span className={code.key}>)](</span>
					<span className={code.flag}>{reportUrl}</span>
					<span className={code.key}>)</span>
				</span>
			),
		},
		{
			label: "index.html",
			icon: <FileCode aria-hidden="true" className="size-3.5" />,
			copy: `<a href="${reportUrl}"><img src="${badgeUrl}" alt="${alt}"></a>`,
			copyLabel: "Copy HTML",
			content: (
				<span className="whitespace-pre-wrap break-all">
					<span className={code.key}>{"<a "}</span>
					<span className={code.flag}>href</span>=
					<span className={code.string}>"{reportUrl}"</span>
					<span className={code.key}>{"><img "}</span>
					<span className={code.flag}>src</span>=
					<span className={code.string}>"{badgeUrl}"</span>{" "}
					<span className={code.flag}>alt</span>=
					<span className={code.string}>"{alt}"</span>
					<span className={code.key}>{"></a>"}</span>
				</span>
			),
		},
	];
}
