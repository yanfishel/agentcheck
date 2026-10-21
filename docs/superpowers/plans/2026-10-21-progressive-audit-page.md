# Progressive Audit Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The running audit page fills in with real per-category results, the favicon and the Fix files block as they become ready, with soft animations, and turns into the finished report without remounting what is already on screen.

**Architecture:** The engine reports each finished check through a new opt-in callback; the worker stores finished checks in a new `audits.partial` jsonb column (and the favicon row early), conditional on the row still being `running` and claimed by the job; every non-`done` ending and every claim clears them. `GET /api/audits/[id]` adds the complete categories (central scoring) while running. One client component renders the running and the finished report at the same place in the page tree, so `router.refresh()` at "done" updates props instead of remounting; only pieces that arrive while the viewer watches animate.

**Tech Stack:** TypeScript, Node ≥ 22.18, Next 16 (React 19), Drizzle + PostgreSQL (PGlite in tests), pg-boss, Vitest (+ jsdom/Testing Library per file), Tailwind, Biome.

**Spec:** `docs/superpowers/specs/2026-10-21-progressive-audit-page-design.md` (the live spike: `docs/superpowers/specs/2026-10-21-progressive-audit-page/spike.tsx` — feel and timings, not code to copy).

## Global Constraints

- `AuditResult` and the CLI output/exit codes do not change; the CLI never sets the new callback.
- Category scores come only from `buildCategoryResults` (`packages/core/src/scoring.ts`); checks and the worker never score.
- Code under `packages/*` and `apps/worker` uses erasable TypeScript only (no enums, namespaces, parameter properties); `packages/core` uses `.ts` import specifiers.
- The worker builds `runAudit` options only via `guardedAuditOptions({...})`; nothing from the job payload or row except URL and mode reaches them; `apps/worker/test/process-audit.test.ts` pins the output keys.
- Partial data and an early favicon exist only for a `running` audit; the status body returns them only while `running`.
- Migrations are additive and generated with `pnpm --filter @agentcheck/db db:generate`.
- Web tests import sources through `@/*`; interaction tests opt into jsdom per file.
- Animations: tile pop (scale 0.94→1, opacity 0.4→1, ~520 ms, slight overshoot); gauge arc and number count-up ~700 ms ease-out (band ring ~900 ms); section / Fix files / screenshot / actions fade-and-rise (4 px, ~480 ms). None with `prefers-reduced-motion: reduce`.
- Copy (exact): Fix files status line while running appends `" Available when the check finishes."`.
- Before reporting done: `pnpm check && pnpm typecheck && pnpm test && pnpm build`; stop `next dev` first.
- Never commit `apps/web/src/app/spike/` (the throwaway demo).

## Review Focus

