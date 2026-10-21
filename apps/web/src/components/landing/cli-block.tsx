import { renderTerminal } from "@agentcheck/core/terminal";
import { FileCode, SquareTerminal, Terminal } from "lucide-react";
import type { ReactNode } from "react";
import { exampleAudit } from "../../content/example-audit";
import { CodeWindow, code } from "../ui";

const TARGET = exampleAudit.target;
const CI_FLAGS = "--threshold=85 --format=json";

const WORKFLOW = `name: AI readiness
on: [push]
jobs:
  agentcheck:
    runs-on: ubuntu-latest
    steps:
      - run: npx agentcheck-dev https://your-site.com ${CI_FLAGS}`;

/** Paints the reporter's markers the way a colour terminal shows them. */
function paintLine(line: string): ReactNode {
	const marker = line.match(/^(\s*)(\[✓\]|\[!\]|\[✗\]|\[–\]|✓|⚠|✗|–)(.*)$/);
	if (marker) {
		const [, indent, sign, rest] = marker;
		const tone = sign?.includes("✓")
			? code.pass
			: sign?.includes("!") || sign?.includes("⚠")
				? code.warn
				: sign?.includes("✗")
					? code.fail
					: code.muted;
		const score = rest?.match(/^(.*?)(\d+)(\/100)$/);
		return (
			<>
				{indent}
				<span className={tone}>{sign}</span>
				{score ? (
					<>
						{score[1]}
						<span className={code.strong}>{score[2]}</span>
						{score[3]}
					</>
				) : (
					rest
				)}
			</>
		);
	}
	if (/^\s*(Target|Browser):|^\s*─+$/.test(line)) {
		return <span className={code.muted}>{line}</span>;
	}
	if (line.includes("OVERALL AI SCORE")) {
		return <span className={code.strong}>{line}</span>;
	}
	return line;
}

/**
 * The real terminal reporter run on the saved example audit, shortened: passing
 * checks and remediation lines are left out so the window stays small.
 */
function terminalOutput(): ReactNode {
	const lines = renderTerminal(exampleAudit, { color: false })
		.split("\n")
		.filter((line) => !/^\s+✓ /.test(line) && !/^\s+→ /.test(line))
		// Without their passing checks, categories no longer need blank lines between them.
		.filter(
			(line, index, all) =>
				!(
					line === "" &&
					/^\s+(\[|✗|⚠|–)/.test(all[index - 1] ?? "") &&
					/^\s+\[/.test(all[index + 1] ?? "")
				),
		);
	while (lines.at(-1) === "") lines.pop();
	return lines.map((line, index) => (
		// biome-ignore lint/suspicious/noArrayIndexKey: static lines that never reorder.
		<span key={index}>
			{paintLine(line)}
			{"\n"}
		</span>
	));
}

function Command({ flags }: { flags?: string }) {
	return (
		<>
			<span className={code.prompt}>$</span> npx agentcheck-dev{" "}
			<span className={code.string}>{TARGET}</span>
			{flags
				? flags.split(" ").map((flag) => {
						const [name, value] = flag.split("=");
						return (
							<span key={flag}>
								{" "}
								<span className={code.flag}>{name}</span>=
								<span className={code.number}>{value}</span>
							</span>
						);
					})
				: null}
		</>
	);
}

function Yaml() {
	return WORKFLOW.split("\n").map((line) => {
		const [, indent, dash, key, value] =
			line.match(/^(\s*)(- )?([\w-]+):\s?(.*)$/) ?? [];
		return (
			<span key={line}>
				{indent}
				{dash}
				<span className={code.key}>{key}</span>:{" "}
				<span className={code.string}>{value}</span>
				{"\n"}
			</span>
		);
	});
}

export function CliBlock() {
	return (
		<section aria-labelledby="cli" className="flex min-w-0 flex-col">
			<h2
				id="cli"
				className="flex items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl"
			>
				<Terminal aria-hidden="true" className="size-7 text-accent" />
				Command line and CI
			</h2>
			<p className="mt-2 text-muted">
				The CLI runs the same engine. Fail the build when the score drops.
			</p>
			<div className="mt-6">
				<CodeWindow
					label="Command line examples"
					tabs={[
						{
							label: "zsh",
							icon: <SquareTerminal aria-hidden="true" className="size-3.5" />,
							copy: `npx agentcheck-dev https://your-site.com ${CI_FLAGS}`,
							copyLabel: "Copy command",
							content: (
								<>
									<Command />
									{"\n\n"}
									{terminalOutput()}
									{"\n"}
									<Command flags={CI_FLAGS} />
									<span className={code.muted}> # in CI</span>
								</>
							),
						},
						{
							label: ".github/workflows/agentcheck.yml",
							icon: <FileCode aria-hidden="true" className="size-3.5" />,
							copy: WORKFLOW,
							copyLabel: "Copy workflow",
							content: <Yaml />,
						},
					]}
				/>
			</div>
			<p className="mt-4 text-sm">
				<a
					href="https://www.npmjs.com/package/agentcheck-dev"
					className="rounded-full font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 outline-accent outline-offset-2"
				>
					agentcheck-dev on npm
				</a>
			</p>
		</section>
	);
}
