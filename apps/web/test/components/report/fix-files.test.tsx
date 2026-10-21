// @vitest-environment jsdom
import {
	act,
	cleanup,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FixFilesFooter } from "@/components/report/fix-files/footer";
import { FixFilesPanel } from "@/components/report/fix-files/panel";
import { FixFilesProvider } from "@/components/report/fix-files/provider";
import { takeRerun } from "@/components/rerun-intent";
import { ToastProvider } from "@/components/ui";
import type { FixFilesPreview, FixFilesView } from "@/server/fix-files";

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
let signedIn = true;
vi.mock("@clerk/nextjs", () => ({
	useAuth: () => ({ isLoaded: true, isSignedIn: signedIn }),
	useClerk: () => ({ openSignIn: vi.fn(), openSignUp: vi.fn() }),
}));

const CATEGORY_IDS = [
	"ai-manifests",
	"bot-access",
	"content-semantics",
	"agentic-actionability",
];

const files: FixFilesPreview = {
	files: [
		{
			kind: "robots",
			name: "robots.txt",
			target: "Replace /robots.txt at the site root",
			fixes: ["ai-bots-allowed"],
			content: "User-agent: *\nAllow: /\n",
			todos: [],
			previewOf: null,
		},
		{
			kind: "llms",
			name: "llms.txt",
			target: "New file at /llms.txt",
			fixes: ["llms-txt"],
			content:
				"# Example\n\n- [About](https://example.com/about): <!-- TODO: add a description of /about -->\n",
			todos: [{ text: "llms.txt: add a description of /about" }],
			previewOf: null,
		},
		{
			kind: "llms-full",
			name: "llms-full.txt",
			target: "New file at /llms-full.txt",
			fixes: ["llms-full-txt"],
			content: "# Example\n",
			todos: [],
			previewOf: null,
		},
		{
			kind: "markdown",
			name: "pricing.md",
			target: "Serve at /pricing.md",
			fixes: ["markdown-twin"],
			content: "# Pricing\n",
			todos: [],
			previewOf: null,
		},
		{
			kind: "head",
			name: "head.html",
			target: "Add inside <head> of https://example.com/",
			fixes: ["opengraph"],
			content: '<meta property="og:image" content="TODO: an image URL">\n',
			todos: [
				{
					text: "head.html: og:image, a 1200×630 picture (none found on the page)",
				},
			],
			previewOf: null,
		},
	],
	skipped: [],
	pagesRead: 18,
	pagesFailed: 0,
	generatedAt: new Date().toISOString(),
	toolVersion: "0.1.0",
};

const none: FixFilesView = {
	status: "none",
	kinds: ["robots", "llms", "llms-full", "markdown", "head"],
	attempts: 0,
	progress: null,
	error: null,
	result: null,
	hasPrompt: false,
};

const done: FixFilesView = {
	...none,
	status: "done",
	attempts: 1,
	result: files,
	hasPrompt: true,
};

function setup(
	initial: FixFilesView,
	role: "owner" | "admin" | "other" = "owner",
) {
	render(
		<ToastProvider>
			<FixFilesProvider
				auditId="a1"
				url="https://example.com"
				finalUrl="https://www.example.com/"
				mode="quick"
				role={role}
				initial={initial}
			>
				<FixFilesPanel />
				{CATEGORY_IDS.map((id) => (
					<div key={id} data-testid={`footer-${id}`}>
						<FixFilesFooter categoryId={id} />
					</div>
				))}
			</FixFilesProvider>
		</ToastProvider>,
	);
}

const panel = () => screen.getByRole("region", { name: "Fix files" });
const openPromptMenu = () =>
	userEvent.click(
		within(panel()).getByRole("button", { name: "Prompt for your agent" }),
	);
const posts = () =>
	fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	fetchMock = vi.fn();
	vi.stubGlobal("fetch", fetchMock);
	Object.defineProperty(navigator, "clipboard", {
		value: { writeText: vi.fn().mockResolvedValue(undefined) },
		configurable: true,
	});
	Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	signedIn = true;
});

