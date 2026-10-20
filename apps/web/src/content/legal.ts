/** Facts the Privacy Policy, the Terms of Use and the footer share. */
export const LEGAL = {
	operator: "Yan Fishel (fishart)",
	email: "yan.fishel@gmail.com",
	country: "Israel",
	/** Shown as "Last updated"; change it whenever either document changes. */
	updated: "20 October 2026",
	repo: "https://github.com/yanfishel/agentcheck",
	licence: "MIT",
	/** Must match ANONYMOUS_RETENTION_DAYS in @agentcheck/db (a test pins it). */
	anonymousRetentionDays: 30,
	/** How long the hosting provider keeps backups of the server. */
	backupRetentionWeeks: 4,
} as const;