1. A retry (same job id reclaiming a `running` row) must start with no partial checks and no favicon: stale tiles from the first attempt would show wrong scores. → Task 2 test `claim clears partial data and an early favicon`.
2. A late callback after a timeout (runAudit cannot be aborted) must not write into a failed row. → Task 2 test `recordAuditCheck is a no-op unless running and claimed by the job`.
3. A finished report opened later must not animate anything (no pop, no count-up). → Task 5 test `renders a done report without arrival animations`.
4. The tile/section DOM shown while running must survive the switch to done (same node, no replayed animation). → Task 6 test `keeps the running tiles mounted when the audit finishes`.
5. Quick checks: Agentic Actionability's checks report `skip` at once, so its tile becomes "Skipped" early — real data, accepted (ruling in the ledger). → Task 1 test `a quick audit's skipped category is complete`.

---

### Task 1: Engine — per-check callback, early favicon, partial categories

**Files:**
- Modify: `packages/core/src/audit.ts`
- Create: `packages/core/src/progress.ts`
- Modify: `packages/core/src/index.ts`, `packages/core/package.json` (export `./progress`)
- Test: `packages/core/test/audit-progress.test.ts`, `packages/core/test/progress.test.ts`

**Interfaces:**
- Produces:
  - `export type FinishedCheck = CheckResult & { category: CategoryId }` (from `progress.ts`, re-exported by the index).
  - `AuditOptions.onCheck?: (check: FinishedCheck) => void` — called once per check as it settles (crashed checks too, with the crash result); a throwing consumer never affects the audit.
  - `GuardedAuditOptionsInput.onCheck?` passed through; `guardedAuditOptions` output includes `onCheck` only when given.
  - `onFavicon` now fires as soon as the icon is fetched (still within `faviconBudgetMs`), before `runAudit` resolves.
  - `export function completeCategories(checks: FinishedCheck[]): CategoryResult[]` — the categories whose every registry check (`CHECKS`, by category) is present, built with `buildCategoryResults`, in `CATEGORIES` order; incomplete categories omitted.

- [ ] **Step 1: Write failing tests**
  - `audit-progress.test.ts` (MockAgent fixtures as in existing audit tests): `calls onCheck once per check with its category` (count equals `CHECKS.length`, every id once, categories match the registry); `a throwing onCheck does not change the result` (result deep-equals a run without the callback, timestamp via `now`); `onFavicon fires before runAudit resolves` (record order of a favicon callback vs. a promise `.then` on runAudit; favicon first); `guardedAuditOptions passes onCheck through` (`Object.keys(guardedAuditOptions({userAgent:"x",browser:false,onCheck}))` contains `onCheck`; absent when not given).
  - `progress.test.ts`: `omits a category until all its checks are in`; `scores a complete category like buildCategoryResults` (all checks of `ai-manifests` with pass/warn/fail → equals the matching element of `buildCategoryResults`); `keeps CATEGORIES order`; `a quick audit's skipped category is complete` (every `agentic-actionability` check with status `skip` → that category present with `status: "skipped"`).
- [ ] **Step 2: Run** `pnpm --filter @agentcheck/core exec vitest run test/audit-progress.test.ts test/progress.test.ts` — FAIL.
- [ ] **Step 3: Implement.** In `execute`, call `opts.onCheck` inside each check's promise (try/catch around the consumer). Start the favicon fetch as now and attach the consumer to its settle; still await it before returning so nothing is in flight when the fetcher closes.
- [ ] **Step 4: Run** the two files, then `pnpm --filter @agentcheck/core test` — PASS (reference-site tests unchanged).
- [ ] **Step 5: Commit** `feat(core): report each finished check and the favicon as they arrive`.

### Task 2: Database — partial checks, early favicon, clearing

**Files:**
- Modify: `packages/db/src/schema.ts` (`audits.partial: jsonb("partial").$type<Record<string, FinishedCheck>>()`, nullable)
- Create: migration via `db:generate` (`packages/db/drizzle/0007_*.sql`)
- Modify: `packages/db/src/audits.ts`, `packages/db/src/index.ts`
- Test: `packages/db/test/audit-progress.test.ts`

**Interfaces:**
- Consumes: `FinishedCheck`, `Favicon` from `@agentcheck/core`.
- Produces:
  - `recordAuditCheck(db, id, jobId, check: FinishedCheck): Promise<boolean>` — merges `{[check.id]: check}` into `partial` (`coalesce(partial,'{}'::jsonb) || …` in one UPDATE) only where `status = 'running' and claimed_by = jobId`.
  - `saveAuditFavicon(db, id, jobId, icon: Favicon): Promise<boolean>` — in one transaction, same condition: upsert the `audit_favicons` row and set `has_favicon = true`.
  - `claimAudit`: the claiming UPDATE also sets `partial = null, has_favicon = false`, and the transaction deletes the audit's favicon row.
  - `completeAudit`: sets `partial = null`; the favicon insert becomes an upsert (`onConflictDoUpdate`); `hasFavicon` is set to true when `data.favicon` is given and left unchanged otherwise (an early row stays valid).
  - `failAudit` and `failStaleAudits`: set `partial = null, has_favicon = false` and delete the favicon rows of the audits they failed, in one transaction each.
  - `Audit` type gains `partial`.

