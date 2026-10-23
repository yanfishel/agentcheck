import type { Metadata } from "next";
import { LegalPage } from "../../components/legal-page";
import { LEGAL } from "../../content/legal";

const DESCRIPTION = "What AgentCheck collects, why, and how long it keeps it.";

export const metadata: Metadata = {
	title: "Privacy Policy — AgentCheck",
	alternates: {
		canonical: "/privacy",
		types: { "text/markdown": "/privacy.md" },
	},
	description: DESCRIPTION,
};

const mail = `mailto:${LEGAL.email}?subject=AgentCheck%20privacy`;

export default function PrivacyPage() {
	return (
		<LegalPage
			title="Privacy Policy"
			path="/privacy"
			description={DESCRIPTION}
			intro={
				<>
					AgentCheck is operated by {LEGAL.operator}. This policy explains what
					the hosted service on this website collects and why. We keep it short
					and specific, and because the code is{" "}
					<a href={LEGAL.repo}>open source</a>, you can check every point below
					against what the service actually does.
				</>
			}
		>
			<h2>Who this covers</h2>
			<p>
				This policy covers the AgentCheck service on this website only. The
				AgentCheck code is published under the {LEGAL.licence} licence, and
				anyone can run their own copy; a copy run by someone else is that
				person's service, and their own privacy terms apply to it.
			</p>

			<h2>What we collect</h2>
			<ul>
				<li>
					<strong>Your account, if you create one.</strong> Sign-in is handled
					by Clerk. We store your account id, your email address, your role and
					whether the account is active. Passwords and sign-in tokens stay with
					Clerk; we never see them.
				</li>
				<li>
					<strong>The checks you run.</strong> The address you submit, the
					address it redirected to, the mode (quick or full), the result, the
					score and the times it was queued, started and finished. For signed-in
					users the check is linked to the account so it shows in History.
				</li>
				<li>
					<strong>A screenshot, for full checks.</strong> For a full check, a
					screenshot of the first screen of the checked page, as our browser saw
					it.
				</li>
				<li>
					<strong>A site icon.</strong> The site's icon (favicon), as its server
					provides it.
				</li>
				<li>
					<strong>Fix files, if you generate them.</strong> For a check linked
					to your account you can generate ready-made files (robots.txt,
					llms.txt and page tags). They are built from the public pages of the
					checked site and stored with the check.
				</li>
				<li>
					<strong>A hash of your network address.</strong> We do not store your
					IP address. To enforce rate limits we keep a keyed hash of it (for
					IPv6, of its /64 network), which cannot be turned back into the
					address without a secret key that never leaves our servers.
				</li>
				<li>
					<strong>Cookies and browser storage.</strong> Clerk sets the cookies
					needed to keep you signed in. Your light or dark theme choice is kept
					in your browser's local storage. We use no analytics, advertising or
					tracking cookies.
				</li>
			</ul>
			<p>
				A check reads the public pages of the website you name, such as its
				robots.txt, llms.txt and page markup. The report keeps what the checks
				found there; it does not keep whole pages.
			</p>

			<h2>How we use it</h2>
			<p>
				Only to run the service: to perform the checks, show your reports and
				history, keep usage within fair limits and stop abuse. We do not sell
				data, show ads or use your data to train AI models.
			</p>

			<h2>Who else handles it</h2>
			<ul>
				<li>
					<strong>Clerk</strong> provides sign-in and holds your account
					credentials.
				</li>
				<li>
					<strong>Our hosting and database provider</strong> runs the service
					and stores the data described above.
				</li>
				<li>
					<strong>The websites you check</strong> receive requests from our
					checker, which identifies itself with an AgentCheck user agent. They
					learn nothing about you from it.
				</li>
			</ul>
			<p>
				If you share a report, anyone with the share link can open it and its
				badge until you stop sharing.
			</p>

			<h2>How long we keep it</h2>
			<ul>
				<li>
					Checks run without an account are deleted automatically after{" "}
					{LEGAL.anonymousRetentionDays} days.
				</li>
				<li>
					Checks linked to an account are kept until the account is deleted.
					When you delete your account (in Manage account), we delete your user
					record and all your checks automatically. Screenshots and site icons
					are kept and deleted together with their audit, and so are fix files.
				</li>
				<li>
					The network address hash is stored with the check and goes when the
					check does.
				</li>
				<li>
					Backups of the server are kept for up to {LEGAL.backupRetentionWeeks}{" "}
					weeks, so deleted data can remain in a backup for that long before it
					is overwritten. Backups are never used to restore data you deleted,
					except to recover the whole service after a failure.
				</li>
			</ul>

			<h2>Your rights</h2>
			<p>
				Depending on where you live, including under Israel's Protection of
				Privacy Law and the GDPR, you may ask us to show, correct or delete your
				data. Write to <a href={mail}>{LEGAL.email}</a>. You can delete your
				account yourself at any time, or ask us to, and we do it within 30 days.
			</p>

			<h2>Security</h2>
			<p>
				The service runs over HTTPS, stores network addresses only as keyed
				hashes and refuses to check private or internal network addresses.
				Because the code is public, anyone can review how this is done.
			</p>

			<h2>Children</h2>
			<p>
				AgentCheck is a tool for website owners and is not meant for children
				under 16.
			</p>

			<h2>Changes</h2>
			<p>
				If this policy changes, we update it here and change the date at the
				top.
			</p>

			<h2>Contact</h2>
			<p>
				Questions or requests: <a href={mail}>{LEGAL.email}</a>.
			</p>
		</LegalPage>
	);
}
