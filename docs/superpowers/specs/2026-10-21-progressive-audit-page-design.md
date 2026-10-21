# Progressive audit page — design

Agreed with the author on 2026-10-21. The throwaway spike the author reviewed
live (real report components, invented scores and timing) is
`2026-10-21-progressive-audit-page/spike.tsx`; it is a picture of the
behaviour, not code to keep.

## Intent

While an audit runs, `/audits/[id]` shows a spinning ring and four pulsing
placeholder tiles for 5–15 seconds, then swaps in the whole report at once.
The wait is dull. The author wants the page to fill in with **real data as it
becomes ready**, with soft animations, the way modern tools stream results.

Where the time goes today: the static checks (manifests, robots, meta tags,
semantics) and the favicon finish in a second or two; the browser render
(Agentic Actionability and the screenshot) takes most of the wait. The engine
already runs every check concurrently, but `runAudit` returns one result at
the end and the worker stores everything at once.

## Goals

- The running page shows each category's real score as soon as all its checks
  are done, the favicon as soon as it is fetched, and the rest at the end.
- The change from "running" to "done" is seamless: nothing already on screen
  jumps, remounts or replays its animation.

## Non-goals

- `AuditResult` (the public JSON contract) does not change, and neither do
  the CLI's output or its exit codes. The CLI does not stream.
- No WebSockets or server-sent events: the page keeps polling.
- No partial data anywhere but the running page of the audit itself: not on
  `/r/[shareToken]` (only done audits are shared), `/history`, admin, exports,
  badge or OG picture.
- No change to who may see an audit (`requireAuditAccess`) or to fix-files
  ownership rules.

## Anti-goals

- A layout jump at the end (the Fix files block or the sections shoving
  content down when the audit finishes).
- Animations replaying when a finished report is opened later: entrance
  animations are for things that arrive while the viewer watches.
- A partial or half-drawn report left on screen after a failure.
- Partial data overwriting or outliving the final result: the stored
  `result` stays the only source of truth once the audit is done.

## What the viewer sees (approved live)

Timings below are the spike's, for feel; real ones are whatever the audit takes.

1. **Start.** The band as today: spinning "Running" ring, host, URL with a
   globe, mode chip, brand mark. Below, four tiles in the pulsing placeholder
   state (variant **B**, today's `PendingTiles` look; the author rejected a
   spinner per tile).
2. **Favicon.** When fetched, it replaces the globe beside the URL with a
   short pop.
3. **A category is done** (all its checks are in). Its tile "pops" (scale
   0.94→1, opacity 0.4→1, ~0.5 s, slight overshoot), its gauge arc grows from
   0 to the score and the number counts up (~0.7 s, ease-out), coloured by the
   usual tone (pass ≥ 90, warn ≥ 50, fail). **At the same moment its section
   (accordion row) fades and rises in** below (4 px up, ~0.5 s) — sections
   arrive with their tiles, not all at the end (the author preferred this
   over a staggered reveal at the end). Sections always keep the category
   order: a category that arrives early takes its own slot, never the end.
   A section can be opened while the audit runs and shows its real check rows.
4. **Fix files.** As soon as the categories that are in call for at least one
   fix file (`fixKindsFor` on the partial categories), the Fix files block
   fades in between the tiles and the sections, with the same animation. Its
   "Generate fix files" button is disabled and the status line adds
   "Available when the check finishes."; the list of files grows as more
   categories arrive. At the end the button turns on and that sentence goes;
   nothing moves. This applies to quick and full checks alike, with today's
   rules on who sees what (owner generates, a guest's press goes to the
   account prompt, admin reads).
5. **Done.** Agentic Actionability's tile and section arrive (on a quick
   check the tile shows "Skipped", as in the report); the screenshot fades in
   where the brand mark was; the band's ring turns into the total score with a
   count-up (~0.9 s) and the grade appears; confetti fires on a full 100 (as
   today). The action row (Run again, Share, Export…) fades in in its reserved
   place above the tiles; it never appears earlier (nothing to share yet).
   The section asides and footers that belong to a finished report (the Full
   check offer on a quick check, the per-category Fix files footer) appear
   now too. Sections with warnings or failures open as a done report opens
   them today.

With `prefers-reduced-motion: reduce` everything appears in place with no pop,
fade or count-up. A failed audit shows today's failure view; partial tiles and
sections are not kept. The queued state and its stall/give-up messages stay as
they are.

## How it works (decided)

