# Deploying AgentCheck

AgentCheck runs on one Linux server (2 vCPU / 4 GB, Ubuntu 24.04, Docker) that
can also host other small projects behind the same Caddy. Server address, SSH
access and DNS live with the operator, not in this repository.

## Layout

| On the server | From the repo | What |
|---|---|---|
| `/srv/edge/` | `deploy/edge/` | The shared front door: Caddy on 80/443, owns the Docker network `edge`; one file per site in `sites/` |
| `/srv/agentcheck/` | `deploy/docker-compose.yml`, `deploy/seccomp-chromium.json`, `deploy/bin/{ci,set-env,deploy}` | web, worker, a one-shot `migrate`, postgres; publishes no ports. The stack files are installed by every deploy |
| `/srv/agentcheck/.env` | `deploy/.env.example` (keys only) | Configuration and secrets, mode 600, root only |

Images: `ghcr.io/yanfishel/agentcheck-web:<tag>` and `-worker:<tag>`, public,
built by `.github/workflows/release.yml`. `web` reaches Caddy over `edge` as
`agentcheck-web:3000`; postgres and the worker stay on the project network.

Host setup: 2 GB swap (`vm.swappiness=10`), `ufw` allowing only
SSH, 80/tcp, 443/tcp and 443/udp, Docker Engine and the Compose plugin from
Docker's apt repository, Docker logs rotated at 10 MB × 3. Docker publishes
ports past `ufw`, which is fine as long as only the edge Caddy publishes any.
Caddy must never get `trusted_proxies`: the app reads the last
`X-Forwarded-For` entry as the client, so trusting an incoming one would let a
client pick its own IP hash and rate-limit bucket.
**IPv4 only: no AAAA records.** The server has no IPv6, and Docker reaches
published ports over IPv6 through `docker-proxy` unless the daemon and the
`edge` network have IPv6 enabled; Caddy would then see the bridge gateway as
every IPv6 visitor's address, so they would share one IP hash and one rate
limit. Before adding an AAAA record: enable IPv6 in Docker (`"ipv6": true`
and `"ip6tables": true` in `/etc/docker/daemon.json`, `enable_ipv6: true` on
the `edge` network) and repeat the forged `X-Forwarded-For` check over IPv6.

Backups: the hosting provider's server backups (weekly, kept four weeks; `/privacy`
says so).

## Release and deploy

A release is one command from the merged `main`:

```sh
gh release create vX.Y.Z --generate-notes
```

It creates the tag and a GitHub release with the merged pull requests as
notes; the `Release` workflow does the rest:

1. **Gate**: the `CI` workflow on the tag.
2. **Version**: the repository keeps the placeholder `0.0.0-dev` in the five
   released packages (`scripts/release-packages.mjs`; a new released package
   is added there); `node scripts/set-version.mjs X.Y.Z` writes the tag's
   version before anything is built, so the footer, every report and the CLI
   show it. No version bump is ever committed.
3. **Images**: `ghcr.io/yanfishel/agentcheck-web:vX.Y.Z` and `-worker:vX.Y.Z`.
4. **npm**: the CLI, when the repository variable `NPM_PUBLISH` is `true`
   (below).
5. **Deploy** (`.github/workflows/deploy.yml`): the job waits in the
   `production` environment for its reviewer's approval (Actions → the run →
   Review deployments), then sends the stack files (`deploy/docker-compose.yml`,
   `seccomp-chromium.json`, `bin/ci`, `bin/set-env`, `bin/deploy`) as a tar
   over ssh to `deploy vX.Y.Z` on the server. `deploy/bin/deploy` accepts only
   those paths, installs them, writes `AGENTCHECK_VERSION`, runs
   `docker compose pull` and `up -d`, and fails the job unless `migrate`
   exited 0 and `web` and `worker` are running (their logs are printed then).
   `web` and `worker` start only after `migrate` exited 0. Never `latest`.

A manual run of "Release" builds images tagged `:sha-<short>` for a trial and
neither publishes nor deploys.

**Rollback:** Actions → Deploy → Run workflow with the previous tag (the same
approval). Migrations are additive; a release with one that is not says so.

**Changing the stack files** (`deploy/`): they reach the server with the
next deploy (or a manual Deploy run of the current tag). The edge stack
(`deploy/edge/`) is still copied by hand to `/srv/edge`; for a Caddyfile change
`docker compose restart caddy` there.
`deploy/test/stacks.test.ts`, `set-env.test.ts` and `deploy.test.ts` pin the
stack: no `ports` in the AgentCheck compose, `web` on `edge` as
`agentcheck-web`, only the edge Caddy publishing 80/443/443-udp, each service
given only the variables it reads (never the whole `.env`), `set-env`
rejecting any name outside the three Clerk keys before it writes and quoting
the values so Compose takes them literally, `ci` refusing any command but
`set-env` and `deploy vX.Y.Z`, and `deploy` refusing other tags and files
outside the list before it touches anything. The images carry no tests
(`.dockerignore`).