describe("Fix files", () => {
	it("owner sees Generate and starts one job", async () => {
		fetchMock.mockResolvedValue(
			Response.json(
				{ ...none, status: "queued", attempts: 1 },
				{ status: 202 },
			),
		);
		setup(none);
		expect(
			within(panel()).getByText(
				/robots\.txt, llms\.txt, llms-full\.txt, markdown version and head tags/,
			),
		);
		const button = within(panel()).getByRole("button", {
			name: "Generate fix files",
		});
		await userEvent.click(button);
		expect(posts()).toHaveLength(1);
		expect(posts()[0]?.[0]).toBe("/api/audits/a1/fix-files");
		const busy = await within(panel()).findByRole("button", {
			name: "Generating…",
		});
		expect(busy).toBeDisabled();
		expect(within(panel()).getByText("Reading your site's pages…"));
		expect(
			within(panel()).queryByText(/built from your site's own pages/),
		).toBeNull();
		await userEvent.click(busy);
		expect(posts()).toHaveLength(1);
		// The footers follow the same job.
		const footer = screen.getByTestId("footer-ai-manifests");
		expect(within(footer).getByRole("button", { name: "Generating…" }));
	});

	it("guest gets the account dialog, and the press is remembered as a rerun", async () => {
		signedIn = false;
		sessionStorage.clear();
		setup(none, "other");
		await userEvent.click(
			within(panel()).getByRole("button", { name: "Generate fix files" }),
		);
		expect(
			await screen.findByRole("dialog", { name: "Fix files need an account" }),
		).toBeInTheDocument();
		expect(fetchMock).not.toHaveBeenCalled();
		expect(takeRerun("a1", "quick")).toMatchObject({
			auditId: "a1",
			url: "https://example.com",
			mode: "quick",
		});
	});

	it("closing the account dialog without signing in forgets the press", async () => {
		signedIn = false;
		sessionStorage.clear();
		setup(none, "other");
		await userEvent.click(
			within(panel()).getByRole("button", { name: "Generate fix files" }),
		);
		await screen.findByRole("dialog", { name: "Fix files need an account" });
		await userEvent.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(takeRerun("a1", "quick")).toBeNull();
	});

	it("non-owner gets the run-it-from-your-account dialog", async () => {
		setup(none, "other");
		await userEvent.click(
			within(screen.getByTestId("footer-bot-access")).getByRole("button", {
				name: "Generate fix files",
			}),
		);
		const dialog = await screen.findByRole("dialog", {
			name: "Generate them from your account",
		});
		expect(
			within(dialog).getByRole("button", { name: "Run again" }),
		).toBeInTheDocument();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("polls while running and shows the files", async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		fetchMock
			.mockResolvedValueOnce(
				Response.json({
					...none,
					status: "running",
					attempts: 1,
					progress: { read: 12, planned: 30 },
				}),
			)
			.mockResolvedValueOnce(Response.json(done));
		setup({ ...none, status: "running", attempts: 1 });
		expect(within(panel()).getByText("Reading your site's pages…"));
		await act(() => vi.advanceTimersByTimeAsync(1500));
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/audits/a1/fix-files",
			expect.objectContaining({ cache: "no-store" }),
		);
		expect(within(panel()).getByText("Reading 12 of 30 pages…"));
		await act(() => vi.advanceTimersByTimeAsync(1500));
		expect(
			within(panel()).getByRole("tab", { name: "robots.txt" }),
		).toHaveAttribute("aria-selected", "true");
		expect(within(panel()).getByRole("tab", { name: "llms.txt" }));
		expect(within(panel()).getByRole("tab", { name: "head.html" }));
		expect(
			within(panel()).getByText("Replace /robots.txt at the site root"),
		).toBeVisible();
		expect(
			within(panel()).getByText(/Built from 18 pages of www\.example\.com/),
		).toBeInTheDocument();
		const plaque = within(panel()).getByText("Fill in by hand (2)")
			.parentElement as HTMLElement;
		const files = within(plaque)
			.getAllByRole("term")
			.map((term) => term.textContent);
		const items = within(plaque)
			.getAllByRole("definition")
			.map((item) => item.textContent);
		expect(files).toEqual(["llms.txt", "head.html"]);
		expect(items).toEqual([
			"Add a description of /about",
			"og:image, a 1200×630 picture (none found on the page)",
		]);
		expect(plaque).not.toHaveTextContent("head.html: head.html");
		const calls = fetchMock.mock.calls.length;
		await act(() => vi.advanceTimersByTimeAsync(3000));
		expect(fetchMock.mock.calls.length).toBe(calls);
	});

	it("shows the reading line while the start request is on its way", async () => {
		fetchMock.mockReturnValue(new Promise(() => {}));
		setup(none);
		await userEvent.click(
			within(panel()).getByRole("button", { name: "Generate fix files" }),
		);
		expect(within(panel()).getByText("Reading your site's pages…"));
	});

	it("queued with progress shows the pages read, not the offer", () => {
		setup({
			...none,
			status: "queued",
			attempts: 1,
			progress: { read: 12, planned: 30 },
		});
		expect(within(panel()).getByText("Reading 12 of 30 pages…"));
		expect(
			within(panel()).queryByText(/built from your site's own pages/),
		).toBeNull();
	});

	it("a 404 while polling shows the reload line", async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
		setup({ ...none, status: "running", attempts: 1 });
		await act(() => vi.advanceTimersByTimeAsync(1500));
		expect(within(panel()).getByText(/Reload the page/)).toBeInTheDocument();
	});

	it("failed shows the error and Try again", async () => {
		fetchMock.mockResolvedValue(
			Response.json(
				{ ...none, status: "queued", attempts: 2 },
				{ status: 202 },
			),
		);
		setup({
			...none,
			status: "failed",
			attempts: 1,
			error: "The site could not be reached",
		});
		expect(within(panel()).getByText(/The site could not be reached/));
		await userEvent.click(
			within(panel()).getByRole("button", { name: "Try again" }),
		);
		expect(posts()).toHaveLength(1);
	});

	it("failed after the last attempt asks for a new check", () => {
		setup({
			...none,
			status: "failed",
			attempts: 3,
			error: "The site could not be reached",
		});
		expect(within(panel()).getByText(/Run a new check/)).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
	});

	it("category footer opens its file", async () => {
		setup(done);
		const footer = screen.getByTestId("footer-ai-manifests");
		await userEvent.click(
			within(footer).getByRole("link", { name: "Open llms.txt in Fix files" }),
		);
		expect(
			within(panel()).getByRole("tab", { name: "llms.txt" }),
		).toHaveAttribute("aria-selected", "true");
		expect(within(panel()).getByText("New file at /llms.txt")).toBeVisible();
		expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
		expect(
			within(screen.getByTestId("footer-agentic-actionability")).queryByRole(
				"link",
			),
		).toBeNull();
	});

	it("a category footer lists all its kinds and tabs show the stored names", () => {
		setup(done);
		expect(screen.getByTestId("footer-ai-manifests")).toHaveTextContent(
			"Get ready llms.txt and llms-full.txt built from your site's pages, and a markdown version of this page.",
		);
		expect(
			within(panel()).getByRole("tab", { name: "pricing.md" }),
		).toBeInTheDocument();
	});

	it("the footer lists only the applicable kinds", () => {
		setup({ ...none, kinds: ["robots", "llms", "head"] });
		expect(screen.getByTestId("footer-ai-manifests")).toHaveTextContent(
			"Get a ready llms.txt built from your site's pages.",
		);
	});

	it("a skipped file shows its reason instead of the link", () => {
		setup({
			...done,
			result: {
				...files,
				files: files.files.filter((f) => f.kind !== "robots"),
				skipped: [
					{
						kind: "robots",
						reason: "robots.txt already allows the AI crawlers on /",
					},
				],
			},
		});
		const footer = screen.getByTestId("footer-bot-access");
		expect(footer).toHaveTextContent(
			"robots.txt already allows the AI crawlers on /",
		);
		expect(within(footer).queryByRole("link")).toBeNull();
		expect(panel()).toHaveTextContent(
			"robots.txt already allows the AI crawlers on /",
		);
	});

	it("no prompt or zip when every file was skipped, but the reasons show", () => {
		setup({
			...done,
			result: {
				...files,
				files: [],
				skipped: [
					{
						kind: "robots",
						reason: "robots.txt already allows the AI crawlers on /",
					},
				],
			},
		});
		expect(
			within(panel()).queryByRole("button", {
				name: "Prompt for your agent",
			}),
		).toBeNull();
		expect(
			within(panel()).queryByRole("link", { name: "Download zip" }),
		).toBeNull();
		expect(panel()).toHaveTextContent(
			"robots.txt was not built: robots.txt already allows the AI crawlers on /.",
		);
	});

	it("renders file content as text", () => {
		setup({
			...done,
			result: {
				...files,
				files: [
					{
						...(files.files[2] as FixFilesPreview["files"][number]),
						content: "<img src=x onerror=alert(1)>",
					},
				],
			},
		});
		expect(panel()).toHaveTextContent("<img src=x onerror=alert(1)>");
		expect(panel().querySelector("img")).toBeNull();
	});

	it("admin sees files but no Generate", () => {
		setup(done, "admin");
		expect(within(panel()).getByRole("tab", { name: "robots.txt" }));
		expect(screen.queryByRole("button", { name: /Generate/ })).toBeNull();
	});

	it("admin sees no Generate before generation either", () => {
		setup(none, "admin");
		expect(screen.queryByRole("button", { name: /Generate/ })).toBeNull();
	});

	it("no block and no footers when nothing is fixable", () => {
		setup({ ...none, kinds: [] }, "owner");
		expect(screen.queryByRole("region", { name: "Fix files" })).toBeNull();
		for (const id of CATEGORY_IDS) {
			expect(screen.getByTestId(`footer-${id}`)).toBeEmptyDOMElement();
		}
	});

	it("Download zip, and the prompt menu copies the prompt", async () => {
		setup(done);
		const zip = within(panel()).getByRole("link", { name: "Download zip" });
		expect(zip).toHaveAttribute("href", "/api/audits/a1/fix-files/zip");
		expect(zip).toHaveAttribute("download");
		const file = within(panel()).getByRole("link", {
			name: "Download robots.txt",
		});
		expect(file).toHaveAttribute("href", "/api/audits/a1/fix-files/robots.txt");
		const prompt = "You are working in the repository of https://example.com/.";
		fetchMock.mockResolvedValue(new Response(prompt));
		await openPromptMenu();
		await userEvent.click(
			await screen.findByRole("menuitem", { name: "Copy to clipboard" }),
		);
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/audits/a1/fix-files/prompt",
			expect.objectContaining({ cache: "no-store" }),
		);
		expect(navigator.clipboard.writeText).toHaveBeenCalledWith(prompt);
		expect(await screen.findByText("Prompt copied")).toBeInTheDocument();
	});

	it("the prompt menu downloads the prompt as a text file", async () => {
		setup(done);
		await openPromptMenu();
		const link = await screen.findByRole("menuitem", {
			name: "Download AGENT-PROMPT.txt",
		});
		expect(link).toHaveAttribute("href", "/api/audits/a1/fix-files/prompt");
		expect(link).toHaveAttribute("download");
	});

	it("a failed prompt fetch does not show Copied", async () => {
		setup(done);
		fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
		await openPromptMenu();
		await userEvent.click(
			await screen.findByRole("menuitem", { name: "Copy to clipboard" }),
		);
		await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
		expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
		expect(screen.queryByText("Prompt copied")).toBeNull();
		expect(
			await screen.findByText(
				"Could not copy the prompt. Download it instead.",
			),
		).toBeInTheDocument();
	});

	describe("a file cut to a preview", () => {
		const full = "line of llms-full\n".repeat(70_000);
		const cut: FixFilesView = {
			...done,
			result: {
				...files,
				files: files.files.map((file) =>
					file.kind === "llms-full"
						? { ...file, content: "# Example\n", previewOf: 1_258_291 }
						: file,
				),
			},
		};
		const openCut = async () => {
			setup(cut);
			await userEvent.click(
				within(panel()).getByRole("tab", { name: "llms-full.txt" }),
			);
		};

		it("shows a chip with the sizes in the status bar", async () => {
			await openCut();
			expect(
				within(panel()).getByText("Preview: 20 KB of 1.2 MB"),
			).toBeVisible();
		});

		it("has no chip for a file shown whole", () => {
			setup(cut);
			// Every tab's status line is in the page; only the cut file has a chip.
			expect(within(panel()).getAllByText(/^Preview:/)).toHaveLength(1);
			// It belongs to another tab: hidden from the page and from screen readers.
			expect(
				within(panel())
					.getByText("Preview: 20 KB of 1.2 MB")
					.closest('[aria-hidden="true"]'),
			).not.toBeNull();
		});

		it("Copy fetches the full file", async () => {
			await openCut();
			fetchMock.mockResolvedValue(new Response(full));
			await userEvent.click(
				within(panel()).getByRole("button", { name: "Copy llms-full.txt" }),
			);
			expect(fetchMock).toHaveBeenCalledWith(
				"/api/audits/a1/fix-files/llms-full.txt",
				expect.objectContaining({ cache: "no-store" }),
			);
			expect(navigator.clipboard.writeText).toHaveBeenCalledWith(full);
		});

		it("Copy of a whole file copies it without a request", async () => {
			setup(cut);
			await userEvent.click(
				within(panel()).getByRole("button", { name: "Copy robots.txt" }),
			);
			expect(fetchMock).not.toHaveBeenCalled();
			expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
				"User-agent: *\nAllow: /\n",
			);
		});

		it("a failed fetch does not show Copied", async () => {
			await openCut();
			fetchMock.mockRejectedValue(new TypeError("offline"));
			await userEvent.click(
				within(panel()).getByRole("button", { name: "Copy llms-full.txt" }),
			);
			await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
			expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
			expect(
				within(panel()).queryByRole("button", { name: "Copied" }),
			).toBeNull();
		});
	});
});
