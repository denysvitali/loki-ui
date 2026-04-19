# Security policy

## Scope

loki-ui is a static, client-side SPA that talks directly to a Loki instance
the user configures. It has no backend and stores no data server-side. For
context, see [PLAN.md §2 and §3](./PLAN.md).

**In scope:**

- Vulnerabilities in loki-ui that let a malicious Loki response execute
  JavaScript in the user's browser (XSS via log rendering, parser confusion).
- Vulnerabilities that allow one configured datasource to read credentials
  or state belonging to another datasource within the same installation.
- Mishandling of credentials in storage beyond what is documented (Basic /
  Bearer tokens leaking outside the chosen storage tier).

**Out of scope:**

- A user can read their own stored credentials via browser devtools. This
  is by design; the browser is the trust boundary.
- GitHub Pages shared-origin localStorage risk on `github.io`. Documented in
  PLAN §3.2; users who self-host avoid it.
- CORS, TLS, or authentication behavior of the user's Loki deployment.
- Third-party npm supply-chain issues — report upstream, then let us know
  if loki-ui is affected.

## Reporting

Please report privately via GitHub Security Advisories:

https://github.com/denysvitali/loki-ui/security/advisories/new

Or by email to the repository owner. Please do not open public issues for
suspected vulnerabilities until they have been triaged.

We'll acknowledge within a few working days, agree a disclosure timeline,
and credit reporters (unless you prefer not to be credited) in the release
notes for the fix.
