# Web UI rules (`apps/web`)

Read this before changing anything under `apps/web/src`. Security and data rules
(auth, access, routes) stay in `CLAUDE.md`; this file is the look, the
components and the copy.

## Brand

- The mark is `components/brand-mark.tsx`: one inline SVG (frame, spark, letters
  AC). States `idle|queued|running|done|failed` are `.ac--*` classes in
  `app/globals.css`; only `.ac-spark` animates; done and failed change colour
  only. The favicon is `app/icon.svg`.
- The grade is `GradeMark` (`components/report/grade-mark.tsx`): the same frame
  and spark with the grade in place of AC. Its frame and letters take the
  grade's colour (`gradeStroke`: green A+/A, yellow B–D, red F); the spark keeps
  `currentColor` (white on the band). `stamp` mode is the small seal on a plum
  tile (frame centred on the tile, lighter lines, spark past the corner with
  `--spark-shadow`), used over thumbnails in the report band and in history.
- Keep the frame and spark paths identical in `brand-mark.tsx`,
  `grade-mark.tsx` and `icon.svg`. The spark is centred on the frame's corner
  (78,22) with equal arms; the frame's cuts end 10 units from the spark's tips.
- `.ac` sets the mark's own colour, so a mark on a coloured surface needs an
  explicit text colour class on the `<svg>`.
- The brand colour is plum (`--accent`). Green `--pass` and red `--fail` are
  status colours, never brand colours.

## Tokens and theme

- Tokens live in `app/globals.css` (both themes) and reach Tailwind through
  `@theme inline`. New colours are tokens, never literals in components.
- Light/Dark/System via `ThemeMenu`. Tokens use `light-dark()` and follow
  `color-scheme`; a pinned theme is `data-theme="light|dark"` on `<html>`, set
  before paint by `themeScript` (`components/theme.ts`, `localStorage`);
  "system" leaves the attribute off. The `dark:` variant is redefined to follow
  this, so use `dark:`, never raw `prefers-color-scheme`.
- The plum band (header, landing hero, "How it works" and closing band, report,
  waiting and failed band, landing example) looks the same in both themes: its root carries `.on-band`, which
  maps `--accent`/`--accent-fg` onto the fixed `--band-bg`/`--band-fg`. Band
  tokens (`--band-*`, `--hero-*`, `--thumb-ring`, `--score-halo`) have one
  value. No `dark:` on band content; overlays opened from it render in a portal
  and follow the theme.
- Status on the band uses `--band-*` (green, yellow, red in three discrete
  steps picked to read on plum, no blends). The score ring's arc colours by
  grade via `gradeStroke`; a soft white halo (`--score-halo`) sits under the
  ring, the pending ring included.
- Dialog backdrops use the dark `--scrim` in both themes.
- Code windows (`--code-*`) are dark in both themes.

## Layout and components

- The root layout renders `SiteHeader` and `SiteFooter` on every page; pages
  never add their own footer.
- Every page, the header and the footer use `max-w-page` (`--container-page`,
  1040px), never a local width.
- Overlays (tooltip, menu, dialog, toast, collapsible) come only from
  `components/ui/` (thin wrappers over `@base-ui/react`); nothing else imports
  `@base-ui/react`. `Dialog` has a corner close button and 15 px under the
  title; `size="medium"` is for a `CodeWindow` (Get badge), `size="wide"` for large
  images. One `TooltipProvider` is mounted in the root layout; `Tooltip` has no
  provider of its own.
- Icons come only from `lucide-react`, `aria-hidden`. Exceptions, custom bare
  glyphs in `currentColor` that lucide must not replace: the GitHub mark
  (`components/github-icon.tsx`), the robot in the start form
  (`components/robot-icon.tsx`) and the network logos of the share sheet
  (`components/report/share-icons.tsx`, one viewBox each).
- Everything clickable shows `cursor: pointer` from the base-layer rule in
  `globals.css`; never add `cursor-default` to something clickable (the only
  exception: tooltip-only chips that do nothing on click).