- [ ] **Step 1: Write failing tests** (PGlite, `createTestDb()`): `recordAuditCheck merges checks of the claiming job`; `recordAuditCheck is a no-op unless running and claimed by the job` (other job id → false; after `failAudit` → false and `partial` stays null); `saveAuditFavicon stores the icon and the flag`; `claim clears partial data and an early favicon` (record + save with job A, reclaim with job A → `partial` null, no favicon row, `hasFavicon` false); `completeAudit clears partial and upserts an early favicon` (save early, complete with a favicon → one row, new bytes); `failAudit clears partial and the early favicon`; `failStaleAudits clears partial and the early favicon of a stale running audit`.
- [ ] **Step 2: Run** `pnpm --filter @agentcheck/db exec vitest run test/audit-progress.test.ts` — FAIL.
- [ ] **Step 3: Implement** the schema column, `pnpm --filter @agentcheck/db db:generate`, the functions above; export the new two from the package index.
- [ ] **Step 4: Run** the file, then `pnpm --filter @agentcheck/db test` — PASS.
- [ ] **Step 5: Commit** `feat(db): keep a running audit's finished checks and favicon`.

### Task 3: Worker — store checks and the favicon while the audit runs

**Files:**
- Modify: `apps/worker/src/process-audit.ts`, `apps/worker/src/audit-store.ts`
- Test: `apps/worker/test/process-audit.test.ts`
- Modify: `CLAUDE.md` (the worker option keys: `guardedAuditOptions({ userAgent, toolVersion, browser, onScreenshot, onFavicon, onCheck })`; the partial-data rule in Service rules: written only while `running` and claimed, cleared by claim/complete/fail/sweep)

**Interfaces:**
- Consumes: Task 1 `onCheck`, Task 2 `recordAuditCheck`, `saveAuditFavicon`.
- Produces: `AuditStore.recordCheck(id, jobId, check): Promise<boolean>`, `AuditStore.saveFavicon(id, jobId, icon): Promise<boolean>`.

- [ ] **Step 1: Write failing tests:** update both pinned key lists to `["network","onCheck","onFavicon","renderer","toolVersion","userAgent"]`; `records each finished check with the job id` (fake audit calls `opts.onCheck` twice → `store.recorded` has both with `JOB_ID`); `saves the favicon when it arrives and still passes it to complete`; `a failing recordCheck neither fails the audit nor throws` (store rejects → outcome `done`, a `warn` log `audit.partial_error`).
- [ ] **Step 2: Run** `pnpm --filter @agentcheck/worker exec vitest run test/process-audit.test.ts` — FAIL.
- [ ] **Step 3: Implement:** pass `onCheck` and the existing `onFavicon` through `buildOptions`; each callback fires its store write without awaiting, catches rejections and logs them (`audit.partial_error`); keep the favicon in memory for `complete` as today. `dbAuditStore` wires the two db functions.
- [ ] **Step 4: Run** the file, then `pnpm --filter @agentcheck/worker test` — PASS.
- [ ] **Step 5: Commit** `feat(worker): store finished checks and the favicon while an audit runs`.

### Task 4: Status endpoint — progress while running

**Files:**
- Modify: `apps/web/src/server/audit-access.ts` (`AuditStatusBody`, `auditStatusBody`)
- Test: `apps/web/test/server/audit-access.test.ts` (or the existing status-body test file)

**Interfaces:**
- Consumes: `completeCategories` (`@agentcheck/core/progress`), `fixKindsFor` (`@agentcheck/core/fixes`).
- Produces: `AuditStatusBody.progress: AuditProgressData | null` with
  `export interface AuditProgressData { categories: CategoryResult[]; hasFavicon: boolean; fixKinds: FixKind[] }` —
  non-null only for `status === "running"`; `categories = completeCategories(Object.values(audit.partial ?? {}))`; `fixKinds = fixKindsFor({ categories })`.