**The CLI on npm.** The `npm` job of the release workflow publishes
`apps/cli` as `agentcheck-dev` (npm refuses the bare name as too close to
`agent-check`; the command stays `agentcheck`) with
[trusted publishing](https://docs.npmjs.com/trusted-publishers/): no npm token
in the repository, npm accepts the job's OIDC identity (repository
`yanfishel/agentcheck`, workflow `release.yml`) and attaches a provenance
attestation. The trusted publisher is configured on npmjs.com in the package's
settings, which exist only once the package does: the first version is
published by the maintainer from a clean checkout of the tag, in a real
terminal (npm's 2FA opens the browser; pnpm's publish cannot):

```sh
node scripts/set-version.mjs X.Y.Z        # the checkout holds 0.0.0-dev
pnpm --filter agentcheck-dev build
cd apps/cli && pnpm pack                  # resolves the catalog: versions
npm publish agentcheck-dev-X.Y.Z.tgz --access public --provenance=false
```

Then the publisher is added, the repository variable `NPM_PUBLISH` is set to
`true` (until then the job is skipped and a release is images and a deploy),
and every later tag publishes itself. The job
skips a version that is already on npm (the hand-published first one, or a
re-run) instead of failing the release, and runs `npm install -g npm@latest`
because trusted publishing needs npm 11.5.1 or newer.

## Secrets and configuration

- `POSTGRES_PASSWORD`, `IP_HASH_SECRET` and `DATABASE_URL` are generated on
  the server (`openssl rand -hex 32`) and exist only in `.env`.
- `ADMIN_EMAIL` is written by hand into `.env` (it is not a secret, but it
  never goes into the repository).
- The Clerk keys (`CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`,
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`) live in GitHub repository secrets. To
  change one: update the secret, run **Actions → Sync server secrets**, then
  redeploy the current tag (Actions → Deploy). The workflows log in with a
  deploy key whose forced command in root's `authorized_keys` is
  `/srv/agentcheck/bin/ci`: it runs only `set-env` (accepts just those three
  names and prints names, never values) or `deploy vX.Y.Z`. Repository
  secret `DEPLOY_SSH_KEY`, variables `DEPLOY_HOST` and `DEPLOY_KNOWN_HOSTS`;
  the `production` environment names the reviewer who approves deploys.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is also baked into the web image at
  build time (Next inlines `NEXT_PUBLIC_*` into the browser code): a new
  publishable key needs a new release, not only a sync.
- Clerk production instance: email, Google and GitHub sign-in (each with its
  own OAuth client); webhook `https://agentcheck.dev/api/webhooks/clerk` with
  `user.deleted`.

## Chromium sandbox

The worker launches Chromium with its sandbox on: the guarded renderer sets
`sandbox: true`, which becomes Playwright's `chromiumSandbox: true`, and
service code cannot turn it off. If the sandbox fails on a host, fix the host
(seccomp, AppArmor), never disable it. In Docker the sandbox needs user namespaces, which the
default seccomp profile forbids; `deploy/seccomp-chromium.json` is
Playwright's profile from `microsoft/playwright` tag `v1.64.1`
(`utils/docker/seccomp_profile.json`): Docker's default plus `clone`, `setns`
and `unshare`. Without it Chromium dies with SIGTRAP. When `playwright-core`
is upgraded, take the profile from the matching tag.

## Capacity

Measured on a 2 vCPU / 4 GB server, four full audits at once (three
rendered in the browser) inside the worker:
worker peak 601 MiB and 192% CPU (both cores busy), web 107 MiB, postgres
38 MiB, Caddy 16 MiB; the host used 0.9 of 3.9 GB. A full audit renders in
5–8 s. The limit is CPU, not memory: keep `AUDIT_CONCURRENCY=2` on two vCPUs;
raise it only with more cores.

## Adding another project to the server

Only the author's own projects go on `edge`: any container there can call
`agentcheck-web:3000` directly and set its own `X-Forwarded-For`, past
Caddy and the IP rate limit. Give it its own Compose project in `/srv/<name>`, put its public container on
the external network `edge` under a unique alias, and add
`/srv/edge/sites/<name>.caddy` with its domain and `reverse_proxy
<alias>:<port>` (or `root`/`file_server` for a static site). Point the
domain's A record at the server; Caddy gets the certificate itself.