- Lists that can grow (admin users and audits; history) page with
  `Pagination` (`components/ui/pagination.tsx`) under the list: First and Last
  as round icon buttons (from three pages on), Previous, "Page N of M", Next;
  on a phone Previous and Next are icon-only too. The page is `?page=N` (page 1
  has no parameter), read with `pageWindow` (`server/paging.ts`), which clamps
  bad or out-of-range values; other query parameters (a filter) are kept.
  Admin lists show 25 rows, history 10 sites. Admin users and audits have a
  search box above the table (`ListSearch`, `components/ui/list-search.tsx`):
  a GET form with `?q=`, read with `searchQuery`, kept with the filter and the
  pagination.
- A failed audit (`components/audit-failed.tsx`) keeps the report's frame:
  the band with `FailedRing` (empty track, "Failed" in band red) and the failed
  mark in band red, the action row (Run again by the report's rule, Try another
  URL), and the error text as is in a card.
- Gauges (`components/report/gauge.tsx`) centre their label through a grid
  wrapper; don't wrap labels in a plain block.
- Category identity: colour (`--cat-*`), icon and short name in
  `components/category-meta.tsx`, used by the landing and the report;
  `renderHtml` keeps the same steps in `CATEGORY_COLOURS` (keep both in sync).
  Category hues colour icons, rings and dots only, never text or scores. The
  category order is `CATEGORIES` from `@agentcheck/core/scoring` everywhere,
  never re-sorted locally.
- Site identity: `SiteIcon` (`components/site-icon.tsx`) shows the stored
  favicon or a lucide `Globe` in the same 16 px box (a `decode()` check covers
  images that fail before hydration). The screenshot thumbnail
  (`components/report/screenshot-thumb.tsx`, history: `components/history-thumb.tsx`)
  carries the grade as a stamp on its bottom-left corner.
- Code snippets go in `CodeWindow` (`components/ui/code-window.tsx`). Syntax
  classes come from `code` in `ui/code-tokens.ts`, a plain module, because
  constants exported from a `"use client"` file reach server components as
  client references. The landing's terminal output is the real
  `renderTerminal` run on the saved example audit.
- The landing's example (`landing/example-report.tsx`) is a saved real audit
  of vite.dev (`content/example-audit.json`, screenshot and site icon in
  `public/example/`, all from `apps/web/scripts/capture-example.ts`), rendered
  like a live report: the full band on a rounded plum card with the backdrop,
  ring, thumbnail and icon, no actions. Its heading, line and the primary
  "Check your site" button (to `#start`) sit above the card, like every other
  section's heading.
- "How it works" (`landing/how-it-works.tsx`) is a full-width plum band
  outside the page's width container (backdrop without lit cells), its steps
  as light tiles on the plum (`bg-accent-fg/10`, a faint border), not cards.
- The landing ends with `CheckNow` (`landing/check-now.tsx`): the hero's plum
  band again (backdrop without lit cells; the hero keeps the page's one
  moving moment), "Check your site now", one line and a second
  `StartAuditForm` (`id="check-now"`, `tone="band"`: its own field id, hint in
  the band's colours, never takes focus). The section order above it stays.
- The site is AI-ready itself (our own CLI must keep it at A): `content/site.ts`
  holds its URL (`https://agentcheck.dev`, a constant because the landing is
  built before the server's env exists) and the root metadata (metadataBase,
  OpenGraph, Twitter card); `app/robots.ts`, `app/sitemap.ts`,
  `app/opengraph-image.tsx` (built at build time, `drawSiteOg`; our font from
  `app/_og/`, each font URL a literal or the bundler loads one file for both
  weights); `public/llms.txt`,
  `public/llms-full.txt` and `public/index.md` are hand-kept, and
  `test/app/ai-ready.test.tsx` fails when a landing heading is missing from
  `index.md` or `llms-full.txt`, so change them with the landing's copy. The
  landing carries JSON-LD (`landing/structured-data.tsx`) and
  `<link rel="alternate" type="text/markdown" href="/index.md">`.
- OG pictures are drawn only in `app/_og/draw.tsx`: `drawSiteOg` (the site
  picture) and `drawReportOg` (a shared report's, served at
  `/api/shared/[token]/og.png`). Report layout: brand row with the score ring
  top right, the grade seal before "AI readiness of" + host, the call line at
  the bottom, the hero grid with 64px cells. A long host shrinks, then is cut
  from the left with "…". Grade letters are HTML text, never SVG `<text>`: the
  production renderer has no fonts for SVG text.
- On a phone (below `sm`) the header shows the mark only; the name stays for
  screen readers.
- Same-page anchors scroll smoothly (`scroll-behavior` on `<html>` with
  `data-scroll-behavior="smooth"` so Next keeps it; off under reduced motion)
  and land 1.5rem below the top. The URL field gets focus on load where there
  is a mouse (`pointer: fine`, never on touch, where it would open the
  keyboard) and after any click on a link to `#start`.
- In a skipped category the reason is shown once, in its header; each check
  row then shows the check's title instead of repeating it.
- A category header is icon and title in one flex item of natural width
  (`flex-auto min-w-0`) and the chips in another; chips that do not fit
  beside the whole title wrap under it. The title never gets a zero basis: at
  320 px that left it a sliver of the line and its words ran under the chips.
- Confetti: a done full report (`mode === "full"`) with a total score of 100
  fires one salvo from the band's ring (`report/score-confetti.tsx`, four shots
  800 ms apart, `canvas-confetti` loaded by a dynamic `import()` only then), on
  every open of the report page and of the shared one. Never on a quick check,
  on the landing example or with `prefers-reduced-motion: reduce` (checked
  before the import, so nothing is downloaded). It fires once per mount, so the
  polling `router.refresh()` does not repeat it; no loop, no setting.
