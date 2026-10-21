# Contributing

Thanks for helping. **Bug reports and ideas are welcome as
[issues](https://github.com/yanfishel/agentcheck/issues).** Pull requests are
accepted only from the project's collaborators; pull requests from anyone
else are closed. If you would like to work on something, open an issue and
say so.

The rest of this page is for collaborators, and for anyone who wants to run
AgentCheck from source.

## Setup

You need Node.js 22.18 or newer, [pnpm](https://pnpm.io) (the version in
`package.json`'s `packageManager`; `corepack enable` sets it up) and, for the
web service, Docker.

```sh
pnpm install
pnpm --filter agentcheck-dev build
node apps/cli/dist/cli.mjs https://example.com   # the CLI from source
```

The web service needs PostgreSQL and a [Clerk](https://clerk.com) development
instance:

```sh
docker compose -f docker-compose.dev.yml up -d   # PostgreSQL on 127.0.0.1:5432
pnpm --filter @agentcheck/db db:migrate
pnpm --filter @agentcheck/web dev                # http://localhost:3000
pnpm --filter @agentcheck/worker dev             # runs the audits
```

Put your Clerk keys and `ADMIN_EMAIL` in `apps/web/.env.local` (see
`apps/web/.env.example`); never commit it.

## Pull requests (collaborators)

Every change reaches `main` through a pull request, the maintainer's own
included: the branch ruleset allows no direct pushes. Work on a branch
(`feat/...`, `fix/...`), open a pull request against `main`, and merge it once
the **CI** workflow is green. Run the same gate locally first:

```sh
pnpm check && pnpm typecheck && pnpm test && pnpm build
```

- Tests use Vitest and never hit the real network (HTTP is mocked; browser
  tests use local pages). New behaviour comes with a test.
- Lint and format with Biome (`pnpm check`): tabs and double quotes.
- Code, comments, identifiers and commit messages are in English.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org)
  (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`).
- The `AuditResult` JSON is a public contract for CI users: changing it is a
  breaking change.

The project's detailed rules (engine, service security, UI) are in
[`CLAUDE.md`](CLAUDE.md) and [`docs/`](docs/README.md); the UI rules in
[`docs/web-ui.md`](docs/web-ui.md).

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By
taking part you agree to it.