- [ ] **Step 1: Write failing tests:** `adds progress for a running audit` (partial with every `ai-manifests` check failing `llms-txt` → one category, `fixKinds` contains `"llms"`); `progress is null for queued, done and failed audits even with partial data present`; `hasFavicon follows the row`.
- [ ] **Step 2: Run** `pnpm --filter @agentcheck/web exec vitest run test/server/audit-access.test.ts` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(web): report a running audit's finished categories in its status`.

### Task 5: Report components — partial rendering and arrival animations

**Files:**
- Modify: `apps/web/src/components/audit-report.tsx`, `report/category-tiles.tsx`, `report/score-band.tsx`, `report/fix-files/provider.tsx`, `report/fix-files/panel.tsx`, `site-icon.tsx` (if needed), `apps/web/src/app/globals.css` (keyframes `arrive-pop`, `arrive-rise` as Tailwind animations, `motion-safe` only)
- Create: `apps/web/src/components/report/count-up.ts` (`useCountUp(target: number | null, ms: number, enabled: boolean): number` — returns `target` immediately when disabled or reduced motion)
- Test: `apps/web/test/components/report/arrival.test.tsx` (jsdom), existing `audit-report.test.tsx` stays green

**Interfaces:**
- Produces:
  - `AuditReport` accepts a partial result: `result: AuditResult | PartialAuditView` where `export interface PartialAuditView { target: string; categories: CategoryResult[] }` (complete categories only). With a partial result: tiles for missing categories render in the pulsing placeholder state (today's `PendingTiles` look, per tile), sections only for present categories in `CATEGORIES` order, no actions row content (its reserved `min-h-[34px]` place stays), no section asides/footers.
  - `AuditReport` prop `animate: boolean` — when true, a tile/section/Fix files block/actions row that mounts or turns from placeholder to filled gets the arrival animation and the count-up; when false nothing animates. Each piece animates once (tracked by category id / block key inside the report's state).
  - `FixFilesProvider` prop `pending: boolean` — while true: `view.kinds` follows the `initial.kinds` prop as it changes, `StartButton` is disabled, `StatusLine` appends `" Available when the check finishes."`; when it turns false the button enables, nothing else changes.

- [ ] **Step 1: Write failing tests** (jsdom, fake timers, `matchMedia` stub): `renders placeholder tiles for categories not yet in`; `renders sections only for present categories, in category order`; `animates a tile that fills while animate is on` (class `animate-arrive-pop` present on that tile, count-up reaches the score after 700 ms); `renders a done report without arrival animations` (`animate` false → no `animate-arrive-*` classes, numbers final at once); `no animation with reduced motion`; `Fix files waits while pending` (button disabled, the exact copy; rerender with `pending=false` → enabled, copy gone).
- [ ] **Step 2: Run** `pnpm --filter @agentcheck/web exec vitest run test/components/report/arrival.test.tsx` — FAIL.
- [ ] **Step 3: Implement.** Keep tile and section elements keyed by category id and the placeholder→filled change inside the same element, so a later prop update never remounts them.
- [ ] **Step 4: Run** the file and `test/components/audit-report.test.tsx` — PASS.
- [ ] **Step 5: Commit** `feat(web): render a partial report with arrival animations`.

### Task 6: Live page — one tree from queued to done

**Files:**
- Create: `apps/web/src/components/live-report.tsx` (client)
- Modify: `apps/web/src/app/audits/[id]/page.tsx`, `apps/web/src/components/audit-progress.tsx` (reduced to the band/queue messages it still owns, or folded into `LiveReport`)
- Test: `apps/web/test/components/live-report.test.tsx` (jsdom), existing `audit-progress` tests updated
- Modify: `docs/web-ui.md` (the running page), `CLAUDE.md` if a rule changed beyond Task 3

**Interfaces:**
- Consumes: Task 4 `AuditStatusBody.progress`, Task 5 `AuditReport` partial + `animate`, `FixFilesProvider.pending`.
- Produces: `LiveReport` props: `{ id, status: "queued" | "running" | "done", url, mode, queuedMs, final?: { …the props the done branch passes to AuditReport today… } , fixFiles: { role, initial } }`. The page renders `<FixFilesProvider …><LiveReport …/></FixFilesProvider>` (or the provider inside `LiveReport`) **at the same position** for queued, running and done, so `router.refresh()` updates props. `failed` keeps `AuditFailed`.
  - While queued/running it polls `/api/audits/${id}` every 1000 ms (5 min cap, stall/give-up copy as today), keeps the latest `progress`, shows the band with `PendingRing` and the favicon (`/api/audits/${id}/favicon`) once `hasFavicon`, and passes `{ target: url, categories }` to `AuditReport` with `animate` on.
  - On `done`/`failed` it stops and calls `router.refresh()`. With `status === "done"` it renders the final report; `animate` stays on only if this mount saw the audit running (so the ring count-up, the screenshot, the remaining tile/section and the actions row arrive animated); a page opened on a done audit never animates. Confetti keeps its current rule.

- [ ] **Step 1: Write failing tests** (jsdom, fake timers, mocked `fetch`, mocked `next/navigation` router): `fills tiles from polled progress`; `shows the favicon once the status says so`; `refreshes when the audit finishes`; `keeps the running tiles mounted when the audit finishes` (grab the `ai-manifests` tile node while running, rerender with `status="done"` and `final` → same node, no new `animate-arrive-pop` on it); `a page opened on a done audit does not animate`.
- [ ] **Step 2: Run** `pnpm --filter @agentcheck/web exec vitest run test/components/live-report.test.tsx` — FAIL.
- [ ] **Step 3: Implement**, then update `docs/web-ui.md` (running page: what arrives when, the animations, Fix files pending, reduced motion, no animations on a reopened report).
- [ ] **Step 4: Run** `pnpm --filter @agentcheck/web test` — PASS.
- [ ] **Step 5: Live check** (local stack: Postgres, `db:migrate`, web dev, worker dev): run a full and a quick audit of a reachable site from the browser; confirm tiles and sections arrive one by one, Fix files appears early with the disabled button, the switch to done does not replay animations or jump; then reload the finished report and confirm nothing animates. Stop the dev servers and any stray `--watch src/main.ts` worker.
- [ ] **Step 6: Commit** `feat(web): fill the running audit page in as results arrive`.

---

## Revision 2 (spec section "Revision 2: the whole report in place from the start")

Built on Tasks 1–6 as committed. Reference: `docs/superpowers/specs/2026-10-21-progressive-audit-page/spike-v2.tsx`.

### Task 7: Data for the waiting report — fix-kinds settled, pending actions

**Files:**
- Modify: `packages/core/src/fixes/kinds.ts` (+ export from `@agentcheck/core/fixes`)
- Modify: `apps/web/src/server/audit-access.ts` (`AuditProgressData`)
- Modify: `apps/web/src/components/report-actions.tsx`, `apps/web/src/app/audits/[id]/page.tsx`, `apps/web/src/components/live-report.tsx` (prop plumbing only)
- Test: `packages/core/test/fixes/kinds.test.ts` (or the existing kinds test file), `apps/web/test/server/audit-access.test.ts`, `apps/web/test/components/report-actions.test.tsx` (existing or new)

**Interfaces:**
- Produces:
  - `fixKindsSettled(categories: Pick<CategoryResult, "checks">[]): boolean` in `@agentcheck/core/fixes` — true when every check id that `FIXED_BY` names is present among the given categories' checks (so `fixKindsFor` on them can no longer grow).
  - `AuditProgressData.fixKindsSettled: boolean` (computed with the above on `progress.categories`).
  - `ReportActions` prop `pending?: boolean` (and `score` optional when pending): renders the same buttons the finished report shows this viewer, faded (`opacity` ~0.45) and inert (`inert` attribute or `pointer-events-none` + `tabIndex={-1}`/`aria-disabled`), opening no dialog.
  - The page builds `<ReportActions pending … />` for queued/running audits (same viewer rules as done: `canRerun`, `canShare`, mode) and passes it to `LiveReport` as `pendingActions: ReactNode`; `final.actions` stays as is.

- [ ] **Step 1: Failing tests:** `fixKindsSettled is false until every fix source check is in` (only `ai-manifests` checks → false; all checks of the three static categories → true; order irrelevant); `progress carries fixKindsSettled` (running audit with the three static categories → true; with one → false); `pending actions are inert` (renders the buttons, a click opens nothing, they are not focusable/tabbable, the row has the faded class).
- [ ] **Step 2: Run** the three files — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the files, then core and web suites — PASS.
- [ ] **Step 5: Commit** `feat(web): know when fix files are settled and draw pending actions`.

### Task 8: The waiting report — sections, Fix files, actions in place from the start

**Files:**
- Modify: `apps/web/src/components/audit-report.tsx`, `report/category-section.tsx` (a waiting variant or a sibling `WaitingSection` with the same outer box), `report/fix-files/panel.tsx` (+ provider if needed), `live-report.tsx`, `apps/web/src/app/globals.css` (collapse transition if not inline)
- Test: `apps/web/test/components/report/arrival.test.tsx`, `apps/web/test/components/live-report.test.tsx`
- Modify: `docs/web-ui.md` (the running page)

**Interfaces:**
- Consumes: Task 7 `fixKindsSettled`, `pendingActions`; Task 5/6 arrival machinery (`animate`, first render never animates).
- Produces (behaviour, per spec Revision 2):
  - With a partial result, `AuditReport` renders a waiting row for every category not yet in (same outer box as a section: icon, title, pulsing chip, faded chevron, not a button), in `CATEGORIES` order, keyed by category id so the waiting row and the arrived section occupy one slot.
  - An arriving category's section opens itself (through the accordion's own open state, so it animates its height) when it has warnings or failures and `animate` is on; without problems it stays closed. With `animate` off (reopened report, or present on first render) sections open per today's `defaultOpen="problems"` rule without animation.
  - Actions row: `pendingActions` while queued/running, `final.actions` at done, in the same wrapper; the swap fades in (no layout change).
  - Fix files while running, for viewers who would see the block: a waiting state from the start (muted icon/title, pulsing line, Generate inactive) until `fixKinds` is non-empty (then today's pending text and inactive button); when `fixKindsSettled && fixKinds.length === 0` the block collapses (height + opacity → 0, ~500 ms, `motion-safe`; instant with reduced motion) and is not rendered after that, nor at done. A done report with no kinds renders no block (unchanged).

- [ ] **Step 1: Failing tests:** `renders waiting rows for categories not yet in`; `a waiting row becomes the section in the same slot` (node of the slot wrapper stays, waiting row gone); `opens an arriving section with problems, leaves a clean one closed` (`aria-expanded`); `a reopened report opens problem sections without animation`; `actions are present and inert while running, active at done`; `Fix files waits, then shows its files`; `Fix files collapses when settled with nothing to fix` (after the transition the block is gone; reduced motion → gone at once); `no Fix files block on a done report without kinds`.
- [ ] **Step 2: Run** the two files — FAIL.
- [ ] **Step 3: Implement**, then update `docs/web-ui.md`.
- [ ] **Step 4: Run** `pnpm --filter @agentcheck/web test`, `pnpm typecheck`, `pnpm check`, `pnpm build` — PASS.
- [ ] **Step 5: Commit** `feat(web): show the whole report waiting from the start`.