- **Engine.** `runAudit` gets an opt-in callback, like `onFavicon` and
  `onScreenshot`: called once per check as it finishes, with that check's
  result and its category. A throwing consumer never affects the audit. The
  favicon callback fires as soon as the icon is fetched instead of after all
  checks. The returned `AuditResult` is unchanged. The CLI never sets the new
  callback. Category scores are still computed only by the central scoring
  module (`buildCategoryResults`), never by checks or by the worker ad hoc.
- **Worker.** `process-audit.ts` passes the new callback through
  `guardedAuditOptions` (its output keys are pinned by
  `apps/worker/test/process-audit.test.ts`; the pin and `CLAUDE.md` are
  updated to the new key). Each finished check is written to the audit row's
  partial data, conditionally on the row still being `running` and claimed by
  this job; the favicon row is stored when fetched under the same condition.
  A retry that reclaims the row starts with empty partial data.
  `completeAudit` stays the one place that writes `done`, the result and the
  screenshot; it clears the partial data in the same transaction.
- **Clearing (Claude's call, not discussed with the author).** Partial data
  and an early favicon row exist only for a `running` audit. Every path that
  ends a run without `done` (the worker's failure, the sweep, the
  dead-letter handler) clears the partial data and removes an early favicon
  row in the same statement or transaction; a reclaim by a retry clears both
  before the run starts again; `completeAudit` writes the favicon as an
  upsert, so an early row never conflicts with the final write. The status
  body returns partial data only while the status is `running`.
- **Storage.** An additive migration on `audits` for the partial check
  results. No new table is required.
- **Polling.** `GET /api/audits/[id]` (already behind `requireAuditAccess`)
  adds, while the audit is running, the categories that are complete (id,
  title, status, score, and their checks, computed through the central
  scoring), whether a favicon is stored, and the fix kinds they call for.
  Nothing extra for queued, done or failed audits. The page polls a little
  faster while running (about 1 s instead of 1.5 s).
- **Page.** The running page and the finished report are one layout, so
  "done" does not remount what is already shown; only newly arriving pieces
  animate. The final state is still the server-rendered report from the
  stored `result`.

## Left to the builder

- The callback's name and exact shape; whether the worker writes per check or
  batches per category (a handful of small conditional updates per audit is
  fine); the column's name and shape.
- How the running view and `AuditReport` share one tree (props for a partial
  result, or a provider) and how "done" swaps data without a full remount
  (e.g. keep the client view and fetch the final result, or a refresh that
  preserves keys).
- How Fix files' provider gets partial kinds while running.
- Exact easing curves and durations within the feel above; reusing
  `spike-pop`/`spike-fade` as Tailwind keyframes in `globals.css`.
- Tests: engine callback order and isolation, worker conditional writes and
  retry reset, the status body per state, the page's arrival logic with jsdom
  (fake timers, mocked fetch), reduced motion.
- Updating `CLAUDE.md` (engine and worker rules, the option keys) and
  `docs/web-ui.md` (the running page).

## Revision 2: the whole report in place from the start (agreed 2026-10-21)

After seeing the first build live, the author asked for every part of the
report to be on the page from the first moment, in a quiet waiting state, and
to fill in as data arrives. Approved live in
`2026-10-21-progressive-audit-page/spike-v2.tsx` (scenarios "site with errors"
and "site at 100"). This replaces the parts of "What the viewer sees" it
contradicts; everything else above stands.

- **Action row.** Run again, Full check (after a quick check), Share, Get
  badge and Export are in their place from the start (the same buttons the
  finished report will show to this viewer), faded and inactive (not
  clickable, not focusable); at done they turn fully on with a short fade.
  Nothing in the row moves.
- **Sections.** All four category sections are there from the start as
  waiting rows: icon and title as usual, a pulsing chip where the score goes,
  a faded chevron, not openable. When a category arrives its row becomes the
  real section: with warnings or failures it **opens itself** with the
  accordion's own height animation; without, it stays closed but becomes
  openable. Opening a section pushes the rows under it down smoothly; that is
  accepted. A reopened finished report is unchanged (sections with problems
  open, nothing animates); a reload mid-run shows the categories already in
  as filled sections, open per the same rule, without animation.
- **Fix files.** On a page that would show the block (today's rules on who
  sees it), the block is there from the start in a waiting state: muted icon
  and title, a pulsing line in place of the text, Generate inactive. When the
  arrived categories call for fix files, the text appears ("… built from your
  site's own pages. Available when the check finishes.") and the button stays
  inactive until done. When every category that fix files are built from has
  arrived and none calls for a file, the block **collapses** (height and
  opacity to zero, ~0.5 s) and the sections below move up; it stays gone.
  The author chose collapsing over a permanent "nothing to fix" state.
- **Reduced motion.** Sections open and the Fix files block disappears
  without animation; the waiting pulses are static.