- The audit page (`/audits/[id]`) is one `LiveReport` (`components/live-report.tsx`)
  from queued to done, rendering one `AuditReport` at one place, so the
  refresh at the end updates the running report instead of replacing it
  (tiles and sections keyed by category stay the same elements; only the band
  is replaced). While queued or running it polls `/api/audits/[id]` every
  second (5 minutes, then "Reload the page"; the queue stall message after
  30 s queued, both under the action row) and fills in from its
  `progress`. The whole report is in place from the start: the band with the
  spinning "Queued"/"Running" ring, the globe and the waiting brand mark; the
  action row the finished report will show this viewer (`ReportActions
  pending`: faded `opacity-45`, `inert`); four pulsing placeholder tiles; the
  Fix files block waiting (muted icon and title, a pulsing line, Generate
  disabled); and a waiting row per category (`WaitingSection`: the section's
  box, icon and title, a pulsing chip where the score goes, a faded chevron,
  not a button). The site's icon pops in over the globe when fetched. A
  category whose checks are all in pops its tile in (scale 0.94→1, opacity
  0.4→1, 520 ms, slight overshoot) with its gauge and number counting up
  (700 ms, ease-out), and its section fades and rises in (4 px, 480 ms) in
  its waiting row's slot, with its real check rows: with warnings or failures
  it mounts closed and opens itself through the accordion (the height
  animates), without them it stays closed. When a file is called for, the
  Fix files text fades in ("… built from your site's own pages. Available
  when the check finishes.", Generate still disabled); when every category
  the fix files come from is in and none calls for one (`fixKindsSettled`)
  the block collapses (grid row, opacity and margin to zero, 500 ms) and
  stays gone, also at done. On done the last tiles and sections arrive, the
  ring pops in and counts up to the total (900 ms), the screenshot rises in
  where the brand mark was (the grade fades in without one), the same action
  row turns on with a short opacity fade (nothing moves), asides and footers
  appear, Generate turns on, and confetti keeps its rule. Nothing in the
  first render animates, so a report opened when done (or reloaded) stays
  still and opens its problem sections at once; with
  `prefers-reduced-motion: reduce` everything appears in place (all arrival
  classes and pulses are `motion-safe:`, count-ups jump to the value,
  sections open and Fix files disappears at once). A failed audit shows
  `AuditFailed`; partial tiles are not kept.

## Account-gated actions

- Sign in and Sign up open Clerk's modal on the same page; the account menu is
  our `UserMenu`, never Clerk's `UserButton`.
- Clerk's components use Clerk's own default theme, which follows the page's
  `color-scheme` (light or dark with the site); `appearance.variables` in
  `app/layout.tsx` sets only the brand colour (`colorPrimary: "#6e2a5e"` with
  `colorPrimaryForeground: "#ffffff"`, a
  plain hex: Clerk derives its button shades from it and a CSS variable leaves
  the primary button empty; the Clerk dashboard's colours reach only Clerk's
  hosted pages), our font and corner radius, and
  `appearance.options.logoImageUrl` the mark on its plum tile
  (`public/brand/agentcheck-icon-512.png`). No `@clerk/themes`, no token mapping
  (it made the modal look washed out).
- `app/global-error.tsx` replaces the root layout when it fails: its own
  document, no header, footer or Clerk, never the error text.
- Every Full check button (start form, `RerunButton` with `mode="full"`) gives a
  guest, or any 401, `FullCheckDialog` instead of a request. The guest's
  press is the intent: it is remembered (`rerun-intent.ts`, sessionStorage,
  keyed by the audit (or `START_SCOPE` for the start form) and the mode, 10
  minutes) and, once the viewer is signed in on that page, the run starts by
  itself: on the landing the start form posts the URL that was typed; on a
  report page the `RerunButton` of that mode with `auditId` does it. A
  guest's Full check remembers a full run; a guest's Generate fix files
  remembers a run in the audit's own mode (the fix files then come from that
  owned report). Only the press counts:
  closing the dialog without Sign in or Sign up forgets it (`AccountDialog`'s
  `onDismiss`), and nothing ever starts without a press.
