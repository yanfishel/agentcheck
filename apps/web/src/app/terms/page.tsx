import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "../../components/legal-page";
import { LEGAL } from "../../content/legal";

export const metadata: Metadata = {
	title: "Terms of Use — AgentCheck",
	alternates: { canonical: "/terms" },
	description: "The terms for using the hosted AgentCheck service.",
};

const mail = `mailto:${LEGAL.email}?subject=AgentCheck%20terms`;

export default function TermsPage() {
	return (
		<LegalPage
			title="Terms of Use"
			intro={
				<>
					These terms apply to the AgentCheck service on this website, operated
					by {LEGAL.operator}. By using it you agree to them. If you do not
					agree, please do not use the service.
				</>
			}
		>
			<h2>The service</h2>
			<p>
				AgentCheck checks how ready a public website is for AI agents and AI
				search, and reports what it found. Quick checks work without an account;
				full checks, which also render pages in a browser, need one. Usage
				limits apply and may change.
			</p>

			<h2>Open source</h2>
			<p>
				The AgentCheck code is <a href={LEGAL.repo}>published on GitHub</a>{" "}
				under the {LEGAL.licence} licence, which governs your use of the code.
				These terms cover only the hosted service on this website. If you run
				your own copy, you are the operator of that copy and these terms do not
				apply to it.
			</p>

			<h2>Acceptable use</h2>
			<p>
				Use the service only for websites you own or are allowed to test. Do
				not:
			</p>
			<ul>
				<li>
					use it to overload, attack or probe websites or networks, including
					private or internal ones;
				</li>
				<li>
					get around usage limits, for example with automated accounts or by
					spreading requests to hide them;
				</li>
				<li>
					interfere with the service or try to reach data that is not yours.
				</li>
			</ul>
			<p>
				We may block requests, suspend accounts or refuse service when we see
				abuse.
			</p>

			<h2>Accounts</h2>
			<p>
				Accounts are provided through Clerk. Keep your sign-in secure; you are
				responsible for checks run from your account. You can ask us to delete
				your account at any time.
			</p>

			<h2>Reports and sharing</h2>
			<p>
				Reports describe the website you checked at the time of the check. When
				you share a report, anyone with the link can see it until you stop
				sharing. How we handle data is described in the{" "}
				<Link href="/privacy">Privacy Policy</Link>.
			</p>

			<h2>No guarantees</h2>
			<p>
				Checks are automated and their results are for information only. The
				service is provided as is and as available, without warranties of any
				kind. A good score does not guarantee that any AI assistant or search
				engine will read, cite or rank your website, and the service may change,
				pause or stop at any time.
			</p>

			<h2>Liability</h2>
			<p>
				To the extent the law allows, we are not liable for indirect, incidental
				or consequential damages, or for lost profits or data, arising from your
				use of the service. The service is free, and our total liability is
				limited accordingly.
			</p>

			<h2>Changes</h2>
			<p>
				We may update these terms. The date at the top shows the current
				version; continuing to use the service means you accept it.
			</p>

			<h2>Governing law</h2>
			<p>
				These terms are governed by the laws of {LEGAL.country}, and the
				competent courts of {LEGAL.country} have exclusive jurisdiction.
			</p>

			<h2>Contact</h2>
			<p>
				Questions about these terms: <a href={mail}>{LEGAL.email}</a>.
			</p>
		</LegalPage>
	);
}
