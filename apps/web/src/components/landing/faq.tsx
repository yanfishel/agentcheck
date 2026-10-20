import { CircleHelp } from "lucide-react";
import { Card, Collapsible } from "../ui";

const questions = [
	{
		question: "Is this just SEO with a new name?",
		answer:
			"Partly. Good SEO helps, but AI crawlers have their own names in robots.txt, their own files to read, and agents that try to press your buttons. Classic SEO tools do not look at any of that.",
	},
	{
		question: "Should I let every AI bot in?",
		answer:
			"That is your call. Some sites block training crawlers and allow search ones. The report shows what is open and what is closed, so it is a decision rather than an accident.",
	},
	{
		question: "Does llms.txt really work?",
		answer:
			"Not every assistant reads it yet. It is a small markdown file that takes minutes to write, so we count it and show you what to put in it.",
	},
	{
		question: "Will a perfect score get me into ChatGPT answers?",
		answer:
			"No tool can promise that, and anyone who does is selling something. A good score means nothing on your side is in the way.",
	},
];

/** Short, honest answers; each opens in place (the WAI accordion pattern). */
export function Faq() {
	return (
		<section aria-labelledby="faq" className="mt-20">
			<h2 id="faq" className="text-2xl font-bold tracking-tight sm:text-3xl">
				Fair questions
			</h2>
			<Card className="mt-6 divide-y divide-line-soft px-5 py-2">
				{questions.map(({ question, answer }) => (
					<div key={question} className="py-1">
						<Collapsible
							heading="h3"
							hiddenUntilFound
							trigger={
								<span className="flex items-center gap-3 font-semibold">
									<CircleHelp
										aria-hidden="true"
										className="size-5 shrink-0 text-accent"
									/>
									{question}
								</span>
							}
						>
							<p className="pb-3 pl-8 text-muted">{answer}</p>
						</Collapsible>
					</div>
				))}
			</Card>
		</section>
	);
}
