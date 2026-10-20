# Security policy

## Reporting a vulnerability

Please report security issues privately, not in a public issue:

- **GitHub:** [Report a vulnerability](https://github.com/yanfishel/agentcheck/security/advisories/new)
  (private security advisory), or
- **Email:** yan.fishel@gmail.com with "AgentCheck security" in the subject.

Include what you found, how to reproduce it, and what an attacker could do with
it. You will get an answer within a few days. Please give us a reasonable time
to fix the issue before you disclose it; we will credit you in the advisory
unless you prefer not to be named.

## Scope

- The hosted service at **agentcheck.dev**, especially:
  - the network guard: an audit must never reach private, loopback,
    link-local or metadata addresses, including through redirects, DNS
    rebinding or the browser;
  - the sandboxed browser that renders audited pages;
  - access control: owned audits, share links, fix files and the admin area;
  - handling of untrusted content from audited sites (screenshots, favicons,
    generated files).
- The `agentcheck` CLI and the engine in this repository.

Out of scope: findings that need a compromised account or machine, denial of
service by volume, reports from automated scanners without a working impact,
and missing security headers without a concrete attack. Please do not test
against other people's sites through the service, and do not run load tests
against agentcheck.dev.

## Supported versions

Only the latest release is supported. The hosted service always runs it.