- On a done quick report the skipped browser category carries `FullCheckOffer`
  under its header (`CategorySection`'s `aside`, outside the collapsible
  trigger, shown whether the panel is open or not): one line and the same
  Full check button. Not on `/r/…` and not in the landing's example.
- The shared report (`/r/[shareToken]`) is the report only: no actions
  (no Share, Get badge, Export, Run again), for anyone; the owner acts from
  their own report page.
- Share shows on every report page: a
  guest gets `AccountDialog`; a signed-in non-owner a "run it from your
  account" dialog with Run again; the owner without a link "Make this report
  public?" (Create link); the owner with a link the share sheet (link and Copy,
  X, LinkedIn, Facebook, Reddit, Hacker News, Bluesky, Email from
  `share-targets.ts`, the system share sheet where available, Stop sharing).
  Get badge goes through the same flow.
- Fix files (owner only): the block `FixFilesPanel` (`components/report/fix-files/`) sits between the category tiles and the category sections, on an audit with a fixable failure (while it runs, from the start in a waiting state, then with the files as soon as the categories that are in call for one: Generate disabled and the status line ends with " Available when the check finishes."; it collapses once the kinds are settled with none), and not on the shared page. It has four states: Generate fix files, running (disabled "Generating…" with progress or a plain line, polled like `LiveReport`), failed (error and Try again, up to 3 attempts), done (Copy prompt for your agent, Download zip, one `CodeWindow` with a tab per file with Copy and Download, the target line, skipped files with reasons, and the "Fill in by hand (N)" plaque). The page gets at most the first 20 KB of each file (`FIX_PREVIEW_MAX`); under the window a cut file has a muted line "Showing the first 20 KB of llms-full.txt (1.2 MB). Download for the full file." Copy always copies the whole file: a cut file and the agent prompt are fetched from their downloads on click (`CopyButton` with `load`, a `ClipboardItem` with a promised blob so Safari keeps the gesture), and a failed fetch never shows "Copied". A guest who clicks Generate gets `AccountDialog` (the press is remembered, see the Full check rule: after sign-in the check runs again from their account and the files come from that report); a signed-in non-owner, and anyone on an anonymous audit, the "run it from your account" dialog with Run again (as Share). The admin sees finished files read-only, without Generate.
- Category footer (`fix-files/footer.tsx`): a row at the bottom of a category section that has a failed check a file fixes (never Agentic Actionability): all applicable files of this category (for example robots.txt, or llms.txt, llms-full.txt and the markdown twin) and a secondary Generate fix files button with the same access flows; while running the button says "Generating…", when done the row is a link "Open <file> in Fix files" that selects the first file's tab, failed offers Try again.
- Report actions: Run again and (after a quick check) Full check on the left;
  Share, Get badge, Export on the right.

## Copy

- No emojis, no all-caps eyebrow labels, no arrows appended to link or button
  text, no meta strings joined with middle dots (use chips).
